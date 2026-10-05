import { memo, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { DupGroup, DupProgress, SnapshotMeta } from "../../../shared/types";
import type { Disk } from "../lib/disk";
import { byType, duplicateCandidates, findClutter } from "../lib/analysis";
import type { ClutterKind, Comparison, FilterResult } from "../lib/analysis";
import type { Fmt, T } from "../lib/i18n";
import { Icon } from "./Icon";
import { VirtualRows } from "./ui";

export interface PaneProps {
  disk: Disk;
  version: number;
  selected: number;
  hover: number;
  fmt: Fmt;
  t: T;
  onSelect: (id: number) => void;
  onHover: (id: number) => void;
  onZoom: (id: number) => void;
  onContext: (id: number, x: number, y: number) => void;
}

// One file or folder with the folder it lives in, shared by most lists.
function ItemRow(p: PaneProps & { id: number; top: number; grid: string; children: ReactNode }) {
  const { disk, id } = p;
  const dir = disk.isDir(id);
  const parent = disk.parent(id);
  return (
    <div
      key={id}
      role="row"
      className={"trow" + (id === p.selected ? " sel" : id === p.hover ? " hot" : "")}
      style={{ top: p.top, gridTemplateColumns: p.grid }}
      onMouseEnter={() => p.onHover(id)}
      onMouseDown={() => p.onSelect(id)}
      onDoubleClick={() => p.onZoom(dir ? id : parent)}
      onContextMenu={(e) => {
        e.preventDefault();
        p.onSelect(id);
        p.onContext(id, e.clientX, e.clientY);
      }}
    >
      <div className="cell-name" style={{ paddingLeft: 8 }}>
        <Icon name={dir ? "folder" : "file"} className="glyph" />
        <span className="text">{disk.name(id)}</span>
        <span className="sub">{parent >= 0 ? disk.path(parent) : ""}</span>
      </div>
      {p.children}
    </div>
  );
}

// Largest files, and search results ------------------------------------------

const LIST_GRID = "minmax(0, 1fr) 78px 86px";

export const ListPane = memo(function ListPane(p: PaneProps & { ids: number[]; note: ReactNode; empty?: string }) {
  const { fmt, t, disk } = p;
  return (
    <div className="pane">
      <div className="pane-note">{p.note}</div>
      {p.ids.length === 0 && p.empty ? (
        <div className="pane-empty">{p.empty}</div>
      ) : (
        <>
          <div className="thead" style={{ gridTemplateColumns: LIST_GRID }}>
            <button disabled>{t("col.name")}</button>
            <button disabled className="num sorted">
              {t("col.size")}
              <Icon name="sortDown" size={12} />
            </button>
            <button disabled className="num">
              {t("col.modified")}
            </button>
          </div>
          <VirtualRows
            count={p.ids.length}
            label={t("tab.largest")}
            onLeave={() => p.onHover(-1)}
            render={(i, top) => (
              <ItemRow key={p.ids[i]} {...p} id={p.ids[i]} top={top} grid={LIST_GRID}>
                <div className="num">{fmt.bytes(disk.size(p.ids[i]))}</div>
                <div className="num dim">{fmt.date(disk.t.mtime[p.ids[i]])}</div>
              </ItemRow>
            )}
          />
        </>
      )}
    </div>
  );
});

// Types --------------------------------------------------------------------

const TYPE_GRID = "minmax(0, 1fr) 150px 84px 76px";

export const TypesPane = memo(function TypesPane(p: PaneProps & { activeExt: number; onPick: (extId: number) => void }) {
  const { disk, fmt, t } = p;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => byType(disk), [disk, p.version]);
  const total = disk.size(0) || 1;
  return (
    <div className="pane">
      <div className="thead" style={{ gridTemplateColumns: TYPE_GRID }}>
        <button disabled>{t("col.type")}</button>
        <button disabled>{t("col.ofTotal")}</button>
        <button disabled className="num sorted">
          {t("col.size")}
          <Icon name="sortDown" size={12} />
        </button>
        <button disabled className="num">
          {t("col.files")}
        </button>
      </div>
      <VirtualRows
        count={rows.length}
        label={t("tab.types")}
        render={(i, top) => {
          const r = rows[i];
          const share = r.bytes / total;
          return (
            <div
              key={r.extId}
              role="row"
              className={"trow" + (r.extId === p.activeExt ? " sel" : "")}
              style={{ top, gridTemplateColumns: TYPE_GRID }}
              onClick={() => p.onPick(r.extId === p.activeExt ? -1 : r.extId)}
            >
              <div className={r.ext ? "" : "dim"} style={{ fontWeight: r.ext ? 500 : 400 }}>
                {r.ext ? "." + r.ext : t("types.none")}
              </div>
              <div className="share">
                <span className="track">
                  <span className="fill" style={{ width: Math.max(share * 100, 1) + "%", display: "block" }} />
                </span>
                <span className="pct">{fmt.pct(share)}</span>
              </div>
              <div className="num">{fmt.bytes(r.bytes)}</div>
              <div className="num dim">{fmt.count(r.files)}</div>
            </div>
          );
        }}
      />
    </div>
  );
});

