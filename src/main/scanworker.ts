// Scan coordinator. Owns the node table, hands folders to a pool of
// dirworkers and posts the finished table back to the main process.
import { parentPort, workerData, Worker } from "worker_threads";
import { availableParallelism } from "os";
import { join, sep } from "path";
import { F_DIR, F_ERR, F_LINK } from "../shared/types";
import type { ScanIssue, ScanProgress, SnapshotMeta } from "../shared/types";
import { finishTable, previewTable, tableBuffers } from "../shared/table";
import type { RawScan, ScanFacts } from "../shared/table";
import type { DirJob, DirResult } from "./dirworker";
import { writeSnapshot } from "./snapshots";

interface Job {
  root: string;
  snapshotDir: string;
  quiet?: boolean; // no live preview and no snapshot: used to measure one pasted folder
  liveDepth?: number; // how deep the preview goes: one level past what the plan opens
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
let stopping = false; // asked to stop, but hand over what was measured
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
  // Once asked to stop, folders found by the jobs still in flight are not followed.
  if (cancelled || stopping) stackIds.length = stackPaths.length = stackTops.length = 0;
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
  if (!cancelled && !stopping && !job.quiet && now - lastLive > Math.max(900, liveCost * 10)) live();
  dispatch();
}

// Live preview -------------------------------------------------------------
// While the walk is running, the top levels of what has been measured so far
// are sent out about once a second so the plan can fill in as it goes.

// The preview only carries what the plan can show. Fewer levels mean a
// smaller table, built and sent more often, and a plan that keeps moving.
const LIVE_DEPTH = Math.max(3, Math.min(6, job.liveDepth ?? 5));
let lastLive = Date.now();
let liveCost = 0;

// What has been collected so far, as the shared table builders read it.
function raw(): RawScan {
  return { root: job.root, n, parent, size, logical, mtime, flags, nameOff, names };
}
function facts(): ScanFacts {
  return { startedAt, durationMs: Date.now() - startedAt, dirs: dirCount, errors: errorCount, errorSamples: issues, incomplete: stopping };
}

function live(): void {
  const began = Date.now();
  const table = previewTable(raw(), LIVE_DEPTH, facts());
  port.postMessage({ type: "partial", table }, tableBuffers(table));
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

  const table = finishTable(raw(), facts());

  if (process.env.DISKPLOT_TIMING) console.error("walk", walkMs, "finalize", Date.now() - startedAt - walkMs);
  let snapshot: SnapshotMeta | null = null;
  try {
    if (!job.quiet && !stopping) snapshot = writeSnapshot(job.snapshotDir, table);
  } catch {
    // A scan is still useful without its snapshot.
  }

  port.postMessage({ type: "done", table, snapshot }, tableBuffers(table));
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
  if (finished || (msg.type !== "cancel" && msg.type !== "stop")) return;
  // "stop" finishes with what there is; "cancel" throws it away.
  if (msg.type === "stop") stopping = true;
  else cancelled = true;
  stackIds.length = stackPaths.length = stackTops.length = 0;
  if (ready === poolSize) dispatch();
});
