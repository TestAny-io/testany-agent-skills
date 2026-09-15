import { useSyncExternalStore } from "react";

export type Language = "zh" | "en" | "ja";
export type Theme = "light" | "dark" | "system";
export interface Preferences {
  language: Language;
  theme: Theme;
}
const key = "skilldock.preferences.v1";
const defaults: Preferences = { language: "zh", theme: "light" };
function load(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return {
      language: ["zh", "en", "ja"].includes(value.language)
        ? value.language
        : defaults.language,
      theme: ["light", "dark", "system"].includes(value.theme)
        ? value.theme
        : defaults.theme,
    };
  } catch {
    return defaults;
  }
}
let current = load();
const subscribers = new Set<() => void>();
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
function apply() {
  document.documentElement.dataset.theme =
    current.theme === "system"
      ? systemDark.matches
        ? "dark"
        : "light"
      : current.theme;
  document.documentElement.lang = { zh: "zh-CN", en: "en", ja: "ja" }[
    current.language
  ];
  document.title = {
    zh: "SkillDock · 技能管理台",
    en: "SkillDock · Skill manager",
    ja: "SkillDock · スキル管理",
  }[current.language];
}
export function preferences() {
  return current;
}
export function setPreferences(change: Partial<Preferences>) {
  current = { ...current, ...change };
  try {
    localStorage.setItem(key, JSON.stringify(current));
  } catch {
    /* Preferences still apply for this tab when storage is unavailable. */
  }
  apply();
  subscribers.forEach((subscriber) => subscriber());
}
export function usePreferences() {
  return useSyncExternalStore(
    (listener) => {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    () => current,
  );
}
systemDark.addEventListener("change", apply);
window.addEventListener("storage", (event) => {
  if (event.key === key) {
    current = load();
    apply();
    subscribers.forEach((subscriber) => subscriber());
  }
});
apply();
