import { useState } from "react";
import { t } from "./i18n";

export function GitAccessHelp() {
  return <details className="git-access-help">
    <summary>{t("私有仓库访问设置")}</summary>
    <p>{t("使用这台电脑已有的 Git 登录或 SSH 密钥。仅在浏览器登录并不够；SkillDock 不保存密码或 token。")}</p>
    <strong>HTTPS</strong>
    <p>{t("仓库地址和 GitHub 目录链接使用本机 Git credential helper，例如 macOS Keychain。已安装 GitHub CLI 的用户可先在终端完成：")}</p>
    <pre><code>{"gh auth login\ngh auth setup-git"}</code></pre>
    <strong>SSH</strong>
    <p>{t("也可使用 SSH 仓库地址，例如 git@github.com:owner/repo.git。先在终端验证主机，并将密钥解锁到 ssh-agent。")}</p>
    <p>{t("定时更新使用相同凭据。凭据过期、密钥未解锁或组织授权不足时，会记录失败；完成授权后可重新检查。不要把 token 放进仓库地址。")}</p>
    <a href="https://docs.github.com/en/get-started/git-basics/caching-your-github-credentials-in-git" target="_blank" rel="noreferrer">{t("查看 GitHub 认证说明")}</a>
  </details>;
}

export function GitSourceFields({ source, subpath, gitRef, setSource, setSubpath, setRef, kind = "skill" }: {
  source: string; subpath: string; gitRef: string;
  kind?: "skill" | "plugin";
  setSource: (value: string) => void; setSubpath: (value: string) => void; setRef: (value: string) => void;
}) {
  const [advanced, setAdvanced] = useState(Boolean(subpath && subpath !== "."));
  return <>
    <label className="field"><span>{t("Git 仓库或目录链接")}</span>
      <input required aria-label={t("Git 仓库或目录链接")} value={source} autoComplete="off" spellCheck={false}
        placeholder={kind === "plugin" ? "https://github.com/owner/repo/tree/main/plugins/my-plugin" : "https://github.com/owner/repo/tree/main/skills/my-skill"}
        onChange={event => { setSource(event.target.value); setSubpath(""); setRef(""); }} />
      <small>{t("直接粘贴 GitHub 目录链接，自动识别仓库、分支和子目录。也支持 Git 仓库地址。")}</small>
    </label>
    <label className="field"><span>{t("分支或标签（可选）")}</span>
      <input aria-label={t("分支或标签（可选）")} value={gitRef} onChange={event => setRef(event.target.value)} autoComplete="off" spellCheck={false} placeholder={t("使用链接中的版本或仓库默认分支")} />
      <small>{t("填写后覆盖链接中的分支或标签，保留同一子目录。")}</small>
    </label>
    <details className="git-source-advanced" open={advanced} onToggle={event => setAdvanced(event.currentTarget.open)}>
      <summary tabIndex={0}>{t("高级：手动指定子目录")}</summary>
      <label className="field"><span>{t("仓库内子目录（可选）")}</span>
        <input aria-label={t("仓库内子目录（可选）")} value={subpath} onChange={event => setSubpath(event.target.value)} autoComplete="off" spellCheck={false} placeholder={kind === "plugin" ? "plugins/my-plugin" : "skills/my-skill"} />
        <small>{t("仅仓库根地址或其他 Git 托管服务需要；目录链接无需填写。")}</small>
      </label>
    </details>
    <GitAccessHelp />
  </>;
}

export function ResolvedGitSource({ source }: { source: { subpath?: string; ref?: string; commit?: string } }) {
  return <dl className="resolved-source">
    {source.subpath && <div><dt>{t("来源内目录")}</dt><dd><code>{source.subpath}</code></dd></div>}
    {source.ref && <div><dt>{t("分支或标签")}</dt><dd><code>{source.ref}</code></dd></div>}
    {source.commit && <div><dt>Commit</dt><dd><code>{source.commit}</code></dd></div>}
  </dl>;
}
