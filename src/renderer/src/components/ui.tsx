import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

export const ROW = 26;

// Fixed height rows, only the visible ones mounted.
export function VirtualRows(props: {
  count: number;
  render: (index: number, top: number) => ReactNode;
  reveal?: { index: number; tick: number };
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  onLeave?: () => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(400);

  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const tick = props.reveal?.tick;
  useLayoutEffect(() => {
    const el = ref.current;
    const index = props.reveal?.index ?? -1;
    if (!el || index < 0) return;
    const y = index * ROW;
    if (y < el.scrollTop) el.scrollTop = Math.max(0, y - ROW * 2);
    else if (y + ROW > el.scrollTop + el.clientHeight) el.scrollTop = y - el.clientHeight + ROW * 3;
    // Only when asked to reveal, not on every index change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const first = Math.max(0, Math.floor(top / ROW) - 6);
  const last = Math.min(props.count, Math.ceil((top + height) / ROW) + 6);
  const rows: ReactNode[] = [];
  for (let i = first; i < last; i++) rows.push(props.render(i, i * ROW));

  return (
    <div
      ref={ref}
      className="rows"
      tabIndex={0}
      role="grid"
      aria-label={props.label}
      aria-rowcount={props.count}
      onScroll={(e) => setTop(e.currentTarget.scrollTop)}
      onKeyDown={props.onKeyDown}
      onMouseLeave={props.onLeave}
    >
      <div style={{ height: props.count * ROW }} />
      {rows}
    </div>
  );
}

export type MenuEntry =
  | { kind?: "item"; label: string; icon?: IconName; keys?: string; checked?: boolean; danger?: boolean; disabled?: boolean; run: () => void }
  | { kind: "sep" }
  | { kind: "title"; label: string };

// A square drop menu, used by the title bar and by right click.
export function Menu(props: { x: number; y: number; items: MenuEntry[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: props.x, y: props.y });

  useLayoutEffect(() => {
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.max(4, Math.min(props.x, window.innerWidth - r.width - 4)),
      y: Math.max(4, Math.min(props.y, window.innerHeight - r.height - 4)),
    });
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [props.x, props.y, props.items]);

  useEffect(() => {
    const down = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) props.onClose();
    };
    const close = (): void => props.onClose();
    window.addEventListener("mousedown", down, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", down, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [props]);

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      props.onClose();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const buttons = [...ref.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = (at + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <div ref={ref} className="menu" role="menu" style={{ left: pos.x, top: pos.y }} onKeyDown={onKey}>
      {props.items.map((it, i) => {
        if (it.kind === "sep") return <div key={i} className="menu-sep" role="separator" />;
        if (it.kind === "title")
          return (
            <div key={i} className="menu-title">
              {it.label}
            </div>
          );
        return (
          <button
            key={i}
            role="menuitem"
            className={"menu-item" + (it.danger ? " danger" : "")}
            disabled={it.disabled}
            onClick={() => {
              props.onClose();
              it.run();
            }}
          >
            <span className="mark">{it.checked ? <Icon name="dot" /> : it.icon ? <Icon name={it.icon} /> : null}</span>
            <span className="label">{it.label}</span>
            {it.keys && <kbd>{it.keys}</kbd>}
          </button>
        );
      })}
    </div>
  );
}
