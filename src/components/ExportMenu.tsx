import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "./ui/dropdown-menu";
import { useEffect, useState } from "react";
import { Dialog } from "./Dialog";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Download, FolderDown, Layers } from "@/src/components/icons";
import type { EnxovalCategory, EnxovalItem } from "../types";
import { exportItems, type ExportFormat } from "../utils/export";
import { useSubscriptionCheck } from "./SubscriptionAccess";

interface ExportMenuProps {
  categories: EnxovalCategory[];
  items: EnxovalItem[];
  enxovalName: string;
  activeCategoryId?: string;
  /** Controlado por fora (celular): a janela abre a partir de "Planilhas", sem o botão próprio. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
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
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: ExportMenuProps) {
  const checkAccess = useSubscriptionCheck();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 767px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => {
      setMobile(query.matches);
      setOpen(false);
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const [format, setFormat] = useState<ExportFormat>("csv");
  const exportEnvironment = async (category: EnxovalCategory) => {
    setOpen(false);
    if (!checkAccess || !(await checkAccess())) return;
    void exportItems(
      items.filter((item) => item.categoryId === category.id),
      `${enxovalName}-${category.name}`,
      format,
    );
  };
  const exportAll = async () => {
    setOpen(false);
    if (!checkAccess || !(await checkAccess())) return;
    void exportItems(items, enxovalName, format);
  };

  if (mobile)
    return (
      <div className="export-menu">
        {!hideTrigger && (
          <Button
            variant="brand"
            size="brand"
            type="button"
            className="button button-outline button-small export-menu-trigger"
            aria-label="Exportar"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            <Download size={17} aria-hidden="true" />
            <span>Exportar</span>
          </Button>
        )}
        <Dialog
          title="Exportar lista"
          isOpen={open}
          onClose={() => setOpen(false)}
        >
          <div className="export-sheet-actions">
            <RadioGroup
              value={format}
              onValueChange={(value) => setFormat(value as ExportFormat)}
              className="export-sheet-formats"
              aria-label="Formato do arquivo"
            >
              {FORMATS.map((option) => (
                <RadioGroupItem key={option.id} value={option.id} asChild>
                  <Button variant="brand" size="brand" type="button">
                    {option.label} <small>{option.hint}</small>
                  </Button>
                </RadioGroupItem>
              ))}
            </RadioGroup>
            <Button
              variant="brand"
              size="brand"
              type="button"
              onClick={exportAll}
            >
              <Layers size={18} aria-hidden="true" />
              <span>
                <strong>Baixar todos os ambientes</strong>
                <small>{countLabel(items.length)} no total</small>
              </span>
            </Button>
            {categories.length > 0 && (
              <p className="export-sheet-caption">Ou apenas um ambiente</p>
            )}
            {categories.map((category) => (
              <Button
                key={category.id}
                variant="brand"
                size="brand"
                type="button"
                onClick={() => void exportEnvironment(category)}
              >
                <FolderDown size={18} aria-hidden="true" />
                <span>
                  <strong>Baixar {category.name}</strong>
                  <small>
                    {countLabel(
                      items.filter((item) => item.categoryId === category.id)
                        .length,
                    )}
                  </small>
                </span>
              </Button>
            ))}
          </div>
        </Dialog>
      </div>
    );

  return (
    <div className="export-menu">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="brand"
            size="brand"
            type="button"
            className="button button-outline button-small export-menu-trigger"
            aria-label="Exportar"
          >
            <Download size={17} aria-hidden="true" />
            <span>Exportar</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="export-menu-panel"
          aria-label="Exportar lista"
        >
          <DropdownMenuRadioGroup
            value={format}
            onValueChange={(value) => setFormat(value as ExportFormat)}
            className="export-menu-formats"
            aria-label="Formato do arquivo"
          >
            {FORMATS.map((option) => (
              <DropdownMenuRadioItem
                key={option.id}
                value={option.id}
                onSelect={(event) => event.preventDefault()}
                asChild
              >
                <Button variant="brand" size="brand" type="button">
                  {option.label} <small>{option.hint}</small>
                </Button>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuItem asChild>
            <Button
              variant="brand"
              size="brand"
              type="button"
              onClick={exportAll}
            >
              <Layers size={18} aria-hidden="true" />
              <span>
                <strong>Baixar todos os ambientes</strong>
                <small>{countLabel(items.length)} no total</small>
              </span>
            </Button>
          </DropdownMenuItem>
          {categories.length > 0 && (
            <>
              <div className="export-menu-divider" role="presentation">
                Ou apenas um ambiente
              </div>
              <div className="export-menu-list">
                {categories.map((category) => (
                  <DropdownMenuItem key={category.id} asChild>
                    <Button
                      variant="brand"
                      size="brand"
                      type="button"
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
                    </Button>
                  </DropdownMenuItem>
                ))}
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
