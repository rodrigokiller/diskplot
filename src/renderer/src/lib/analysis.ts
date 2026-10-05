import { F_DIR, F_GONE, F_LINK } from "../../../shared/types";
import type { DupCandidate, SnapshotTable } from "../../../shared/types";
import type { Disk } from "./disk";

// Largest files ------------------------------------------------------------

export function topFiles(disk: Disk, limit: number, within = 0): number[] {
  const t = disk.t;
  const picked: number[] = [];
  let floor = 0;
  for (let i = 1; i < t.n; i++) {
    if (t.flags[i] & (F_DIR | F_GONE) || t.size[i] <= floor) continue;
    picked.push(i);
    if (picked.length >= limit * 4) {
      picked.sort((a, b) => t.size[b] - t.size[a]);
      picked.length = limit;
      floor = t.size[picked[limit - 1]];
    }
  }
  picked.sort((a, b) => t.size[b] - t.size[a]);
  const out = within > 0 ? picked.filter((id) => disk.contains(within, id)) : picked;
  return out.slice(0, limit);
}

// By type ------------------------------------------------------------------

export interface TypeRow {
  ext: string;
  extId: number;
  bytes: number;
  files: number;
}

export function byType(disk: Disk): TypeRow[] {
  const t = disk.t;
  const bytes = new Float64Array(t.exts.length);
  const files = new Uint32Array(t.exts.length);
  for (let i = 1; i < t.n; i++) {
    if (t.flags[i] & (F_DIR | F_GONE | F_LINK)) continue;
    bytes[t.ext[i]] += t.size[i];
    files[t.ext[i]]++;
  }
  const rows: TypeRow[] = [];
  for (let e = 0; e < t.exts.length; e++) {
    if (files[e] > 0) rows.push({ ext: t.exts[e], extId: e, bytes: bytes[e], files: files[e] });
  }
  return rows.sort((a, b) => b.bytes - a.bytes);
}

// Filters ------------------------------------------------------------------

export interface Filter {
  query: string;
  minBytes: number;
  olderThanDays: number;
  extId: number; // -1 for any
}

export const NO_FILTER: Filter = { query: "", minBytes: 0, olderThanDays: 0, extId: -1 };

export function isFiltering(f: Filter): boolean {
  return f.query.trim() !== "" || f.minBytes > 0 || f.olderThanDays > 0 || f.extId >= 0;
}

export interface FilterResult {
  ids: number[]; // largest first, capped
  total: number; // matches before the cap
  bytes: number; // bytes of matching files
}

export function runFilter(disk: Disk, f: Filter, limit: number): FilterResult {
  const t = disk.t;
  const before = f.olderThanDays > 0 ? Math.floor(Date.now() / 1000) - f.olderThanDays * 86400 : 0;
  const pass = (i: number): boolean => {
    if (t.flags[i] & F_GONE) return false;
    if (t.size[i] < f.minBytes) return false;
    if (f.extId >= 0 && (t.flags[i] & F_DIR || t.ext[i] !== f.extId)) return false;
    if (before > 0 && (t.flags[i] & F_DIR || t.mtime[i] === 0 || t.mtime[i] > before)) return false;
    return true;
  };

  let ids: number[];
  const q = f.query.trim();
  if (q !== "") {
    ids = disk.search(q, 400_000).filter(pass);
  } else {
    ids = [];
    for (let i = 1; i < t.n; i++) {
      // Without a name query folders would just repeat their files.
      if (!(t.flags[i] & F_DIR) && pass(i)) ids.push(i);
    }
  }
  let bytes = 0;
  for (const id of ids) if (!(t.flags[id] & F_DIR)) bytes += t.size[id];
  ids.sort((a, b) => t.size[b] - t.size[a]);
  const total = ids.length;
  if (ids.length > limit) ids.length = limit;
  return { ids, total, bytes };
}

// Developer clutter --------------------------------------------------------

export type ClutterKind =
  | "deps"
  | "build"
  | "cache"
  | "pkgcache"
  | "temp"
  | "browser"
  | "system"
  | "recycle";

export interface ClutterHit {
  id: number;
  kind: ClutterKind;
  bytes: number;
}

