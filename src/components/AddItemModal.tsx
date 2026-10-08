import React, { useEffect, useState } from "react";
import type { EnxovalCategory, EnxovalItem } from "../types";
import { MAX_ENVIRONMENT_NAME_LENGTH } from "../data";
import { Dialog } from "./Dialog";
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
    details?: Pick<EnxovalItem, "priceCents" | "link" | "description">,
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
  const [link, setLink] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setCategoryId(defaultCategoryId || categories[0]?.id || NEW_CATEGORY_VALUE);
    setNewCategoryName("");
    setName("");
    setPriceText("");
    setLink("");
    setDescription("");
    setError("");
  }, [categories, defaultCategoryId, isOpen]);

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

    setIsSubmitting(true);
    setError("");

    try {
      await onAdd(
        trimmedName,
        categoryId === NEW_CATEGORY_VALUE ? undefined : categoryId,
        categoryId === NEW_CATEGORY_VALUE ? trimmedCategoryName : undefined,
        {
          priceCents: digits && Number(digits) > 0 ? Number(digits) : null,
          link: link.trim(),
          description: description.trim(),
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
        <div>
          <label
            htmlFor="new-item-name"
            className="block text-sm font-medium text-stone-700 mb-1"
          >
            Nome do produto
          </label>
          <input
            type="text"
            id="new-item-name"
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Jogo de Taças"
            className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
          />
        </div>

        <div>
          <label
            htmlFor="new-item-category"
            className="block text-sm font-medium text-stone-700 mb-1"
          >
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

        {categoryId === NEW_CATEGORY_VALUE && (
          <div>
            <label
              htmlFor="new-item-category-name"
              className="block text-sm font-medium text-stone-700 mb-1"
            >
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="new-item-price"
              className="block text-sm font-medium text-stone-700 mb-1"
            >
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
            <label
              htmlFor="new-item-link"
              className="block text-sm font-medium text-stone-700 mb-1"
            >
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
        </div>

        <div>
          <label
            htmlFor="new-item-description"
            className="block text-sm font-medium text-stone-700 mb-1"
          >
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
