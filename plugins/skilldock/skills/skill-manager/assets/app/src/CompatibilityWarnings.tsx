import { CircleAlert } from "lucide-react";
import { ServiceMessage, t } from "./i18n";

export function CompatibilityWarnings({ warnings }: { warnings?: string[] }) {
  if (!warnings?.length) return null;
  return <div className="notice compatibility-notice" role="status">
    <CircleAlert size={17} aria-hidden="true" />
    <div><strong>{t("兼容性提示")}</strong><ul>{[...new Set(warnings)].map(warning =>
      <li key={warning}><ServiceMessage value={warning} /></li>)}</ul></div>
  </div>;
}
