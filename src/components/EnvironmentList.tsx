import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Pencil, Trash2 } from "@/src/components/icons";
import type { EnxovalCategory, EnxovalItem } from "../types";
import { isInactiveStatus } from "../itemStatus";
import { SortableList } from "./SortableList";
import { RoomIcon } from "./WorkspaceOverview";

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
            {!horizontal && (
              <small>
                {
                  items.filter(
                    (item) =>
                      item.categoryId === category.id &&
                      !isInactiveStatus(item.status),
                  ).length
                }
              </small>
            )}
          </Button>
          {horizontal && handle}
          {!horizontal && (
            <Button variant="brand" size="brand"
              type="button"
              className="environment-rename"
              aria-label={`Editar ambiente ${category.name}`}
              onClick={() => onRename(category)}
              disabled={disabled}
            >
              <Pencil size={14} />
            </Button>
          )}
          {!horizontal && onDelete && (
            <Button variant="brand" size="brand"
              type="button"
              className="environment-rename environment-delete"
              aria-label={`Excluir ambiente ${category.name}`}
              onClick={() => onDelete(category)}
              disabled={disabled}
            >
              <Trash2 size={14} />
            </Button>
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
        </Button>
      </div>
      {list}
    </div>
  );
}
