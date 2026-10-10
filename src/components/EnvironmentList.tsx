import { Pencil, Trash2 } from "lucide-react";
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
          className={`environment-row ${activeId === category.id ? "active" : ""}`}
        >
          {handle}
          <button
            type="button"
            className="environment-select"
            disabled={disabled}
            onClick={() => onSelect(category.id)}
            aria-current={activeId === category.id ? "true" : undefined}
          >
            {!horizontal && <RoomIcon name={category.name} />}
            <span>{category.name}</span>
            <small>
              {horizontal
                ? `${items.filter((item) => item.categoryId === category.id && item.checked).length}/`
                : ""}
              {
                items.filter(
                  (item) =>
                    item.categoryId === category.id &&
                    !isInactiveStatus(item.status),
                ).length
              }
            </small>
          </button>
          {!horizontal && (
            <button
              type="button"
              className="environment-rename"
              aria-label={`Editar ambiente ${category.name}`}
              onClick={() => onRename(category)}
              disabled={disabled}
            >
              <Pencil size={14} />
            </button>
          )}
          {!horizontal && onDelete && (
            <button
              type="button"
              className="environment-rename environment-delete"
              aria-label={`Excluir ambiente ${category.name}`}
              onClick={() => onDelete(category)}
              disabled={disabled}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    />
  );
  if (!horizontal || !allOption) return list;
  return (
    <div className="environment-chips-row">
      <div
        className={`environment-row environment-all ${allOption.active ? "active" : ""}`}
      >
        <button
          type="button"
          className="environment-select"
          disabled={disabled}
          onClick={allOption.onSelect}
          aria-current={allOption.active ? "true" : undefined}
        >
          <span>Todos</span>
          <small>
            {allOption.done}/{allOption.total}
          </small>
        </button>
      </div>
      {list}
    </div>
  );
}
