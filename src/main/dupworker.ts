// Finds identical files among candidates that already share a size.
// Cheap pass first (head and tail of each file), full hash only for survivors.
import { parentPort, workerData } from "worker_threads";
import { createHash } from "crypto";
import { closeSync, openSync, readSync } from "fs";
import type { DupCandidate, DupGroup, DupProgress } from "../shared/types";

const candidates = workerData as DupCandidate[];
const port = parentPort!;
const EDGE = 16 * 1024;
const CHUNK = 1024 * 1024;
const chunk = Buffer.allocUnsafe(CHUNK);

function edgeHash(path: string, size: number): string | null {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const h = createHash("sha1");
    const head = readSync(fd, chunk, 0, Math.min(EDGE, size), 0);
    h.update(chunk.subarray(0, head));
    if (size > EDGE) {
      const tail = readSync(fd, chunk, 0, Math.min(EDGE, size - EDGE), Math.max(EDGE, size - EDGE));
      h.update(chunk.subarray(0, tail));
    }
    return h.digest("hex");
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function fullHash(path: string, onBytes: (n: number) => void): string | null {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const h = createHash("sha1");
    for (;;) {
      const got = readSync(fd, chunk, 0, CHUNK, null);
      if (got === 0) break;
      h.update(chunk.subarray(0, got));
      onBytes(got);
    }
    return h.digest("hex");
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function split(ids: number[], paths: string[], keyOf: (path: string) => string | null): { ids: number[]; paths: string[] }[] {
  const groups = new Map<string, { ids: number[]; paths: string[] }>();
  for (let i = 0; i < ids.length; i++) {
    const key = keyOf(paths[i]);
    if (key === null) continue;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { ids: [], paths: [] }));
    g.ids.push(ids[i]);
    g.paths.push(paths[i]);
  }
  return [...groups.values()].filter((g) => g.ids.length > 1);
}

// Pass 1: head and tail.
const survivors: { size: number; ids: number[]; paths: string[] }[] = [];
let done = 0;
const totalFiles = candidates.reduce((a, c) => a + c.ids.length, 0);
let last = 0;
function report(p: DupProgress): void {
  const now = Date.now();
  if (now - last < 150) return;
  last = now;
  port.postMessage({ type: "progress", progress: p });
}

for (const c of candidates) {
  for (const g of split(c.ids, c.paths, (p) => {
    done++;
    report({ done, total: totalFiles, bytes: 0, totalBytes: 0 });
    return edgeHash(p, c.size);
  })) {
    survivors.push({ size: c.size, ...g });
  }
}

// Pass 2: whole file, only where head and tail matched and the file is larger than both.
const totalBytes = survivors.reduce((a, s) => a + (s.size > EDGE * 2 ? s.size * s.ids.length : 0), 0);
let bytes = 0;
const out: DupGroup[] = [];
for (const s of survivors) {
  if (s.size <= EDGE * 2) {
    out.push({ size: s.size, ids: s.ids });
    continue;
  }
  for (const g of split(s.ids, s.paths, (p) =>
    fullHash(p, (got) => {
      bytes += got;
      report({ done: totalFiles, total: totalFiles, bytes, totalBytes });
    }),
  )) {
    out.push({ size: s.size, ids: g.ids });
  }
}

out.sort((a, b) => b.size * (b.ids.length - 1) - a.size * (a.ids.length - 1));
port.postMessage({ type: "done", groups: out });
