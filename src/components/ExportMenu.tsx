import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Download, FolderDown, Layers } from "lucide-react";
import type { EnxovalCategory, EnxovalItem } from "../types";
import { exportItems, type ExportFormat } from "../utils/export";

interface ExportMenuProps {
  categories: EnxovalCategory[];
  items: EnxovalItem[];
  enxovalName: string;
  activeCategoryId?: string;
}

const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: "csv", label: "CSV", hint: ".csv" },
  { id: "xlsx", label: "Excel", hint: ".xlsx" },
];

const countLabel = (count: number) =>
  `${count} ${count === 1 ? "item" : "itens"}`;

export function ExportMenu({
  categories,
  items,
  enxovalName,
  activeCategoryId,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("csv");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const [placement, setPlacement] = useState({ up: false, maxHeight: 420 });

  // Abre para o lado com mais espaço e limita a altura; a lista rola dentro do menu.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const place = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 16;
      const above = rect.top - 16;
      const up = below < 240 && above > below;
      setPlacement({
        up,
        maxHeight: Math.max(180, Math.min(420, (up ? above : below) - 8)),
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const exportEnvironment = (category: EnxovalCategory) => {
    setOpen(false);
    void exportItems(
      items.filter((item) => item.categoryId === category.id),
      `${enxovalName}-${category.name}`,
      format,
    );
  };
  const exportAll = () => {
    setOpen(false);
    void exportItems(items, enxovalName, format);
  };

  return (
    <div className="export-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="button button-outline button-small export-menu-trigger"
        aria-label="Exportar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Download size={17} aria-hidden="true" />
        <span>Exportar</span>
      </button>
      {open && (
        <div
          id={menuId}
          className={`export-menu-panel ${placement.up ? "is-up" : ""}`}
          style={{ maxHeight: placement.maxHeight }}
          role="menu"
        >
          <div
            className="export-menu-formats"
            role="group"
            aria-label="Formato do arquivo"
          >
            {FORMATS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={format === option.id}
                onClick={() => setFormat(option.id)}
              >
                {option.label} <small>{option.hint}</small>
              </button>
            ))}
          </div>
          <button type="button" role="menuitem" onClick={exportAll}>
            <Layers size={18} aria-hidden="true" />
            <span>
              <strong>Baixar todos os ambientes</strong>
              <small>{countLabel(items.length)} no total</small>
            </span>
          </button>
          {categories.length > 0 && (
            <>
              <div className="export-menu-divider" role="presentation">
                Ou apenas um ambiente
              </div>
              <div className="export-menu-list">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    role="menuitem"
                    className={
                      category.id === activeCategoryId ? "is-current" : ""
                    }
                    onClick={() => exportEnvironment(category)}
                  >
                    <FolderDown size={18} aria-hidden="true" />
                    <span>
                      <strong>Baixar {category.name}</strong>
                      <small>
                        {countLabel(
                          items.filter(
                            (item) => item.categoryId === category.id,
                          ).length,
                        )}
                        {category.id === activeCategoryId &&
                          " · ambiente atual"}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
