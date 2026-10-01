import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { IconAssets, ProviderIcon as IconMetadata } from "../shared/contracts";
import { usePreferences } from "./preferences";
import "./ProviderIcon.css";
import { apiFetch } from './transport';

const remoteIcons = new Map<string, Promise<string | null>>();
const validImage = (value: unknown): value is string => typeof value === 'string' && /^data:image\/(?:png|jpeg|gif|webp|x-icon|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(value);
function remoteIcon(id: string, dark: boolean) {
  const key = `${id}:${dark}`;
  if (!remoteIcons.has(key)) {
    if (remoteIcons.size >= 256) remoteIcons.delete(remoteIcons.keys().next().value!);
    remoteIcons.set(key, apiFetch(`/api/plugin-icon?id=${encodeURIComponent(id)}&theme=${dark ? 'dark' : 'light'}`)
      .then(async response => response.ok ? (await response.json()).data : null).then(data => validImage(data) ? data : null)
      .catch(() => null));
  }
  return remoteIcons.get(key)!;
}

const Context = createContext<{ assets: IconAssets; dark: boolean }>({ assets: {}, dark: false });
const system = window.matchMedia("(prefers-color-scheme: dark)");
const subscribe = (notify: () => void) => {
  system.addEventListener("change", notify);
  return () => system.removeEventListener("change", notify);
};

export function IconProvider({ assets, children }: { assets?: IconAssets; children: ReactNode }) {
  const parent = useContext(Context);
  const { theme } = usePreferences();
  const systemDark = useSyncExternalStore(subscribe, () => system.matches);
  const value = useMemo(() => ({ assets: { ...parent.assets, ...assets }, dark: theme === "dark" || theme === "system" && systemDark }), [parent.assets, assets, theme, systemDark]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function ProviderIcon({ icon, children, className = "skill-icon", large = false }: {
  icon?: IconMetadata; children: ReactNode; className?: string; large?: boolean;
}) {
  const { assets, dark } = useContext(Context);
  const element = useRef<HTMLSpanElement>(null);
  const [remote, setRemote] = useState<{ key: string; data: string | null }>();
  const [failed, setFailed] = useState<string[]>([]);
  const candidates = [...(dark ? [icon?.dark] : []), ...(large ? [icon?.large, icon?.small] : [icon?.small, icon?.large]), icon?.dark];
  const id = candidates.find(id => id && assets[id] && !failed.includes(id)
    && /^data:image\/(?:png|jpeg|gif|webp|x-icon|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(assets[id]));
  const remoteKey = `${icon?.remote}:${dark}`;
  useEffect(() => {
    if (!icon?.remote || id || !element.current) return;
    let cancelled = false;
    const load = () => { void remoteIcon(icon.remote!, dark).then(data => { if (!cancelled) setRemote({ key: remoteKey, data }); }); };
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); load(); } }, { rootMargin: '100px' });
    observer.observe(element.current);
    return () => { cancelled = true; observer.disconnect(); };
  }, [icon?.remote, dark, id, remoteKey]);
  const source = id ? assets[id] : remote?.key === remoteKey && !failed.includes(remoteKey) ? remote.data : null;
  return <span ref={element} className={`${className}${source ? ` provider-icon${id === icon?.dark && id ? " provider-icon-dark" : ""}` : ""}`} aria-hidden="true">
    {source ? <img key={id || remoteKey} data-provider-icon={id || icon?.remote} src={source} alt="" draggable={false} decoding="async" onError={() => setFailed(previous => [...previous, id || remoteKey])} /> : children}
  </span>;
}
