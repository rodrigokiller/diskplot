import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { F_DIR } from "../../shared/types";
import { reduceTable } from "../../shared/reduce";
import type { DriveInfo, ItemStat, ScanProgress, WatchBatch, ScanTable, SnapshotMeta, UpdateStatus, WindowInfo } from "../../shared/types";
import { Disk } from "./lib/disk";
import type { Graftable } from "./lib/disk";
import { NO_FILTER, compare, isFiltering, runFilter, topFiles } from "./lib/analysis";
import type { Comparison, Filter } from "./lib/analysis";
import { initialLang, makeFmt, makeT } from "./lib/i18n";
import type { Fmt, Lang, T } from "./lib/i18n";
import { Icon, Mark, Wordmark } from "./components/Icon";
import { Menu } from "./components/ui";
import type { MenuEntry } from "./components/ui";
import { Treemap } from "./components/Treemap";
import { TreeView } from "./components/TreeView";
import { ChangesPane, ClutterPane, DupesPane, ListPane, TypesPane } from "./components/Panels";
import type { DupState } from "./components/Panels";

type Family = "grid" | "paper";
type Mode = "system" | "light" | "dark";
const FAMILIES = ["grid", "paper"] as const;
const MODES = ["system", "light", "dark"] as const;
const LEVELS = [2, 3, 4, 5, 6, 0] as const; // 0 means every level
const BAR = ["file", "view", "window", "help"] as const;
type BarName = (typeof BAR)[number];
// Shown in menus and in the shortcut list. The Mac spells the modifier its own way.
const MOD = navigator.platform.toLowerCase().includes("mac") ? "Cmd" : "Ctrl";
type Tab = "tree" | "largest" | "types" | "clutter" | "dupes" | "changes" | "found";
type Phase = { is: "start" } | { is: "scanning"; root: string } | { is: "failed"; root: string; error: string } | { is: "ready" };

const MB = 1024 * 1024;
const SITE = "https://www.diskplot.com/";
const REPO = "https://github.com/rodrigokiller/diskplot";
const AUTHOR_SITE = "https://sanguanini.dev";
const DUP_IDLE: DupState = { status: "idle", progress: null, groups: [] };