// Clutter ------------------------------------------------------------------

const CLUTTER_GRID = "minmax(0, 1fr) 84px 34px";
const KINDS: ClutterKind[] = ["deps", "build", "cache", "pkgcache", "temp", "browser", "system", "recycle"];
const HANDS_OFF: ClutterKind[] = ["system", "recycle"];

type ClutterSort = "size" | "name" | "modified";

export const ClutterPane = memo(function ClutterPane(p: PaneProps & { onTrash: (ids: number[]) => void }) {
  const { disk, fmt, t } = p;
  const [sort, setSort] = useState<ClutterSort>("size");
  const [closed, setClosed] = useState<Set<ClutterKind>>(() => new Set());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hits = useMemo(() => findClutter(disk), [disk, p.version]);
  const rows = useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    const order = (a: number, b: number): number =>
      sort === "name"
        ? collator.compare(disk.name(a), disk.name(b)) || collator.compare(disk.path(a), disk.path(b))
        : sort === "modified"
          ? disk.t.mtime[b] - disk.t.mtime[a]
          : disk.size(b) - disk.size(a);
    const groups = KINDS.map((kind) => {
      const ids = hits.filter((h) => h.kind === kind).map((h) => h.id);
      return { kind, ids: ids.sort(order), bytes: ids.reduce((a, id) => a + disk.size(id), 0) };
    }).filter((g) => g.ids.length > 0);
    // The heaviest group comes first, whatever the order inside it.
    groups.sort((a, b) => b.bytes - a.bytes);
    const out: ({ group: ClutterKind; bytes: number; ids: number[] } | { id: number; kind: ClutterKind })[] = [];
    for (const g of groups) {
      out.push({ group: g.kind, bytes: g.bytes, ids: g.ids });
      if (!closed.has(g.kind)) for (const id of g.ids) out.push({ id, kind: g.kind });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits, sort, closed, disk, p.version]);
  const reclaim = hits.filter((h) => !HANDS_OFF.includes(h.kind)).reduce((a, h) => a + h.bytes, 0);
  const toggle = (kind: ClutterKind): void =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  if (hits.length === 0)
    return (
      <div className="pane">
        <div className="pane-empty">{t("clutter.none")}</div>
      </div>
    );
  return (
    <div className="pane">
      <div className="pane-note">
        <strong>{t("clutter.total", { bytes: fmt.bytes(reclaim) })}</strong>
        <br />
        {t("clutter.lead")}
      </div>
      <div className="pane-bar">
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {t("clutter.sort")}
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as ClutterSort)}>
            <option value="size">{t("sort.size")}</option>
            <option value="name">{t("sort.name")}</option>
            <option value="modified">{t("sort.modified")}</option>
          </select>
        </label>
      </div>
      <VirtualRows
        count={rows.length}
        label={t("tab.clutter")}
        onLeave={() => p.onHover(-1)}
        render={(i, top) => {
          const r = rows[i];
          if ("group" in r) {
            const open = !closed.has(r.group);
            return (
              <div
                key={"g" + r.group}
                role="row"
                aria-expanded={open}
                className="trow group"
                style={{ top, gridTemplateColumns: CLUTTER_GRID, cursor: "pointer" }}
                onClick={() => toggle(r.group)}
              >
                <div className="cell-name">
                  <span className={"twist" + (open ? " open" : "")}>
                    <Icon name="chevron" size={12} />
                  </span>
                  <span className="text">{t(`clutter.${r.group}`)}</span>
                  <span className="hint">
                    {r.ids.length}, {t(`clutter.${r.group}.hint`)}
                  </span>
                </div>
                <div className="num">{fmt.bytes(r.bytes)}</div>
                <div style={{ padding: 0 }}>
                  {!HANDS_OFF.includes(r.group) && (
                    <button
                      className="btn quiet icon"
                      style={{ height: 24, color: "inherit" }}
                      title={t("clutter.removeGroup")}
                      aria-label={t("clutter.removeGroup")}
                      onClick={(e) => {
                        e.stopPropagation();
                        p.onTrash(r.ids);
                      }}
                    >
                      <Icon name="trash" />
                    </button>
                  )}
                </div>
              </div>
            );
          }
          return (
            <ItemRow key={r.id} {...p} id={r.id} top={top} grid={CLUTTER_GRID}>
              <div className="num">{fmt.bytes(disk.size(r.id))}</div>
              <div style={{ padding: 0 }}>
                {!HANDS_OFF.includes(r.kind) && (
                  <button
                    className="btn quiet icon"
                    style={{ height: 24, color: "inherit" }}
                    title={t("act.trash")}
                    aria-label={t("act.trash")}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => p.onTrash([r.id])}
                  >
                    <Icon name="trash" />
                  </button>
                )}
              </div>
            </ItemRow>
          );
        }}
      />
    </div>
  );
});

