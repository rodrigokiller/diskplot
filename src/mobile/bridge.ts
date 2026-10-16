// window.api for Android: the same calls the desktop preload offers, served by
// the native Diskplot plugin. What Android cannot do is reported in `can` and
// answered with a harmless no-op.
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { Api } from "../preload";
import type { DriveInfo, DupCandidate, DupGroup, DupProgress, ItemStat, ScanProgress, ScanTable, SnapshotMeta, SnapshotTable } from "../shared/types";
import { finishTable, previewTable } from "../shared/table";
import type { RawScan, ScanFacts } from "../shared/table";
import { reduceTable } from "../shared/reduce";
import type { Reduced } from "../shared/reduce";

interface Native {
  access(): Promise<{ granted: boolean }>;
  requestAccess(): Promise<void>;
  volumes(): Promise<{ volumes: DriveInfo[] }>;
  pickFolder(): Promise<{ path?: string }>;
  startScan(o: { root: string }): Promise<{ ok: boolean; root?: string; error?: string; scan?: number }>;
  stopScan(): Promise<void>;
  cancelScan(): Promise<void>;
  stat(o: { path: string }): Promise<ItemStat>;
  openExternal(o: { url: string }): Promise<void>;
  info(): Promise<{ version: string }>;
  startDuplicates(o: { candidates: DupCandidate[] }): Promise<void>;
  cancelDuplicates(): Promise<void>;
  exitApp(): Promise<void>;
  copyText(o: { text: string }): Promise<void>;
  setBars(o: { color: string; dark: boolean }): Promise<void>;
  addListener(event: string, cb: (data: never) => void): Promise<unknown>;
}

const Native = registerPlugin<Native>("Diskplot");

// A small event hub with the same unsubscribe shape as the preload's.
type Cb = (...args: never[]) => void;
const subs = new Map<string, Set<Cb>>();
function on<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  let set = subs.get(channel);
  if (!set) subs.set(channel, (set = new Set()));
  set.add(cb as unknown as Cb);
  return () => set!.delete(cb as unknown as Cb);
}
function emit(channel: string, ...args: unknown[]): void {
  subs.get(channel)?.forEach((cb) => (cb as (...a: unknown[]) => void)(...args));
}

// Scans ---------------------------------------------------------------------
// The native scanner writes what it has collected to a file in the app's
// cache; it is read here and turned into a table by the shared code.

interface Head extends ScanFacts {
  root: string;
  n: number;
  nameBytes: number;
}

async function readRaw(file: string): Promise<{ raw: RawScan; facts: ScanFacts }> {
  const buf = await (await fetch(Capacitor.convertFileSrc(file))).arrayBuffer();
  const view = new DataView(buf);
  const headLen = view.getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, headLen))) as Head;
  const n = head.n;
  let off = (4 + headLen + 7) & ~7; // the columns start on an 8 byte boundary
  const take = <A>(make: (b: ArrayBuffer, o: number, l: number) => A, len: number, width: number): A => {
    const a = make(buf, off, len);
    off += len * width;
    return a;
  };
  const size = take((b, o, l) => new Float64Array(b, o, l), n, 8);
  const logical = take((b, o, l) => new Float64Array(b, o, l), n, 8);
  const parent = take((b, o, l) => new Int32Array(b, o, l), n, 4);
  const mtime = take((b, o, l) => new Uint32Array(b, o, l), n, 4);
  const nameOff = take((b, o, l) => new Uint32Array(b, o, l), n + 1, 4);
  const flags = take((b, o, l) => new Uint8Array(b, o, l), n, 1);
  const names = take((b, o, l) => new Uint8Array(b, o, l), head.nameBytes, 1);
  return {
    raw: { root: head.root, n, parent, size, logical, mtime, flags, nameOff, names },
    facts: {
      startedAt: head.startedAt,
      durationMs: head.durationMs,
      dirs: head.dirs,
      errors: head.errors,
      errorSamples: head.errorSamples ?? [],
      incomplete: head.incomplete,
    },
  };
}

let scanId = 0; // the scan whose events still count
let depth = 3; // how deep the preview goes
let partialTicket = 0;
let finished = true;

void Native.addListener("progress", ((p: ScanProgress & { scan: number }) => {
  if (p.scan === scanId && !finished) emit("scan:progress", p);
}) as (d: never) => void);

