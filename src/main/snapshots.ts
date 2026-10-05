// Snapshots: a reduced copy of a scan kept on disk so a later scan of the
// same root can show what grew. Every folder is kept, files only when large.
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { gunzipSync, gzipSync } from "zlib";
import { F_DIR } from "../shared/types";
import type { ScanTable, SnapshotMeta, SnapshotTable } from "../shared/types";

const BIG_FILE = 8 * 1024 * 1024;
const KEEP_PER_ROOT = 8;

function rootKey(root: string): string {
  return createHash("sha1").update(root.toLowerCase()).digest("hex").slice(0, 12);
}

export function writeSnapshot(dir: string, t: ScanTable): SnapshotMeta {
  mkdirSync(dir, { recursive: true });

  const remap = new Int32Array(t.n).fill(-1);
  let n = 0;
  let nameBytes = 0;
  for (let i = 0; i < t.n; i++) {
    if (i === 0 || t.flags[i] & F_DIR || t.size[i] >= BIG_FILE) {
      remap[i] = n++;
      nameBytes += t.nameOff[i + 1] - t.nameOff[i];
    }
  }
  const parent = new Int32Array(n);
  const size = new Float64Array(n);
  const flags = new Uint8Array(n);
  const nameOff = new Uint32Array(n + 1);
  const names = new Uint8Array(nameBytes);
  let off = 0;
  for (let i = 0; i < t.n; i++) {
    const j = remap[i];
    if (j === -1) continue;
    parent[j] = i === 0 ? -1 : remap[t.parent[i]];
    size[j] = t.size[i];
    flags[j] = t.flags[i];
    names.set(t.names.subarray(t.nameOff[i], t.nameOff[i + 1]), off);
    off += t.nameOff[i + 1] - t.nameOff[i];
    nameOff[j + 1] = off;
  }

  const file = `${rootKey(t.root)}-${t.startedAt}.dps`;
  const meta: SnapshotMeta = { file, root: t.root, date: t.startedAt, total: t.size[0], files: t.files[0] };
  const header = Buffer.from(JSON.stringify({ v: 1, meta, n, nameBytes }), "utf8");
  const head = Buffer.alloc(4);
  head.writeUInt32LE(header.length, 0);
  const body = Buffer.concat([
    head,
    header,
    Buffer.from(parent.buffer),
    Buffer.from(size.buffer),
    Buffer.from(flags.buffer),
    Buffer.from(nameOff.buffer),
    Buffer.from(names.buffer),
  ]);
  writeFileSync(join(dir, file), gzipSync(body, { level: 3 }));
  writeFileSync(join(dir, file + ".json"), JSON.stringify(meta));
  prune(dir, t.root);
  return meta;
}

export function listSnapshots(dir: string, root?: string): SnapshotMeta[] {
  if (!existsSync(dir)) return [];
  const out: SnapshotMeta[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".dps.json")) continue;
    try {
      const meta = JSON.parse(readFileSync(join(dir, name), "utf8")) as SnapshotMeta;
      if (!root || meta.root.toLowerCase() === root.toLowerCase()) out.push(meta);
    } catch {
      // Skip a damaged entry.
    }
  }
  return out.sort((a, b) => b.date - a.date);
}

function prune(dir: string, root: string): void {
  for (const old of listSnapshots(dir, root).slice(KEEP_PER_ROOT)) {
    for (const f of [old.file, old.file + ".json"]) {
      try {
        unlinkSync(join(dir, f));
      } catch {
        // Already gone.
      }
    }
  }
}

export function readSnapshot(dir: string, file: string): SnapshotTable {
  // The file name comes from the renderer; keep it inside the snapshot folder.
  if (!/^[0-9a-f]{12}-\d+\.dps$/.test(file)) throw new Error("Invalid snapshot name");
  const raw = gunzipSync(readFileSync(join(dir, file)));
  const headerLen = raw.readUInt32LE(0);
  const header = JSON.parse(raw.subarray(4, 4 + headerLen).toString("utf8")) as {
    meta: SnapshotMeta;
    n: number;
    nameBytes: number;
  };
  const { n, nameBytes } = header;
  let at = 4 + headerLen;
  // Copies, because the offsets inside the file are not aligned.
  const take = (bytes: number): ArrayBuffer => {
    const copy = new Uint8Array(bytes);
    copy.set(raw.subarray(at, at + bytes));
    at += bytes;
    return copy.buffer;
  };
  return {
    meta: header.meta,
    n,
    parent: new Int32Array(take(n * 4)),
    size: new Float64Array(take(n * 8)),
    flags: new Uint8Array(take(n)),
    nameOff: new Uint32Array(take((n + 1) * 4)),
    names: new Uint8Array(take(nameBytes)),
  };
}
