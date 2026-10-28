import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";

import { Check } from "@/src/components/icons";
import {
MAX_ENVIRONMENT_NAME_LENGTH,
sanitizeEnvironmentNameInput,
} from "../data";
import {
ITEM_STATUS_META,
ITEM_STATUSES,
type ItemStatus,
} from "../itemStatus";
import { AddChoiceDialog } from "./AddChoiceDialog";
import { AddItemModal } from "./AddItemModal";
import { Dialog } from "./Dialog";
import { FeedbackDialog } from "./FeedbackDialog";
import { PaywallDialog } from "./PaywallDialog";
import { Select } from "./Select";
import { WorkspaceMenu } from "./WorkspaceMenu";

import type { useWorkspace } from "../hooks/useWorkspace";

type DialogWorkspace = Pick<
  ReturnType<typeof useWorkspace>,
  | "isFeedbackOpen"
  | "setIsFeedbackOpen"
  | "user"
  | "workspaceView"
  | "setWorkspaceView"
  | "helpTriggerRef"
  | "setIsProfileOpen"
  | "isWorkspaceMenuOpen"
  | "menuTriggerRef"
  | "setIsWorkspaceMenuOpen"
  | "enxovais"
  | "activeEnxoval"
  | "members"
  | "categories"
  | "items"
  | "activeCategoryId"
  | "selectEnvironment"
  | "isAllEnvironments"
  | "showAllItems"
  | "openRenameCategory"
  | "openDeleteCategory"
  | "commitEnvironmentOrder"
  | "isWorkspaceLoading"
  | "isOrdering"
  | "handleEnxovalChange"
  | "openCreateEnxoval"
  | "openInvite"
  | "openDeleteEnxoval"
  | "openLeaveEnxoval"
  | "handleLogout"
  | "isAddChoiceOpen"
  | "setIsAddChoiceOpen"
  | "setIsAddModalOpen"
  | "openCreateCategory"
  | "categoryToRename"
  | "setCategoryToRename"
  | "isDialogSubmitting"
  | "handleRenameCategory"
  | "renameCategoryName"
  | "setRenameCategoryName"
  | "dialogError"
  | "isAddModalOpen"
  | "addItem"
  | "activeCategory"
  | "isFilterOpen"
  | "setIsFilterOpen"
  | "setShowOnlyPricedItems"
  | "setShowOnlyCheckedItems"
  | "setShowOnlyUnpricedItems"
  | "setStatusFilter"
  | "setQuickFilter"
  | "assigneeFilter"
  | "setAssigneeFilter"
  | "hasItemFilters"
  | "showOnlyPricedItems"
  | "showOnlyUnpricedItems"
  | "showOnlyCheckedItems"
  | "quickFilter"
  | "statusFilter"
  | "setItemSortMode"
  | "itemSortMode"
  | "activeFilterCount"
  | "isCreateCategoryOpen"
  | "setIsCreateCategoryOpen"
  | "handleCreateCategory"
  | "newCategoryName"
  | "setNewCategoryName"
  | "isCreateEnxovalOpen"
  | "setIsCreateEnxovalOpen"
  | "handleCreateEnxoval"
  | "newEnxovalName"
  | "setNewEnxovalName"
  | "setNewEnxovalUseDefaultTemplate"
  | "newEnxovalUseDefaultTemplate"
  | "isDiscountsOpen"
  | "setIsDiscountsOpen"
  | "handleSaveDiscounts"
  | "discountCategoryId"
  | "setDiscountCategoryId"
  | "setDiscountItemId"
  | "setDiscountText"
  | "setDialogError"
  | "discountItemId"
  | "discountItemOptions"
  | "selectDiscountItem"
  | "discountText"
  | "formatPriceInput"
  | "selectedDiscountItem"
  | "normalizePriceCents"
  | "formatCurrency"
  | "discountInputCents"
  | "registeredDiscountItems"
  | "enxovalDiscountCents"
  | "categoryById"
  | "saveItemDiscount"
  | "savedDiscountText"
  | "removeGeneralDiscount"
  | "itemDiscountsTotalCents"
  | "receivedValueCents"
  | "receivedValueText"
  | "checkedTotalSpentCents"
  | "isRenameEnxovalOpen"
  | "setIsRenameEnxovalOpen"
  | "handleRenameEnxoval"
  | "renameEnxovalName"
  | "setRenameEnxovalName"
  | "isDeleteEnxovalOpen"
  | "setIsDeleteEnxovalOpen"
  | "handleDeleteEnxoval"
  | "isLeaveEnxovalOpen"
  | "setIsLeaveEnxovalOpen"
  | "handleLeaveEnxoval"
  | "categoryToDelete"
  | "setCategoryToDelete"
  | "deleteCategoryItemCount"
  | "handleDeleteCategory"
  | "itemToDelete"
  | "setItemToDelete"
  | "handleDeleteItem"
  | "isInviteOpen"
  | "setIsInviteOpen"
  | "handleInviteMember"
  | "inviteEmail"
  | "setInviteEmail"
  | "memberToRemoveId"
  | "handleRemoveMember"
  | "setMemberToRemoveId"
  | "invitations"
  | "handleRevokeInvitation"
  | "inviteNotice"
  | "handleRefresh"