function load<V extends string>(key: string, allowed: readonly V[], fallback: V): V {
  try {
    const v = localStorage.getItem(key) as V | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A preference that fails to save is not worth interrupting anyone.
  }
}

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [family, setFamily] = useState<Family>(() => load("family", FAMILIES, "grid"));
  const [mode, setMode] = useState<Mode>(() => load("mode", MODES, "light"));
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const dark = mode === "system" ? systemDark : mode === "dark";
  // The value the stylesheet keys on.
  const theme = family === "grid" ? (dark ? "grid-dark" : "grid") : dark ? "dark" : "light";
  const t = useMemo(() => makeT(lang), [lang]);
  const fmt = useMemo(() => makeFmt(lang, t), [lang, t]);

  const [phase, setPhase] = useState<Phase>({ is: "start" });
  const [drives, setDrives] = useState<DriveInfo[] | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [disk, setDisk] = useState<Disk | null>(null);
  const [version, setVersion] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [selected, setSelected] = useState(-1);
  const [hover, setHover] = useState(-1);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([0]));
  const [reveal, setReveal] = useState(0);
  const [tab, setTab] = useState<Tab>("tree");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [against, setAgainst] = useState<string | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [dups, setDups] = useState<DupState>(DUP_IDLE);
  const [panelWidth, setPanelWidth] = useState(() => {
    try {
      const w = Number(localStorage.getItem("panel"));
      return w >= 320 && w <= 1200 ? w : 580;
    } catch {
      return 580;
    }
  });
  const [planArea, setPlanArea] = useState(0);
  const [levels, setLevels] = useState(() => Number(load("levels", ["2", "3", "4", "5", "6", "0"] as const, "2")));
  // Where the plan has been, for Back and Forward.
  const [trail, setTrail] = useState<{ back: number[]; forward: number[] }>({ back: [], forward: [] });

  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[]; from?: BarName; first?: boolean } | null>(null);
  // Which bar entry the keyboard is on after Alt, or -1.
  const [barFocus, setBarFocus] = useState(-1);
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [propsOf, setPropsOf] = useState<number | null>(null);
  const [itemStat, setItemStat] = useState<ItemStat | null>(null);
  const [trash, setTrash] = useState<number[] | null>(null);
  const [dialog, setDialog] = useState<"issues" | "about" | "keys" | null>(null);
  const [notice, setNotice] = useState<{ text: string; bad?: boolean; progress?: number; action?: { label: string; run: () => void } } | null>(null);
  const [stopping, setStopping] = useState(false);
  // What the scan is measured against for a percentage: the drive's used
  // space, or the last scan of the same folder. Null when there is nothing to go by.
  const [scanBase, setScanBase] = useState<number | null>(null);
  // The scan's numbers, shown under the schedule while it runs.
  const [dockOpen, setDockOpen] = useState(true);
  // Items added a moment ago, so the plan and the tree can point them out.
  const [fresh, setFresh] = useState<Set<number>>(() => new Set());
  const freshTimer = useRef(0);
  const markFresh = (ids: number[]): void => {
    if (ids.length === 0) return;
    setFresh(new Set(ids.slice(0, 500)));
    window.clearTimeout(freshTimer.current);
    freshTimer.current = window.setTimeout(() => setFresh(new Set()), 1700);
  };
  // Live sync: the wish (remembered) and whether it had to give up on this scan.
  const [sync, setSync] = useState(() => load("sync", ["on", "off"] as const, "off") === "on");
  const [syncLost, setSyncLost] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const askedUpdate = useRef(false);
  const view = useRef({ disk, zoom, selected, expanded, trail, menu, barFocus });
  view.current = { disk, zoom, selected, expanded, trail, menu, barFocus };
  const searchRef = useRef<HTMLInputElement>(null);

  // Preferences ------------------------------------------------------------

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = (): void => setSystemDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  // A layout effect, so the colours are in place before the plan redraws.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    void window.api.setOverlay(theme.endsWith("dark") ? "#c9d4cf" : "#33403c");
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
  }, [lang]);

  // Windows ----------------------------------------------------------------

  useEffect(() => {
    void window.api.listWindows().then(setWindows);
    return window.api.onWindows(setWindows);
  }, []);
  const titleRoot = disk ? disk.t.root : phase.is === "scanning" ? phase.root : "";
  useEffect(() => {
    void window.api.setTitle(titleRoot ? titleRoot + " - Diskplot" : "Diskplot");
  }, [titleRoot]);

  // Start ------------------------------------------------------------------

  const refreshDrives = useCallback(() => {
    void window.api.listDrives().then(setDrives);
  }, []);
  useEffect(() => {
    refreshDrives();
    void window.api.info().then((i) => setAppVersion(i.version));
    const timer = setTimeout(() => void window.api.checkUpdate(), 4000);
    return () => clearTimeout(timer);
  }, [refreshDrives]);

  const startScan = useCallback((root: string) => {
    setMenu(null);
    setProgress(null);
    setNotice(null);
    setSyncLost(false);
    setDockOpen(true);
    setFresh(new Set());
    setDisk(null);
    setTab("tree");
    setPhase({ is: "scanning", root });
    const norm = (p: string): string => p.replace(/[\\/]+$/, "").toLowerCase();
    const drive = drives?.find((d) => norm(d.path) === norm(root));
    if (drive) setScanBase(drive.total - drive.free);
    else {
      setScanBase(null);
      void window.api.listSnapshots(root).then((all) => all.length > 0 && setScanBase(all[0].total));
    }
    void window.api.cancelDuplicates();
    // The preview goes one level past what the plan opens, so it stays small and quick.
    void window.api.startScan(root, levels === 0 ? 6 : levels + 1).then((r) => {
      if (!r.ok) setPhase({ is: "failed", root, error: r.error === "ENOENT" ? "missing" : (r.error ?? "") });
      else if (r.root) setPhase({ is: "scanning", root: r.root });
    });
  }, [drives, levels]);

  useEffect(() => {
    const m = /^#scan=(.+)$/.exec(window.location.hash);
    if (m) startScan(decodeURIComponent(m[1]));
  }, [startScan]);

  const pickFolder = useCallback(() => {
    void window.api.pickFolder().then((path) => path && startScan(path));
  }, [startScan]);

  // Stop a scan that already shows something: keep it on screen as it is.
  const stopHere = useCallback(() => {
    setStopping(true);
    void window.api.stopScan();
  }, []);

  const toStart = useCallback(() => {
    setStopping(false);
    void window.api.cancelScan();
    setPhase({ is: "start" });
    refreshDrives();
  }, [refreshDrives]);

  // Scan events ------------------------------------------------------------

  useEffect(() => {
    const offP = window.api.onScanProgress(setProgress);
    // A new table has new ids. Carry the view over by name so the plan does
    // not jump back to the top every time the live preview refreshes.
    const adopt = (table: ScanTable): void => {
      const d = new Disk(table);
      const old = view.current;
      let zoom = 0;
      let selected = -1;
      const expanded = new Set([0]);
      if (old.disk && old.disk.t.root === table.root) {
        const z = d.follow(old.disk.trail(old.zoom));
        if (z > 0 && d.isDir(z) && d.size(z) > 0) zoom = z;
        if (old.selected > 0) selected = d.follow(old.disk.trail(old.selected));
        for (const id of old.expanded) {
          const e = id > 0 ? d.follow(old.disk.trail(id)) : -1;
          if (e > 0) expanded.add(e);
        }
      }
      const carry = (ids: number[]): number[] =>
        old.disk && old.disk.t.root === table.root
          ? ids.map((id) => (id === 0 ? 0 : d.follow(old.disk!.trail(id)))).filter((id) => id >= 0 && d.isDir(id))
          : [];
      setDisk(d);
      setTrail({ back: carry(old.trail.back), forward: carry(old.trail.forward) });
      setVersion(0);
      setZoom(zoom);
      setSelected(selected);
      setHover(-1);
      setExpanded(expanded);
    };
    const offL = window.api.onScanPartial(adopt);
    const offD = window.api.onScanDone((table) => {
      adopt(table);
      setStopping(false);
      if (table.incomplete) setNotice({ text: t("scan.stopped"), action: { label: t("menu.rescan"), run: () => startScan(table.root) } });
      setQuery("");
      setFilter(NO_FILTER);
      setComparison(null);
      setAgainst(null);
      setDups(DUP_IDLE);
      setPhase({ is: "ready" });
      void window.api.listSnapshots(table.root).then((all) => {
        const older = table.incomplete ? [] : all.filter((s) => s.date < table.startedAt);
        setSnapshots(older);
        if (older.length > 0) setAgainst(older[0].file);
      });
    });
    const offC = window.api.onPasteProgress((p) =>
      setNotice({ text: t("clip.progress", { done: fmt.bytes(p.done), total: fmt.bytes(p.total) }), progress: p.total > 0 ? p.done / p.total : 0 }),
    );
    const offE = window.api.onScanError((error) => setPhase((p) => ({ is: "failed", root: p.is === "scanning" ? p.root : "", error })));
    const offU = window.api.onUpdateStatus((s: UpdateStatus) => {
      const asked = askedUpdate.current;
      if (s.state === "available")
        setNotice({ text: t("upd.available", { version: s.version }), action: { label: t("upd.download"), run: () => void window.api.downloadUpdate() } });
      else if (s.state === "downloading") setNotice({ text: t("upd.downloading", { pct: Math.round(s.percent) + "%" }) });
      else if (s.state === "ready")
        setNotice({ text: t("upd.ready", { version: s.version }), action: { label: t("upd.install"), run: () => void window.api.installUpdate() } });
      else if (asked && s.state === "none") setNotice({ text: t("upd.none") });
      else if (asked && s.state === "dev") setNotice({ text: t("upd.dev") });
      else if (asked && s.state === "error") setNotice({ text: t("upd.error"), bad: true });
      if (s.state !== "checking") askedUpdate.current = false;
    });
    return () => {
      offP();
      offL();
      offD();
      offC();
      offE();
      offU();
    };
  }, [t, fmt, startScan]);

  // Comparison with an older scan --------------------------------------------

  useEffect(() => {
    if (!disk || !against) {
      setComparison(null);
      return;
    }
    let live = true;
    void window.api.loadSnapshot(against).then((r) => {
      if (live && r.ok && r.snapshot) setComparison(compare(disk, r.snapshot));
    });
    return () => {
      live = false;
    };
  }, [disk, against]);

  // Search and filters -----------------------------------------------------

  useEffect(() => {
    const timer = setTimeout(() => setFilter((f) => (f.query === query ? f : { ...f, query })), 160);
    return () => clearTimeout(timer);
  }, [query]);
  const filtering = isFiltering(filter);
  const found = useMemo(
    () => (disk && filtering ? runFilter(disk, filter, 5000) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disk, filter, filtering, version],
  );
  useEffect(() => {
    if (filtering) setTab("found");
    else setTab((cur) => (cur === "found" ? "tree" : cur));
  }, [filtering]);
  const clearFilters = (): void => {
    setQuery("");
    setFilter(NO_FILTER);
  };

  const largest = useMemo(
    () => (disk && tab === "largest" ? topFiles(disk, 500) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disk, tab, version],
  );

  // Navigation -------------------------------------------------------------

  const select = useCallback(
    (id: number) => {
      setSelected(id);
      if (!disk || id < 0) return;
      setExpanded((prev) => {
        let next = prev;
        for (let p = disk.parent(id); p >= 0; p = disk.parent(p)) {
          if (!next.has(p)) {
            if (next === prev) next = new Set(prev);
            next.add(p);
          }
        }
        return next;
      });
      setReveal((n) => n + 1);
    },
    [disk],
  );
  const selectInTree = useCallback((id: number) => setSelected(id), []);

  const openAt = useCallback(
    (id: number) => {
      if (!disk || id < 0 || !disk.isDir(id) || disk.size(id) <= 0) return false;
      setZoom(id);
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const a of disk.ancestors(id)) next.add(a);
        return next;
      });
      return true;
    },
    [disk],
  );
  const zoomTo = useCallback(
    (id: number) => {
      const from = view.current.zoom;
      if (id !== from && openAt(id)) setTrail((h) => ({ back: [...h.back.slice(-49), from], forward: [] }));
    },
    [openAt],
  );
  const step = useCallback(
    (dir: "back" | "forward") => {
      const stack = trail[dir];
      if (stack.length === 0) return;
      const to = stack[stack.length - 1];
      const from = view.current.zoom;
      const rest = stack.slice(0, -1);
      if (!openAt(to)) return;
      setTrail(dir === "back" ? { back: rest, forward: [...trail.forward, from] } : { back: [...trail.back, from], forward: rest });
    },
    [trail, openAt],
  );

  const toggle = useCallback((id: number, open?: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const want = open ?? !next.has(id);
      if (want) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // Actions on items -------------------------------------------------------

  const flash = (text: string): void => {
    setToast(text);
    setTimeout(() => setToast(null), 1600);
  };

  // Copy, cut and paste work on the finished scan only: while it is still
  // running the table is replaced every second.
  const copyItem = (id: number, cut: boolean): void => {
    if (!disk || phase.is !== "ready" || id < 0 || (cut && id === 0)) return;
    void window.api.setClip([disk.path(id)], cut).then(() => flash(t(cut ? "clip.cut" : "clip.copied")));
  };
  const pasteInto = async (dir: number): Promise<void> => {
    if (!disk || phase.is !== "ready" || dir < 0 || !disk.isDir(dir)) return;
    const clip = await window.api.getClip();
    if (!clip || clip.paths.length === 0) return flash(t("clip.empty"));
    setNotice({ text: t("clip.working") });
    const results = await window.api.paste(clip.paths, clip.cut, disk.path(dir));
    let failed = 0;
    let why = "";
    let done = 0;
    let last = -1;
    for (const r of results) {
      if (!r.ok) {
        failed++;
        why = why || (r.error ?? "");
        continue;
      }
      if (clip.cut) {
        // The original left its place, if that place is part of this scan.
        const src = disk.findPath(r.src);
        if (src > 0) {
          if (disk.contains(src, view.current.zoom)) setZoom(Math.max(0, disk.parent(src)));
          if (view.current.selected >= 0 && disk.contains(src, view.current.selected)) setSelected(-1);
          disk.remove(src);
        }
      }
      const measured = await window.api.measure(r.dest);
      const seen = disk.findPath(r.dest);
      if (seen >= 0) last = seen;
      else if (measured.ok) last = disk.graft(dir, measured);
      done++;
    }
    setHover(-1);
    setVersion((v) => v + 1);
    if (last >= 0) {
      select(last);
      markFresh([last]);
    }
    if (failed > 0) {
      const known = ["EINSIDE", "ESAME", "EEXIST"].includes(why) ? (why as "EINSIDE" | "ESAME" | "EEXIST") : "other";
      setNotice({ text: t("clip.failed", { count: failed, why: t(`clip.${known}`) }), bad: true });
    } else {
      setNotice(null);
      flash(t("clip.pasted", { count: done }));
    }
  };
  // Where a paste lands: the selected folder, or the folder of the selected file.
  const pasteTarget = (): number => {
    if (!disk) return -1;
    const s = view.current.selected;
    if (s >= 0 && !disk.isGone(s)) return disk.isDir(s) ? s : disk.parent(s);
    return view.current.zoom;
  };
  const showProps = (id: number): void => {
    if (!disk || id < 0) return;
    setItemStat(null);
    setPropsOf(id);
    void window.api.stat(disk.path(id)).then(setItemStat);
  };

  const context = useCallback(
    (id: number, x: number, y: number) => {
      if (!disk) return;
      const path = disk.path(id);
      const dir = disk.isDir(id);
      const done = phase.is === "ready";
      const items: MenuEntry[] = [
        { label: t("act.open"), icon: "open", run: () => void window.api.openPath(path) },
        { label: t("act.reveal"), icon: "reveal", run: () => void window.api.showInFolder(path) },
      ];
      if (dir) items.push({ label: t("act.zoom"), icon: "enter", keys: "Enter", run: () => zoomTo(id) });
      items.push(
        { kind: "sep" },
        { label: t("act.copy"), icon: "copy", keys: MOD + "+C", disabled: !done, run: () => copyItem(id, false) },
        { label: t("act.cut"), icon: "cut", keys: MOD + "+X", disabled: !done || id === 0, run: () => copyItem(id, true) },
        {
          label: t(dir ? "act.pasteHere" : "act.paste"),
          icon: "paste",
          keys: MOD + "+V",
          disabled: !done,
          run: () => void pasteInto(dir ? id : disk.parent(id)),
        },
        { label: t("act.copyPath"), keys: MOD + "+Shift+C", run: () => void window.api.copyText(path).then(() => flash(t("copied"))) },
        { kind: "sep" },
        { label: t("act.properties"), icon: "info", keys: "Alt+Enter", run: () => showProps(id) },
      );
      if (id > 0) items.push({ kind: "sep" }, { label: t("act.trash"), icon: "trash", keys: "Del", danger: true, disabled: !done, run: () => setTrash([id]) });
      setMenu({ x, y, items });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disk, t, zoomTo, phase.is],
  );

  const askTrash = useCallback((ids: number[]) => setTrash(ids), []);
  const askTrashOne = useCallback((id: number) => setTrash([id]), []);

  const confirmTrash = async (): Promise<void> => {
    if (!disk || !trash) return;
    const ids = trash;
    setTrash(null);
    const results = await window.api.trash(ids.map((id) => disk.path(id)));
    let failed = 0;
    results.forEach((r, i) => {
      if (!r.ok) {
        failed++;
        return;
      }
      const id = ids[i];
      if (disk.contains(id, zoom)) setZoom(Math.max(0, disk.parent(id)));
      if (selected >= 0 && disk.contains(id, selected)) setSelected(-1);
      disk.remove(id);
    });
    setHover(-1);
    setVersion((v) => v + 1);
    if (failed > 0) setNotice({ text: t("trash.failed", { count: failed }), bad: true });
  };

  // Live sync ----------------------------------------------------------------
  // While it is on, Windows reports the folders that change and only those
  // are read again; the table is patched in place.

  const synced = sync && !syncLost && phase.is === "ready" && disk !== null && !disk.t.incomplete;
  useEffect(() => {
    if (!synced || !disk) return;
    const d = disk;
    const decoder = new TextDecoder();
    let queue: Promise<void> = Promise.resolve();
    let alive = true;

    const apply = async (b: WatchBatch): Promise<void> => {
      if (!alive) return;
      const failed = new Map(b.failed);
      const adds: { parent: number; item: Graftable }[] = [];
      const newDirs: { parent: number; path: string }[] = [];
      let changed = false;
      const drop = (id: number): void => {
        if (d.contains(id, view.current.zoom)) setZoom(Math.max(0, d.parent(id)));
        if (view.current.selected >= 0 && d.contains(id, view.current.selected)) setSelected(-1);
        d.remove(id);
        changed = true;
      };
      let e = 0;
      let off = 0;
      for (let k = 0; k < b.paths.length; k++) {
        const count = b.counts[k];
        const dir = d.findPath(b.paths[k]);
        const code = failed.get(k);
        if (code !== undefined) {
          if (code === "ENOENT" && dir > 0) drop(dir); // the folder itself is gone
          continue;
        }
        if (dir < 0 || !d.isDir(dir) || d.isLink(dir)) {
          for (let j = 0; j < count; j++) off += b.nameLens[e++];
          continue;
        }
        const have = new Map<string, number>();
        for (const c of d.children(dir)) have.set(d.name(c).toLowerCase(), c);
        const base = b.paths[k].endsWith(d.sep) ? b.paths[k] : b.paths[k] + d.sep;
        for (let j = 0; j < count; j++, e++) {
          const name = decoder.decode(b.names.subarray(off, off + b.nameLens[e]));
          off += b.nameLens[e];
          const isDir = (b.flags[e] & F_DIR) !== 0;
          const key = name.toLowerCase();
          let cur = have.get(key);
          have.delete(key);
          if (cur !== undefined && d.isDir(cur) !== isDir) {
            drop(cur); // a file became a folder, or the reverse
            cur = undefined;
          }
          if (cur === undefined) {
            if (isDir) newDirs.push({ parent: dir, path: base + name });
            else adds.push({ parent: dir, item: { kind: "file", name, size: b.sizes[e], logical: b.logical[e], mtime: b.mtimes[e], flags: b.flags[e] } });
          } else if (!isDir && (d.size(cur) !== b.sizes[e] || d.logical(cur) !== b.logical[e] || d.t.mtime[cur] !== b.mtimes[e])) {
            d.resize(cur, b.sizes[e], b.logical[e], b.mtimes[e]);
            changed = true;
          }
        }
        for (const id of have.values()) drop(id); // listed before, not there now
      }
      // A new folder has to be measured all the way down.
      for (const nd of newDirs) {
        const measured = await window.api.measure(nd.path);
        if (!alive) return;
        if (measured.ok) adds.push({ parent: nd.parent, item: measured });
      }
      // Measuring takes time; a paste may have added the same item meanwhile.
      const names = new Map<number, Set<string>>();
      const fresh = adds.filter((a) => {
        if (d.isGone(a.parent)) return false;
        if (newDirs.length === 0) return true;
        let set = names.get(a.parent);
        if (!set) {
          set = new Set();
          for (const c of d.children(a.parent)) set.add(d.name(c).toLowerCase());
          names.set(a.parent, set);
        }
        const key = a.item.name.toLowerCase();
        if (set.has(key)) return false;
        set.add(key);
        return true;
      });
      if (fresh.length > 0) {
        markFresh(d.graftAll(fresh));
        changed = true;
      }
      if (changed) {
        setHover(-1);
        setVersion((v) => v + 1);
      }
    };

    const offChanges = window.api.onWatchChanges((b) => {
      queue = queue.then(() => apply(b)).catch(() => undefined);
    });
    const offLost = window.api.onWatchLost(() => {
      setSyncLost(true);
      setNotice({ text: t("live.lost"), bad: true, action: { label: t("menu.rescan"), run: () => startScan(d.t.root) } });
    });
    void window.api.startWatch(d.t.root);
    return () => {
      alive = false;
      offChanges();
      offLost();
      void window.api.stopWatch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synced, disk]);

  const toggleSync = (): void => {
    const next = !(sync && !syncLost);
    // Switching it off records where the disk stands now.
    if (!next && synced && disk) {
      void window.api.saveSnapshot(reduceTable(disk.t, Date.now())).then((meta) => meta && setNotice({ text: t("live.saved") }));
    }
    setSyncLost(false);
    setSync(next);
    save("sync", next ? "on" : "off");
  };

  // Menus ------------------------------------------------------------------

  const ready = phase.is === "ready" && disk !== null;
  // During a scan the plan is already on screen, filling in as folders are measured.
  const live = phase.is === "scanning" && disk !== null;
  // Anything that moves around the plan works during a scan as well.
  const nav = ready || live;
  const menus: Record<BarName, () => MenuEntry[]> = {
    file: () => [
      { label: t("menu.chooseFolder"), icon: "folder", keys: MOD + "+O", run: pickFolder },
      { label: t("menu.rescan"), icon: "rescan", keys: "F5", disabled: !ready, run: () => disk && startScan(disk.t.root) },
      { label: t("menu.start"), icon: "drive", disabled: phase.is === "start", run: toStart },
      { kind: "sep" },
      { label: t("menu.exit"), keys: "Alt+F4", run: () => void window.api.quit() },
    ],
    view: () => [
      { label: t("menu.zoomOut"), icon: "up", keys: "Backspace", disabled: !nav || zoom === 0, run: () => disk && zoomTo(disk.parent(zoom)) },
      { label: t("menu.zoomRoot"), disabled: !nav || zoom === 0, run: () => zoomTo(0) },
      { label: t("menu.back"), icon: "back", keys: "Alt+Left", disabled: !nav || trail.back.length === 0, run: () => step("back") },
      { label: t("menu.forward"), icon: "forward", keys: "Alt+Right", disabled: !nav || trail.forward.length === 0, run: () => step("forward") },
      { kind: "sep" },
      { label: t("live.title"), checked: sync && !syncLost, run: toggleSync },
      { kind: "sep" },
      { kind: "title", label: t("menu.levels") },
      ...LEVELS.map(
        (v): MenuEntry => ({
          label: v === 0 ? t("menu.levelsAll") : String(v),
          checked: levels === v,
          run: () => {
            setLevels(v);
            save("levels", String(v));
          },
        }),
      ),
      { kind: "sep" },
      { kind: "title", label: t("menu.theme") },
      ...FAMILIES.map(
        (v): MenuEntry => ({
          label: t(v === "grid" ? "menu.themeGrid" : "menu.themePaper"),
          checked: family === v,
          run: () => {
            setFamily(v);
            save("family", v);
          },
        }),
      ),
      { kind: "sep" },
      { kind: "title", label: t("menu.mode") },
      ...MODES.map(
        (v): MenuEntry => ({
          label: t(v === "system" ? "menu.modeSystem" : v === "light" ? "menu.modeLight" : "menu.modeDark"),
          checked: mode === v,
          run: () => {
            setMode(v);
            save("mode", v);
          },
        }),
      ),
      { kind: "sep" },
      { kind: "title", label: t("menu.language") },
      ...(["en", "pt"] as const).map(
        (v): MenuEntry => ({
          label: v === "en" ? "English" : "Português",
          checked: lang === v,
          run: () => {
            setLang(v);
            save("lang", v);
          },
        }),
      ),
      { kind: "sep" },
      { label: t("menu.fullscreen"), keys: "F11", run: () => void window.api.toggleFullScreen() },
    ],
    window: () => [
      { label: t("menu.newWindow"), icon: "windows", keys: MOD + "+N", run: () => void window.api.newWindow() },
      { label: t("menu.closeWindow"), keys: MOD + "+W", run: () => void window.api.closeWindow() },
      { kind: "sep" },
      { label: t("menu.sideBySide"), disabled: windows.length < 2, run: () => void window.api.arrangeWindows("columns") },
      { label: t("menu.stacked"), disabled: windows.length < 2, run: () => void window.api.arrangeWindows("rows") },
      { label: t("menu.cascade"), disabled: windows.length < 2, run: () => void window.api.arrangeWindows("cascade") },
      { kind: "sep" },
      ...windows.map((w): MenuEntry => ({ label: w.title, checked: w.focused, run: () => void window.api.focusWindow(w.id) })),
    ],
    help: () => [
      { label: t("menu.shortcuts"), keys: "F1", run: () => setDialog("keys") },
      { kind: "sep" },
      { label: t("menu.website"), icon: "reveal", run: () => void window.api.openExternal(SITE) },
      { label: t("menu.source"), icon: "reveal", run: () => void window.api.openExternal(REPO) },
      { kind: "sep" },
      {
        label: t("menu.update"),
        run: () => {
          askedUpdate.current = true;
          void window.api.checkUpdate();
        },
      },
      { label: t("menu.about"), run: () => setDialog("about") },
    ],
  };
  const openMenu = (name: BarName, first = false): void => {
    const el = document.querySelector<HTMLElement>(`[data-menu="${name}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setBarFocus(-1);
    setMenu({ x: r.left, y: r.bottom, items: menus[name](), from: name, first });
  };
  const openRef = useRef(openMenu);
  openRef.current = openMenu;

  // The menu bar from the keyboard: Alt alone moves onto it, the arrows walk
  // it, Alt with a letter opens that menu, Escape leaves. Registered in the
  // capture phase so these keys never reach the shortcuts below.
  useEffect(() => {
    let altAlone = false;
    const byKey = (key: string): BarName | undefined => BAR.find((n) => t(`menu.${n}.key`) === key.toLowerCase());
    const swallow = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const down = (e: KeyboardEvent): void => {
      if (e.key === "Alt") {
        if (!e.repeat) altAlone = true;
        e.preventDefault(); // keep Windows from opening the system menu
        return;
      }
      altAlone = false;
      const { menu: open, barFocus: at } = view.current;
      if (open) return; // an open menu reads its own keys
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
        const name = byKey(e.key);
        if (name) {
          swallow(e);
          openRef.current(name, true);
        }
        return;
      }
      if (at < 0) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") setBarFocus((at + (e.key === "ArrowLeft" ? -1 : 1) + BAR.length) % BAR.length);
      else if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") openRef.current(BAR[at], true);
      else if (e.key === "Escape") setBarFocus(-1);
      else if (e.key.length === 1 && byKey(e.key)) openRef.current(byKey(e.key)!, true);
      else {
        setBarFocus(-1);
        return;
      }
      swallow(e);
    };
    const up = (e: KeyboardEvent): void => {
      if (e.key !== "Alt" || !altAlone) return;
      altAlone = false;
      e.preventDefault();
      if (view.current.menu) setMenu(null);
      else setBarFocus((f) => (f >= 0 ? -1 : 0));
    };
    const leave = (): void => {
      altAlone = false;
      setBarFocus(-1);
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("mousedown", leave, true);
    window.addEventListener("blur", leave);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("mousedown", leave, true);
      window.removeEventListener("blur", leave);
    };
  }, [t]);

  // Keyboard ---------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      // A dialog keeps the keyboard to itself.
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "F1") {
        e.preventDefault();
        setDialog("keys");
      } else if (mod && key === "n") {
        e.preventDefault();
        void window.api.newWindow();
      } else if (mod && key === "w") {
        e.preventDefault();
        void window.api.closeWindow();
      } else if (e.key === "F5") {
        e.preventDefault();
        if (ready && disk) startScan(disk.t.root);
      } else if (e.key === "F11") {
        e.preventDefault();
        void window.api.toggleFullScreen();
      } else if (e.key === "F12") {
        void window.api.toggleDevTools();
      } else if (mod && key === "o") {
        e.preventDefault();
        pickFolder();
      } else if (mod && key === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "Escape") {
        if (typing && query) clearFilters();
        else if (phase.is === "scanning") (live ? stopHere : toStart)();
      } else if (!typing && nav && disk) {
        if (e.altKey && e.key === "ArrowLeft") step("back");
        else if (e.altKey && e.key === "ArrowRight") step("forward");
        else if (e.altKey && e.key === "Enter" && selected >= 0) showProps(selected);
        else if (e.key === "Backspace" && zoom > 0) zoomTo(disk.parent(zoom));
        else if (mod && e.shiftKey && key === "c" && selected >= 0) {
          void window.api.copyText(disk.path(selected)).then(() => flash(t("copied")));
        } else if (mod && key === "c" && selected >= 0) {
          // Leave the system copy alone when text is selected.
          if (!window.getSelection()?.toString()) copyItem(selected, false);
        } else if (mod && key === "x" && selected > 0) copyItem(selected, true);
        else if (mod && key === "v") void pasteInto(pasteTarget());
        else if (ready && e.key === "Delete" && selected > 0 && !(e.target as HTMLElement).closest?.(".rows")) setTrash([selected]);
        else return;
        e.preventDefault();
      }
    };
    // The side buttons of a mouse go back and forward, as in a browser.
    const onMouse = (e: MouseEvent): void => {
      if (!nav) return;
      if (e.button === 3) step("back");
      else if (e.button === 4) step("forward");
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mouseup", onMouse);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mouseup", onMouse);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, nav, disk, zoom, selected, phase, query, t, startScan, pickFolder, zoomTo, toStart, step]);

  // Splitter ---------------------------------------------------------------

  const dragSplit = (e: React.MouseEvent): void => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    let latest = startW;
    const move = (ev: MouseEvent): void => {
      latest = Math.max(320, Math.min(window.innerWidth - 360, startW + startX - ev.clientX));
      setPanelWidth(latest);
    };
    const up = (): void => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      save("panel", String(latest));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // Derived ----------------------------------------------------------------

  const crumbs = useMemo(() => (disk && nav ? disk.ancestors(zoom) : []), [disk, nav, zoom]);
  const scale = useMemo(() => {
    if (!disk || planArea <= 0 || disk.size(zoom) <= 0) return null;
    const perPixel = disk.size(zoom) / planArea;
    for (let unit = 1024; unit < 2 ** 50; unit *= 1024) {
      for (const m of [1, 2, 5, 10, 20, 50, 100, 200, 500]) {
        const side = Math.sqrt((unit * m) / perPixel);
        if (side >= 12) return { side: Math.min(32, Math.round(side)), bytes: unit * m };
      }
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disk, zoom, planArea, version]);

  const scanPct = progress && scanBase ? Math.min(0.99, progress.bytes / scanBase) : null;
  const pane = { disk: disk!, version, selected, hover, fmt, t, onSelect: select, onHover: setHover, onZoom: zoomTo, onContext: context };
  const grew = comparison !== null && comparison.rows.some((id) => comparison.delta[id] > 0);
  const tabs: Tab[] = ["tree", "largest", "types", "clutter", "dupes", "changes"];
  if (filtering) tabs.push("found");

  return (
    <div
      className={"app" + (dropping ? " dropping" : "")}
      onDragOver={(e) => {
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDropping(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        const file = e.dataTransfer.files[0];
        if (file) {
          const path = window.api.pathForFile(file);
          if (path) startScan(path);
        }
      }}
    >
      <header className="titlebar">
        <div className="brand">
          <Mark />
          <Wordmark />
        </div>
        <nav className={"menus" + (barFocus >= 0 || menu?.from ? " keys" : "")}>
          {BAR.map((name, i) => {
            const label = t(`menu.${name}`);
            const at = label.toLowerCase().indexOf(t(`menu.${name}.key`));
            return (
              <button
                key={name}
                data-menu={name}
                data-menu-owner=""
                tabIndex={-1}
                className={"menu-button" + (barFocus === i ? " focus" : "")}
                aria-haspopup="menu"
                aria-expanded={menu?.from === name}
                onMouseDown={(e) => {
                  // The button keeps neither focus nor the click: it only toggles.
                  e.preventDefault();
                  if (menu?.from === name) setMenu(null);
                  else openMenu(name);
                }}
                onMouseEnter={() => {
                  if (menu?.from && menu.from !== name) openMenu(name);
                }}
              >
                {at < 0 ? (
                  label
                ) : (
                  <>
                    {label.slice(0, at)}
                    <u>{label[at]}</u>
                    {label.slice(at + 1)}
                  </>
                )}
              </button>
            );
          })}
        </nav>
        <div className="titlebar-path">{nav && disk ? disk.path(zoom) : phase.is === "scanning" ? phase.root : ""}</div>
        <button
          className="menu-button titlebar-tool"
          tabIndex={-1}
          title={t("menu.toggleMode")}
          aria-label={t("menu.toggleMode")}
          onClick={() => {
            const next = dark ? "light" : "dark";
            setMode(next);
            save("mode", next);
          }}
        >
          <Icon name="sun" />
        </button>
      </header>

      {notice && (
        <div className={"notice" + (notice.bad ? " bad" : "")} role="status">
          <span className="grow">{notice.text}</span>
          {notice.progress !== undefined && (
            <span className="share" style={{ width: 220 }}>
              <span className="track">
                <span className="fill" style={{ width: Math.round(notice.progress * 100) + "%", display: "block" }} />
              </span>
            </span>
          )}
          {notice.action && (
            <button className="btn" onClick={notice.action.run}>
              {notice.action.label}
            </button>
          )}
          <button className="btn quiet icon" aria-label={t("issues.close")} onClick={() => setNotice(null)}>
            <Icon name="close" />
          </button>
        </div>
      )}

      {phase.is === "start" && <StartSheet drives={drives} t={t} fmt={fmt} onScan={startScan} onPick={pickFolder} />}

      {((phase.is === "scanning" && !live) || phase.is === "failed") && (
        <ScanSheet phase={phase} progress={progress} pct={scanPct} t={t} fmt={fmt} onStop={toStart} onRetry={() => startScan(phase.root)} />
      )}

      {(ready || live) && disk && (
        <>
          {live && (
            <div className="toolrow livebar" role="status">
              {scanPct !== null && <span className="live-progress" style={{ width: Math.round(scanPct * 100) + "%" }} />}
              <button className="btn icon" disabled={trail.back.length === 0} title={t("menu.back") + " (Alt+Left)"} aria-label={t("menu.back")} onClick={() => step("back")}>
                <Icon name="back" />
              </button>
              <button
                className="btn icon"
                disabled={trail.forward.length === 0}
                title={t("menu.forward") + " (Alt+Right)"}
                aria-label={t("menu.forward")}
                onClick={() => step("forward")}
              >
                <Icon name="forward" />
              </button>
              <button className="btn icon" disabled={zoom === 0} title={t("menu.zoomOut") + " (Backspace)"} aria-label={t("menu.zoomOut")} onClick={() => zoomTo(disk.parent(zoom))}>
                <Icon name="up" />
              </button>
              <Icon name="scan" />
              <strong>{t("scan.title", { root: zoom === 0 ? disk.t.root : disk.name(zoom) })}</strong>
              <span className="live-now">
                <bdi>{progress?.current ?? ""}</bdi>
              </span>
              <span className="live-count">
                {fmt.count(progress?.files ?? 0)} {t("scan.files").toLowerCase()}, {fmt.bytes(progress?.bytes ?? 0)}
                {scanPct !== null && <strong> {Math.round(scanPct * 100)}%</strong>}
              </span>
              <button
                className={"btn icon" + (dockOpen ? " on" : "")}
                aria-pressed={dockOpen}
                title={t("scan.details")}
                aria-label={t("scan.details")}
                onClick={() => setDockOpen((o) => !o)}
              >
                <Icon name="info" />
              </button>
              <button className="btn" disabled={stopping} onClick={stopHere}>
                <Icon name="stop" />
                {t(stopping ? "scan.stopping" : "scan.cancel")}
              </button>
            </div>
          )}
          <div className="toolrow" style={live ? { display: "none" } : undefined}>
            <button className="btn" title={t("menu.start")} onClick={toStart}>
              <Icon name="drive" />
              {t("tool.drives")}
            </button>
            <button className="btn" onClick={() => startScan(disk.t.root)} title="F5">
              <Icon name="rescan" />
              {t("menu.rescan")}
            </button>
            <button
              className={"btn" + (synced ? " on" : "")}
              aria-pressed={synced}
              disabled={disk.t.incomplete}
              title={t("live.title")}
              onClick={toggleSync}
            >
              <span className="pulse" />
              {t("live.button")}
            </button>
            <button
              className="btn icon"
              disabled={trail.back.length === 0}
              title={t("menu.back") + " (Alt+Left)"}
              aria-label={t("menu.back")}
              onClick={() => step("back")}
            >
              <Icon name="back" />
            </button>
            <button
              className="btn icon"
              disabled={trail.forward.length === 0}
              title={t("menu.forward") + " (Alt+Right)"}
              aria-label={t("menu.forward")}
              onClick={() => step("forward")}
            >
              <Icon name="forward" />
            </button>
            <button
              className="btn icon"
              disabled={zoom === 0}
              title={t("menu.zoomOut") + " (Backspace)"}
              aria-label={t("menu.zoomOut")}
              onClick={() => zoomTo(disk.parent(zoom))}
            >
              <Icon name="up" />
            </button>
            <div className="crumbs">
              {crumbs.map((id, i) => (
                <span key={id} style={{ display: "contents" }}>
                  {i > 0 && <Icon name="chevron" size={10} className="crumb-sep" />}
                  <button className={"crumb" + (id === zoom ? " here" : "")} onClick={() => zoomTo(id)}>
                    {id === 0 ? disk.t.root : disk.name(id)}
                  </button>
                </span>
              ))}
            </div>
            <select
              className={"select" + (filter.minBytes > 0 ? " on" : "")}
              aria-label={t("filter.size")}
              value={filter.minBytes}
              onChange={(e) => setFilter((f) => ({ ...f, minBytes: Number(e.target.value) }))}
            >
              <option value={0}>{t("filter.size")}</option>
              {[1, 10, 100, 1024].map((mb) => (
                <option key={mb} value={mb * MB}>
                  {t("filter.size")} {fmt.bytes(mb * MB)}
                </option>
              ))}
            </select>
            <select
              className={"select" + (filter.olderThanDays > 0 ? " on" : "")}
              aria-label={t("filter.age")}
              value={filter.olderThanDays}
              onChange={(e) => setFilter((f) => ({ ...f, olderThanDays: Number(e.target.value) }))}
            >
              <option value={0}>{t("filter.age")}</option>
              {([30, 180, 365, 730] as const).map((d) => (
                <option key={d} value={d}>
                  {t("filter.age")} {t(`filter.days${d}`)}
                </option>
              ))}
            </select>
            <label className="field">
              <Icon name="search" />
              <input
                ref={searchRef}
                value={query}
                placeholder={t("search.placeholder")}
                aria-label={t("search.placeholder")}
                spellCheck={false}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {filtering && (
              <button className="btn icon" title={t("filter.clear")} aria-label={t("filter.clear")} onClick={clearFilters}>
                <Icon name="close" />
              </button>
            )}
          </div>

          <div className="work">
            <Treemap
              disk={disk}
              version={version}
              theme={theme}
              zoom={zoom}
              fresh={fresh}
              levels={levels === 0 ? Infinity : levels}
              selected={selected}
              hover={hover}
              comparison={comparison}
              showDelta={tab === "changes"}
              fmt={fmt}
              t={t}
              onHover={setHover}
              onSelect={select}
              onZoom={zoomTo}
              onContext={context}
              onArea={setPlanArea}
            />
            <div className="splitter" onMouseDown={dragSplit} role="separator" aria-orientation="vertical" />
            <aside className="schedule" style={{ width: panelWidth }}>
              <div className="tabs" role="tablist">
                {tabs.map((name) => (
                  <button key={name} role="tab" className="tab" aria-selected={tab === name} onClick={() => setTab(name)}>
                    {t(`tab.${name}`)}
                    {name === "changes" && grew && <span className="badge" />}
                  </button>
                ))}
              </div>
              {tab === "tree" && (
                <TreeView
                  disk={disk}
                  version={version}
                  selected={selected}
                  hover={hover}
                  expanded={expanded}
                  reveal={reveal}
                  fresh={fresh}
                  wide={panelWidth >= 560}
                  fmt={fmt}
                  t={t}
                  onToggle={toggle}
                  onSelect={selectInTree}
                  onHover={setHover}
                  onZoom={zoomTo}
                  onContext={context}
                  onTrash={askTrashOne}
                />
              )}
              {tab === "largest" && <ListPane {...pane} ids={largest} note={t("largest.note", { count: fmt.count(largest.length) })} />}
              {tab === "types" && (
                <TypesPane {...pane} activeExt={filter.extId} onPick={(extId) => setFilter((f) => ({ ...f, extId }))} />
              )}
              {tab === "clutter" && <ClutterPane {...pane} onTrash={askTrash} />}
              {tab === "dupes" && <DupesPane {...pane} state={dups} setState={setDups} onTrash={askTrash} />}
              {tab === "changes" && (
                <ChangesPane {...pane} comparison={comparison} snapshots={snapshots} against={against} onAgainst={setAgainst} />
              )}
              {tab === "found" && found && (
                <ListPane
                  {...pane}
                  ids={found.ids}
                  empty={t("found.none")}
                  note={
                    <>
                      <strong>{t("found.summary", { count: fmt.count(found.total), bytes: fmt.bytes(found.bytes) })}</strong>
                      {filter.extId >= 0 && " " + t("found.type", { ext: disk.t.exts[filter.extId] || "?" }) + "."}
                      {found.total > found.ids.length && " " + t("found.capped", { shown: fmt.count(found.ids.length) })}
                    </>
                  }
                />
              )}
              {live && dockOpen && <ScanDock progress={progress} pct={scanPct} t={t} fmt={fmt} onClose={() => setDockOpen(false)} />}
            </aside>
          </div>

          <footer className="titleblock">
            <div className="tb-cell">
              <span className="k">{t("block.root")}</span>
              <span className="v">{disk.t.root}</span>
            </div>
            <div className="tb-cell">
              <span className="k">{t("block.total")}</span>
              <span className="v">{fmt.bytes(disk.size(0))}</span>
            </div>
            <div className="tb-cell">
              <span className="k">{t("block.files")}</span>
              <span className="v">{fmt.count(disk.files(0))}</span>
            </div>
            <div className="tb-cell">
              <span className="k">{t("block.folders")}</span>
              <span className="v">{fmt.count(disk.t.dirs)}</span>
            </div>
            <div className="tb-cell">
              <span className="k">{t("block.scanned")}</span>
              <span className="v">
                {live ? t("scan.running") : disk.t.incomplete ? t("scan.stoppedShort") : synced ? t("live.short") : fmt.when(disk.t.startedAt)}
                <small>{t("block.in", { time: fmt.duration(disk.t.durationMs) })}</small>
              </span>
            </div>
            {disk.t.errors > 0 ? (
              <button className="tb-cell link" onClick={() => setDialog("issues")}>
                <span className="k">{t("block.issues")}</span>
                <span className="v">{fmt.count(disk.t.errors)}</span>
              </button>
            ) : (
              <div className="tb-cell">
                <span className="k">{t("block.issues")}</span>
                <span className="v">0</span>
              </div>
            )}
            <div className="tb-cell grow">
              <span className="k">{t("block.selected")}</span>
              <span className="v">
                {selected >= 0 && !disk.isGone(selected) ? (
                  <>
                    {selected === 0 ? disk.t.root : disk.name(selected)}
                    <small>{fmt.bytes(disk.size(selected))}</small>
                  </>
                ) : (
                  ""
                )}
              </span>
            </div>
            {scale && (
              <div className="tb-cell scale" title={t("block.scale")}>
                <span className="scale-box" style={{ width: scale.side, height: scale.side }} />
                <span>
                  <span className="k" style={{ display: "block" }}>
                    {t("block.scale")}
                  </span>
                  <span className="v">{fmt.bytes(scale.bytes)}</span>
                </span>
              </div>
            )}
          </footer>
        </>
      )}

      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          first={menu.first}
          onClose={() => setMenu(null)}
          onSide={
            menu.from
              ? (dir) => openMenu(BAR[(BAR.indexOf(menu.from!) + dir + BAR.length) % BAR.length], true)
              : undefined
          }
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {trash && disk && (
        <Dialog onClose={() => setTrash(null)}>
          <header>
            <h2>{t("trash.title")}</h2>
          </header>
          <div className="body">
            <p className="what">{trash.length === 1 ? disk.path(trash[0]) : t("trash.many", { count: trash.length })}</p>
            <p>{t("trash.size", { bytes: fmt.bytes(trash.reduce((a, id) => a + disk.size(id), 0)) })}</p>
          </div>
          <footer>
            <button className="btn" onClick={() => setTrash(null)}>
              {t("act.cancel")}
            </button>
            <button className="btn danger" autoFocus onClick={() => void confirmTrash()}>
              <Icon name="trash" />
              {t("trash.confirm")}
            </button>
          </footer>
        </Dialog>
      )}

      {dialog === "issues" && disk && (
        <Dialog onClose={() => setDialog(null)}>
          <header>
            <h2>{t("issues.title", { count: fmt.count(disk.t.errors) })}</h2>
          </header>
          <div className="body">
            <p>{t("issues.lead")}</p>
            <ul className="issue-list">
              {disk.t.errorSamples.map((s, i) => (
                <li key={i}>
                  <span className="p">{s.path}</span>
                  <span className="c">{s.code}</span>
                </li>
              ))}
            </ul>
            {disk.t.errors > disk.t.errorSamples.length && (
              <p>{t("issues.more", { count: fmt.count(disk.t.errors - disk.t.errorSamples.length) })}</p>
            )}
          </div>
          <footer>
            <button className="btn" autoFocus onClick={() => setDialog(null)}>
              {t("issues.close")}
            </button>
          </footer>
        </Dialog>
      )}

      {propsOf !== null && disk && !disk.isGone(propsOf) && (
        <Dialog onClose={() => setPropsOf(null)}>
          <header>
            <h2>{t("props.title")}</h2>
          </header>
          <div className="body">
            <dl className="props">
              <dt>{t("props.name")}</dt>
              <dd>{propsOf === 0 ? disk.t.root : disk.name(propsOf)}</dd>
              {propsOf > 0 && (
                <>
                  <dt>{t("props.location")}</dt>
                  <dd>{disk.path(disk.parent(propsOf))}</dd>
                </>
              )}
              <dt>{t("props.kind")}</dt>
              <dd>
                {disk.isLink(propsOf)
                  ? t("props.link")
                  : disk.isDir(propsOf)
                    ? t("props.folder")
                    : t("props.file") + (disk.ext(propsOf) ? " ." + disk.ext(propsOf) : "")}
              </dd>
              <dt>{t("props.onDisk")}</dt>
              <dd>
                {fmt.bytes(disk.size(propsOf))} ({t("props.bytes", { count: fmt.count(disk.size(propsOf)) })})
              </dd>
              <dt>{t("props.length")}</dt>
              <dd>
                {fmt.bytes(disk.logical(propsOf))} ({t("props.bytes", { count: fmt.count(disk.logical(propsOf)) })})
              </dd>
              {disk.isDir(propsOf) && (
                <>
                  <dt>{t("props.contains")}</dt>
                  <dd>{t("tip.files", { count: fmt.count(disk.files(propsOf)) })}</dd>
                </>
              )}
              {propsOf > 0 && (
                <>
                  <dt>{t("props.ofParent")}</dt>
                  <dd>{fmt.pct(disk.size(propsOf) / (disk.size(disk.parent(propsOf)) || 1))}</dd>
                  <dt>{t("props.ofScan")}</dt>
                  <dd>{fmt.pct(disk.size(propsOf) / (disk.size(0) || 1))}</dd>
                </>
              )}
              {itemStat?.ok && (
                <>
                  <dt>{t("props.created")}</dt>
                  <dd>{fmt.stamp(itemStat.created)}</dd>
                  <dt>{t("props.modified")}</dt>
                  <dd>{fmt.stamp(itemStat.modified)}</dd>
                  <dt>{t("props.accessed")}</dt>
                  <dd>{fmt.stamp(itemStat.accessed)}</dd>
                  <dt>{t("props.readOnly")}</dt>
                  <dd>{t(itemStat.readOnly ? "props.yes" : "props.no")}</dd>
                </>
              )}
            </dl>
            {itemStat && !itemStat.ok && <p style={{ marginTop: 12 }}>{t("props.gone")}</p>}
          </div>
          <footer>
            <button className="btn" onClick={() => void window.api.showInFolder(disk.path(propsOf))}>
              <Icon name="reveal" />
              {t("act.reveal")}
            </button>
            <button className="btn" autoFocus onClick={() => setPropsOf(null)}>
              {t("issues.close")}
            </button>
          </footer>
        </Dialog>
      )}

      {dialog === "keys" && (
        <Dialog wide onClose={() => setDialog(null)}>
          <header>
            <h2>{t("keys.title")}</h2>
          </header>
          <div className="body">
            <table className="keys">
              <tbody>
                {(
                  [
                    [t("keys.scan")],
                    [t("keys.scanFolder"), MOD + "+O"],
                    [t("keys.rescan"), "F5"],
                    [t("keys.stop"), "Esc"],
                    [t("keys.move")],
                    [t("keys.open"), "Enter"],
                    [t("keys.double"), t("keys.doubleKey")],
                    [t("keys.wheel"), t("keys.wheelKey")],
                    [t("keys.up"), "Backspace"],
                    [t("keys.backForward"), "Alt+Left", "Alt+Right"],
                    [t("keys.find"), MOD + "+F"],
                    [t("keys.items")],
                    [t("keys.copyCutPaste"), MOD + "+C", MOD + "+X", MOD + "+V"],
                    [t("keys.copyPath"), MOD + "+Shift+C"],
                    [t("keys.trash"), "Delete"],
                    [t("keys.properties"), "Alt+Enter"],
                    [t("keys.windowGroup")],
                    [t("keys.newWindow"), MOD + "+N"],
                    [t("keys.closeWindow"), MOD + "+W"],
                    [t("keys.menuBar"), "Alt"],
                    [t("keys.fullscreen"), "F11"],
                    [t("keys.thisList"), "F1"],
                  ] as string[][]
                ).map((row, i) =>
                  row.length === 1 ? (
                    <tr key={i}>
                      <th colSpan={2}>{row[0]}</th>
                    </tr>
                  ) : (
                    <tr key={i}>
                      <td>{row[0]}</td>
                      <td>
                        {row.slice(1).map((k, j) => (
                          <span key={k}>
                            {j > 0 && " "}
                            <kbd>{k}</kbd>
                          </span>
                        ))}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          <footer>
            <button className="btn" autoFocus onClick={() => setDialog(null)}>
              {t("issues.close")}
            </button>
          </footer>
        </Dialog>
      )}

      {dialog === "about" && (
        <Dialog onClose={() => setDialog(null)}>
          <div className="body" style={{ paddingTop: 16 }}>
            <div className="about">
              <Mark size={44} />
              <div>
                <div className="name">
                  <Wordmark size={30} />
                </div>
                <div>{t("about.line", { version: appVersion })}</div>
                <div>
                  {t("about.by")}{" "}
                  <a
                    href={AUTHOR_SITE}
                    onClick={(e) => {
                      e.preventDefault();
                      void window.api.openExternal(AUTHOR_SITE);
                    }}
                  >
                    sanguanini.dev
                  </a>
                </div>
              </div>
            </div>
          </div>
          <footer>
            <button className="btn" onClick={() => void window.api.openExternal(REPO)}>
              GitHub
            </button>
            <button className="btn" autoFocus onClick={() => setDialog(null)}>
              {t("issues.close")}
            </button>
          </footer>
        </Dialog>
      )}
    </div>
  );
}

function Dialog({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    if (!el.open) el.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "wide" : undefined}
      onClose={onClose}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}

function StartSheet(p: { drives: DriveInfo[] | null; t: T; fmt: Fmt; onScan: (root: string) => void; onPick: () => void }) {
  const { t, fmt } = p;
  return (
    <main className="sheet">
      <div className="sheet-inner">
        <h1>{t("start.title")}</h1>
        <p className="lead">{t("start.lead")}</p>
        <div className="drives">
          <div className="drives-head">
            <span>{t("start.drive")}</span>
            <span />
            <span className="num">{t("start.used")}</span>
            <span className="num">{t("start.free")}</span>
            <span className="num">{t("start.capacity")}</span>
            <span />
          </div>
          {p.drives?.length === 0 && (
            <div className="drive" style={{ gridTemplateColumns: "1fr" }}>
              <span>{t("start.noDrives")}</span>
            </div>
          )}
          {p.drives?.map((d) => {
            const used = d.total - d.free;
            const frac = d.total > 0 ? used / d.total : 0;
            return (
              <div className="drive" key={d.path} onDoubleClick={() => p.onScan(d.path)}>
                <span className="letter">
                  <Icon name="drive" size={20} />
                  {d.path.replace(/[\\/]$/, "")}
                </span>
                <span
                  className={"meter" + (frac > 0.9 ? " full" : "")}
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(frac * 100)}
                  aria-label={t("start.used")}
                >
                  <i style={{ width: frac * 100 + "%" }} />
                </span>
                <span className="num">{fmt.bytes(used)}</span>
                <span className="num">{fmt.bytes(d.free)}</span>
                <span className="num">{fmt.bytes(d.total)}</span>
                <span className="go">
                  <button className="btn primary" onClick={() => p.onScan(d.path)}>
                    <Icon name="scan" />
                    {t("start.scan")}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
        <div className="sheet-foot">
          <button className="btn" onClick={p.onPick}>
            <Icon name="folder" />
            {t("start.folder")}
          </button>
          <span>{t("start.drop")}</span>
        </div>
      </div>
    </main>
  );
}

// Where the centred scan sheet last stood. When the plan takes over, the
// dock starts there and travels to its place under the schedule.
let sheetRect: DOMRect | null = null;

function ScanDock(p: { progress: ScanProgress | null; pct: number | null; t: T; fmt: Fmt; onClose: () => void }) {
  const { t, fmt } = p;
  const pr = p.progress;
  const ref = useRef<HTMLDivElement>(null);
  const max = pr && pr.top.length > 0 ? pr.top[0].bytes || 1 : 1;

  useLayoutEffect(() => {
    const el = ref.current;
    const from = sheetRect;
    sheetRect = null;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const to = el.getBoundingClientRect();
    const frames = from
      ? [
          {
            transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${Math.min(2.2, from.height / to.height)})`,
            opacity: 0.5,
          },
          { transform: "none", opacity: 1 },
        ]
      : [
          { transform: "translateY(24px)", opacity: 0 },
          { transform: "none", opacity: 1 },
        ];
    el.animate(frames, { duration: from ? 520 : 240, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  }, []);

  return (
    <div className="dock" ref={ref}>
      <div className="dock-head">
        {t("scan.dockTitle")}
        {p.pct !== null && <span>{Math.round(p.pct * 100)}%</span>}
        <span className="path">
          <bdi>{pr?.current ?? ""}</bdi>
        </span>
        <button className="btn quiet icon" style={{ height: 24 }} aria-label={t("issues.close")} title={t("issues.close")} onClick={p.onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="dock-nums">
        <div>
          <div className="k">{t("scan.bytes")}</div>
          <div className="v">{fmt.bytes(pr?.bytes ?? 0)}</div>
        </div>
        <div>
          <div className="k">{t("scan.files")}</div>
          <div className="v">{fmt.count(pr?.files ?? 0)}</div>
        </div>
        <div>
          <div className="k">{t("scan.folders")}</div>
          <div className="v">{fmt.count(pr?.dirs ?? 0)}</div>
        </div>
        <div>
          <div className="k">{t("scan.rate")}</div>
          <div className="v">{fmt.count(pr && pr.elapsedMs > 0 ? (pr.files / pr.elapsedMs) * 1000 : 0)}</div>
        </div>
      </div>
      <div className="sofar" style={{ margin: 0 }}>
        {pr?.top.slice(0, 6).map((row) => (
          <div className="sofar-row" key={row.name}>
            <span className="n">
              <Icon name={row.dir ? "folder" : "file"} />
              {row.name}
            </span>
            <span className="bar" style={{ transform: `scaleX(${Math.max(0.004, row.bytes / max)})` }} />
            <span className="s">{fmt.bytes(row.bytes)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScanSheet(p: {
  phase: { is: "scanning"; root: string } | { is: "failed"; root: string; error: string };
  progress: ScanProgress | null;
  pct: number | null;
  t: T;
  fmt: Fmt;
  onStop: () => void;
  onRetry: () => void;
}) {
  const { t, fmt, phase } = p;
  const pr = p.progress;
  const max = pr && pr.top.length > 0 ? pr.top[0].bytes || 1 : 1;
  const card = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (phase.is === "scanning" && card.current) sheetRect = card.current.getBoundingClientRect();
  });
  return (
    <main className="sheet scan">
      <div className="sheet-inner" ref={card}>
        <h1>
          {t("scan.title", { root: phase.root })}
          {p.pct !== null && phase.is === "scanning" && <span style={{ color: "var(--ink-2)", fontWeight: 400 }}> {Math.round(p.pct * 100)}%</span>}
        </h1>
        {phase.is === "failed" ? (
          <div className="problem" role="alert">
            <h2>{t("scan.failed")}</h2>
            <p>{phase.error === "missing" ? t("scan.missing") : phase.error}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn primary" onClick={p.onRetry}>
                <Icon name="rescan" />
                {t("menu.rescan")}
              </button>
              <button className="btn" onClick={p.onStop}>
                {t("scan.back")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="current">
              <bdi>{pr?.current ?? ""}</bdi>
            </div>
            <div className="counters">
              <div>
                <div className="k">{t("scan.bytes")}</div>
                <div className="v">{fmt.bytes(pr?.bytes ?? 0)}</div>
              </div>
              <div>
                <div className="k">{t("scan.files")}</div>
                <div className="v">{fmt.count(pr?.files ?? 0)}</div>
              </div>
              <div>
                <div className="k">{t("scan.folders")}</div>
                <div className="v">{fmt.count(pr?.dirs ?? 0)}</div>
              </div>
              <div>
                <div className="k">{t("scan.rate")}</div>
                <div className="v">{fmt.count(pr && pr.elapsedMs > 0 ? (pr.files / pr.elapsedMs) * 1000 : 0)}</div>
              </div>
              <div className="stop">
                <button className="btn" onClick={p.onStop}>
                  <Icon name="stop" />
                  {t("scan.cancel")}
                </button>
              </div>
            </div>
            <div className="sofar">
              <h2>{t("scan.sofar")}</h2>
              {pr?.top.map((row) => (
                <div className="sofar-row" key={row.name}>
                  <span className="n">
                    <Icon name={row.dir ? "folder" : "file"} />
                    {row.name}
                  </span>
                  <span className="bar" style={{ transform: `scaleX(${Math.max(0.004, row.bytes / max)})` }} />
                  <span className="s">{fmt.bytes(row.bytes)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
