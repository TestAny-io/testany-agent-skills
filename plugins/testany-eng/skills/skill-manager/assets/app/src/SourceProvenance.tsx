import type { SourceInfo } from "../shared/contracts";

const copy = {
  zh: {
    title: "已检测到的来源信息",
    missing:
      "未找到可核实的安装来源记录，因此下面的关联表单没有自动填入仓库。技能可能只保留了复制后的文件；SKILL.md 和 agents/openai.yaml 不要求记录原仓库、子目录和 commit。",
    detected: "已从当前 Git 工作区读取来源，并预填关联表单。请核对后再比较。",
    recorded: "以下字段来自应用保存的来源记录。",
    source: "来源地址",
    subpath: "来源内目录",
    ref: "分支 / 标签",
    commit: "检测到的来源 commit",
    unknown: "未记录",
    notGit: "不适用（本地目录）",
    root: "来源根目录",
    head: "这里的 commit 是当前工作区的 HEAD，不能证明最初安装时使用的 commit。",
    baseline:
      "关联来源不会补造历史安装记录。比较后的来源 commit 也不代表旧文件原本来自该提交。",
    next: "如果这些信息未保存，需要提供一次可信的来源地址；确认关联后，后续更新会保留来源记录。",
  },
  en: {
    title: "Detected source information",
    missing:
      "No verifiable installation source record was found, so the connection form has no repository to prefill. A skill may contain only copied files; SKILL.md and agents/openai.yaml do not require the original repository, subdirectory or commit.",
    detected:
      "The source was read from the current Git working tree and prefilled below. Review it before comparing.",
    recorded:
      "These fields come from the source record saved by this application.",
    source: "Source address",
    subpath: "Source subdirectory",
    ref: "Branch / tag",
    commit: "Detected source commit",
    unknown: "Not recorded",
    notGit: "Not applicable (local directory)",
    root: "Source root",
    head: "This commit is the current working tree HEAD. It does not prove which commit was originally installed.",
    baseline:
      "Connecting a source does not reconstruct installation history. A compared source commit does not prove that the old files came from that commit.",
    next: "If this information was not saved, provide a trusted source once. After confirmation, subsequent updates retain a source record.",
  },
  ja: {
    title: "検出された取得元情報",
    missing:
      "確認できるインストール元の記録がないため、関連付けフォームにリポジトリは自動入力されていません。スキルにはコピーされたファイルだけが残る場合があります。SKILL.md と agents/openai.yaml には元のリポジトリ、サブフォルダー、コミットの記録は必須ではありません。",
    detected:
      "現在の Git 作業ツリーから取得元を読み取り、下のフォームに入力しました。比較する前に確認してください。",
    recorded: "以下は、このアプリに保存された取得元の記録です。",
    source: "取得元アドレス",
    subpath: "取得元内の場所",
    ref: "ブランチ / タグ",
    commit: "検出された取得元コミット",
    unknown: "記録なし",
    notGit: "該当なし（ローカルフォルダー）",
    root: "取得元のルート",
    head: "このコミットは現在の作業ツリーの HEAD です。最初のインストール時のコミットを証明するものではありません。",
    baseline:
      "関連付けによって過去のインストール履歴が復元されるわけではありません。比較した取得元のコミットは、既存ファイルの元のコミットを証明しません。",
    next: "情報が保存されていない場合は、信頼できる取得元を一度指定してください。確認後は、以降の更新で取得元の記録が保持されます。",
  },
} as const;

export function SourceProvenance({
  source,
  language,
}: {
  source?: SourceInfo;
  language: "zh" | "en" | "ja";
}) {
  const t = copy[language];
  const missing = !source?.source;
  const local =
    source?.sourceType === "local" && source?.kind !== "git-checkout";
  return (
    <section className="uw-source-context" aria-label={t.title}>
      <h4>{t.title}</h4>
      <p className="uw-hint">
        {missing
          ? t.missing
          : source?.kind === "git-checkout"
            ? t.detected
            : t.recorded}
      </p>
      <dl className="uw-facts">
        <div className="uw-full">
          <dt>{t.source}</dt>
          <dd>
            <code>{source?.source || t.unknown}</code>
          </dd>
        </div>
        <div>
          <dt>{t.subpath}</dt>
          <dd>
            <code>
              {source?.subpath === "."
                ? t.root
                : source?.subpath ||
                  (source?.sourceType === "local" ? t.root : t.unknown)}
            </code>
          </dd>
        </div>
        <div>
          <dt>{t.ref}</dt>
          <dd>
            <code>{local ? t.notGit : source?.ref || t.unknown}</code>
          </dd>
        </div>
        <div className="uw-full">
          <dt>{t.commit}</dt>
          <dd>
            <code>{local ? t.notGit : source?.commit || t.unknown}</code>
          </dd>
        </div>
      </dl>
      <p className="uw-hint">
        {source?.kind === "git-checkout" ? t.head : t.baseline}
      </p>
      {missing && <p className="uw-hint">{t.next}</p>}
    </section>
  );
}
