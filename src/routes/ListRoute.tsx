import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "../components/Dialog";
import { ExportMenu } from "../components/ExportMenu";
import {
Download,
FileSpreadsheet,
ListChecks,
Pencil,
Plus,
Search,
ShoppingBag,
SlidersHorizontal,
Sparkles,
Upload,
X,
} from "../components/icons";
import { ImportItemsButton } from "../components/ImportItemsDialog";
import { ListInsights,RoomSuggestions } from "../components/ListInsights";
import { NextStepCard } from "../components/NextStepCard";
import { RoomIcon } from "../components/RoomIcon";
import { SortableList } from "../components/SortableList";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import type { useWorkspace } from "../hooks/useWorkspace";
import { moveCountdownLabel } from "../listInsights";

type ListWorkspace = Pick<
  ReturnType<typeof useWorkspace>,
  | "activeCategory"
  | "isSearching"
  | "isShowingLatestChanges"
  | "filteredItems"
  | "openRenameCategory"
  | "activeEnxoval"
  | "items"
  | "categories"
  | "handleRefresh"
  | "setIsAddModalOpen"
  | "handleCategoryListPointerDown"
  | "handleCategoryListPointerMove"
  | "handleCategoryListPointerEnd"
  | "handleCategoryListPointerCancel"
  | "canSwipeCategories"
  | "categorySwipeAnimationClass"
  | "categorySwipeStyle"
  | "showNextStep"
  | "nextStep"
  | "moveDate"
  | "openItemFromNextStep"
  | "showListInsights"
  | "listInsights"
  | "quickFilter"
  | "setQuickFilter"
  | "isOwner"
  | "setWorkspaceView"
  | "showRoomSuggestions"
  | "suggestionsForRoom"
  | "addItem"
  | "searchScopeLabel"
  | "searchQuery"
  | "setSearchQuery"
  | "setIsFilterOpen"
  | "activeFilterCount"
  | "hasItemFilters"
  | "listTitle"
  | "listCounterText"
  | "canReorderItems"
  | "commitItemOrder"
  | "isOrdering"
  | "isWorkspaceLoading"
  | "renderItem"
  | "weekGroups"
>;

