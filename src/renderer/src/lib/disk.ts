import { F_DIR, F_ERR, F_GONE, F_LINK } from "../../../shared/types";
import type { ScanTable } from "../../../shared/types";

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
