import { type ReactNode, useRef } from "react";
import { X } from "@/src/components/icons";
import { Dialog as DialogRoot, DialogContent, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";

interface DialogProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  tone?: "default" | "danger";
  busy?: boolean;
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
  const wasOpen = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  if (isOpen && !wasOpen.current) {
    const active = document.activeElement as HTMLElement | null;
    const menu = active?.closest<HTMLElement>('[role="menu"]');
    // A menu item unmounts when selected. Restore to its persistent trigger instead.
    const triggerId = menu?.getAttribute("aria-labelledby");
    returnFocus.current = (triggerId ? document.getElementById(triggerId) : null)
      ?? (menu?.id ? document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(menu.id)}"]`) : null)
      ?? active;
  }
  wasOpen.current = isOpen;
  return (
    <DialogRoot
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        brandLayout
        layoutClassName="dialog-layer"
        overlayClassName="dialog-backdrop"
        showCloseButton={false}
        aria-describedby={undefined}
        aria-busy={busy}
        className={`casamia-dialog ${tone === "danger" ? "dialog-danger" : ""} ${className}`.trim()}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
        onCloseAutoFocus={event => {
          if (returnFocus.current?.isConnected) {
            event.preventDefault();
            const target = returnFocus.current;
            requestAnimationFrame(() => { if (target.isConnected) target.focus({ preventScroll: true }); });
          }
        }}
        onOpenAutoFocus={(event) => {
          const target = event.currentTarget as HTMLElement;
          const preferred = target.querySelector<HTMLElement>("[data-dialog-autofocus]");
          const field = preferred ?? Array.from(target.querySelectorAll<HTMLInputElement>(
            'input:not([disabled]):not([hidden]):not([type=hidden]):not([aria-hidden=true])',
          )).find(input => input.getClientRects().length > 0);
          if (field) {
            event.preventDefault();
            field.focus();
          }
        }}
      >
        <div className="dialog-heading">
          <DialogTitle>{title}</DialogTitle>
          <Button
            variant="brand"
            size="brand"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Fechar janela"
            className="dialog-close"
          >
            <X size={20} aria-hidden="true" />
          </Button>
        </div>
        {children}
      </DialogContent>
    </DialogRoot>
  );
}
