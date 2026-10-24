import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import type { RefObject } from "react";
import {
  Home,
  Plus,
  UserPlus,
  Trash2,
  DoorOpen,
  LogOut,
  X,
  ListChecks,
  MessageCircleHeart,
  ChevronRight,
  ShoppingBag,
} from "@/src/components/icons";
import type {
  AuthUser,
  EnxovalSummary,
  EnxovalCategory,
  EnxovalItem,
  EnxovalMember,
} from "../types";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";
import { Select } from "./Select";
import { EnvironmentList } from "./EnvironmentList";
import { activeItems, doneItems } from "../itemStatus";
import { enxovalSelectOptions } from "../enxovais";
import { UserAvatar } from './UserAvatar';

interface WorkspaceMenuProps {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  user: AuthUser;
  enxovais: EnxovalSummary[];
  activeEnxoval: EnxovalSummary | null;
  members: EnxovalMember[];
  categories: EnxovalCategory[];
  items: EnxovalItem[];
  activeCategoryId: string;
  onSelectCategory: (id: string) => void;
  /** Mostra os itens de todos os ambientes (a opção "Todos", igual à do topo da lista). */
  onSelectAll: () => void;
  allSelected: boolean;
  onRenameCategory: (category: EnxovalCategory) => void;
  onDeleteCategory: (category: EnxovalCategory) => void;
  onReorderCategories: (ids: string[]) => Promise<void>;
  busy: boolean;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onInvite: () => void;
  onDelete: () => void;
  onLeave: () => void;
  onLogout: () => void;
  /** Abre a central de ajuda (relatar problema ou sugerir melhoria). */
  onHelp: () => void;
  onProfile: () => void;
  /** Modo loja: só o que falta, com letra grande, para riscar rápido na loja física. */
  onStoreMode?: () => void;
}

