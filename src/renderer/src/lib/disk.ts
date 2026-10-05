import { F_DIR, F_ERR, F_GONE, F_LINK } from "../../../shared/types";
import type { Measured, ScanTable } from "../../../shared/types";

const decoder = new TextDecoder();

// Read access to one scan, plus the few edits the app makes after it
// (marking nodes removed and resorting a folder on demand).
export class Disk {
  readonly t: ScanTable;
  readonly sep: string;
  private nameCache = new Map<number, string>();
  private haystack: string | null = null;

  constructor(table: ScanTable) {
    this.t = table;
    this.sep = table.root.includes("/") && !table.root.includes("\\") ? "/" : "\\";
  }

  get n(): number {
    return this.t.n;
  }
  size(id: number): number {
    return this.t.size[id];
  }
  logical(id: number): number {
    return this.t.logical[id];
  }
  parent(id: number): number {
    return this.t.parent[id];
  }
  isDir(id: number): boolean {
    return (this.t.flags[id] & F_DIR) !== 0;
  }
  isLink(id: number): boolean {
    return (this.t.flags[id] & F_LINK) !== 0;
  }
  hasError(id: number): boolean {
    return (this.t.flags[id] & F_ERR) !== 0;
  }
  isGone(id: number): boolean {
    return (this.t.flags[id] & F_GONE) !== 0;
  }
  files(id: number): number {
    return this.isDir(id) ? this.t.files[id] : 1;
  }
  ext(id: number): string {
    return this.t.exts[this.t.ext[id]];
  }

  name(id: number): string {
    let s = this.nameCache.get(id);
    if (s === undefined) {
      s = decoder.decode(this.t.names.subarray(this.t.nameOff[id], this.t.nameOff[id + 1]));
      if (this.nameCache.size > 200_000) this.nameCache.clear();
      this.nameCache.set(id, s);
    }
    return s;
  }

  path(id: number): string {
    const parts: string[] = [];
    for (let i = id; i > 0; i = this.t.parent[i]) parts.push(this.name(i));
    const root = this.t.root;
    if (parts.length === 0) return root;
    return (root.endsWith(this.sep) ? root : root + this.sep) + parts.reverse().join(this.sep);
  }

  // The names from the root down to a node, and the way back. Used to carry
  // a position from one table to the next, where ids differ.
  trail(id: number): string[] {
    const out: string[] = [];
    for (let i = id; i > 0; i = this.t.parent[i]) out.push(this.name(i));
    return out.reverse();
  }
  follow(trail: string[]): number {
    let at = 0;
    for (const name of trail) {
      let next = -1;
      for (const c of this.children(at)) {
        if (this.name(c) === name) {
          next = c;
          break;
        }
      }
      if (next === -1) return -1;
      at = next;
    }
    return at;
  }

  // The node for an absolute path, or -1 when it is not part of this scan.
  findPath(path: string): number {
    const norm = (p: string): string => p.replace(/[\\/]+/g, this.sep).replace(/[\\/]$/, "").toLowerCase();
    const root = norm(this.t.root);
    const full = norm(path);
    if (full === root) return 0;
    if (!full.startsWith(root + this.sep)) return -1;
    const names = path.replace(/[\\/]+/g, this.sep).replace(/[\\/]$/, "").slice(root.length + 1).split(this.sep);
    let at = 0;
    for (const name of names) {
      const want = name.toLowerCase();
      let next = -1;
      for (const c of this.children(at)) {
        if (this.name(c).toLowerCase() === want) {
          next = c;
          break;
        }
      }
      if (next === -1) return -1;
      at = next;
    }
    return at;
  }

