import { useEffect, useRef, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Check, Undo2, X } from "@/src/components/icons";

export interface UndoToastMessage {
  /** Muda a cada aviso, para um aviso novo reiniciar o tempo mesmo com o mesmo texto. */
  id: number;
  text: string;
  /** Sem `undo`, o aviso só confirma o que aconteceu. */
  undo?: () => Promise<void> | void;
  /** Texto do botão; sem ele, a ação é "Desfazer". */
  actionLabel?: string;
}

const VISIBLE_MS = 6000;

/**
 * Aviso curto no rodapé, com "Desfazer" (ou outra ação) quando há o que fazer a partir dele. O tempo pausa enquanto o
 * ponteiro ou o foco estão no aviso, para quem lê devagar ou navega pelo teclado não perdê-lo.
 */
export function UndoToast({
  message,
  onDismiss,
}: {
  message: UndoToastMessage | null;
  onDismiss: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    setUndoing(false);
  }, [message?.id]);

  useEffect(() => {
    if (!message || paused) return;
    const timeout = window.setTimeout(() => dismissRef.current(), VISIBLE_MS);
    return () => window.clearTimeout(timeout);
  }, [message, paused]);

  return (
    <div className="undo-toast-region" role="status" aria-live="polite">
      {message && (
        <div
          key={message.id}
          className="undo-toast"
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <Check size={16} aria-hidden="true" className="undo-toast-icon" />
          <span className="undo-toast-text">{message.text}</span>
          {message.undo && (
            <Button
              variant="brand"
              size="brand"
              type="button"
              className="undo-toast-action"
              disabled={undoing}
              onClick={async () => {
                setUndoing(true);
                try {
                  await message.undo?.();
                  onDismiss();
                } catch {
                  // O erro já aparece no topo da lista; o aviso some para não prometer o que não aconteceu.
                  onDismiss();
                }
              }}
            >
              {message.actionLabel ?? (
                <>
                  <Undo2 size={15} aria-hidden="true" /> Desfazer
                </>
              )}
            </Button>
          )}
          <Button
            variant="brand"
            size="brand"
            type="button"
            className="undo-toast-close"
            aria-label="Fechar aviso"
            onClick={onDismiss}
          >
            <X size={16} aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
