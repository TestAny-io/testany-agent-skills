// A confirmation the interface asks for before a request (the service's own
// CONFIRMATION_REQUIRED is NativeConfirm). Moved out of App.tsx so that it can be rendered alone.
import { useState } from "react";
import { Check, CircleAlert, Folder, Trash2 } from "lucide-react";
import type { ActionRequest } from "../shared/contracts";
import { Modal } from "./Modal";
import { LibraryButton as Button, type ActionHandler } from "./LibraryUI";
import { ServiceMessage, t } from "./i18n";

type Request = Omit<ActionRequest, "mode">;
/** `option`: a choice the user may tick — unticked at first — which sends its request instead. */
export interface ConfirmContent { title: string; description: string; target: string; request: Request; danger?: boolean; label: string; affected?: string[]; affectedTitle?: string; option?: { label: string; request: Request } }

export function ConfirmDialog({
  dialog,
  busy,
  action,
  onClose,
}: {
  dialog: ConfirmContent;
  busy: string | null;
  action: ActionHandler;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [chosen, setChosen] = useState(false);
  async function confirm() {
    setError("");
    try {
      if (await action(chosen && dialog.option ? dialog.option.request : dialog.request)) onClose();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <Modal title={dialog.title} eyebrow="REVIEW YOUR ACTION" onClose={onClose}>
      <div className="modal-body">
        <p className="dialog-description">{dialog.description}</p>
        <div className="confirm-target">
          <Folder size={17} />
          <code>{dialog.target}</code>
        </div>
        {!!dialog.affected?.length && (
          <div className="affected-list">
            <h3>
              {dialog.affectedTitle ? t(dialog.affectedTitle) : t("受影响的技能（")}
              {dialog.affectedTitle ? null : <>{dialog.affected.length}）</>}
            </h3>
            <ul>
              {dialog.affected.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        {dialog.option && (
          <label className="check-field">
            <input type="checkbox" checked={chosen} onChange={(event) => setChosen(event.target.checked)} />
            {dialog.option.label}
          </label>
        )}
        {error && (
          <div className="field-error" role="alert">
            <CircleAlert size={16} />
            <ServiceMessage value={error} error />
          </div>
        )}
      </div>
      <div className="modal-footer">
        <Button onClick={onClose} disabled={!!busy}>
          {t("取消")}
        </Button>
        <Button
          variant={dialog.danger ? "danger" : "primary"}
          busy={!!busy}
          onClick={() => void confirm()}
        >
          {dialog.danger ? <Trash2 size={15} /> : <Check size={15} />}
          {dialog.label}
        </Button>
      </div>
    </Modal>
  );
}