>;

export function WorkspaceDialogs({
  workspace,
}: {
  workspace: DialogWorkspace;
}) {
  const {
    isFeedbackOpen,
    setIsFeedbackOpen,
    user,
    workspaceView,
    setWorkspaceView,
    helpTriggerRef,
    setIsProfileOpen,
    isWorkspaceMenuOpen,
    menuTriggerRef,
    setIsWorkspaceMenuOpen,
    enxovais,
    activeEnxoval,
    members,
    categories,
    items,
    activeCategoryId,
    selectEnvironment,
    isAllEnvironments,
    showAllItems,
    openRenameCategory,
    openDeleteCategory,
    commitEnvironmentOrder,
    isWorkspaceLoading,
    isOrdering,
    handleEnxovalChange,
    openCreateEnxoval,
    openInvite,
    openDeleteEnxoval,
    openLeaveEnxoval,
    handleLogout,
    isAddChoiceOpen,
    setIsAddChoiceOpen,
    setIsAddModalOpen,
    openCreateCategory,
    categoryToRename,
    setCategoryToRename,
    isDialogSubmitting,
    handleRenameCategory,
    renameCategoryName,
    setRenameCategoryName,
    dialogError,
    isAddModalOpen,
    addItem,
    activeCategory,
    isFilterOpen,
    setIsFilterOpen,
    setShowOnlyPricedItems,
    setShowOnlyCheckedItems,
    setShowOnlyUnpricedItems,
    setStatusFilter,
    setQuickFilter,
    assigneeFilter,
    setAssigneeFilter,
    hasItemFilters,
    showOnlyPricedItems,
    showOnlyUnpricedItems,
    showOnlyCheckedItems,
    quickFilter,
    statusFilter,
    setItemSortMode,
    itemSortMode,
    activeFilterCount,
    isCreateCategoryOpen,
    setIsCreateCategoryOpen,
    handleCreateCategory,
    newCategoryName,
    setNewCategoryName,
    isCreateEnxovalOpen,
    setIsCreateEnxovalOpen,
    handleCreateEnxoval,
    newEnxovalName,
    setNewEnxovalName,
    setNewEnxovalUseDefaultTemplate,
    newEnxovalUseDefaultTemplate,
    isDiscountsOpen,
    setIsDiscountsOpen,
    handleSaveDiscounts,
    discountCategoryId,
    setDiscountCategoryId,
    setDiscountItemId,
    setDiscountText,
    setDialogError,
    discountItemId,
    discountItemOptions,
    selectDiscountItem,
    discountText,
    formatPriceInput,
    selectedDiscountItem,
    normalizePriceCents,
    formatCurrency,
    discountInputCents,
    registeredDiscountItems,
    enxovalDiscountCents,
    categoryById,
    saveItemDiscount,
    savedDiscountText,
    removeGeneralDiscount,
    itemDiscountsTotalCents,
    receivedValueCents,
    receivedValueText,
    checkedTotalSpentCents,
    isRenameEnxovalOpen,
    setIsRenameEnxovalOpen,
    handleRenameEnxoval,
    renameEnxovalName,
    setRenameEnxovalName,
    isDeleteEnxovalOpen,
    setIsDeleteEnxovalOpen,
    handleDeleteEnxoval,
    isLeaveEnxovalOpen,
    setIsLeaveEnxovalOpen,
    handleLeaveEnxoval,
    categoryToDelete,
    setCategoryToDelete,
    deleteCategoryItemCount,
    handleDeleteCategory,
    itemToDelete,
    setItemToDelete,
    handleDeleteItem,
    isInviteOpen,
    setIsInviteOpen,
    handleInviteMember,
    inviteEmail,
    setInviteEmail,
    memberToRemoveId,
    handleRemoveMember,
    setMemberToRemoveId,
    invitations,
    handleRevokeInvitation,
    inviteNotice,
    handleRefresh,
  } = workspace;
  return (
    <>
      <FeedbackDialog
        open={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        user={user}
        currentArea={
          workspaceView === "plan"
            ? "plan"
            : workspaceView === "overview"
              ? "overview"
              : "list"
        }
        triggerRef={helpTriggerRef}
      />
      <WorkspaceMenu
        onProfile={() => setIsProfileOpen(true)}
        open={isWorkspaceMenuOpen}
        onHelp={() => {
          helpTriggerRef.current = menuTriggerRef.current;
          setIsFeedbackOpen(true);
        }}
        onClose={() => setIsWorkspaceMenuOpen(false)}
        triggerRef={menuTriggerRef}
        user={user}
        enxovais={enxovais}
        activeEnxoval={activeEnxoval}
        members={members}
        categories={categories}
        items={items}
        activeCategoryId={activeCategoryId}
        onSelectCategory={selectEnvironment}
        allSelected={workspaceView === "list" && isAllEnvironments}
        onSelectAll={showAllItems}
        onRenameCategory={openRenameCategory}
        onDeleteCategory={openDeleteCategory}
        onReorderCategories={commitEnvironmentOrder}
        busy={isWorkspaceLoading || isOrdering}
        onSwitch={(id) => void handleEnxovalChange(id)}
        onCreate={openCreateEnxoval}
        onInvite={openInvite}
        onDelete={openDeleteEnxoval}
        onLeave={openLeaveEnxoval}
        onLogout={() => void handleLogout()}
        onStoreMode={() => {
          setWorkspaceView("store");
          window.scrollTo({ top: 0 });
        }}
      />
      <AddChoiceDialog
        isOpen={isAddChoiceOpen}
        onClose={() => setIsAddChoiceOpen(false)}
        onItem={() => setIsAddModalOpen(true)}
        onCategory={openCreateCategory}
      />
      <Dialog
        title="Editar ambiente"
        isOpen={Boolean(categoryToRename)}
        onClose={() => setCategoryToRename(null)}
        busy={isDialogSubmitting}
      >
        <form
          onSubmit={handleRenameCategory}
          className="environment-rename-form"
        >
          <Label htmlFor="rename-environment">Nome do ambiente</Label>
          <Input
            id="rename-environment"
            value={renameCategoryName}
            onChange={(event) =>
              setRenameCategoryName(
                sanitizeEnvironmentNameInput(event.target.value),
              )
            }
            required
            maxLength={MAX_ENVIRONMENT_NAME_LENGTH}
            aria-describedby="rename-environment-count"
            disabled={isDialogSubmitting}
          />
          <span
            id="rename-environment-count"
            className={`env-name-counter${renameCategoryName.length >= MAX_ENVIRONMENT_NAME_LENGTH ? " is-full" : ""}`}
          >
            {renameCategoryName.length}/{MAX_ENVIRONMENT_NAME_LENGTH} caracteres
          </span>
          {dialogError && (
            <div role="alert" className="form-error">
              {dialogError}
            </div>
          )}
          <div>
            <Button
              variant="brand"
              size="brand"
              type="button"
              className="button button-outline"
              disabled={isDialogSubmitting}
              onClick={() => setCategoryToRename(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="brand"
              size="brand"
              type="submit"
              className="button button-dark"
              disabled={isDialogSubmitting || !renameCategoryName.trim()}
            >
              {isDialogSubmitting ? "Salvando…" : "Salvar ambiente"}
            </Button>
          </div>
        </form>
      </Dialog>
      <AddItemModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={addItem}
        defaultCategoryId={activeCategory?.id ?? ""}
        categories={categories}
        members={members}
        currentUserId={user?.id}
        enxovalId={activeEnxoval?.id}
      />

      <Dialog
        title="Filtros da lista"
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
      >
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-5">
          <div>
            <h4 className="mb-2 text-sm font-semibold text-stone-700">
              Mostrar
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="brand"
                size="brand"
                type="button"
                onClick={() => {
                  setShowOnlyPricedItems(false);
                  setShowOnlyCheckedItems(false);
                  setShowOnlyUnpricedItems(false);
                  setStatusFilter("all");
                  setQuickFilter(null);
                  setAssigneeFilter("all");
                }}
                aria-pressed={!hasItemFilters}
                className={`filter-option${!hasItemFilters ? " is-selected" : ""}`}
              >
                {!hasItemFilters && <Check size={16} aria-hidden="true" />}
                Todos
              </Button>
              <Button
                variant="brand"
                size="brand"
                type="button"
                onClick={() => {
                  setShowOnlyPricedItems((current) => !current);
                  setShowOnlyUnpricedItems(false);
                }}
                aria-pressed={showOnlyPricedItems}
                className={`filter-option${showOnlyPricedItems ? " is-selected" : ""}`}
              >
                {showOnlyPricedItems && <Check size={16} aria-hidden="true" />}
                Com preço
              </Button>
              <Button
                variant="brand"
                size="brand"
                type="button"
                onClick={() => {
                  setShowOnlyUnpricedItems((current) => !current);
                  setShowOnlyPricedItems(false);
                }}
                aria-pressed={showOnlyUnpricedItems}
                className={`filter-option${showOnlyUnpricedItems ? " is-selected" : ""}`}
              >
                {showOnlyUnpricedItems && (
                  <Check size={16} aria-hidden="true" />
                )}
                Sem preço
              </Button>
              <Button
                variant="brand"
                size="brand"
                type="button"
                onClick={() => setShowOnlyCheckedItems((current) => !current)}
                aria-pressed={showOnlyCheckedItems}
                className={`filter-option${showOnlyCheckedItems ? " is-selected" : ""}`}
              >
                {showOnlyCheckedItems && <Check size={16} aria-hidden="true" />}
                Conquistados
              </Button>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold text-stone-700">
              Atalhos
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="brand"
                size="brand"
                type="button"
                onClick={() =>
                  setQuickFilter((current) =>
                    current === "week" ? null : "week",
                  )
                }
                aria-pressed={quickFilter === "week"}
                className={`filter-option${quickFilter === "week" ? " is-selected" : ""}`}
              >
                {quickFilter === "week" && (
                  <Check size={16} aria-hidden="true" />
                )}
                Esta semana
              </Button>
              <Button
                variant="brand"
                size="brand"
                type="button"
                onClick={() =>
                  setQuickFilter((current) =>
                    current === "deals" ? null : "deals",
                  )
                }
                aria-pressed={quickFilter === "deals"}
                className={`filter-option${quickFilter === "deals" ? " is-selected" : ""}`}
              >
                {quickFilter === "deals" && (
                  <Check size={16} aria-hidden="true" />
                )}
                Baixou de preço
              </Button>
              <Button
                variant="brand"
                size="brand"
                type="button"
                onClick={() =>
                  setQuickFilter((current) =>
                    current === "boughtUnpriced" ? null : "boughtUnpriced",
                  )
                }
                aria-pressed={quickFilter === "boughtUnpriced"}
                className={`filter-option${quickFilter === "boughtUnpriced" ? " is-selected" : ""}`}
              >
                {quickFilter === "boughtUnpriced" && (
                  <Check size={16} aria-hidden="true" />
                )}
                Compras sem valor
              </Button>
              {(
                [
                  ["thanks", "Agradecer"],
                  ["warranty", "Garantia vencendo"],
                ] as const
              ).map(([filter, label]) => (
                <Button
                  key={filter}
                  variant="brand"
                  size="brand"
                  type="button"
                  onClick={() => setQuickFilter((current) => (current === filter ? null : filter))}
                  aria-pressed={quickFilter === filter}
                  className={`filter-option${quickFilter === filter ? " is-selected" : ""}`}
                >
                  {quickFilter === filter && <Check size={16} aria-hidden="true" />}
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {members.length > 1 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-stone-700">
                Quem vai comprar
              </h4>
              <Select
                id="filter-item-assignee"
                ariaLabel="Filtrar por quem vai comprar"
                value={assigneeFilter}
                onChange={setAssigneeFilter}
                options={[
                  { value: "all", label: "Todos" },
                  { value: "mine", label: "Meus itens" },
                  { value: "unassigned", label: "Sem responsável" },
                  ...members
                    .filter((member) => member.id !== user?.id)
                    .map((member) => ({ value: member.id, label: `De ${member.name.split(" ")[0] || member.email}` })),
                ]}
              />
            </div>
          )}

          <div>
            <h4 className="mb-2 text-sm font-semibold text-stone-700">
              Situação
            </h4>
            <Select
              id="filter-item-status"
              ariaLabel="Filtrar por situação"
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as ItemStatus | "all")}
              options={[
                { value: "all", label: "Todas as situações" },
                ...ITEM_STATUSES.map((status) => ({
                  value: status,
                  label: ITEM_STATUS_META[status].label,
                })),
              ]}
            />
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold text-stone-700">
              Ordenar
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="brand"
                size="brand"
                type="button"
                onClick={() => setItemSortMode("manual")}
                aria-pressed={itemSortMode === "manual"}
                className={`filter-option${itemSortMode === "manual" ? " is-selected" : ""}`}
              >
                {itemSortMode === "manual" && (
                  <Check size={16} aria-hidden="true" />
                )}
                Minha ordem
              </Button>
              <Button
                variant="brand"
                size="brand"
                type="button"
                onClick={() => setItemSortMode("name")}
                aria-pressed={itemSortMode === "name"}
                className={`filter-option${itemSortMode === "name" ? " is-selected" : ""}`}
              >
                {itemSortMode === "name" && (
                  <Check size={16} aria-hidden="true" />
                )}
                Nome A-Z
              </Button>
              <Button
                variant="brand"
                size="brand"
                type="button"
                onClick={() => setItemSortMode("updated")}
                aria-pressed={itemSortMode === "updated"}
                className={`filter-option${itemSortMode === "updated" ? " is-selected" : ""}`}
              >
                {itemSortMode === "updated" && (
                  <Check size={16} aria-hidden="true" />
                )}
                Últimas alterações
              </Button>
              <Button
                variant="brand"
                size="brand"
                type="button"
                onClick={() => setItemSortMode("week")}
                aria-pressed={itemSortMode === "week"}
                className={`filter-option${itemSortMode === "week" ? " is-selected" : ""}`}
              >
                {itemSortMode === "week" && (
                  <Check size={16} aria-hidden="true" />
                )}
                Semana de compra
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
            <Button
              variant="brand"
              size="brand"
              type="button"
              onClick={() => {
                setShowOnlyPricedItems(false);
                setShowOnlyCheckedItems(false);
                setShowOnlyUnpricedItems(false);
                setStatusFilter("all");
                setQuickFilter(null);
                setAssigneeFilter("all");
                setItemSortMode("manual");
              }}
              disabled={activeFilterCount === 0}
              className="rounded-xl bg-stone-100 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Limpar
            </Button>
            <Button
              variant="brand"
              size="brand"
              type="button"
              onClick={() => setIsFilterOpen(false)}
              className="button button-dark button-small"
            >
              Concluir
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        title="Novo ambiente"
        busy={isDialogSubmitting}
        isOpen={isCreateCategoryOpen}
        onClose={() => setIsCreateCategoryOpen(false)}
      >
        <form
          onSubmit={handleCreateCategory}
          className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4"
        >
          <div>
            <Label className="block text-sm font-medium text-stone-700 mb-1">
              Nome do ambiente
            </Label>
            <Input
              type="text"
              aria-label="Nome do ambiente"
              maxLength={MAX_ENVIRONMENT_NAME_LENGTH}
              value={newCategoryName}
              onChange={(event) =>
                setNewCategoryName(
                  sanitizeEnvironmentNameInput(event.target.value),
                )
              }
              aria-describedby="new-environment-count"
              placeholder="Ex: Escritório"
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
            />
            <span
              id="new-environment-count"
              className={`env-name-counter${newCategoryName.length >= MAX_ENVIRONMENT_NAME_LENGTH ? " is-full" : ""}`}
            >
              {newCategoryName.length}/{MAX_ENVIRONMENT_NAME_LENGTH} caracteres
            </span>
          </div>

          {dialogError && (
            <p role="alert" className="form-error">
              {dialogError}
            </p>
          )}

          <Button
            variant="brand"
            size="brand"
            type="submit"
            disabled={
              !newCategoryName.trim() || isDialogSubmitting || !activeEnxoval
            }
            className="w-full py-4 bg-brand-dark text-white rounded-xl font-medium text-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDialogSubmitting ? "Criando..." : "Criar ambiente"}
          </Button>
        </form>
      </Dialog>

      <Dialog
        title="Novo enxoval"
        busy={isDialogSubmitting}
        isOpen={isCreateEnxovalOpen}
        onClose={() => setIsCreateEnxovalOpen(false)}
      >
        <form
          onSubmit={handleCreateEnxoval}
          className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4"
        >
          <div>
            <Label className="block text-sm font-medium text-stone-700 mb-1">
              Nome do enxoval
            </Label>
            <Input
              type="text"
              aria-label="Nome do enxoval"
              value={newEnxovalName}
              onChange={(event) => setNewEnxovalName(event.target.value)}
              placeholder="Ex: Apartamento novo"
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
            />
          </div>

          <div>
            <Label className="block text-sm font-medium text-stone-700 mb-1">
              Modelo inicial
            </Label>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1">
              <Button
                variant="brand"
                size="brand"
                type="button"
                onClick={() => setNewEnxovalUseDefaultTemplate(true)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${newEnxovalUseDefaultTemplate ? "bg-white text-brand-dark shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
              >
                Lista sugerida
              </Button>
              <Button
                variant="brand"
                size="brand"
                type="button"
                onClick={() => setNewEnxovalUseDefaultTemplate(false)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${!newEnxovalUseDefaultTemplate ? "bg-white text-brand-dark shadow-sm" : "text-stone-500 hover:text-stone-700"}`}
              >
                Vazio
              </Button>
            </div>
          </div>

          {dialogError && (
            <p role="alert" className="form-error">
              {dialogError}
            </p>
          )}

          <Button
            variant="brand"
            size="brand"
            type="submit"
            disabled={!newEnxovalName.trim() || isDialogSubmitting}
            className="w-full py-4 bg-brand-dark text-white rounded-xl font-medium text-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDialogSubmitting ? "Criando..." : "Criar enxoval"}
          </Button>
        </form>
      </Dialog>

      <Dialog
        title="Descontos e cashback"
        busy={isDialogSubmitting}
        isOpen={isDiscountsOpen}
        onClose={() => setIsDiscountsOpen(false)}
      >
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-5">
          <form onSubmit={handleSaveDiscounts} className="space-y-4">
            <p className="text-sm text-stone-600">
              Escolha o item e informe quanto foi abatido do preço, seja
              desconto, cupom ou cashback. O valor entra no resumo e fica salvo
              no próprio item: é só abri-lo na lista para ver ou ajustar.
            </p>

            <div>
              <Label
                htmlFor="discount-category"
                className="block text-sm font-medium text-stone-700 mb-1"
              >
                Ambiente
              </Label>
              <Select
                id="discount-category"
                value={discountCategoryId}
                disabled={isDialogSubmitting}
                options={categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                }))}
                onChange={(categoryId) => {
                  setDiscountCategoryId(categoryId);
                  setDiscountItemId("");
                  setDiscountText("");
                  setDialogError("");
                }}
              />
            </div>

            <div>
              <Label
                htmlFor="discount-item"
                className="block text-sm font-medium text-stone-700 mb-1"
              >
                Item
              </Label>
              <Select
                id="discount-item"
                value={discountItemId}
                disabled={isDialogSubmitting}
                options={discountItemOptions}
                onChange={selectDiscountItem}
              />
              {discountItemOptions.length === 0 && (
                <p className="mt-1 text-xs text-stone-500">
                  Este ambiente não tem itens que aceitem desconto. Itens
                  ganhos, que você já tinha, não precisa ou descartados ficam de
                  fora.
                </p>
              )}
            </div>

            <div>
              <Label
                htmlFor="discount-value"
                className="block text-sm font-medium text-stone-700 mb-1"
              >
                Valor do desconto ou cashback
              </Label>
              <Input
                id="discount-value"
                type="text"
                inputMode="numeric"
                value={discountText}
                onChange={(event) => {
                  setDiscountText(formatPriceInput(event.target.value));
                  setDialogError("");
                }}
                placeholder="R$ 0,00"
                disabled={!selectedDiscountItem || isDialogSubmitting}
                className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood disabled:opacity-60"
              />
              {selectedDiscountItem && (
                <p className="mt-1 text-xs text-stone-500">
                  {normalizePriceCents(selectedDiscountItem.priceCents)
                    ? `Preço do item: ${formatCurrency(selectedDiscountItem.priceCents)}. Fica ${formatCurrency(Math.max(0, (normalizePriceCents(selectedDiscountItem.priceCents) ?? 0) - discountInputCents))} depois do desconto.`
                    : "Este item ainda não tem preço. Informe o preço dele antes de registrar o desconto."}
                </p>
              )}
            </div>

            {dialogError && (
              <p role="alert" className="form-error">
                {dialogError}
              </p>
            )}

            <Button
              variant="brand"
              size="brand"
              type="submit"
              disabled={
                isDialogSubmitting ||
                !selectedDiscountItem ||
                discountInputCents <= 0 ||
                discountInputCents ===
                  (selectedDiscountItem?.discountCents ?? 0)
              }
              className="w-full py-4 bg-brand-dark text-white rounded-xl font-medium text-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDialogSubmitting ? "Salvando..." : "Salvar desconto"}
            </Button>
          </form>

          <section aria-label="Descontos registrados">
            <h4 className="mb-2 text-sm font-semibold text-stone-700">
              Descontos registrados
            </h4>
            {registeredDiscountItems.length === 0 &&
            enxovalDiscountCents === 0 ? (
              <p className="text-sm text-stone-500">
                Nenhum desconto ou cashback registrado ainda.
              </p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {registeredDiscountItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 py-2">
                    <Button
                      variant="brand"
                      size="brand"
                      type="button"
                      onClick={() => selectDiscountItem(item.id)}
                      disabled={isDialogSubmitting}
                      className="min-w-0 flex-1 text-left"
                      aria-label={`Editar desconto de ${item.name}`}
                    >
                      <span className="block truncate text-sm font-medium text-stone-800">
                        {item.name}
                      </span>
                      <span className="block truncate text-xs text-stone-500">
                        {categoryById.get(item.categoryId)?.name ??
                          item.category}{" "}
                        · - {formatCurrency(item.discountCents)} de{" "}
                        {formatCurrency(item.priceCents)}
                      </span>
                    </Button>
                    <Button
                      variant="brand"
                      size="brand"
                      type="button"
                      onClick={() => void saveItemDiscount(item.id, 0)}
                      disabled={isDialogSubmitting}
                      aria-label={`Remover desconto de ${item.name}`}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50"
                    >
                      Remover
                    </Button>
                  </li>
                ))}
                {enxovalDiscountCents > 0 && (
                  <li className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-stone-800">
                        Desconto geral anterior
                      </span>
                      <span className="block text-xs text-stone-500">
                        Sem item vinculado · - {savedDiscountText}
                      </span>
                    </span>
                    <Button
                      variant="brand"
                      size="brand"
                      type="button"
                      onClick={() => void removeGeneralDiscount()}
                      disabled={isDialogSubmitting}
                      aria-label="Remover desconto geral anterior"
                      className="rounded-lg px-2 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50"
                    >
                      Remover
                    </Button>
                  </li>
                )}
              </ul>
            )}
          </section>

          <div className="rounded-xl bg-stone-50 p-3 text-sm text-stone-600 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span>Descontos e cashback nos itens</span>
              <strong className="text-brand-wood">
                - {formatCurrency(itemDiscountsTotalCents)}
              </strong>
            </div>
            {enxovalDiscountCents > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span>Desconto geral anterior</span>
                <strong className="text-brand-wood">
                  - {savedDiscountText}
                </strong>
              </div>
            )}
            {receivedValueCents > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span>Itens ganhos (valor cheio)</span>
                <strong className="text-brand-wood">{receivedValueText}</strong>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-stone-200 pt-2">
              <span>Total gasto</span>
              <strong className="text-stone-900">
                {formatCurrency(checkedTotalSpentCents)}
              </strong>
            </div>
          </div>
        </div>
      </Dialog>
      <Dialog
        title="Editar enxoval"
        busy={isDialogSubmitting}
        isOpen={isRenameEnxovalOpen}
        onClose={() => setIsRenameEnxovalOpen(false)}
      >
        <form
          onSubmit={handleRenameEnxoval}
          className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4"
        >
          <div>
            <Label className="block text-sm font-medium text-stone-700 mb-1">
              Nome do enxoval
            </Label>
            <Input
              type="text"
              aria-label="Nome do enxoval"
              value={renameEnxovalName}
              onChange={(event) => setRenameEnxovalName(event.target.value)}
              placeholder="Ex: Apartamento novo"
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
            />
          </div>

          {dialogError && (
            <p role="alert" className="form-error">
              {dialogError}
            </p>
          )}

          <Button
            variant="brand"
            size="brand"
            type="submit"
            disabled={!renameEnxovalName.trim() || isDialogSubmitting}
            className="w-full py-4 bg-brand-dark text-white rounded-xl font-medium text-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDialogSubmitting ? "Salvando..." : "Salvar nome"}
          </Button>
        </form>
      </Dialog>

      <Dialog
        title="Excluir enxoval"
        busy={isDialogSubmitting}
        tone="danger"
        isOpen={isDeleteEnxovalOpen}
        onClose={() => setIsDeleteEnxovalOpen(false)}
      >
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4">
          <p className="text-sm text-stone-600">
            Esta ação vai excluir o enxoval{" "}
            {activeEnxoval ? `"${activeEnxoval.name}"` : ""}, incluindo
            ambientes, itens e colaboradores.
          </p>

          {dialogError && (
            <p role="alert" className="form-error">
              {dialogError}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="brand"
              size="brand"
              type="button"
              onClick={() => setIsDeleteEnxovalOpen(false)}
              data-dialog-autofocus
              disabled={isDialogSubmitting}
              className="py-4 bg-stone-100 text-stone-700 rounded-xl font-medium text-base hover:bg-stone-200 transition-colors disabled:opacity-50"
            >
              Cancelar
            </Button>
            <Button
              variant="brand"
              size="brand"
              type="button"
              onClick={() => void handleDeleteEnxoval()}
              disabled={isDialogSubmitting || !activeEnxoval}
              className="py-4 bg-red-600 text-white rounded-xl font-medium text-base hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDialogSubmitting ? "Tirando…" : "Tirar da lista"}
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        title="Sair do enxoval"
        busy={isDialogSubmitting}
        tone="danger"
        isOpen={isLeaveEnxovalOpen}
        onClose={() => setIsLeaveEnxovalOpen(false)}
      >
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4">
          <p className="text-sm text-stone-600">
            Você vai deixar de participar do enxoval{" "}
            {activeEnxoval ? `"${activeEnxoval.name}"` : ""} de{" "}
            {activeEnxoval?.ownerName}. Para voltar, será preciso receber um
            novo convite.
          </p>

          {dialogError && (
            <p role="alert" className="form-error">
              {dialogError}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="brand"
              size="brand"
              type="button"
              onClick={() => setIsLeaveEnxovalOpen(false)}
              data-dialog-autofocus
              disabled={isDialogSubmitting}
              className="py-4 bg-stone-100 text-stone-700 rounded-xl font-medium text-base hover:bg-stone-200 transition-colors disabled:opacity-50"
            >
              Cancelar
            </Button>
            <Button
              variant="brand"
              size="brand"
              type="button"
              onClick={() => void handleLeaveEnxoval()}
              disabled={isDialogSubmitting || !activeEnxoval}
              className="py-4 bg-red-600 text-white rounded-xl font-medium text-base hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDialogSubmitting ? "Saindo..." : "Sair do enxoval"}
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        title="Excluir ambiente"
        busy={isDialogSubmitting}
        tone="danger"
        isOpen={Boolean(categoryToDelete)}
        onClose={() => setCategoryToDelete(null)}
      >
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4">
          <p className="text-sm text-stone-600">
            {categoryToDelete
              ? `Esta ação vai excluir o ambiente "${categoryToDelete.name}" e ${
                  deleteCategoryItemCount === 0
                    ? "não há itens nele"
                    : deleteCategoryItemCount === 1
                      ? "o 1 item que está nele"
                      : `os ${deleteCategoryItemCount} itens que estão nele`
                }. Não é possível desfazer.`
              : ""}
          </p>

          {dialogError && (
            <p role="alert" className="form-error">
              {dialogError}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="brand"
              size="brand"
              type="button"
              onClick={() => setCategoryToDelete(null)}
              data-dialog-autofocus
              disabled={isDialogSubmitting}
              className="py-4 bg-stone-100 text-stone-700 rounded-xl font-medium text-base hover:bg-stone-200 transition-colors disabled:opacity-50"
            >
              Cancelar
            </Button>
            <Button
              variant="brand"
              size="brand"
              type="button"
              onClick={() => void handleDeleteCategory()}
              disabled={isDialogSubmitting || !categoryToDelete}
              className="py-4 bg-red-600 text-white rounded-xl font-medium text-base hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDialogSubmitting ? "Excluindo..." : "Excluir ambiente"}
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        title="Tirar da lista"
        busy={isDialogSubmitting}
        tone="danger"
        isOpen={Boolean(itemToDelete)}
        onClose={() => setItemToDelete(null)}
      >
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4">
          <p className="text-sm text-stone-600">
            {itemToDelete ? `"${itemToDelete.name}"` : "O item"} sai do enxoval
            de vocês, junto com o preço e o link guardados. Se preferir só mudar
            a situação, toque em Cancelar e abra o item.
          </p>

          {dialogError && (
            <p role="alert" className="form-error">
              {dialogError}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="brand"
              size="brand"
              type="button"
              onClick={() => setItemToDelete(null)}
              data-dialog-autofocus
              disabled={isDialogSubmitting}
              className="py-4 bg-stone-100 text-stone-700 rounded-xl font-medium text-base hover:bg-stone-200 transition-colors disabled:opacity-50"
            >
              Cancelar
            </Button>
            <Button
              variant="brand"
              size="brand"
              type="button"
              onClick={() => void handleDeleteItem()}
              disabled={isDialogSubmitting || !itemToDelete}
              className="py-4 bg-red-600 text-white rounded-xl font-medium text-base hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDialogSubmitting ? "Excluindo..." : "Excluir"}
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        title="Convidar pessoa"
        busy={isDialogSubmitting}
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
      >
        <form
          onSubmit={handleInviteMember}
          className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4"
        >
          <div>
            <Label className="block text-sm font-medium text-stone-700 mb-1">
              E-mail da pessoa
            </Label>
            <Input
              type="email"
              aria-label="E-mail da pessoa"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="pessoa@email.com"
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
            />
          </div>

          <p className="text-sm text-stone-500">
            A pessoa recebe um convite por e-mail e entra no enxoval ao aceitar.
            Ela edita a lista com você, mas não cria enxovais, não convida
            ninguém e não exclui este enxoval.
          </p>

          {members.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-stone-700 mb-1">
                Quem participa
              </h3>
              <ul className="invite-people">
                {members.map((member) => (
                  <li key={member.id}>
                    <span className="invite-person">
                      <strong>{member.name}</strong>
                      <small>{member.email}</small>
                    </span>
                    {member.role === "owner" ? (
                      <span className="text-xs font-medium text-stone-400">
                        dono
                      </span>
                    ) : (
                      <Button
                        variant="brand"
                        size="brand"
                        type="button"
                        className={`invite-remove ${memberToRemoveId === member.id ? "is-confirming" : ""}`}
                        disabled={isDialogSubmitting}
                        onClick={() => void handleRemoveMember(member)}
                        onBlur={() => setMemberToRemoveId("")}
                        aria-label={
                          memberToRemoveId === member.id
                            ? `Confirmar remoção de ${member.name}`
                            : `Remover ${member.name}`
                        }
                      >
                        {memberToRemoveId === member.id
                          ? "Confirmar remoção"
                          : "Remover"}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {invitations.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-stone-700 mb-1">
                Convites pendentes
              </h3>
              <ul className="invite-people">
                {invitations.map((invitation) => (
                  <li key={invitation.id}>
                    <span className="invite-person">
                      <strong>{invitation.email}</strong>
                      <small>Aguardando aceite</small>
                    </span>
                    <Button
                      variant="brand"
                      size="brand"
                      type="button"
                      className="invite-remove"
                      disabled={isDialogSubmitting}
                      onClick={() => void handleRevokeInvitation(invitation)}
                      aria-label={`Cancelar convite de ${invitation.email}`}
                    >
                      Cancelar
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {inviteNotice && (
            <p
              role="status"
              className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2"
            >
              {inviteNotice}
            </p>
          )}

          {dialogError && (
            <p role="alert" className="form-error">
              {dialogError}
            </p>
          )}

          <Button
            variant="brand"
            size="brand"
            type="submit"
            disabled={
              !inviteEmail.trim() || isDialogSubmitting || !activeEnxoval
            }
            className="w-full py-4 bg-brand-dark text-white rounded-xl font-medium text-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDialogSubmitting ? "Enviando..." : "Enviar convite"}
          </Button>
        </form>
      </Dialog>
      <PaywallDialog
        onPlanChanged={() => void handleRefresh()}
        categories={categories}
        items={items}
      />
    </>
  );
}
