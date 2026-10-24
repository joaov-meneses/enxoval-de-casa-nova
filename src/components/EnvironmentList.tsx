import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Ellipsis, Pencil, Trash2 } from "@/src/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { isDoneStatus } from "../itemStatus";
import type { EnxovalCategory, EnxovalItem } from "../types";
import { SortableList } from "./SortableList";
import { RoomIcon } from "./RoomIcon";

export function EnvironmentList({
  categories,
  items,
  activeId,
  onSelect,
  onRename,
  onDelete,
  onReorder,
  disabled = false,
  horizontal = false,
  allOption,
}: {
  categories: EnxovalCategory[];
  items: EnxovalItem[];
  activeId?: string;
  onSelect: (id: string) => void;
  onRename: (category: EnxovalCategory) => void;
  onDelete?: (category: EnxovalCategory) => void;
  onReorder: (ids: string[]) => Promise<void>;
  disabled?: boolean;
  horizontal?: boolean;
  /** Chip "Todos" exibido antes dos ambientes na lista horizontal (mobile). */
  allOption?: {
    active: boolean;
    onSelect: () => void;
    done: number;
    total: number;
  };
}) {
  const [activated, setActivated] = useState<string | null>(null);
  function activate(id: string, select: () => void) {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setActivated(id);
    select();
  }
  function finishActivation(id: string, animationName: string) {
    if (animationName === "environment-activate") {
      setActivated(current => current === id ? null : current);
    }
  }
  const list = (
    <SortableList
      items={categories}
      axis={horizontal ? "x" : "y"}
      onCommit={onReorder}
      disabled={disabled}
      label="Ambientes"
      className={horizontal ? "environment-chips" : "environment-list"}
      render={(category, handle) => (
        <div
          className={`environment-row ${activeId === category.id ? "active" : ""} ${activated === category.id ? "is-activating" : ""}`}
          onAnimationEnd={event => finishActivation(category.id, event.animationName)}
        >
          {!horizontal && handle}
          <Button variant="brand" size="brand"
            type="button"
            className="environment-select"
            title={category.name}
            disabled={disabled}
            onClick={() => activate(category.id, () => onSelect(category.id))}
            aria-current={activeId === category.id ? "true" : undefined}
          >
            {!horizontal && <RoomIcon name={category.name} />}
            <span>{category.name}</span>
            {horizontal
              ? <ChipCount {...countOf(items.filter((item) => item.categoryId === category.id))} />
              : <RoomProgress items={items.filter((item) => item.categoryId === category.id)} />}
          </Button>
          {horizontal && handle}
          {!horizontal && (
            <RoomActions
              category={category}
              disabled={disabled}
              onRename={onRename}
              onDelete={onDelete}
            />
          )}
        </div>
      )}
    />
  );
  if (!horizontal || !allOption) return list;
  return (
    <div className="environment-chips-row">
      <div
        className={`environment-row environment-all ${allOption.active ? "active" : ""} ${activated === "all" ? "is-activating" : ""}`}
        onAnimationEnd={event => finishActivation("all", event.animationName)}
      >
        <Button variant="brand" size="brand"
          type="button"
          className="environment-select"
          disabled={disabled}
          onClick={() => activate("all", allOption.onSelect)}
          aria-current={allOption.active ? "true" : undefined}
        >
          <span>Todos</span>
          <ChipCount done={allOption.done} total={allOption.total} />
        </Button>
      </div>
      {list}
    </div>
  );
}

function countOf(items: EnxovalItem[]) {
  return { done: items.filter((item) => isDoneStatus(item.status)).length, total: items.length };
}

/** Nos chips do celular, só o "conquistados/total" ao lado do nome, sem barra. */
function ChipCount({ done, total }: { done: number; total: number }) {
  return (
    <small className="environment-chip-count">
      <span aria-hidden="true">{done}/{total}</span>
      <span className="sr-only">, {done} de {total} conquistados</span>
    </small>
  );
}

/** Conquistados de quantos, com uma barra fina: na lista de ambientes, o que importa é quanto falta. */
function RoomProgress({ items }: { items: EnxovalItem[] }) {
  const { done, total } = countOf(items);
  return (
    <small className="environment-progress">
      <span className="environment-count" aria-hidden="true">
        {done}/{total}
      </span>
      <span className="sr-only">, {done} de {total} conquistados</span>
      {total > 0 && (
        <span className="environment-meter" aria-hidden="true">
          <span style={{ width: `${Math.round((done / total) * 100)}%` }} />
        </span>
      )}
    </small>
  );
}

/**
 * Renomear e excluir ficam num menu "⋯" por ambiente: são ações raras, e a lista serve para navegar.
 * Na barra lateral do desktop, o botão aparece ao passar o mouse ou com o foco no ambiente.
 */
function RoomActions({
  category,
  disabled,
  onRename,
  onDelete,
}: {
  category: EnxovalCategory;
  disabled: boolean;
  onRename: (category: EnxovalCategory) => void;
  onDelete?: (category: EnxovalCategory) => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="brand" size="brand"
          type="button"
          className="environment-menu-trigger"
          aria-label={`Opções do ambiente ${category.name}`}
          disabled={disabled}
        >
          <Ellipsis size={18} aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="right"
        sideOffset={6}
        collisionPadding={12}
        className="desktop-actions-popup environment-menu-popup"
      >
        <DropdownMenuItem asChild>
          <Button variant="brand" size="brand" type="button" onClick={() => onRename(category)}>
            <Pencil size={16} aria-hidden="true" /> Renomear ambiente
          </Button>
        </DropdownMenuItem>
        {onDelete && (
          <DropdownMenuItem asChild>
            <Button variant="brand" size="brand"
              type="button"
              className="desktop-menu-item-danger"
              onClick={() => onDelete(category)}
            >
              <Trash2 size={16} aria-hidden="true" /> Excluir ambiente
            </Button>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
