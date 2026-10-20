import { Button } from "@/src/components/ui/button";
import { useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "@/src/components/icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "./ui/dropdown-menu";
import { UserAvatar } from "./UserAvatar";
import "./desktopActionsMenu.css";

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
  const pointerInteraction = useRef(false);
  const [pointerFocus, setPointerFocus] = useState(false);
  return (
    <div className="desktop-actions-menu"
      onPointerDownCapture={() => { pointerInteraction.current = true; }}
      onKeyDownCapture={() => {
        pointerInteraction.current = false;
        setPointerFocus(false);
      }}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="brand"
            size="brand"
            type="button"
            className="button button-outline button-small desktop-actions-trigger"
            aria-label="Menu da conta"
            data-pointer-focus={pointerFocus || undefined}
            onBlur={() => setPointerFocus(false)}
          >
            <UserAvatar
              name={name}
              src={avatarUrl}
              className="desktop-actions-avatar"
            />
            Menu <ChevronDown size={16} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={10}
          collisionPadding={12}
          className="desktop-actions-popup"
          aria-label="Ações do enxoval e da conta"
          onPointerDownOutside={() => { pointerInteraction.current = true; }}
          onCloseAutoFocus={event => {
            if (document.querySelector('[data-slot="dialog-content"][data-state="open"]')) {
              event.preventDefault();
              return;
            }
            setPointerFocus(pointerInteraction.current);
          }}
        >
          <div className="desktop-actions-identity" role="presentation">
            <strong>{name}</strong>
            <span>{email}</span>
          </div>
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