  // Adds a freshly measured file or folder under `parent`. Ids already in
  // use do not change: the new nodes are appended. Returns the new node.
  graft(parent: number, item: Measured & { ok: true }): number {
    const t = this.t as { -readonly [K in keyof ScanTable]: ScanTable[K] };
    const enc = new TextEncoder();
    const rootName = enc.encode(item.name);
    const sub = item.kind === "dir" ? item.table : null;
    const m = sub ? sub.n : 1;
    const n0 = t.n;
    const n1 = n0 + m;
    const base = n0; // id of the grafted root

    const grow = <A extends Int32Array | Float64Array | Uint32Array | Uint8Array | Uint16Array>(a: A, len: number): A => {
      const b = new (a.constructor as new (n: number) => A)(len);
      b.set(a.subarray(0, Math.min(a.length, len)));
      return b;
    };
    const parentCol = grow(t.parent, n1);
    const size = grow(t.size, n1);
    const logical = grow(t.logical, n1);
    const mtime = grow(t.mtime, n1);
    const flags = grow(t.flags, n1);
    const files = grow(t.files, n1);
    const ext = grow(t.ext, n1);
    const nameOff = grow(t.nameOff, n1 + 1);

    const subNames = sub ? sub.names.subarray(sub.nameOff[1]) : new Uint8Array(0);
    const names = new Uint8Array(t.names.length + rootName.length + subNames.length);
    names.set(t.names);
    names.set(rootName, t.names.length);
    names.set(subNames, t.names.length + rootName.length);
    nameOff[base + 1] = t.names.length + rootName.length;

    parentCol[base] = parent;
    if (sub) {
      // Extensions are indexes into a per-table list; translate them.
      const extMap = sub.exts.map((e) => {
        let at = t.exts.indexOf(e);
        if (at === -1 && t.exts.length < 0xffff) at = t.exts.push(e) - 1;
        return Math.max(0, at);
      });
      const shift = nameOff[base + 1] - sub.nameOff[1];
      for (let j = 0; j < m; j++) {
        const id = base + j;
        if (j > 0) {
          parentCol[id] = base + sub.parent[j];
          nameOff[id + 1] = sub.nameOff[j + 1] + shift;
        }
        size[id] = sub.size[j];
        logical[id] = sub.logical[j];
        mtime[id] = sub.mtime[j];
        flags[id] = sub.flags[j];
        files[id] = sub.files[j];
        ext[id] = extMap[sub.ext[j]] ?? 0;
      }
    } else if (item.kind === "file") {
      size[base] = item.size;
      logical[base] = item.size;
      mtime[base] = item.mtime;
      const dot = item.name.lastIndexOf(".");
      if (dot > 0 && dot < item.name.length - 1 && item.name.length - dot <= 12) {
        const e = item.name.slice(dot + 1).toLowerCase();
        let at = t.exts.indexOf(e);
        if (at === -1 && t.exts.length < 0xffff) at = t.exts.push(e) - 1;
        ext[base] = Math.max(0, at);
      }
    }

    // Children lists: every folder keeps its order, the parent gains one entry.
    const childStart = new Int32Array(n1 + 1);
    for (let i = 0; i < n0; i++) childStart[i + 1] = t.childStart[i + 1] - t.childStart[i];
    childStart[parent + 1]++;
    if (sub) for (let j = 0; j < m; j++) childStart[base + j + 1] = sub.childStart[j + 1] - sub.childStart[j];
    for (let i = 0; i < n1; i++) childStart[i + 1] += childStart[i];
    const childList = new Int32Array(n1 - 1);
    for (let i = 0; i < n0; i++) {
      childList.set(t.childList.subarray(t.childStart[i], t.childStart[i + 1]), childStart[i]);
    }
    childList[childStart[parent + 1] - 1] = base;
    if (sub) {
      for (let j = 0; j < m; j++) {
        const from = sub.childList.subarray(sub.childStart[j], sub.childStart[j + 1]);
        const at = childStart[base + j];
        for (let k = 0; k < from.length; k++) childList[at + k] = base + from[k];
      }
    }

    const addBytes = size[base];
    const addLogical = logical[base];
    const addFiles = flags[base] & F_DIR ? files[base] : 1;
    Object.assign(t, { n: n1, parent: parentCol, size, logical, mtime, flags, files, ext, nameOff, names, childStart, childList });
    if (sub) t.dirs += sub.dirs;
    for (let p = parent; p >= 0; p = t.parent[p]) {
      t.size[p] += addBytes;
      t.logical[p] += addLogical;
      t.files[p] += addFiles;
      if (t.mtime[base] > t.mtime[p]) t.mtime[p] = t.mtime[base];
    }
    for (let p = parent; p >= 0; p = t.parent[p]) this.resort(p);
    this.nameCache.clear();
    this.haystack = null;
    return base;
  }

