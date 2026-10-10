import React, { useEffect, useState } from "react";
import type { EnxovalCategory, EnxovalItem, ItemStatus } from "../types";
import {
  DEFAULT_ITEM_STATUS,
  discountApplies,
  ITEM_STATUSES,
  ITEM_STATUS_META,
} from "../itemStatus";
import { MAX_ENVIRONMENT_NAME_LENGTH } from "../data";
import { DEFAULT_ITEM_QUANTITY, MAX_ITEM_QUANTITY } from "../itemQuantity";
import { MAX_ITEM_NAME_LENGTH } from "../data";
import { Dialog } from "./Dialog";
import { QuantityStepper } from "./QuantityStepper";
import { Select } from "./Select";

const NEW_CATEGORY_VALUE = "__new_category__";
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (
    name: string,
    categoryId?: string,
    categoryName?: string,
    details?: Pick<
      EnxovalItem,
      "priceCents" | "quantity" | "discountCents" | "link" | "description" | "status"
    >,
  ) => Promise<void> | void;
  defaultCategoryId: string;
  categories: EnxovalCategory[];
}

export function AddItemModal({
  isOpen,
  onClose,
  onAdd,
  defaultCategoryId,
  categories,
}: AddItemModalProps) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [priceText, setPriceText] = useState("");
  const [discountText, setDiscountText] = useState("");
  const [quantityText, setQuantityText] = useState(String(DEFAULT_ITEM_QUANTITY));
  const [link, setLink] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ItemStatus>(DEFAULT_ITEM_STATUS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setCategoryId(defaultCategoryId || categories[0]?.id || NEW_CATEGORY_VALUE);
    setNewCategoryName("");
    setName("");
    setPriceText("");
    setDiscountText("");
    setQuantityText(String(DEFAULT_ITEM_QUANTITY));
    setLink("");
    setDescription("");
    setStatus(DEFAULT_ITEM_STATUS);
    setError("");
  }, [categories, defaultCategoryId, isOpen]);

  const draftPrice = Number(priceText.replace(/\D/g, "")) || 0;
  const draftDiscount = discountApplies(status)
    ? Math.min(Number(discountText.replace(/\D/g, "")) || 0, draftPrice)
    : 0;
  const draftFinal = draftPrice - draftDiscount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    const trimmedCategoryName = newCategoryName.trim();

    const digits = priceText.replace(/\D/g, "");

    if (!trimmedName) return;
    if (categoryId === NEW_CATEGORY_VALUE && !trimmedCategoryName) {
      setError("Informe o nome do novo ambiente.");
      return;
    }

    const priceValue = digits && Number(digits) > 0 ? Number(digits) : null;
    const discountValue = discountApplies(status)
      ? Number(discountText.replace(/\D/g, "")) || 0
      : 0;
    const quantityValue = Number(quantityText.replace(/\D/g, ""));
    if (!Number.isInteger(quantityValue) || quantityValue < 1 || quantityValue > MAX_ITEM_QUANTITY) {
      setError(`A quantidade deve ser um número de 1 a ${MAX_ITEM_QUANTITY}.`);
      return;
    }
    if (discountValue > 0 && !priceValue) {
      setError("Informe o preço do item antes do desconto ou cashback.");
      return;
    }
    if (priceValue !== null && discountValue > priceValue) {
      setError("O desconto ou cashback não pode ser maior que o preço do item.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      await onAdd(
        trimmedName,
        categoryId === NEW_CATEGORY_VALUE ? undefined : categoryId,
        categoryId === NEW_CATEGORY_VALUE ? trimmedCategoryName : undefined,
        {
          priceCents: priceValue,
          quantity: quantityValue,
          discountCents: discountValue,
          link: link.trim(),
          description: description.trim(),
          status,
        },
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível adicionar o item.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      title="Novo item"
      isOpen={isOpen}
      onClose={onClose}
      busy={isSubmitting}
    >
      <form
        onSubmit={handleSubmit}
        className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Sobre o item</h3>

        <div>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <label htmlFor="new-item-name" className="block text-sm font-medium text-stone-700">
              Nome do produto
            </label>
            <span className={`name-counter${name.length >= MAX_ITEM_NAME_LENGTH ? " is-full" : ""}`} aria-hidden="true">
              {name.length}/{MAX_ITEM_NAME_LENGTH}
            </span>
          </div>
          <input
            type="text"
            id="new-item-name"
            required
            maxLength={MAX_ITEM_NAME_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Jogo de Taças"
            className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="new-item-category" className="block text-sm font-medium text-stone-700 mb-1">
              Ambiente
            </label>
            <Select
              id="new-item-category"
              value={categoryId}
              onChange={setCategoryId}
              disabled={isSubmitting}
              options={[
                ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
                { value: NEW_CATEGORY_VALUE, label: "+ Novo ambiente" },
              ]}
            />
          </div>
          <div>
            <label htmlFor="new-item-status" className="block text-sm font-medium text-stone-700 mb-1">
              Situação
            </label>
            <Select
              id="new-item-status"
              value={status}
              onChange={(value) => {
                setStatus(value as ItemStatus);
                if (!discountApplies(value as ItemStatus)) setDiscountText("");
              }}
              disabled={isSubmitting}
              options={ITEM_STATUSES.map((value) => ({
                value,
                label: ITEM_STATUS_META[value].label,
              }))}
            />
            <p className="mt-1 text-xs text-stone-500">
              {ITEM_STATUS_META[status].hint}
            </p>
          </div>
        </div>

        {categoryId === NEW_CATEGORY_VALUE && (
          <div>
            <label htmlFor="new-item-category-name" className="block text-sm font-medium text-stone-700 mb-1">
              Nome do ambiente
            </label>
            <input
              id="new-item-category-name"
              required
              maxLength={MAX_ENVIRONMENT_NAME_LENGTH}
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Ex: Escritório"
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
            />
          </div>
        )}

        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500 pt-1">Valores</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="new-item-price" className="block text-sm font-medium text-stone-700 mb-1">
              Preço
            </label>
            <input
              id="new-item-price"
              type="text"
              inputMode="numeric"
              value={priceText}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
                setPriceText(digits ? money.format(Number(digits) / 100) : "");
              }}
              placeholder="R$ 0,00"
              disabled={isSubmitting}
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
            />
          </div>
          <div>
            <label htmlFor="new-item-discount" className="block text-sm font-medium text-stone-700 mb-1">
              Desconto ou cashback
            </label>
            <input
              id="new-item-discount"
              type="text"
              inputMode="numeric"
              value={discountText}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
                setDiscountText(digits ? money.format(Number(digits) / 100) : "");
              }}
              placeholder="R$ 0,00"
              disabled={isSubmitting || !discountApplies(status)}
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood disabled:opacity-60"
            />
            <p className="mt-1 text-xs text-stone-500">
              {discountApplies(status)
                ? "Quanto foi abatido do preço. Vai para o resumo de descontos."
                : status === "received"
                  ? "Item ganho: o valor cheio vai para o resumo, sem desconto."
                  : "Esta situação não tem compra, então não há desconto."}
            </p>
          </div>
          <div>
            <label htmlFor="new-item-quantity" className="block text-sm font-medium text-stone-700 mb-1">
              Quantidade
            </label>
            <QuantityStepper
              id="new-item-quantity"
              value={quantityText}
              onChange={setQuantityText}
              disabled={isSubmitting}
              inputClassName="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
            />
            <p className="mt-1 text-xs text-stone-500">
              Só informa quantas unidades há. Não muda o preço.
            </p>
          </div>
          <div
            className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-3"
            aria-live="polite"
          >
            <span className="block text-sm font-medium text-stone-700">
              {status === "received" ? "Valor ganho" : "Valor final"}
            </span>
            <strong className="block text-xl font-medium text-stone-800">
              {draftPrice > 0 ? money.format(draftFinal / 100) : "—"}
            </strong>
            <span className="block text-xs text-stone-500">
              {status === "received"
                ? "Vai para Descontos e cashback, não para Já investimos."
                : draftDiscount > 0
                  ? `${money.format(draftPrice / 100)} menos ${money.format(draftDiscount / 100)} de desconto.`
                  : "Preço menos o desconto ou cashback."}
            </span>
          </div>
        </div>

        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500 pt-1">Detalhes</h3>

        <div>
          <label htmlFor="new-item-link" className="block text-sm font-medium text-stone-700 mb-1">
            Link do produto
          </label>
          <input
            id="new-item-link"
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://..."
            disabled={isSubmitting}
            className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
          />
        </div>

        <div>
          <label htmlFor="new-item-description" className="block text-sm font-medium text-stone-700 mb-1">
            Observações
          </label>
          <textarea
            id="new-item-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Ex: Comprar na cor branca, voltagem 110 V..."
            disabled={isSubmitting}
            className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood resize-none"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"
          >
            {error}
          </p>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={!name.trim() || isSubmitting}
            className="w-full py-4 bg-brand-dark text-white rounded-xl font-medium text-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Salvando..." : "Adicionar à lista"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