void Native.addListener("partial", (async ({ file, scan }: { file: string; scan: number }) => {
  if (scan !== scanId || finished) return;
  const mine = ++partialTicket;
  try {
    const { raw, facts } = await readRaw(file);
    // A newer preview, or the end of the scan, may have arrived meanwhile.
    if (mine !== partialTicket || finished || scan !== scanId) return;
    emit("scan:partial", previewTable(raw, depth, facts));
  } catch {
    // A preview is only a preview; the next one will do.
  }
}) as unknown as (d: never) => void);

void Native.addListener("done", (async ({ file, scan }: { file: string; scan: number }) => {
  if (scan !== scanId) return;
  finished = true;
  partialTicket++;
  try {
    const { raw, facts } = await readRaw(file);
    const table = finishTable(raw, facts);
    let meta: SnapshotMeta | null = null;
    if (!table.incomplete) meta = await store.save(reduceTable(table, table.startedAt)).catch(() => null);
    emit("scan:done", table, meta);
  } catch (e) {
    emit("scan:error", String((e as Error).message ?? e));
  }
}) as unknown as (d: never) => void);

void Native.addListener("error", (({ error, scan }: { error: string; scan: number }) => {
  if (scan !== scanId) return;
  finished = true;
  emit("scan:error", error);
}) as (d: never) => void);

void Native.addListener("dupProgress", ((p: DupProgress) => emit("dup:progress", p)) as (d: never) => void);
void Native.addListener("dupDone", (({ groups }: { groups: DupGroup[] }) => emit("dup:done", groups)) as (d: never) => void);
void Native.addListener("resume", (() => emit("app:resume")) as (d: never) => void);
// The interface decides what back means at each moment; see App.tsx.
void Native.addListener("back", (() => window.dispatchEvent(new Event("diskplot:back"))) as (d: never) => void);

