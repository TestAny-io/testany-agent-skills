import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { IconAssets, ProviderIcon as IconMetadata } from "../shared/contracts";
import { usePreferences } from "./preferences";
import "./ProviderIcon.css";

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
  const [failed, setFailed] = useState<string[]>([]);
  const candidates = [...(dark ? [icon?.dark] : []), ...(large ? [icon?.large, icon?.small] : [icon?.small, icon?.large]), icon?.dark];
  const id = candidates.find(id => id && assets[id] && !failed.includes(id)
    && /^data:image\/(?:png|jpeg|gif|webp|x-icon|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(assets[id]));
  return <span className={`${className}${id ? ` provider-icon${id === icon?.dark ? " provider-icon-dark" : ""}` : ""}`} aria-hidden="true">
    {id ? <img key={id} data-provider-icon={id} src={assets[id]} alt="" draggable={false} decoding="async" onError={() => setFailed(previous => [...previous, id])} /> : children}
  </span>;
}
