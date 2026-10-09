import messages from "./i18n/messages.json";
import serverMessages from "./i18n/server-messages.json";
import errorMessages from "./i18n/errors.json";
import { preferences } from "./preferences";

type Translation = { en: string; ja: string };
const catalog: Record<string, Translation> = { ...messages, ...serverMessages };
// Only these slots contain another application message. Names, paths and
// provider descriptions in every other slot must remain verbatim.
const messageSlots: Record<string, string> = {
  "市场 {v0}：{v1}": "v1",
  "插件 {v0}：{v1}": "v1",
  "缓存 {v0}：{v1}": "v1",
  "无法读取状态文件 {v0}：{v1}": "v1",
  "比 {v0} 中的 SkillDock {v1} 旧。{v2}": "v2",
  "无法确认 Claude 中的插件状态：{v0}": "v0",
  "{v0} Codex 为只读：这次检查没有改动 Codex；如有新版本，需要启用 Codex 管理后才能更新。": "v0",
  "{v0} Codex 为只读：这次检查没有刷新来源，也没有改动 Codex；如有新版本，需要启用 Codex 管理后才能更新。": "v0",
};
const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const templates = Object.entries(catalog)
  .filter(([key]) => /\{v\d+\}/.test(key))
  .map(([key, value]) => {
    const slots: string[] = [];
    const parts = key.split(/(\{v\d+\})/g).map((part) => {
      if (/^\{v\d+\}$/.test(part)) {
        slots.push(part.slice(1, -1));
        return "([\\s\\S]*?)";
      }
      return escapeRegex(part);
    });
    return {
      match: new RegExp("^" + parts.join("") + "$"), slots, value, messageSlot: messageSlots[key],
      literalLength: key.replace(/\{v\d+\}/g, "").length,
    };
  })
  // Full messages must win over short labels such as "{v0}插件 {v1}".
  // Rank by fixed text, leaving captured names and other user values literal.
  .sort((a, b) => b.literalLength - a.literalLength || a.slots.length - b.slots.length);
export function locale() {
  return { zh: "zh-CN", en: "en-US", ja: "ja-JP" }[preferences().language];
}
function interpolate(
  value: string,
  parameters: Record<string, string | number>,
) {
  return value.replace(/\{(\w+)\}/g, (whole, key) =>
    parameters[key] === undefined ? whole : String(parameters[key]),
  );
}
function translated(value: string): string | undefined {
  const { language } = preferences();
  if (language === "zh") return value;
  if (catalog[value]) return catalog[value][language];
  const reloadNote = " 新的 Codex 会话或重载后生效。";
  if (value.endsWith(reloadNote)) {
    const main = translated(value.slice(0, -reloadNote.length));
    if (main) return main + catalog[reloadNote][language];
  }
  // UI messages already created in the active language need no source notice.
  if (Object.values(catalog).some((entry) => entry[language] === value))
    return value;
  // A message of several lines translates line by line, only when every line is known.
  if (value.includes("\n")) {
    const lines = value.split("\n").map((line) => translated(line));
    return lines.every((line) => line !== undefined) ? lines.join("\n") : undefined;
  }
  for (const template of templates) {
    const match = value.match(template.match);
    if (match)
      return interpolate(
        template.value[language],
        Object.fromEntries(
          template.slots.map((slot, index) => [slot,
            slot === template.messageSlot
              ? (translated(match[index + 1]) ?? match[index + 1])
              : match[index + 1],
          ]),
        ),
      );
  }
  return undefined;
}
/** Translate only explicit application messages. External names and skill content are never passed here. */
export function t(
  key: string,
  parameters: Record<string, string | number> = {},
) {
  return interpolate(translated(key) ?? key, parameters);
}
export function requestError(code: string, message: string) {
  return new Error("SKILLDOCK_ERROR:" + JSON.stringify({ code, message }));
}
const supplemental = {
  original: { zh: "原始信息", en: "Original details", ja: "元の詳細" },
  external: {
    zh: "来源返回的信息",
    en: "Information returned by the source",
    ja: "配布元からの情報",
  },
  unknown: {
    zh: "操作未完成，请查看原始错误并重试。",
    en: "The action did not complete. Review the original error before retrying.",
    ja: "操作は完了していません。元のエラーを確認してから再試行してください。",
  },
};
export function ServiceMessage({
  value,
  error = false,
  code: suppliedCode,
}: {
  value: string;
  error?: boolean;
  code?: string;
}) {
  const language = preferences().language;
  let code = suppliedCode;
  let original = value;
  if (value.startsWith("SKILLDOCK_ERROR:")) {
    try {
      const parsed = JSON.parse(value.slice("SKILLDOCK_ERROR:".length));
      code = parsed.code;
      original = parsed.message;
    } catch {
      /* Preserve malformed and unknown server output verbatim. */
    }
  }
  const known = code
    ? (errorMessages as Record<string, Translation>)[code]?.[
        language === "zh" ? "en" : language
      ]
    : undefined;
  const copy = language === "zh" ? original : (translated(original) ?? known);
  if (copy)
    return (
      <div className="service-message">
        <span>{copy}</span>
        {code && language !== "zh" && copy !== original && (
          <details>
            <summary>
              {supplemental.original[language]} · {code}
            </summary>
            <div className="original-message">{original}</div>
          </details>
        )}
      </div>
    );
  return (
    <div className="service-message">
      <span>
        {error
          ? supplemental.unknown[language]
          : supplemental.external[language]}
        {code ? ` (${code})` : ""}
      </span>
      <div className="original-message">
        <strong>{supplemental.original[language]}: </strong>
        {original}
      </div>
    </div>
  );
}