const BY_NAME: Record<string, ClutterKind> = {
  node_modules: "deps",
  bower_components: "deps",
  ".venv": "deps",
  pods: "deps",
  ".next": "build",
  ".nuxt": "build",
  ".svelte-kit": "build",
  ".angular": "build",
  deriveddata: "build",
  ".turbo": "cache",
  ".parcel-cache": "cache",
  __pycache__: "cache",
  ".pytest_cache": "cache",
  ".mypy_cache": "cache",
  ".ruff_cache": "cache",
  ".tox": "cache",
  ".gradle": "cache",
  "npm-cache": "pkgcache",
  "go-build": "pkgcache",
  crashdumps: "temp",
  "windows.old": "system",
  "$recycle.bin": "recycle",
};

// Folder name, then a file that must sit next to it for the match to count.
const WITH_SIBLING: [string, RegExp, ClutterKind][] = [
  ["target", /^cargo\.toml$/, "build"],
  ["dist", /^package\.json$/, "build"],
  ["build", /^(package\.json|build\.gradle(\.kts)?|cmakelists\.txt)$/, "build"],
  ["out", /^package\.json$/, "build"],
  ["obj", /\.(cs|fs|vb)proj$/, "build"],
  ["bin", /\.(cs|fs|vb)proj$/, "build"],
  ["venv", /^(requirements.*\.txt|pyproject\.toml|setup\.py)$/, "deps"],
  ["vendor", /^composer\.json$/, "deps"],
];

// Matched against the end of the lowercased path, with forward slashes.
const BY_PATH: [RegExp, ClutterKind][] = [
  [/\/appdata\/local\/temp$/, "temp"],
  [/\/windows\/temp$/, "temp"],
  [/\/windows\/softwaredistribution\/download$/, "system"],
  [/\/appdata\/local\/pip\/cache$/, "pkgcache"],
  [/\/appdata\/local\/yarn\/cache$/, "pkgcache"],
  [/\/appdata\/local\/pnpm\/store$/, "pkgcache"],
  [/\/appdata\/local\/pnpm-cache$/, "pkgcache"],
  [/\/\.nuget\/packages$/, "pkgcache"],
  [/\/\.cargo\/registry$/, "pkgcache"],
  [/\/\.gradle\/caches$/, "pkgcache"],
  [/\/\.m2\/repository$/, "pkgcache"],
  [/\/user data\/[^/]+\/(cache|code cache|gpucache)$/, "browser"],
  [/\/user data\/[^/]+\/service worker\/cachestorage$/, "browser"],
  [/\/firefox\/profiles\/[^/]+\/cache2$/, "browser"],
];

const PATH_TAILS = new Set(["temp", "download", "cache", "store", "pnpm-cache", "packages", "registry", "caches", "repository", "code cache", "gpucache", "cachestorage", "cache2"]);

export function findClutter(disk: Disk, minBytes = 1024 * 1024): ClutterHit[] {
  const t = disk.t;
  const inside = new Uint8Array(t.n); // already under a hit
  const hits: ClutterHit[] = [];
  for (let i = 1; i < t.n; i++) {
    const p = t.parent[i];
    if (inside[p]) {
      inside[i] = 1;
      continue;
    }
    if (!(t.flags[i] & F_DIR) || t.flags[i] & F_GONE) continue;
    const name = disk.name(i).toLowerCase();
    let kind: ClutterKind | undefined = BY_NAME[name];
    if (!kind) {
      for (const [dir, sibling, k] of WITH_SIBLING) {
        if (name !== dir) continue;
        for (const s of disk.children(p)) {
          if (!(t.flags[s] & F_DIR) && sibling.test(disk.name(s).toLowerCase())) {
            kind = k;
            break;
          }
        }
        break;
      }
    }
    if (!kind && PATH_TAILS.has(name)) {
      const path = disk.path(i).toLowerCase().replace(/\\/g, "/");
      for (const [re, k] of BY_PATH) {
        if (re.test(path)) {
          kind = k;
          break;
        }
      }
    }
    if (kind) {
      inside[i] = 1;
      if (t.size[i] >= minBytes) hits.push({ id: i, kind, bytes: t.size[i] });
    }
  }
  return hits.sort((a, b) => b.bytes - a.bytes);
}

// Compare with a snapshot ----------------------------------------------------

export interface Comparison {
  date: number;
  oldTotal: number;
  delta: Float64Array; // bytes gained since the snapshot, 0 when untracked
  isNew: Uint8Array;
  rows: number[]; // nodes that best explain the change, biggest change first
  removed: { path: string; bytes: number }[];
}

function key(names: Uint8Array, s: number, e: number): string {
  return String.fromCharCode.apply(null, names.subarray(s, e) as unknown as number[]);
}

const TRACKED_FILE = 8 * 1024 * 1024; // same floor the snapshot writer uses

