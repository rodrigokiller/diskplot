// Types shared by the main process, the workers and the renderer.

export const F_DIR = 1;
export const F_LINK = 2; // symlink or junction, never followed
export const F_ERR = 4; // unreadable folder or failed stat
export const F_GONE = 8; // removed from inside the app after the scan

// One scan, stored as columns. Node 0 is the root and every parent index is
// lower than its children, so one backward pass can sum sizes upward.
export interface ScanTable {
  root: string;
  n: number;
  parent: Int32Array;
  size: Float64Array; // bytes on disk where the system reports it
  logical: Float64Array; // length in bytes
  mtime: Uint32Array; // seconds since epoch
  flags: Uint8Array;
  files: Uint32Array; // files in the subtree, 1 for a file
  nameOff: Uint32Array; // n + 1 offsets into names
  names: Uint8Array; // UTF-8
  childStart: Int32Array; // n + 1 offsets into childList
  childList: Int32Array; // children of each folder, largest first
  ext: Uint16Array; // index into exts, 0 means none
  exts: string[];
  startedAt: number;
  durationMs: number;
  dirs: number;
  errors: number;
  errorSamples: ScanIssue[];
  incomplete?: boolean; // the scan was stopped before the end
}

export interface ScanIssue {
  path: string;
  code: string;
}

export interface ScanProgress {
  files: number;
  dirs: number;
  bytes: number;
  errors: number;
  current: string;
  elapsedMs: number;
  top: { name: string; bytes: number; dir: boolean }[];
}

export interface DriveInfo {
  path: string;
  total: number;
  free: number;
}

export interface SnapshotMeta {
  file: string;
  root: string;
  date: number;
  total: number;
  files: number;
}

// A reduced copy of a past scan: every folder plus the large files.
export interface SnapshotTable {
  meta: SnapshotMeta;
  n: number;
  parent: Int32Array;
  size: Float64Array;
  flags: Uint8Array;
  nameOff: Uint32Array;
  names: Uint8Array;
}

export interface DupCandidate {
  size: number;
  ids: number[];
  paths: string[];
}

export interface DupGroup {
  size: number;
  ids: number[];
}

export interface DupProgress {
  done: number;
  total: number;
  bytes: number;
  totalBytes: number;
}

export interface TrashResult {
  path: string;
  ok: boolean;
  error?: string;
}

export interface WindowInfo {
  id: number;
  title: string;
  focused: boolean;
}

// Files waiting to be pasted. A cut moves them, a copy duplicates them.
export interface FileClip {
  paths: string[];
  cut: boolean;
}

export interface PasteResult {
  src: string;
  dest: string;
  ok: boolean;
  error?: string;
}

// One item measured after the scan, ready to be added to it.
export type Measured =
  | { ok: true; kind: "file"; name: string; size: number; mtime: number }
  | { ok: true; kind: "dir"; name: string; table: ScanTable }
  | { ok: false; error: string };

export type ItemStat =
  | { ok: true; created: number; modified: number; accessed: number; readOnly: boolean }
  | { ok: false; error: string };

export type UpdateStatus =
  | { state: "dev" | "checking" | "none" }
  | { state: "available" | "ready"; version: string }
  | { state: "downloading"; percent: number }
  | { state: "error"; error: string };
