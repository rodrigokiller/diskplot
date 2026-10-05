import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DriveInfo, ScanProgress, SnapshotMeta, UpdateStatus } from "../../shared/types";
import { Disk } from "./lib/disk";
import { NO_FILTER, compare, isFiltering, runFilter, topFiles } from "./lib/analysis";
import type { Comparison, Filter } from "./lib/analysis";
import { initialLang, makeFmt, makeT } from "./lib/i18n";
import type { Fmt, Lang, T } from "./lib/i18n";
import { Icon, Mark } from "./components/Icon";
import { Menu } from "./components/ui";
import type { MenuEntry } from "./components/ui";
import { Treemap } from "./components/Treemap";
import { TreeView } from "./components/TreeView";
import { ChangesPane, ClutterPane, DupesPane, ListPane, TypesPane } from "./components/Panels";
import type { DupState } from "./components/Panels";

type ThemePref = "system" | "light" | "dark";
type Tab = "tree" | "largest" | "types" | "clutter" | "dupes" | "changes" | "found";
type Phase = { is: "start" } | { is: "scanning"; root: string } | { is: "failed"; root: string; error: string } | { is: "ready" };

const MB = 1024 * 1024;
const SITE = "https://rodrigokiller.github.io/diskplot/";
const REPO = "https://github.com/rodrigokiller/diskplot";
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
  const [themePref, setThemePref] = useState<ThemePref>(() => load("theme", ["system", "light", "dark"] as const, "system"));
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const theme = themePref === "system" ? (systemDark ? "dark" : "light") : themePref;
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
      return w >= 320 && w <= 1200 ? w : 500;
    } catch {
      return 500;
    }
  });
  const [planArea, setPlanArea] = useState(0);

  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[]; from?: string } | null>(null);
  const [trash, setTrash] = useState<number[] | null>(null);
  const [dialog, setDialog] = useState<"issues" | "about" | null>(null);
  const [notice, setNotice] = useState<{ text: string; bad?: boolean; action?: { label: string; run: () => void } } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const askedUpdate = useRef(false);
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
    void window.api.setOverlay(theme === "dark" ? "#c9d4cf" : "#33403c");
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
  }, [lang]);

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
    setPhase({ is: "scanning", root });
    void window.api.cancelDuplicates();
    void window.api.startScan(root).then((r) => {
      if (!r.ok) setPhase({ is: "failed", root, error: r.error === "ENOENT" ? "missing" : (r.error ?? "") });
      else if (r.root) setPhase({ is: "scanning", root: r.root });
    });
  }, []);

  const pickFolder = useCallback(() => {
    void window.api.pickFolder().then((path) => path && startScan(path));
  }, [startScan]);

  const toStart = useCallback(() => {
    void window.api.cancelScan();
    setPhase({ is: "start" });
    refreshDrives();
  }, [refreshDrives]);

  // Scan events ------------------------------------------------------------

  useEffect(() => {
    const offP = window.api.onScanProgress(setProgress);
    const offD = window.api.onScanDone((table) => {
      const d = new Disk(table);
      setDisk(d);
      setVersion(0);
      setZoom(0);
      setSelected(-1);
      setHover(-1);
      setExpanded(new Set([0]));
      setTab("tree");
      setQuery("");
      setFilter(NO_FILTER);
      setComparison(null);
      setAgainst(null);
      setDups(DUP_IDLE);
      setPhase({ is: "ready" });
      void window.api.listSnapshots(table.root).then((all) => {
        const older = all.filter((s) => s.date < table.startedAt);
        setSnapshots(older);
        if (older.length > 0) setAgainst(older[0].file);
      });
    });
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
      offD();
      offE();
      offU();
    };
  }, [t]);

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

  const zoomTo = useCallback(
    (id: number) => {
      if (!disk || id < 0 || !disk.isDir(id) || disk.size(id) <= 0) return;
      setZoom(id);
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const a of disk.ancestors(id)) next.add(a);
        return next;
      });
    },
    [disk],
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

  const context = useCallback(
    (id: number, x: number, y: number) => {
      if (!disk) return;
      const path = disk.path(id);
      const dir = disk.isDir(id);
      const items: MenuEntry[] = [
        { label: t("act.open"), icon: "open", run: () => void window.api.openPath(path) },
        { label: t("act.reveal"), icon: "reveal", run: () => void window.api.showInFolder(path) },
        {
          label: t("act.copyPath"),
          icon: "copy",
          keys: "Ctrl+C",
          run: () => void window.api.copyText(path).then(() => flash(t("copied"))),
        },
      ];
      if (dir) items.push({ label: t("act.zoom"), icon: "enter", keys: "Enter", run: () => zoomTo(id) });
      if (id > 0) items.push({ kind: "sep" }, { label: t("act.trash"), icon: "trash", keys: "Del", danger: true, run: () => setTrash([id]) });
      setMenu({ x, y, items });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disk, t, zoomTo],
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

  // Menus ------------------------------------------------------------------

  const ready = phase.is === "ready" && disk !== null;
  const menus: Record<string, () => MenuEntry[]> = {
    file: () => [
      { label: t("menu.chooseFolder"), icon: "folder", keys: "Ctrl+O", run: pickFolder },
      { label: t("menu.rescan"), icon: "rescan", keys: "F5", disabled: !ready, run: () => disk && startScan(disk.t.root) },
      { label: t("menu.start"), icon: "drive", disabled: phase.is === "start", run: toStart },
      { kind: "sep" },
      { label: t("menu.exit"), keys: "Alt+F4", run: () => void window.api.quit() },
    ],
    view: () => [
      { label: t("menu.zoomOut"), icon: "up", keys: "Backspace", disabled: !ready || zoom === 0, run: () => disk && zoomTo(disk.parent(zoom)) },
      { label: t("menu.zoomRoot"), disabled: !ready || zoom === 0, run: () => zoomTo(0) },
      { kind: "sep" },
      { kind: "title", label: t("menu.theme") },
      ...(["system", "light", "dark"] as const).map(
        (v): MenuEntry => ({
          label: t(v === "system" ? "menu.themeSystem" : v === "light" ? "menu.themeLight" : "menu.themeDark"),
          checked: themePref === v,
          run: () => {
            setThemePref(v);
            save("theme", v);
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
    help: () => [
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
  const openMenu = (name: string, el: HTMLElement): void => {
    const r = el.getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom, items: menus[name](), from: name });
  };

  // Keyboard ---------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
      if (e.key === "F5") {
        e.preventDefault();
        if (ready && disk) startScan(disk.t.root);
      } else if (e.key === "F11") {
        e.preventDefault();
        void window.api.toggleFullScreen();
      } else if (e.key === "F12") {
        void window.api.toggleDevTools();
      } else if (e.ctrlKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        pickFolder();
      } else if (e.ctrlKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "Escape") {
        if (typing && query) clearFilters();
        else if (phase.is === "scanning") toStart();
      } else if (!typing && ready && disk) {
        if (e.key === "Backspace" && zoom > 0) zoomTo(disk.parent(zoom));
        else if (e.ctrlKey && e.key.toLowerCase() === "c" && selected >= 0) {
          void window.api.copyText(disk.path(selected)).then(() => flash(t("copied")));
        } else if (e.key === "Delete" && selected > 0 && !(e.target as HTMLElement).closest?.(".rows")) setTrash([selected]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, disk, zoom, selected, phase, query, t, startScan, pickFolder, zoomTo, toStart]);

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

  const crumbs = useMemo(() => (disk && ready ? disk.ancestors(zoom) : []), [disk, ready, zoom]);
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
          Diskplot
        </div>
        <nav className="menus">
          {(["file", "view", "help"] as const).map((name) => (
            <button
              key={name}
              className="menu-button"
              aria-haspopup="menu"
              aria-expanded={menu?.from === name}
              onMouseDown={(e) => {
                e.stopPropagation();
                if (menu?.from === name) setMenu(null);
                else openMenu(name, e.currentTarget);
              }}
              onMouseEnter={(e) => {
                if (menu?.from && menu.from !== name) openMenu(name, e.currentTarget);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
                  e.preventDefault();
                  openMenu(name, e.currentTarget);
                }
              }}
            >
              {t(`menu.${name}`)}
            </button>
          ))}
        </nav>
        <div className="titlebar-path">{ready ? disk.path(zoom) : phase.is === "scanning" ? phase.root : ""}</div>
      </header>

      {notice && (
        <div className={"notice" + (notice.bad ? " bad" : "")} role="status">
          <span className="grow">{notice.text}</span>
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

      {(phase.is === "scanning" || phase.is === "failed") && (
        <ScanSheet phase={phase} progress={progress} t={t} fmt={fmt} onStop={toStart} onRetry={() => startScan(phase.root)} />
      )}

      {ready && (
        <>
          <div className="toolrow">
            <button className="btn" title={t("menu.start")} onClick={toStart}>
              <Icon name="drive" />
              {t("tool.drives")}
            </button>
            <button className="btn" onClick={() => startScan(disk.t.root)} title="F5">
              <Icon name="rescan" />
              {t("menu.rescan")}
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
                {fmt.when(disk.t.startedAt)}
                <small>{t("block.in", { time: fmt.duration(disk.t.durationMs) })}</small>
              </span>
            </div>
            {disk.t.errors > 0 && (
              <button className="tb-cell link" onClick={() => setDialog("issues")}>
                <span className="k">{t("block.issues")}</span>
                <span className="v">{fmt.count(disk.t.errors)}</span>
              </button>
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

      {menu && <Menu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
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

      {dialog === "about" && (
        <Dialog onClose={() => setDialog(null)}>
          <div className="body" style={{ paddingTop: 16 }}>
            <div className="about">
              <Mark size={44} />
              <div>
                <div className="name">Diskplot</div>
                <div>{t("about.line", { version: appVersion })}</div>
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

function Dialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    if (!el.open) el.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
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

function ScanSheet(p: {
  phase: { is: "scanning"; root: string } | { is: "failed"; root: string; error: string };
  progress: ScanProgress | null;
  t: T;
  fmt: Fmt;
  onStop: () => void;
  onRetry: () => void;
}) {
  const { t, fmt, phase } = p;
  const pr = p.progress;
  const max = pr && pr.top.length > 0 ? pr.top[0].bytes || 1 : 1;
  return (
    <main className="sheet scan">
      <div className="sheet-inner">
        <h1>{t("scan.title", { root: phase.root })}</h1>
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