export function WorkspaceMenu(props: WorkspaceMenuProps) {
  const hasEnxoval = Boolean(props.activeEnxoval);
  const isOwner = props.activeEnxoval?.role === "owner";
  const run = (action: () => void) => {
    props.onClose();
    action();
  };
  return (
    <Sheet open={props.open} onOpenChange={open => { if (!open) props.onClose(); }}>
      <SheetContent brandLayout layoutClassName="workspace-menu-layer" overlayClassName="workspace-menu-backdrop" showCloseButton={false}
        id="workspace-menu" className="workspace-menu-panel" aria-labelledby="workspace-menu-title" aria-describedby={undefined}
        onCloseAutoFocus={event => { event.preventDefault(); props.triggerRef.current?.focus(); }}>
        <div className="workspace-menu-heading">
          <div>
            <SheetTitle id="workspace-menu-title">Menu do enxoval</SheetTitle>
          </div>
          <Button variant="brand" size="brand"
            type="button"
            className="workspace-menu-close"
            aria-label="Fechar menu do enxoval"
            onClick={props.onClose}
          >
            <X size={20} />
          </Button>
        </div>
        <div className="workspace-menu-content">
          {/* O perfil abre o menu: quem é a pessoa vem antes do que ela organiza. */}
          <Button variant="brand" size="brand" type="button" className="profile-entry-mobile" aria-label="Meu perfil"
            onClick={() => run(props.onProfile)}>
            <UserAvatar name={props.user.name} src={props.user.avatarUrl} className="profile-entry-avatar" />
            <span className="profile-entry-text">
              <strong>Meu perfil</strong>
              <small>{props.user.name}</small>
            </span>
            <ChevronRight size={18} className="profile-entry-chevron" aria-hidden="true" />
          </Button>
          <section
            className="workspace-menu-switcher"
            aria-label="Seus enxovais"
          >
            <Label htmlFor="menu-enxoval">
              <Home size={17} /> Trocar de enxoval
            </Label>
            {props.enxovais.length > 0 ? (
              <Select
                id="menu-enxoval"
                autoFocus
                value={props.activeEnxoval?.id ?? ""}
                disabled={props.busy}
                onChange={(id) => run(() => props.onSwitch(id))}
                options={enxovalSelectOptions(props.enxovais)}
              />
            ) : (
              <p>Vamos começar seu primeiro enxoval?</p>
            )}
            {props.user.isGuest !== true && (
              <Button variant="brand" size="brand"
                type="button"
                className="workspace-menu-create"
                disabled={props.busy}
                onClick={() => run(props.onCreate)}
              >
                <Plus size={17} /> Criar novo enxoval
              </Button>
            )}
          </section>
          {hasEnxoval && props.onStoreMode && (
            <Button variant="brand" size="brand"
              type="button"
              className="workspace-menu-create workspace-menu-store"
              disabled={props.busy}
              onClick={() => run(props.onStoreMode!)}
            >
              <ShoppingBag size={17} /> Estou na loja
            </Button>
          )}
          {hasEnxoval && !isOwner && (
            <section
              className="workspace-menu-invite workspace-menu-guest"
              aria-label="Sobre este enxoval compartilhado"
            >
              <div className="invite-avatars" aria-hidden="true">
                {props.members.slice(0, 4).map((member) => (
                  <span key={member.id}>
                    {member.name.slice(0, 1).toUpperCase()}
                  </span>
                ))}
              </div>
              <div className="invite-copy">
                <strong>Enxoval de {props.activeEnxoval?.ownerName}</strong>
                <p>
                  Você participa como convidado: edita a lista junto. Só o dono
                  convida pessoas ou exclui o enxoval.
                </p>
              </div>
            </section>
          )}
          {hasEnxoval && !isOwner && (
            <div className="workspace-menu-danger">
              <Button variant="brand" size="brand"
                type="button"
                disabled={props.busy}
                onClick={() => run(props.onLeave)}
              >
                <DoorOpen size={18} /> Sair do enxoval
              </Button>
              <p>Você confirma antes de sair.</p>
            </div>
          )}
          {hasEnxoval && isOwner && (
            <section
              className="workspace-menu-invite"
              aria-label="Convidar pessoas"
            >
              <div className="invite-avatars" aria-hidden="true">
                {props.members.slice(0, 4).map((member) => (
                  <span key={member.id}>
                    {member.name.slice(0, 1).toUpperCase()}
                  </span>
                ))}
                {props.members.length > 4 && (
                  <span>+{props.members.length - 4}</span>
                )}
                <span className="invite-avatar-add">
                  <Plus size={16} strokeWidth={2.2} />
                </span>
              </div>
              <div className="invite-copy">
                <strong>Organizem juntos</strong>
                <p>
                  {props.members.length > 1
                    ? `${props.members.length} pessoas montando este enxoval. Chame mais alguém.`
                    : "Chame quem vai montar a casa com você: vocês editam a mesma lista."}
                </p>
              </div>
              <Button variant="brand" size="brand"
                type="button"
                className="invite-button"
                disabled={props.busy}
                onClick={() => run(props.onInvite)}
              >
                <UserPlus size={18} aria-hidden="true" /> Convidar pessoas
              </Button>
            </section>
          )}
          {hasEnxoval && (
            <section
              className="workspace-menu-environments"
              aria-label="Ambientes do menu lateral"
            >
              <h3>Ambientes</h3>
              <p>Segure a alça e arraste para mudar a ordem.</p>
              <div
                className={`environment-row environment-all-row ${props.allSelected ? "active" : ""}`}
              >
                <span className="environment-all-spacer" aria-hidden="true" />
                <Button variant="brand" size="brand"
                  type="button"
                  className="environment-select"
                  disabled={props.busy}
                  aria-current={props.allSelected ? "true" : undefined}
                  onClick={() => run(props.onSelectAll)}
                >
                  <ListChecks size={18} strokeWidth={1.6} aria-hidden="true" />
                  <span>Todos</span>
                  <small className="environment-progress">
                    <span className="environment-count" aria-hidden="true">
                      {doneItems(props.items).length}/{activeItems(props.items).length}
                    </span>
                    <span className="sr-only">
                      , {doneItems(props.items).length} de {activeItems(props.items).length} conquistados
                    </span>
                  </small>
                </Button>
              </div>
              <EnvironmentList
                categories={props.categories}
                items={props.items}
                activeId={props.activeCategoryId}
                disabled={props.busy}
                onSelect={(id) => run(() => props.onSelectCategory(id))}
                onRename={(category) =>
                  run(() => props.onRenameCategory(category))
                }
                onDelete={(category) =>
                  run(() => props.onDeleteCategory(category))
                }
                onReorder={props.onReorderCategories}
              />
            </section>
          )}
          {isOwner && (
            <div className="workspace-menu-danger">
              <Button variant="brand" size="brand"
                type="button"
                disabled={props.busy}
                onClick={() => run(props.onDelete)}
              >
                <Trash2 size={18} /> Excluir enxoval
              </Button>
            </div>
          )}
          <div className="workspace-menu-help">
            <Button variant="brand" size="brand" type="button" onClick={() => run(props.onHelp)}>
              <span className="workspace-menu-help-icon" aria-hidden="true">
                <MessageCircleHeart size={20} />
              </span>
              <span className="workspace-menu-help-text">
                <strong>Central de ajuda</strong>
                <small>Relate um problema ou sugira uma melhoria</small>
              </span>
            </Button>
          </div>
        </div>
        <div className="workspace-menu-account">
          <UserAvatar name={props.user.name} src={props.user.avatarUrl} className="workspace-menu-avatar" />
          <div>
            <strong>{props.user.name}</strong>
            <span>{props.user.email}</span>
          </div>
          <Button variant="brand" size="brand" type="button" onClick={() => run(props.onLogout)}>
            <LogOut size={17} /> Sair
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
