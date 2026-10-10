import type { RefObject } from "react";
import {
  Home,
  Plus,
  UserPlus,
  Trash2,
  LogOut,
  X,
  ListChecks,
} from "lucide-react";
import type {
  AuthUser,
  EnxovalSummary,
  EnxovalCategory,
  EnxovalItem,
  EnxovalMember,
} from "../types";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";
import { Select } from "./Select";
import { EnvironmentList } from "./EnvironmentList";
import { activeItems } from "../itemStatus";

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
  onLogout: () => void;
}

export function WorkspaceMenu(props: WorkspaceMenuProps) {
  const ref = useDialogAccessibility(
    props.open,
    props.onClose,
    props.triggerRef,
  );
  if (!props.open) return null;
  const hasEnxoval = Boolean(props.activeEnxoval);
  const run = (action: () => void) => {
    props.onClose();
    action();
  };
  return (
    <div className="workspace-menu-layer">
      <div
        className="workspace-menu-backdrop"
        onClick={props.onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        id="workspace-menu"
        className="workspace-menu-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-menu-title"
        tabIndex={-1}
      >
        <div className="workspace-menu-heading">
          <div>
            <span className="workspace-menu-eyebrow">SEU CANTINHO</span>
            <h2 id="workspace-menu-title">Menu do enxoval</h2>
          </div>
          <button
            type="button"
            className="workspace-menu-close"
            aria-label="Fechar menu do enxoval"
            onClick={props.onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-menu-content">
          <section
            className="workspace-menu-switcher"
            aria-label="Seus enxovais"
          >
            <label htmlFor="menu-enxoval">
              <Home size={17} /> Seus enxovais
            </label>
            {props.enxovais.length > 0 ? (
              <Select
                id="menu-enxoval"
                autoFocus
                value={props.activeEnxoval?.id ?? ""}
                disabled={props.busy}
                onChange={(id) => run(() => props.onSwitch(id))}
                options={props.enxovais.map((enxoval) => ({
                  value: enxoval.id,
                  label: enxoval.name,
                }))}
              />
            ) : (
              <p>Vamos começar seu primeiro enxoval?</p>
            )}
            <button
              type="button"
              className="workspace-menu-create"
              disabled={props.busy}
              onClick={() => run(props.onCreate)}
            >
              <Plus size={17} /> Criar novo enxoval
            </button>
          </section>
          {hasEnxoval && (
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
              <button
                type="button"
                className="invite-button"
                disabled={props.busy}
                onClick={() => run(props.onInvite)}
              >
                <UserPlus size={18} aria-hidden="true" /> Convidar pessoas
              </button>
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
                <button
                  type="button"
                  className="environment-select"
                  disabled={props.busy}
                  aria-current={props.allSelected ? "true" : undefined}
                  onClick={() => run(props.onSelectAll)}
                >
                  <ListChecks size={18} strokeWidth={1.6} aria-hidden="true" />
                  <span>Todos</span>
                  <small>{activeItems(props.items).length}</small>
                </button>
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
          {props.activeEnxoval?.role === "owner" && (
            <div className="workspace-menu-danger">
              <button
                type="button"
                disabled={props.busy}
                onClick={() => run(props.onDelete)}
              >
                <Trash2 size={18} /> Excluir enxoval
              </button>
              <p>Você confirma antes de excluir.</p>
            </div>
          )}
        </div>
        <div className="workspace-menu-account">
          <span className="workspace-menu-avatar">
            {props.user.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{props.user.name}</strong>
            <span>{props.user.email}</span>
          </div>
          <button type="button" onClick={() => run(props.onLogout)}>
            <LogOut size={17} /> Sair
          </button>
        </div>
      </div>
    </div>
  );
}
