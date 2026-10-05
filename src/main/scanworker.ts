// Scan coordinator. Owns the node table, hands folders to a pool of
// dirworkers and posts the finished table back to the main process.
import { parentPort, workerData, Worker } from "worker_threads";
import { availableParallelism } from "os";
import { join, sep } from "path";
import { F_DIR, F_ERR, F_LINK } from "../shared/types";
import type { ScanIssue, ScanProgress, ScanTable, SnapshotMeta } from "../shared/types";
import type { DirJob, DirResult } from "./dirworker";
import { writeSnapshot } from "./snapshots";

interface Job {
  root: string;
  snapshotDir: string;
}

const job = workerData as Job;
const port = parentPort!;
const decoder = new TextDecoder();

const BATCH = 24; // folders per job
const IN_FLIGHT = 2; // jobs queued on each worker
const MAX_SAMPLES = 200;

// Growable columns.
let cap = 1 << 16;
let parent = new Int32Array(cap);
let size = new Float64Array(cap);
let logical = new Float64Array(cap);
let mtime = new Uint32Array(cap);
let flags = new Uint8Array(cap);
let nameOff = new Uint32Array(cap + 1);
let names = new Uint8Array(1 << 20);
let n = 0;
let nameEnd = 0;

function grow(min: number): void {
  while (cap < min) cap *= 2;
  const p = new Int32Array(cap);
  p.set(parent.subarray(0, n));
  parent = p;
  const s = new Float64Array(cap);
  s.set(size.subarray(0, n));
  size = s;
  const g = new Float64Array(cap);
  g.set(logical.subarray(0, n));
  logical = g;
  const m = new Uint32Array(cap);
  m.set(mtime.subarray(0, n));
  mtime = m;
  const f = new Uint8Array(cap);
  f.set(flags.subarray(0, n));
  flags = f;
  const o = new Uint32Array(cap + 1);
  o.set(nameOff.subarray(0, n + 1));
  nameOff = o;
}

function growNames(min: number): void {
  let c = names.length;
  while (c < min) c *= 2;
  const b = new Uint8Array(c);
  b.set(names.subarray(0, nameEnd));
  names = b;
}

// Pending folders, used as a stack so the queue stays shallow.
const stackIds: number[] = [];
const stackPaths: string[] = [];
const stackTops: number[] = []; // depth 1 ancestor, for the live breakdown

const pending = new Map<number, { ids: number[]; paths: string[]; tops: number[] }>();
const topBytes = new Map<number, number>();
const issues: ScanIssue[] = [];
let seq = 0;
let fileCount = 0;
let dirCount = 1;
let byteCount = 0;
let errorCount = 0;
let current = job.root;
const startedAt = Date.now();
let lastProgress = 0;
let finished = false;
let cancelled = false;
let ready = 0;

// Workers are asked to leave, never terminated: see dirworker.
function release(): void {
  for (const w of workers) w.postMessage({ exit: true });
}

function leave(): void {
  if (finished) return;
  finished = true;
  release();
  port.close();
}

function issue(path: string, code: string): void {
  errorCount++;
  if (issues.length < MAX_SAMPLES) issues.push({ path, code });
}

// Root node.
{
  const bytes = new TextEncoder().encode(job.root);
  growNames(bytes.length);
  names.set(bytes, 0);
  nameEnd = bytes.length;
  parent[0] = -1;
  flags[0] = F_DIR;
  nameOff[0] = 0;
  nameOff[1] = nameEnd;
  n = 1;
  stackIds.push(0);
  stackPaths.push(job.root);
  stackTops.push(-1);
}

const poolSize = Math.max(2, Math.min(12, availableParallelism()));
const workers: Worker[] = [];
const load: number[] = [];

function dispatch(): void {
  for (let w = 0; w < workers.length; w++) {
    while (load[w] < IN_FLIGHT && stackIds.length > 0) {
      const take = Math.min(BATCH, stackIds.length);
      const at = stackIds.length - take;
      const ids = stackIds.splice(at, take);
      const paths = stackPaths.splice(at, take);
      const tops = stackTops.splice(at, take);
      const id = seq++;
      pending.set(id, { ids, paths, tops });
      load[w]++;
      workers[w].postMessage({ seq: id, paths } satisfies DirJob);
    }
  }
  if (pending.size === 0 && stackIds.length === 0) {
    if (cancelled) leave();
    else finish();
  }
}

