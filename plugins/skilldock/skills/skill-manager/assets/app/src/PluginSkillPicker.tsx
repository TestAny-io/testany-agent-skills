import { useId, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import type { PluginInstallPreview } from "../shared/contracts";
import { LibraryButton as Button } from "./LibraryUI";
import { t } from "./i18n";

export function PluginSkillPicker({ preview, selected, onChange, disabled }: {
  preview: PluginInstallPreview; selected: string[]; onChange: (paths: string[]) => void; disabled: boolean;
}) {
  const [query, setQuery] = useState(""); const hint = useId();
  const skills = preview.skillDetails;
  const visible = skills.filter(skill => `${skill.name} ${skill.description} ${skill.path}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="plugin-skill-picker" aria-label={t("插件内的技能")}>
    <div className="plugin-skills-heading"><div><strong>{t("插件内的技能")}</strong><p aria-live="polite">{preview.canSelectSkills ? t("安装 {v0} 项 · 启用 {v1} 项", { v0: skills.length, v1: selected.length }) : t("附带技能（{v0}）", { v0: skills.length })}</p></div><Sparkles size={20} /></div>
    {skills.length ? <>
      <p className="field-hint" id={hint}>{t(preview.canSelectSkills ? "插件按整包安装。取消勾选的技能仍会安装，但保持禁用；其他组件不受影响。" : "共享目录中的技能暂不支持逐项启用，请通过 Codex 管理。")}</p>
      <div className="plugin-skills-toolbar"><label className="search-field"><Search size={15} /><input type="search" aria-label={t("搜索插件内的技能")} placeholder={t("搜索名称、用途或目录…")} value={query} onChange={event => setQuery(event.target.value)} /></label>
        {preview.canSelectSkills && <div><Button disabled={disabled} variant="ghost" onClick={() => onChange(skills.map(skill => skill.path))}>{t("全选")}</Button><Button disabled={disabled} variant="ghost" onClick={() => onChange([])}>{t("全不选")}</Button></div>}
      </div>
      <div className="plugin-skill-options">{visible.map(skill => <label className={`plugin-skill-option ${selected.includes(skill.path) ? "selected" : ""}`} key={skill.path}>
        {preview.canSelectSkills && <input type="checkbox" aria-label={t("启用 {v0}（{v1}）", { v0: skill.name, v1: skill.path })} aria-describedby={hint} checked={selected.includes(skill.path)} disabled={disabled} onChange={event => onChange(event.target.checked ? [...selected, skill.path] : selected.filter(item => item !== skill.path))} />}
        <div><strong>{skill.name}</strong><p>{skill.description}</p><code>{skill.path}</code></div>
      </label>)}</div>
      {!visible.length && <p className="field-hint" role="status">{t("没有匹配的技能；搜索不会改变已有选择。")}</p>}
      {preview.canSelectSkills && <p className="field-hint">{t("更新会保留这些选择；新增技能默认禁用，可在技能库中启用。")}</p>}
    </> : <p className="field-hint">{t("这个插件没有附带技能，仍可安装下面列出的其他组件。")}</p>}
  </section>;
}
