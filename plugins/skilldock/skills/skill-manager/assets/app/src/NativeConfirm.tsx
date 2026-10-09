// CONFIRMATION_REQUIRED (API-SDX-001 36c §7.3, AC-016): the service names the native rules a
// change touches; the user confirms. Where a rule allows a choice, the dialog offers it:
// keeping a plugin's data, or naming a new local settings file in .git/info/exclude.
import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { ActionRequest, NativeRule } from "../shared/contracts";
import { Modal } from "./Modal";
import { LibraryButton as Button, type ActionHandler } from "./LibraryUI";
import { ServiceMessage, t } from "./i18n";

export type NativeConfirmation = { request: Omit<ActionRequest, "mode">; message: string; rules: NativeRule[] };

/** Which choices the rules offer. */
export function confirmationChoices(rules: NativeRule[]) {
  return {
    keepData: rules.some(rule => rule.kind === "data-removal"),
    gitExclude: rules.some(rule => rule.items?.some(item => item.endsWith("settings.local.json"))),
  };
}

/** The request sent again once the user confirmed, with the choices the rules offered. */
export function confirmedRequest(confirmation: NativeConfirmation, chosen: { keepData: boolean; gitExclude: boolean }): Omit<ActionRequest, "mode"> {
  const offered = confirmationChoices(confirmation.rules);
  return { ...confirmation.request, confirm: true, ...(offered.keepData ? { keepData: chosen.keepData } : {}), ...(offered.gitExclude ? { gitExclude: chosen.gitExclude } : {}) };
}

/** What a change touches, as the service names it. */
export function NativeRuleList({ rules }: { rules: NativeRule[] }) {
  return (
    <ul className="native-rules">
      {rules.map((rule, index) => (
        <li key={`${rule.kind}-${index}`}>
          <ShieldAlert size={15} aria-hidden="true" />
          <div><ServiceMessage value={rule.message} />{!!rule.items?.length && <ul>{rule.items.map(item => <li key={item}><code>{item}</code></li>)}</ul>}</div>
        </li>
      ))}
    </ul>
  );
}

export function NativeConfirmDialog({ confirmation, busy, action, onClose }: { confirmation: NativeConfirmation; busy: string | null; action: ActionHandler; onClose: () => void }) {
  const offered = confirmationChoices(confirmation.rules);
  const [keepData, setKeepData] = useState(false);
  const [gitExclude, setGitExclude] = useState(true);
  const [error, setError] = useState("");
  async function confirm() {
    setError("");
    try { if (await action(confirmedRequest(confirmation, { keepData, gitExclude }))) onClose(); }
    catch (failure) { setError((failure as Error).message); }
  }
  return (
    <Modal title={t("请确认这次改动")} eyebrow="REVIEW YOUR ACTION" onClose={onClose}>
      <div className="modal-body">
        <div className="dialog-description"><ServiceMessage value={confirmation.message} /></div>
        <NativeRuleList rules={confirmation.rules} />
        {offered.keepData && <label className="check-field"><input type="checkbox" checked={keepData} onChange={event => setKeepData(event.target.checked)} />{t("保留插件数据")}</label>}
        {offered.gitExclude && <label className="check-field"><input type="checkbox" checked={gitExclude} onChange={event => setGitExclude(event.target.checked)} />{t("把它写入本机的 .git/info/exclude")}</label>}
        {error && <div className="field-error" role="alert"><ServiceMessage value={error} error /></div>}
      </div>
      <div className="modal-footer">
        <Button onClick={onClose} disabled={!!busy}>{t("取消")}</Button>
        <Button variant="primary" busy={!!busy} onClick={() => void confirm()}>{t("确认")}</Button>
      </div>
    </Modal>
  );
}
