import { useEffect, useRef, type RefObject } from "react";

export function useDialogAccessibility(
  open: boolean,
  onClose: () => void,
  returnFocus?: RefObject<HTMLElement | null>,
) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const selector =
      'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
    const frame = requestAnimationFrame(() => {
      (
        ref.current?.querySelector<HTMLElement>("[data-dialog-autofocus]") ??
        ref.current?.querySelector<HTMLElement>(
          "input:not([disabled]),select:not([disabled])",
        ) ??
        ref.current
      )?.focus();
    });
    function keydown(e: KeyboardEvent) {
      // Com uma janela aberta sobre outra (ex.: o convite para os planos sobre o formulário do item),
      // só a de cima responde ao teclado.
      const modals = document.querySelectorAll('[aria-modal="true"]');
      if (ref.current && modals.length > 1 && modals[modals.length - 1] !== ref.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key !== "Tab" || !ref.current) return;
      const elements = [
        ...ref.current.querySelectorAll<HTMLElement>(selector),
      ].filter((el) => el.getClientRects().length > 0);
      if (!elements.length) {
        e.preventDefault();
        ref.current.focus();
        return;
      }
      const first = elements[0],
        last = elements[elements.length - 1];
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === ref.current)
      ) {
        e.preventDefault();
        last.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === ref.current)
      ) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      (returnFocus?.current ?? previous)?.focus();
    };
  }, [open, returnFocus]);
  return ref;
}
