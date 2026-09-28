import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { t } from "./i18n";

/** A non-modal inspector on a wide canvas, a focus-contained sheet on compact windows. */
export function Inspector({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const [compact, setCompact] = useState(() => matchMedia("(max-width: 1100px)").matches);
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const id = useId();
  useEffect(() => {
    const media = matchMedia("(max-width: 1100px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    let origin = document.activeElement as HTMLElement | null;
    if (compact) panel.current?.focus();
    const background = compact ? [...document.querySelectorAll<HTMLElement>(".sidebar, .workspace")].map(element => ({ element, inert: element.inert, hidden: element.getAttribute("aria-hidden") })) : [];
    for (const { element } of background) { element.inert = true; element.setAttribute("aria-hidden", "true"); }
    function rememberRow(event: FocusEvent) {
      if (event.target instanceof HTMLElement && event.target.matches(".skill-card-open")) origin = event.target;
    }
    function key(event: KeyboardEvent) {
      // A transactional dialog owns Escape while it is above this inspector.
      if (event.defaultPrevented || document.querySelector(".overlay") || document.querySelector(".command-menu")) return;
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (!compact || event.key !== "Tab") return;
      const items = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]') || [])].filter(item => item.getClientRects().length);
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", key);
    document.addEventListener("focusin", rememberRow);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("focusin", rememberRow);
      for (const { element, inert, hidden } of background) {
        element.inert = inert;
        if (hidden === null) element.removeAttribute("aria-hidden"); else element.setAttribute("aria-hidden", hidden);
      }
      if (origin?.isConnected) origin.focus({ preventScroll: true });
    };
  }, [compact]);
  return <>
    {compact && <div className="inspector-scrim" onClick={onClose} aria-hidden="true" />}
    <aside className="inspector" ref={panel} role="dialog" aria-modal={compact || undefined} aria-labelledby={id} tabIndex={-1}>
      <header className="inspector-heading"><h2 id={id}>{title}</h2><button className="icon-button" aria-label={t("关闭详情")} title={t("关闭详情")} onClick={onClose}><X size={17} /></button></header>
      {children}
    </aside>
  </>;
}

export type DesktopCommand = { label: string; icon: ReactNode; run: () => void; disabled?: boolean; danger?: boolean };
export function CommandMenu({ x, y, commands, onClose }: { x: number; y: number; commands: DesktopCommand[]; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const rect = menu.current!.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(x, innerWidth - rect.width - 8)), top: Math.max(8, Math.min(y, innerHeight - rect.height - 8)) });
    menu.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
  }, [x, y]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener("pointerdown", dismiss);
    window.addEventListener("resize", onClose);
    return () => { document.removeEventListener("pointerdown", dismiss); window.removeEventListener("resize", onClose); };
  }, [onClose]);
  return <div className="command-menu" role="menu" aria-label={t("更多操作")} ref={menu} style={position} onKeyDown={event => {
    const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape" || event.key === "Tab") { if (event.key === "Escape") event.preventDefault(); event.stopPropagation(); onClose(); }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }}>{commands.map(command => <button role="menuitem" key={command.label} disabled={command.disabled} className={command.danger ? "danger-text" : ""} onClick={() => { onClose(); command.run(); }}>{command.icon}<span>{command.label}</span></button>)}</div>;
}