  // Root first, the node itself last.
  ancestors(id: number): number[] {
    const out: number[] = [];
    for (let i = id; i >= 0; i = this.t.parent[i]) out.push(i);
    return out.reverse();
  }

  depth(id: number): number {
    let d = 0;
    for (let i = this.t.parent[id]; i >= 0; i = this.t.parent[i]) d++;
    return d;
  }

  contains(ancestor: number, id: number): boolean {
    for (let i = id; i >= 0; i = this.t.parent[i]) if (i === ancestor) return true;
    return false;
  }

  // Children, largest first. Removed nodes sort last and are cut off.
  children(id: number): Int32Array {
    const s = this.t.childStart[id];
    let e = this.t.childStart[id + 1];
    const list = this.t.childList;
    while (e > s && this.t.flags[list[e - 1]] & F_GONE) e--;
    return list.subarray(s, e);
  }

  // Marks a node as removed and takes its weight off every ancestor.
  remove(id: number): void {
    if (this.isDir(id)) this.t.dirs = Math.max(1, this.t.dirs - 1);
    const t = this.t;
    if (id <= 0 || t.flags[id] & F_GONE) return;
    const bytes = t.size[id];
    const length = t.logical[id];
    const count = this.files(id);
    t.flags[id] |= F_GONE;
    for (let p = t.parent[id], child = id; p >= 0; child = p, p = t.parent[p]) {
      t.size[p] -= bytes;
      t.logical[p] -= length;
      t.files[p] -= count;
      this.resort(p);
    }
    t.size[id] = 0;
    this.resort(t.parent[id]);
  }

  private resort(dir: number): void {
    const t = this.t;
    const gone = (i: number): number => (t.flags[i] & F_GONE ? 1 : 0);
    t.childList
      .subarray(t.childStart[dir], t.childStart[dir + 1])
      .sort((a, b) => gone(a) - gone(b) || t.size[b] - t.size[a] || a - b);
  }

  // Every name as one string with one character per byte, so a substring
  // search runs natively and a match offset maps back to a node.
  private names1(): string {
    if (this.haystack === null) {
      const bytes = this.t.names;
      const parts: string[] = [];
      const STEP = 1 << 15;
      for (let i = 0; i < bytes.length; i += STEP) {
        parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + STEP) as unknown as number[]));
      }
      this.haystack = parts.join("").toLowerCase();
    }
    return this.haystack;
  }

  private nodeAtOffset(off: number): number {
    const o = this.t.nameOff;
    let lo = 0;
    let hi = this.t.n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (o[mid] <= off) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  // Ids whose name contains the query, case insensitive. Stops at `limit`.
  search(query: string, limit: number): number[] {
    const bytes = new TextEncoder().encode(query);
    const needle = String.fromCharCode.apply(null, bytes as unknown as number[]).toLowerCase();
    if (needle.length === 0) return [];
    const hay = this.names1();
    const o = this.t.nameOff;
    const out: number[] = [];
    let at = hay.indexOf(needle, o[1]); // skip the root
    while (at !== -1 && out.length < limit) {
      const id = this.nodeAtOffset(at);
      // A match may not run across the border between two names.
      if (at + needle.length <= o[id + 1] && !(this.t.flags[id] & F_GONE)) out.push(id);
      at = hay.indexOf(needle, Math.max(at + 1, o[id + 1] - needle.length + 1));
      if (at !== -1 && at < o[id + 1] && out[out.length - 1] === id) at = hay.indexOf(needle, o[id + 1]);
    }
    return out;
  }
}
