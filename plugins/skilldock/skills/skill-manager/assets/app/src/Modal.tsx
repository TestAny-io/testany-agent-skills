import { useLayoutEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { t } from "./i18n";
function classNames(...values: (string | false | undefined)[]) {
  return values.filter(Boolean).join(" ");
}
let openModals = 0;
let backgroundState: { element: HTMLElement; inert: boolean; hidden: string | null } | null = null;
export function Modal({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
  drawer = false,
  className,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  drawer?: boolean;
  className?: string;
}) {
  const id = useId();
  const element = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.current?.focus();
    if (openModals++ === 0) {
      const background = document.querySelector<HTMLElement>(".app-shell");
      if (background) {
        backgroundState = { element: background, inert: background.inert, hidden: background.getAttribute("aria-hidden") };
        background.inert = true;
        background.setAttribute("aria-hidden", "true");
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const candidates = element.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]',
      );
      const items = [...(candidates || [])].filter(
        (item) => item.getClientRects().length > 0,
      );
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === element.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === element.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      if (--openModals === 0 && backgroundState) {
        backgroundState.element.inert = backgroundState.inert;
        if (backgroundState.hidden === null) backgroundState.element.removeAttribute("aria-hidden");
        else backgroundState.element.setAttribute("aria-hidden", backgroundState.hidden);
        backgroundState = null;
      }
      document.body.style.overflow = bodyOverflow;
      document.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(
    <div
      className={classNames("overlay", drawer && "overlay-drawer")}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={classNames(
          "modal",
          wide && "modal-wide",
          drawer && "drawer",
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        ref={element}
      >
        <div className="modal-header">
          <div>
            {eyebrow && <div className="eyebrow">{t(eyebrow)}</div>}
            <h2 id={id}>{title}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("关闭对话框")}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.getElementById("root")!,
  );
}