// The theme's paper as #rrggbb. The stylesheet writes it in oklch, which only a
// canvas turns into plain numbers.
function paper(): { color: string; dark: boolean } {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const g = c.getContext("2d")!;
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim() || "#ffffff";
  g.fillRect(0, 0, 1, 1);
  const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
  const hex = "#" + [r, gr, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  return { color: hex, dark: 0.2126 * r + 0.7152 * gr + 0.0722 * b < 128 };
}

// History --------------------------------------------------------------------
// Snapshots for the Changes tab live in IndexedDB, inside the app's own data.

const KEEP_PER_ROOT = 8;
const store = (() => {
  const db = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("diskplot", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("meta", { keyPath: "file" });
      req.result.createObjectStore("data");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const run = <T>(stores: string[], mode: IDBTransactionMode, body: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> =>
    db.then(
      (d) =>
        new Promise<T | undefined>((resolve, reject) => {
          const tx = d.transaction(stores, mode);
          const req = body(tx);
          tx.oncomplete = () => resolve(req ? req.result : undefined);
          tx.onerror = () => reject(tx.error);
        }),
    );
  const list = async (root?: string): Promise<SnapshotMeta[]> => {
    const all = ((await run<SnapshotMeta[]>(["meta"], "readonly", (tx) => tx.objectStore("meta").getAll())) ?? []) as SnapshotMeta[];
    const key = root?.toLowerCase();
    return all.filter((m) => !key || m.root.toLowerCase() === key).sort((a, b) => b.date - a.date);
  };
  return {
    list,
    async save(r: Reduced): Promise<SnapshotMeta> {
      const meta: SnapshotMeta = { file: r.meta.root.toLowerCase() + "|" + r.meta.date, ...r.meta };
      await run(["meta", "data"], "readwrite", (tx) => {
        tx.objectStore("meta").put(meta);
        tx.objectStore("data").put({ n: r.n, parent: r.parent, size: r.size, flags: r.flags, nameOff: r.nameOff, names: r.names }, meta.file);
      });
      const old = (await list(r.meta.root)).slice(KEEP_PER_ROOT);
      if (old.length > 0)
        await run(["meta", "data"], "readwrite", (tx) => {
          for (const m of old) {
            tx.objectStore("meta").delete(m.file);
            tx.objectStore("data").delete(m.file);
          }
        });
      return meta;
    },
    async load(file: string): Promise<SnapshotTable | null> {
      const meta = (await run<SnapshotMeta>(["meta"], "readonly", (tx) => tx.objectStore("meta").get(file))) as SnapshotMeta | undefined;
      const data = (await run<Omit<SnapshotTable, "meta">>(["data"], "readonly", (tx) => tx.objectStore("data").get(file))) as
        | Omit<SnapshotTable, "meta">
        | undefined;
      return meta && data ? { meta, ...data } : null;
    },
  };
})();

// The API -------------------------------------------------------------------

const none = (): (() => void) => () => undefined;
let version = "";
void Native.info().then((i) => (version = i.version)).catch(() => undefined);

const api: Api = {
  can: { windows: false, trash: false, reveal: false, update: false, watch: false, fileClipboard: false, drop: false },
  compact: window.matchMedia("(max-width: 820px)").matches,
  access: () => Native.access().then((r) => r.granted),
  requestAccess: () => Native.requestAccess(),
  onResume: (cb: () => void) => on("app:resume", cb),

  listDrives: () => Native.volumes().then((r) => r.volumes),
  pathForFile: () => "",
  pickFolder: () => Native.pickFolder().then((r) => r.path ?? null).catch(() => null),

  startScan: async (root: string, liveDepth?: number) => {
    depth = Math.max(3, Math.min(6, liveDepth ?? 5));
    finished = false;
    partialTicket++;
    const r = await Native.startScan({ root });
    if (r.scan !== undefined) scanId = r.scan;
    return { ok: r.ok, root: r.root, error: r.error };
  },
  stopScan: () => Native.stopScan(),
  cancelScan: () => {
    finished = true;
    scanId = -1;
    return Native.cancelScan();
  },
  onScanProgress: (cb: (p: ScanProgress) => void) => on("scan:progress", cb),
  onScanPartial: (cb: (t: ScanTable) => void) => on("scan:partial", cb),
  onScanDone: (cb: (t: ScanTable, snapshot: SnapshotMeta | null) => void) => on("scan:done", cb),
  onScanError: (cb: (error: string) => void) => on("scan:error", cb),

  listSnapshots: (root: string) => store.list(root),
  loadSnapshot: async (file: string) => {
    const snapshot = await store.load(file).catch(() => null);
    return snapshot ? { ok: true, snapshot } : { ok: false, error: "ENOENT" };
  },

  startDuplicates: (candidates: DupCandidate[]) => Native.startDuplicates({ candidates }),
  cancelDuplicates: () => Native.cancelDuplicates(),
  onDupProgress: (cb: (p: DupProgress) => void) => on("dup:progress", cb),
  onDupDone: (cb: (groups: DupGroup[]) => void) => on("dup:done", cb),
  onDupError: (cb: (error: string) => void) => on("dup:error", cb),

  showInFolder: async () => undefined,
  openPath: async () => "",
  openExternal: (url: string) => Native.openExternal({ url }),
  trash: async (paths: string[]) => paths.map((path) => ({ path, ok: false, error: "ENOTSUP" })),
  // The WebView may refuse the web clipboard; the system one always answers.
  copyText: (text: string) => Native.copyText({ text }),

  measure: async () => ({ ok: false, error: "ENOTSUP" }),
  stat: (path: string) => Native.stat({ path }),
  setClip: async () => undefined,
  getClip: async () => null,
  paste: async (paths: string[]) => paths.map((src) => ({ src, dest: "", ok: false, error: "ENOTSUP" })),
  onPasteProgress: none,

  startWatch: async () => undefined,
  stopWatch: async () => undefined,
  onWatchChanges: none,
  onWatchLost: none,
  saveSnapshot: (reduced: Reduced) => store.save(reduced).catch(() => null),

  newWindow: async () => undefined,
  closeWindow: async () => undefined,
  listWindows: async () => [{ id: 1, title: document.title, focused: true }],
  focusWindow: async () => undefined,
  arrangeWindows: async () => undefined,
  setTitle: async (title: string) => {
    document.title = title;
  },
  onWindows: none,

  // Called when the theme changes; on Android it repaints the system bars.
  setOverlay: () => Native.setBars(paper()).catch(() => undefined),
  toggleFullScreen: async () => undefined,
  toggleDevTools: async () => undefined,
  info: async () => ({ version: version || (await Native.info()).version, platform: "android", home: "/storage/emulated/0" }),
  quit: () => Native.exitApp(),

  checkUpdate: async () => undefined,
  downloadUpdate: async () => undefined,
  installUpdate: async () => undefined,
  onUpdateStatus: none,
};

window.api = api;