export function compare(disk: Disk, snap: SnapshotTable): Comparison {
  const t = disk.t;
  const delta = new Float64Array(t.n);
  const isNew = new Uint8Array(t.n);
  const removed: { path: string; bytes: number }[] = [];

  // Children of every snapshot folder.
  const start = new Int32Array(snap.n + 1);
  for (let i = 1; i < snap.n; i++) start[snap.parent[i] + 1]++;
  for (let i = 0; i < snap.n; i++) start[i + 1] += start[i];
  const fill = start.slice(0, snap.n);
  const list = new Int32Array(Math.max(0, snap.n - 1));
  for (let i = 1; i < snap.n; i++) list[fill[snap.parent[i]]++] = i;

  delta[0] = t.size[0] - snap.size[0];
  const stack: [number, number][] = [[0, 0]];
  while (stack.length > 0) {
    const [cur, old] = stack.pop()!;
    const olds = new Map<string, number>();
    for (let k = start[old]; k < start[old + 1]; k++) {
      const o = list[k];
      olds.set(key(snap.names, snap.nameOff[o], snap.nameOff[o + 1]), o);
    }
    for (const c of disk.children(cur)) {
      const dir = (t.flags[c] & F_DIR) !== 0;
      const o = olds.get(key(t.names, t.nameOff[c], t.nameOff[c + 1]));
      if (o !== undefined) {
        olds.delete(key(t.names, t.nameOff[c], t.nameOff[c + 1]));
        delta[c] = t.size[c] - snap.size[o];
        if (dir && snap.flags[o] & F_DIR) stack.push([c, o]);
      } else if (dir || t.size[c] >= TRACKED_FILE) {
        delta[c] = t.size[c];
        isNew[c] = 1;
        if (dir) markNew(disk, c, delta, isNew);
      }
    }
    for (const o of olds.values()) {
      if (snap.size[o] >= TRACKED_FILE) {
        const name = new TextDecoder().decode(snap.names.subarray(snap.nameOff[o], snap.nameOff[o + 1]));
        removed.push({ path: disk.path(cur) + (cur === 0 && t.root.endsWith(disk.sep) ? "" : disk.sep) + name, bytes: snap.size[o] });
      }
    }
  }

  // Report the deepest node that still explains a change, not the whole chain above it.
  const FLOOR = 4 * 1024 * 1024;
  const rows: number[] = [];
  const walk: number[] = [0];
  while (walk.length > 0) {
    const id = walk.pop()!;
    const d = Math.abs(delta[id]);
    if (d < FLOOR) continue;
    let explained = false;
    if (t.flags[id] & F_DIR && !isNew[id]) {
      for (const c of disk.children(id)) {
        if (Math.abs(delta[c]) >= FLOOR) walk.push(c);
        if (Math.abs(delta[c]) >= d * 0.85) explained = true;
      }
    }
    if (!explained && id !== 0) rows.push(id);
  }
  rows.sort((a, b) => Math.abs(delta[b]) - Math.abs(delta[a]));
  removed.sort((a, b) => b.bytes - a.bytes);
  return { date: snap.meta.date, oldTotal: snap.size[0], delta, isNew, rows: rows.slice(0, 400), removed: removed.slice(0, 200) };
}

function markNew(disk: Disk, dir: number, delta: Float64Array, isNew: Uint8Array): void {
  const stack = [dir];
  while (stack.length > 0) {
    for (const c of disk.children(stack.pop()!)) {
      delta[c] = disk.size(c);
      isNew[c] = 1;
      if (disk.isDir(c)) stack.push(c);
    }
  }
}

// Duplicate candidates -------------------------------------------------------

export function duplicateCandidates(disk: Disk, minBytes: number, within = 0): DupCandidate[] {
  const t = disk.t;
  const bySize = new Map<number, number[]>();
  for (let i = 1; i < t.n; i++) {
    if (t.flags[i] & (F_DIR | F_GONE | F_LINK) || t.logical[i] < minBytes) continue;
    // Identical files have identical lengths, whatever they take on disk.
    const g = bySize.get(t.logical[i]);
    if (g) g.push(i);
    else bySize.set(t.logical[i], [i]);
  }
  const out: DupCandidate[] = [];
  for (const [size, all] of bySize) {
    const ids = within > 0 ? all.filter((id) => disk.contains(within, id)) : all;
    if (ids.length > 1) out.push({ size, ids, paths: ids.map((id) => disk.path(id)) });
  }
  return out.sort((a, b) => b.size - a.size);
}