export default function ListRoute({
  workspace,
  overview,
}: {
  workspace: ListWorkspace;
  overview: React.ReactNode;
}) {
  const {
    activeCategory,
    isSearching,
    isShowingLatestChanges,
    filteredItems,
    openRenameCategory,
    activeEnxoval,
    items,
    categories,
    handleRefresh,
    setIsAddModalOpen,
    handleCategoryListPointerDown,
    handleCategoryListPointerMove,
    handleCategoryListPointerEnd,
    handleCategoryListPointerCancel,
    canSwipeCategories,
    categorySwipeAnimationClass,
    categorySwipeStyle,
    showNextStep,
    nextStep,
    moveDate,
    openItemFromNextStep,
    showListInsights,
    listInsights,
    quickFilter,
    setQuickFilter,
    isOwner,
    setWorkspaceView,
    showRoomSuggestions,
    suggestionsForRoom,
    addItem,
    searchScopeLabel,
    searchQuery,
    setSearchQuery,
    setIsFilterOpen,
    activeFilterCount,
    hasItemFilters,
    listTitle,
    listCounterText,
    canReorderItems,
    commitItemOrder,
    isOrdering,
    isWorkspaceLoading,
    renderItem,
    weekGroups,
  } = workspace;
  // No celular as ações ficam logo acima da busca, junto da lista que elas usam.
  const actionsAboveSearch = useIsCompact();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const openStoreMode = () => {
    setWorkspaceView("store");
    window.scrollTo({ top: 0 });
  };
  // A importação e a exportação abrem a partir da folha "Planilhas", que já fechou: o foco volta ao botão.
  const returnToMore = (open: boolean) => {
    if (!open) requestAnimationFrame(() => moreTriggerRef.current?.focus({ preventScroll: true }));
  };
  // Celular: uma ação principal com explicação; importar e exportar, com nomes por extenso, em "Planilhas".
  const mobileActions = (
    <div className="list-heading-actions list-mobile-actions">
      <Button
        variant="brand"
        size="brand"
        type="button"
        className="store-mode-cta"
        onClick={openStoreMode}
      >
        <ShoppingBag size={20} aria-hidden="true" />
        <span>
          <strong>Estou na loja</strong>
          <small>Só o que falta comprar</small>
        </span>
      </Button>
      <Button
        ref={moreTriggerRef}
        variant="brand"
        size="brand"
        type="button"
        className="list-more-trigger"
        aria-haspopup="dialog"
        onClick={() => setIsMoreOpen(true)}
      >
        <FileSpreadsheet size={18} aria-hidden="true" /> Planilhas
      </Button>
      <Dialog
        title="Planilhas"
        isOpen={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        className="list-more-dialog"
      >
        <div className="export-sheet-actions">
          <Button
            variant="brand"
            size="brand"
            type="button"
            onClick={() => {
              setIsMoreOpen(false);
              setIsImportOpen(true);
            }}
          >
            <Upload size={18} aria-hidden="true" />
            <span>
              <strong>Trazer itens de uma planilha</strong>
              <small>Importe sua lista em CSV ou Excel</small>
            </span>
          </Button>
          <Button
            variant="brand"
            size="brand"
            type="button"
            onClick={() => {
              setIsMoreOpen(false);
              setIsExportOpen(true);
            }}
          >
            <Download size={18} aria-hidden="true" />
            <span>
              <strong>Baixar minha lista</strong>
              <small>Salve uma planilha em CSV ou Excel</small>
            </span>
          </Button>
        </div>
      </Dialog>
      <ImportItemsButton
        enxovalId={activeEnxoval!.id}
        items={items}
        categories={categories}
        onImported={handleRefresh}
        hideTrigger
        open={isImportOpen}
        onOpenChange={(open) => {
          setIsImportOpen(open);
          returnToMore(open);
        }}
      />
      <ExportMenu
        categories={categories}
        items={items}
        enxovalName={activeEnxoval!.name}
        activeCategoryId={activeCategory?.id}
        hideTrigger
        open={isExportOpen}
        onOpenChange={(open) => {
          setIsExportOpen(open);
          returnToMore(open);
        }}
      />
    </div>
  );
  const headingActions = (
    <div className="list-heading-actions">
      <ImportItemsButton
        enxovalId={activeEnxoval!.id}
        items={items}
        categories={categories}
        onImported={handleRefresh}
      />
      <ExportMenu
        categories={categories}
        items={items}
        enxovalName={activeEnxoval!.name}
        activeCategoryId={activeCategory?.id}
      />
      {/* Só no celular: na loja física, a lista enxuta do modo loja. */}
      <Button
        variant="brand"
        size="brand"
        type="button"
        className="button button-outline button-small store-mode-entry"
        onClick={openStoreMode}
      >
        <ShoppingBag size={17} /> Estou na loja
      </Button>
      <Button
        variant="brand"
        size="brand"
        className="button button-dark button-small desktop-add-item"
        onClick={() => setIsAddModalOpen(true)}
      >
        <Plus size={17} /> Adicionar item
      </Button>
    </div>
  );
  return (
    <>
      {overview}
      <>
        <div className="list-section-heading">
          <div>
            {activeCategory ? (
              <RoomIcon name={activeCategory.name} size={24} />
            ) : (
              <ListChecks size={24} strokeWidth={1.6} />
            )}
            <h2>
              {isSearching
                ? "Sua busca"
                : isShowingLatestChanges
                  ? "Últimas alterações"
                  : (activeCategory?.name ?? "Meu enxoval")}
            </h2>
            <span>
              {filteredItems.length}{" "}
              {filteredItems.length === 1 ? "item" : "itens"}
            </span>
            {!isSearching && !isShowingLatestChanges && activeCategory && (
              <Button
                variant="brand"
                size="brand"
                className="title-edit-button"
                aria-label={`Editar ambiente ${activeCategory.name}`}
                onClick={() => openRenameCategory(activeCategory)}
              >
                <Pencil size={16} />
              </Button>
            )}
          </div>
          {!actionsAboveSearch && headingActions}
        </div>
        <div
          onPointerDown={handleCategoryListPointerDown}
          onPointerMove={handleCategoryListPointerMove}
          onPointerUp={handleCategoryListPointerEnd}
          onPointerCancel={handleCategoryListPointerCancel}
          style={{
            touchAction: canSwipeCategories ? "pan-y" : undefined,
          }}
        >
          <div
            className={`category-list-swipe ${categorySwipeAnimationClass}`}
            style={categorySwipeStyle}
          >
            {showNextStep && nextStep && (
              <NextStepCard
                entry={nextStep.entry}
                queued={nextStep.queued}
                countdown={moveDate ? moveCountdownLabel(moveDate) : null}
                onOpen={openItemFromNextStep}
              />
            )}
            {showListInsights && (
              <ListInsights
                data={listInsights}
                active={quickFilter}
                onFilter={setQuickFilter}
                onSetMoveDate={
                  isOwner
                    ? () => {
                        setWorkspaceView("plan");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }
                    : undefined
                }
              />
            )}
            {/* Antes dos itens: no fim de uma lista longa, ninguém chegaria a ver. */}
            {showRoomSuggestions && activeCategory && (
              <RoomSuggestions
                key={activeCategory.id}
                roomName={activeCategory.name}
                suggestions={suggestionsForRoom}
                onAdd={(name) => addItem(name, activeCategory.id)}
              />
            )}
            {actionsAboveSearch && mobileActions}
            {/* A busca fica junto da lista que ela filtra, logo acima do progresso do ambiente. */}
            <div className="list-search mb-4 flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={18}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                />
                <Input
                  type="search"
                  aria-label={searchScopeLabel}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={searchScopeLabel}
                  className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-10 pr-11 text-base text-stone-800 shadow-sm outline-none transition focus:border-brand-wood focus:ring-2 focus:ring-brand-wood/30"
                />
                {searchQuery && (
                  <Button
                    variant="brand"
                    size="brand"
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Limpar busca"
                    title="Limpar busca"
                    className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
                  >
                    <X size={16} />
                  </Button>
                )}
              </div>
              <Button
                variant="brand"
                size="brand"
                type="button"
                onClick={() => setIsFilterOpen(true)}
                aria-label="Abrir filtros"
                title="Filtros"
                className={`relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-stone-600 shadow-sm transition-colors ${activeFilterCount > 0 ? "border-brand-beige bg-brand-beige/20 text-brand-dark" : "border-stone-200 bg-white hover:bg-stone-50"}`}
              >
                <SlidersHorizontal size={18} />
                {activeFilterCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-wood px-1 text-xs font-bold leading-none text-white">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </div>
            <div
              className={`list-progress-row mb-4 flex items-center justify-between gap-3 text-sm text-stone-600 font-medium px-1${!isSearching && !isShowingLatestChanges && !hasItemFilters ? " is-redundant" : ""}`}
            >
              <span className="min-w-0 truncate">{listTitle}</span>
              <span className="shrink-0">{listCounterText}</span>
            </div>

            <div className="space-y-1">
              {filteredItems.length > 0 ? (
                canReorderItems ? (
                  <SortableList
                    items={filteredItems}
                    label={`Itens de ${activeCategory?.name}`}
                    onCommit={commitItemOrder}
                    disabled={isOrdering || isWorkspaceLoading}
                    className="sortable-items"
                    render={renderItem}
                  />
                ) : weekGroups ? (
                  weekGroups.map((group) => (
                    <section
                      key={group.id}
                      className="list-week-group"
                      aria-label={group.label}
                    >
                      <h3 className="list-week-group-title">
                        {group.label}
                        <span>{group.items.length}</span>
                      </h3>
                      <div className="space-y-1">
                        {group.items.map((item) => renderItem(item))}
                      </div>
                    </section>
                  ))
                ) : (
                  filteredItems.map((item) => renderItem(item))
                )
              ) : (
                <div className="text-center py-12 px-4">
                  <Sparkles
                    className="list-empty-icon w-12 h-12 mx-auto mb-4"
                    aria-hidden="true"
                  />
                  <h3 className="list-empty-title text-lg font-serif mb-2">
                    {isSearching
                      ? "Nenhum resultado"
                      : activeFilterCount > 0
                        ? "Nenhum item encontrado"
                        : "Nenhum item aqui"}
                  </h3>
                  <p className="list-empty-text text-sm">
                    {isSearching
                      ? "Tente buscar por outro nome, detalhe ou ambiente."
                      : activeFilterCount > 0
                        ? "Ajuste os filtros para ver mais itens."
                        : activeCategory
                          ? `Toque no botão abaixo para adicionar itens ao ambiente ${activeCategory.name}.`
                          : "Toque no botão abaixo para adicionar o primeiro item ao seu enxoval."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    </>
  );
}

/** Mesmo corte do CSS do celular (767px). */
function useIsCompact() {
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 767px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setCompact(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return compact;
}
