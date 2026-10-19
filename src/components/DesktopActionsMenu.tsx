import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import "./desktopActionsMenu.css";
import { UserAvatar } from "./UserAvatar";

export function DesktopActionsMenu({
  name,
  email,
  avatarUrl,
  children,
}: {
  name: string;
  email: string;
  avatarUrl?: string | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<"first" | "last">("first");
  const id = useId();
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) return;
    const items = panelRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]),a[href]",
    );
    items?.forEach((item) => {
      item.setAttribute("role", "menuitem");
      item.tabIndex = -1;
    });
    (initialFocus.current === "last"
      ? items?.[items.length - 1]
      : items?.[0]
    )?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const resize = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", resize);
    };
  }, [open]);

  return (
    <div className="desktop-actions-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="button button-outline button-small desktop-actions-trigger"
        aria-label="Menu da conta"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          initialFocus.current = "first";
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            initialFocus.current = event.key === "ArrowUp" ? "last" : "first";
            setOpen(true);
          }
        }}
      >
        <UserAvatar
          name={name}
          src={avatarUrl}
          className="desktop-actions-avatar"
        />
        Menu <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={panelRef}
          id={id}
          role="menu"
          aria-label="Ações do enxoval e da conta"
          className="desktop-actions-popup"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("button,a[href]"))
              close();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
              return;
            }
            if (event.key === "Tab") {
              close();
              return;
            }
            const items = Array.from(
              panelRef.current?.querySelectorAll<HTMLElement>(
                '[role="menuitem"]:not([disabled])',
              ) ?? [],
            );
            const index = items.indexOf(document.activeElement as HTMLElement);
            let next: number | undefined;
            if (event.key === "ArrowDown") next = (index + 1) % items.length;
            if (event.key === "ArrowUp")
              next = (index - 1 + items.length) % items.length;
            if (event.key === "Home") next = 0;
            if (event.key === "End") next = items.length - 1;
            if (next !== undefined) {
              event.preventDefault();
              items[next]?.focus();
            }
          }}
        >
          <div className="desktop-actions-identity" role="presentation">
            <strong>{name}</strong>
            <span>{email}</span>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