// Duplicates ---------------------------------------------------------------

const MB = 1024 * 1024;
const DUP_GRID = "minmax(0, 1fr) 84px 34px";

export interface DupState {
  status: "idle" | "running" | "done";
  progress: DupProgress | null;
  groups: DupGroup[];
}

export const DupesPane = memo(function DupesPane(
  p: PaneProps & { state: DupState; setState: (s: DupState) => void; onTrash: (ids: number[]) => void },
) {
  const { disk, fmt, t, state, setState } = p;
  const [min, setMin] = useState(10 * MB);

  useEffect(() => {
    const offP = window.api.onDupProgress((progress) => setState({ status: "running", progress, groups: [] }));
    const offD = window.api.onDupDone((groups) => setState({ status: "done", progress: null, groups }));
    const offE = window.api.onDupError(() => setState({ status: "done", progress: null, groups: [] }));
    return () => {
      offP();
      offD();
      offE();
    };
  }, [setState]);

  const start = (): void => {
    setState({ status: "running", progress: null, groups: [] });
    void window.api.startDuplicates(duplicateCandidates(disk, min));
  };

  const rows = useMemo(() => {
    const out: ({ group: number; size: number; count: number } | { id: number })[] = [];
    state.groups.forEach((g, gi) => {
      const alive = g.ids.filter((id) => !disk.isGone(id));
      if (alive.length < 2) return;
      out.push({ group: gi, size: g.size, count: alive.length });
      for (const id of alive) out.push({ id });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.groups, disk, p.version]);
  const wasted = rows.reduce((a, r) => a + ("group" in r ? r.size * (r.count - 1) : 0), 0);
  const sets = rows.filter((r) => "group" in r).length;

  const picker = (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {t("dupes.min")}
      <select className="select" value={min} onChange={(e) => setMin(Number(e.target.value))}>
        {[1, 10, 100, 1024].map((mb) => (
          <option key={mb} value={mb * MB}>
            {fmt.bytes(mb * MB)}
          </option>
        ))}
      </select>
    </label>
  );

  if (state.status === "idle")
    return (
      <div className="pane">
        <div className="pane-note">{t("dupes.lead")}</div>
        <div className="pane-bar">
          {picker}
          <span className="grow" />
          <button className="btn primary" onClick={start}>
            <Icon name="scan" />
            {t("dupes.start")}
          </button>
        </div>
      </div>
    );

  if (state.status === "running") {
    const pr = state.progress;
    const frac = pr ? (pr.totalBytes > 0 ? pr.bytes / pr.totalBytes : pr.total > 0 ? pr.done / pr.total : 0) : 0;
    return (
      <div className="pane">
        <div className="pane-bar">
          <span className="grow">
            {pr && pr.totalBytes > 0
              ? t("dupes.hashing", { bytes: fmt.bytes(pr.bytes), total: fmt.bytes(pr.totalBytes) })
              : t("dupes.reading", { done: fmt.count(pr?.done ?? 0), total: fmt.count(pr?.total ?? 0) })}
          </span>
          <button
            className="btn"
            onClick={() => {
              void window.api.cancelDuplicates();
              setState({ status: "idle", progress: null, groups: [] });
            }}
          >
            <Icon name="stop" />
            {t("dupes.stop")}
          </button>
        </div>
        <div style={{ padding: "12px" }}>
          <div className="share">
            <span className="track" style={{ height: 10 }}>
              <span className="fill" style={{ width: frac * 100 + "%", display: "block" }} />
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pane">
      <div className="pane-bar">
        <strong className="grow" style={{ fontWeight: 600 }}>
          {sets > 0 ? t("dupes.summary", { groups: fmt.count(sets), bytes: fmt.bytes(wasted) }) : t("dupes.none")}
        </strong>
        {picker}
        <button className="btn" onClick={start}>
          {t("dupes.again")}
        </button>
      </div>
      <VirtualRows
        count={rows.length}
        label={t("tab.dupes")}
        onLeave={() => p.onHover(-1)}
        render={(i, top) => {
          const r = rows[i];
          if ("group" in r) {
            return (
              <div key={"g" + r.group} role="row" className="trow group" style={{ top, gridTemplateColumns: DUP_GRID }}>
                <div>
                  {fmt.bytes(r.size)}
                  <span className="hint">{t("dupes.copies", { count: r.count })}</span>
                </div>
                <div className="num">{fmt.bytes(r.size * (r.count - 1))}</div>
                <div />
              </div>
            );
          }
          return (
            <ItemRow key={r.id} {...p} id={r.id} top={top} grid={DUP_GRID}>
              <div className="num dim">{fmt.date(disk.t.mtime[r.id])}</div>
              <div style={{ padding: 0 }}>
                <button
                  className="btn quiet icon"
                  style={{ height: 24, color: "inherit" }}
                  title={t("act.trash")}
                  aria-label={t("act.trash")}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => p.onTrash([r.id])}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </ItemRow>
          );
        }}
      />
    </div>
  );
});

// Changes ------------------------------------------------------------------

const CHANGE_GRID = "minmax(0, 1fr) 132px 78px";

export const ChangesPane = memo(function ChangesPane(
  p: PaneProps & {
    comparison: Comparison | null;
    snapshots: SnapshotMeta[];
    against: string | null;
    onAgainst: (file: string) => void;
  },
) {
  const { disk, fmt, t, comparison: c } = p;
  if (!c || p.snapshots.length === 0)
    return (
      <div className="pane">
        <div className="pane-empty">{t("changes.first")}</div>
      </div>
    );
  const when = fmt.when(c.date);
  const total = disk.size(0) - c.oldTotal;
  const rows: ({ id: number } | { gone: number } | { head: true })[] = c.rows.filter((id) => !disk.isGone(id)).map((id) => ({ id }));
  if (c.removed.length > 0) {
    rows.push({ head: true });
    c.removed.forEach((_, i) => rows.push({ gone: i }));
  }
  return (
    <div className="pane">
      <div className="pane-bar">
        <span>{t("changes.total")}</span>
        <strong className={total >= 4 * MB ? "delta-up" : ""} style={{ fontWeight: 600 }}>
          {fmt.signedBytes(total)}
        </strong>
        <span className="grow" />
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {t("changes.against")}
          <select className="select" value={p.against ?? ""} onChange={(e) => p.onAgainst(e.target.value)}>
            {p.snapshots.map((s) => (
              <option key={s.file} value={s.file}>
                {fmt.when(s.date)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rows.length === 0 ? (
        <div className="pane-empty">{t("changes.none", { when })}</div>
      ) : (
        <>
          <div className="thead" style={{ gridTemplateColumns: CHANGE_GRID }}>
            <button disabled>{t("col.name")}</button>
            <button disabled className="num sorted">
              {t("col.change")}
            </button>
            <button disabled className="num">
              {t("col.size")}
            </button>
          </div>
          <VirtualRows
            count={rows.length}
            label={t("tab.changes")}
            onLeave={() => p.onHover(-1)}
            render={(i, top) => {
              const r = rows[i];
              if ("head" in r)
                return (
                  <div key="head" role="row" className="trow group" style={{ top, gridTemplateColumns: "1fr" }}>
                    <div>{t("changes.removed")}</div>
                  </div>
                );
              if ("gone" in r) {
                const g = c.removed[r.gone];
                return (
                  <div key={"x" + r.gone} role="row" className="trow" style={{ top, gridTemplateColumns: CHANGE_GRID }}>
                    <div className="dim" style={{ direction: "rtl", textAlign: "left" }}>
                      <bdi>{g.path}</bdi>
                    </div>
                    <div className="num">{fmt.signedBytes(-g.bytes)}</div>
                    <div />
                  </div>
                );
              }
              const d = c.delta[r.id];
              return (
                <ItemRow key={r.id} {...p} id={r.id} top={top} grid={CHANGE_GRID}>
                  <div className={"num" + (d > 0 ? " delta-up" : "")}>
                    {fmt.signedBytes(d)}
                    {c.isNew[r.id] ? <span className="tag">{t("changes.new")}</span> : null}
                  </div>
                  <div className="num dim">{fmt.bytes(disk.size(r.id))}</div>
                </ItemRow>
              );
            }}
          />
        </>
      )}
    </div>
  );
});

export type { FilterResult };