function onResult(w: number, res: DirResult): void {
  load[w]--;
  const batch = pending.get(res.seq)!;
  pending.delete(res.seq);

  for (const [d, code] of res.failed) {
    flags[batch.ids[d]] |= F_ERR;
    issue(batch.paths[d], code);
  }

  const total = res.flags.length;
  if (n + total > cap) grow(n + total);
  if (nameEnd + res.names.length > names.length) growNames(nameEnd + res.names.length);
  names.set(res.names, nameEnd);

  let e = 0;
  let off = 0; // offset inside res.names
  for (let d = 0; d < batch.ids.length; d++) {
    const dirId = batch.ids[d];
    const dirPath = batch.paths[d];
    const count = res.counts[d];
    if (count > 0) current = dirPath;
    let direct = 0; // bytes of the files directly in this folder
    let directTop = -1;
    for (let k = 0; k < count; k++, e++) {
      const id = n++;
      const flag = res.flags[e];
      const len = res.nameLens[e];
      parent[id] = dirId;
      size[id] = res.sizes[e];
      logical[id] = res.logical[e];
      mtime[id] = res.mtimes[e];
      flags[id] = flag;
      nameOff[id + 1] = nameEnd + off + len;

      const top = batch.tops[d] === -1 ? id : batch.tops[d];
      if (flag & F_DIR) {
        dirCount++;
        const name = decoder.decode(res.names.subarray(off, off + len));
        stackIds.push(id);
        stackPaths.push(dirPath.endsWith(sep) ? dirPath + name : dirPath + sep + name);
        stackTops.push(top);
        if (!topBytes.has(top)) topBytes.set(top, 0);
      } else {
        fileCount++;
        if (flag & F_ERR) {
          const name = decoder.decode(res.names.subarray(off, off + len));
          issue(join(dirPath, name), "ESTAT");
        } else if (!(flag & F_LINK)) {
          byteCount += res.sizes[e];
          if (batch.tops[d] === -1) topBytes.set(id, res.sizes[e]);
          else {
            direct += res.sizes[e];
            directTop = top;
          }
        }
      }
      off += len;
    }
    if (directTop !== -1) topBytes.set(directTop, (topBytes.get(directTop) ?? 0) + direct);
  }
  nameEnd += res.names.length;

  const now = Date.now();
  if (now - lastProgress > 120) {
    lastProgress = now;
    port.postMessage({ type: "progress", progress: progress() });
  }
  // Never let the preview take more than about a tenth of the scan's time.
  if (!cancelled && now - lastLive > Math.max(900, liveCost * 10)) live();
  dispatch();
}

// Live preview -------------------------------------------------------------
// While the walk is running, the top levels of what has been measured so far
// are sent out about once a second so the plan can fill in as it goes.

const LIVE_DEPTH = 5;
let lastLive = Date.now();
let liveCost = 0;

