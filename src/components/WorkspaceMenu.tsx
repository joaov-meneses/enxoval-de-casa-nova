import type { RefObject } from "react";
import {
  Home,
  Plus,
  UserPlus,
  Percent,
  Pencil,
  Trash2,
  LogOut,
  X,
  ChevronRight,
  Users,
} from "lucide-react";
import type {
  AuthUser,
  EnxovalSummary,
  EnxovalCategory,
  EnxovalItem,
} from "../types";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";
import { Select } from "./Select";
import { EnvironmentList } from "./EnvironmentList";

interface WorkspaceMenuProps {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  user: AuthUser;
  enxovais: EnxovalSummary[];
  activeEnxoval: EnxovalSummary | null;
  memberCount: number;
  categories: EnxovalCategory[];
  items: EnxovalItem[];
  activeCategoryId: string;
  onSelectCategory: (id: string) => void;
  onRenameCategory: (category: EnxovalCategory) => void;
  onDeleteCategory: (category: EnxovalCategory) => void;
  onReorderCategories: (ids: string[]) => Promise<void>;
  busy: boolean;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onInvite: () => void;
  onDiscounts: () => void;
  onRename: () => void;
  onDelete: () => void;
  onAddCategory: () => void;
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
  const actions = [
    { label: "Convidar pessoas", icon: UserPlus, action: props.onInvite },
    { label: "Descontos e cashback", icon: Percent, action: props.onDiscounts },
    { label: "Adicionar ambiente", icon: Plus, action: props.onAddCategory },
    ...(props.activeEnxoval?.role === "owner"
      ? [
          {
            label: "Editar nome do enxoval",
            icon: Pencil,
            action: props.onRename,
          },
        ]
      : []),
  ];
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
            {hasEnxoval && (
              <p>
                <Users size={14} /> {props.memberCount}{" "}
                {props.memberCount === 1
                  ? "pessoa organizando"
                  : "pessoas organizando"}
              </p>
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
              className="workspace-menu-environments"
              aria-label="Ambientes do menu lateral"
            >
              <h3>Ambientes</h3>
              <p>Segure a alça e arraste para mudar a ordem.</p>
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
          {hasEnxoval && (
            <section
              className="workspace-menu-actions"
              aria-label="Organizar enxoval"
            >
              <h3>Organizar enxoval</h3>
              {actions.map(({ label, icon: Icon, action }) => (
                <button
                  key={label}
                  type="button"
                  disabled={props.busy}
                  onClick={() => run(action)}
                >
                  <Icon size={19} />
                  <span>{label}</span>
                  <ChevronRight size={16} />
                </button>
              ))}
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
