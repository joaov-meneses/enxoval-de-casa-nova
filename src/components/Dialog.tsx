import { type ReactNode, useId } from "react";
import { X } from "lucide-react";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";

interface DialogProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  tone?: "default" | "danger";
  busy?: boolean;
  /** Classe extra no diálogo, para telas que precisam de largura ou rolagem próprias. */
  className?: string;
}

export function Dialog({
  title,
  isOpen,
  onClose,
  children,
  tone = "default",
  busy = false,
  className = "",
}: DialogProps) {
  const titleId = useId();
  const close = () => {
    if (!busy) onClose();
  };
  const dialogRef = useDialogAccessibility(isOpen, close);
  if (!isOpen) return null;

  return (
    <div className="dialog-layer">
      <div className="dialog-backdrop" onClick={close} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`casamia-dialog ${tone === "danger" ? "dialog-danger" : ""} ${className}`.trim()}
      >
        <div className="dialog-heading">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            aria-label="Fechar janela"
            className="dialog-close"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