function live(): void {
  const began = Date.now();
  const count = n;
  const sz = size.slice(0, count);
  const lg = logical.slice(0, count);
  const mt = mtime.slice(0, count);
  const fc = new Uint32Array(count);
  const depth = new Uint8Array(count);
  for (let i = 1; i < count; i++) depth[i] = Math.min(254, depth[parent[i]] + 1);
  for (let i = count - 1; i >= 1; i--) {
    const p = parent[i];
    sz[p] += sz[i];
    lg[p] += lg[i];
    fc[p] += flags[i] & F_DIR ? fc[i] : 1;
    if (mt[i] > mt[p]) mt[p] = mt[i];
  }

  // Keep the shallow nodes only. A folder at the cut is sent as a solid
  // block, so its weight still shows on the plan.
  const remap = new Int32Array(count).fill(-1);
  let m = 0;
  let nameBytes = 0;
  for (let i = 0; i < count; i++) {
    if (depth[i] <= LIVE_DEPTH) {
      remap[i] = m++;
      nameBytes += nameOff[i + 1] - nameOff[i];
    }
  }
  const tParent = new Int32Array(m);
  const tSize = new Float64Array(m);
  const tLogical = new Float64Array(m);
  const tMtime = new Uint32Array(m);
  const tFlags = new Uint8Array(m);
  const tFiles = new Uint32Array(m);
  const tNameOff = new Uint32Array(m + 1);
  const tNames = new Uint8Array(nameBytes);
  let off = 0;
  for (let i = 0; i < count; i++) {
    const j = remap[i];
    if (j === -1) continue;
    tParent[j] = i === 0 ? -1 : remap[parent[i]];
    tSize[j] = sz[i];
    tLogical[j] = lg[i];
    tMtime[j] = mt[i];
    tFiles[j] = fc[i];
    tFlags[j] = depth[i] === LIVE_DEPTH ? flags[i] & ~F_DIR : flags[i];
    tNames.set(names.subarray(nameOff[i], nameOff[i + 1]), off);
    off += nameOff[i + 1] - nameOff[i];
    tNameOff[j + 1] = off;
  }
  const childStart = new Int32Array(m + 1);
  for (let i = 1; i < m; i++) childStart[tParent[i] + 1]++;
  for (let i = 0; i < m; i++) childStart[i + 1] += childStart[i];
  const fill = childStart.slice(0, m);
  const childList = new Int32Array(Math.max(0, m - 1));
  for (let i = 1; i < m; i++) childList[fill[tParent[i]]++] = i;
  const bySize = (a: number, b: number): number => tSize[b] - tSize[a] || a - b;
  for (let i = 0; i < m; i++) {
    if (childStart[i + 1] - childStart[i] > 1) childList.subarray(childStart[i], childStart[i + 1]).sort(bySize);
  }
  const ext = new Uint16Array(m);

  const table: ScanTable = {
    root: job.root,
    n: m,
    parent: tParent,
    size: tSize,
    logical: tLogical,
    mtime: tMtime,
    flags: tFlags,
    files: tFiles,
    nameOff: tNameOff,
    names: tNames,
    childStart,
    childList,
    ext,
    exts: [""],
    startedAt,
    durationMs: Date.now() - startedAt,
    dirs: dirCount,
    errors: errorCount,
    errorSamples: [],
  };
  port.postMessage({ type: "partial", table }, [
    tParent.buffer,
    tSize.buffer,
    tLogical.buffer,
    tMtime.buffer,
    tFlags.buffer,
    tFiles.buffer,
    tNameOff.buffer,
    tNames.buffer,
    childStart.buffer,
    childList.buffer,
    ext.buffer,
  ] as ArrayBuffer[]);
  lastLive = Date.now();
  liveCost = lastLive - began;
}

function nameOf(id: number): string {
  return decoder.decode(names.subarray(nameOff[id], nameOff[id + 1]));
}

function progress(): ScanProgress {
  const top = [...topBytes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([id, bytes]) => ({ name: nameOf(id), bytes, dir: (flags[id] & F_DIR) !== 0 }));
  return {
    files: fileCount,
    dirs: dirCount,
    bytes: byteCount,
    errors: errorCount,
    current,
    elapsedMs: Date.now() - startedAt,
    top,
  };
}

function finish(): void {
  if (finished) return;
  finished = true;
  release();
  const walkMs = Date.now() - startedAt;

  const count = n;
  const tParent = parent.slice(0, count);
  const tSize = size.slice(0, count);
  const tLogical = logical.slice(0, count);
  const tMtime = mtime.slice(0, count);
  const tFlags = flags.slice(0, count);
  const tNameOff = nameOff.slice(0, count + 1);
  const tNames = names.slice(0, nameEnd);
  const files = new Uint32Array(count);

  // Sum sizes, file counts and newest change upward.
  for (let i = count - 1; i >= 1; i--) {
    const p = tParent[i];
    tSize[p] += tSize[i];
    tLogical[p] += tLogical[i];
    files[p] += tFlags[i] & F_DIR ? files[i] : 1;
    if (tMtime[i] > tMtime[p]) tMtime[p] = tMtime[i];
  }

  // Children of each folder as one flat list, largest first.
  const childStart = new Int32Array(count + 1);
  for (let i = 1; i < count; i++) childStart[tParent[i] + 1]++;
  for (let i = 0; i < count; i++) childStart[i + 1] += childStart[i];
  const fill = childStart.slice(0, count);
  const childList = new Int32Array(Math.max(0, count - 1));
  for (let i = 1; i < count; i++) childList[fill[tParent[i]]++] = i;
  const bySize = (a: number, b: number): number => tSize[b] - tSize[a] || a - b;
  for (let i = 0; i < count; i++) {
    const s = childStart[i];
    const e = childStart[i + 1];
    if (e - s > 1) childList.subarray(s, e).sort(bySize);
  }

  // Extension of each file, as an index into a small table.
  const ext = new Uint16Array(count);
  const exts: string[] = [""];
  const extIds = new Map<string, number>();
  for (let i = 1; i < count; i++) {
    if (tFlags[i] & F_DIR) continue;
    const s = tNameOff[i];
    const e = tNameOff[i + 1];
    let dot = -1;
    for (let k = e - 1; k > s && k >= e - 12; k--) {
      if (tNames[k] === 0x2e) {
        dot = k;
        break;
      }
    }
    if (dot === -1 || dot === e - 1) continue;
    let key = "";
    let ascii = true;
    for (let k = dot + 1; k < e; k++) {
      let c = tNames[k];
      if (c > 0x7f || c === 0x20) {
        ascii = false;
        break;
      }
      if (c >= 0x41 && c <= 0x5a) c += 32;
      key += String.fromCharCode(c);
    }
    if (!ascii) continue;
    let id = extIds.get(key);
    if (id === undefined) {
      if (exts.length >= 0xffff) continue;
      id = exts.length;
      exts.push(key);
      extIds.set(key, id);
    }
    ext[i] = id;
  }

  const table: ScanTable = {
    root: job.root,
    n: count,
    parent: tParent,
    size: tSize,
    logical: tLogical,
    mtime: tMtime,
    flags: tFlags,
    files,
    nameOff: tNameOff,
    names: tNames,
    childStart,
    childList,
    ext,
    exts,
    startedAt,
    durationMs: Date.now() - startedAt,
    dirs: dirCount,
    errors: errorCount,
    errorSamples: issues,
  };

  if (process.env.DISKPLOT_TIMING) console.error("walk", walkMs, "finalize", Date.now() - startedAt - walkMs);
  let snapshot: SnapshotMeta | null = null;
  try {
    snapshot = writeSnapshot(job.snapshotDir, table);
  } catch {
    // A scan is still useful without its snapshot.
  }

  port.postMessage({ type: "done", table, snapshot }, [
    tParent.buffer,
    tSize.buffer,
    tLogical.buffer,
    tMtime.buffer,
    tFlags.buffer,
    files.buffer,
    tNameOff.buffer,
    tNames.buffer,
    childStart.buffer,
    childList.buffer,
    ext.buffer,
  ] as ArrayBuffer[]);
  port.close();
}

for (let w = 0; w < poolSize; w++) {
  const worker = new Worker(join(__dirname, "dirworker.js"));
  load.push(0);
  workers.push(worker);
  worker.on("message", (res: DirResult | { ready: true }) => {
    if ("ready" in res) {
      if (++ready === poolSize) dispatch();
    } else onResult(w, res);
  });
  worker.on("error", (err) => {
    if (!finished) port.postMessage({ type: "error", error: String((err as Error)?.message ?? err) });
  });
}

// Stop on request: let the jobs in flight come back, then leave quietly.
port.on("message", (msg: { type: string }) => {
  if (msg.type !== "cancel" || finished) return;
  cancelled = true;
  stackIds.length = stackPaths.length = stackTops.length = 0;
  if (ready === poolSize) dispatch();
});
