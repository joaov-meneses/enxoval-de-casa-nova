import React from 'react';
import { Check, Link as LinkIcon, AlignLeft, Trash2, Pencil } from 'lucide-react';
import type { EnxovalItem } from '../types';

interface ItemRowProps {
  key?: React.Key;
  item: EnxovalItem;
  categoryName?: string;
  onUpdate: (id: string, updates: Partial<EnxovalItem>) => Promise<void> | void;
  onDelete: (item: EnxovalItem) => void;
  onEdit: (item: EnxovalItem) => void;
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

function normalizePriceCents(priceCents: number | string | null | undefined) {
  if (typeof priceCents === 'number' && Number.isFinite(priceCents)) return Math.round(priceCents);
  if (typeof priceCents === 'string' && priceCents.trim()) {
    const parsed = Number(priceCents);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  return null;
}

function formatCurrency(priceCents: number | string | null | undefined) {
  const normalizedPriceCents = normalizePriceCents(priceCents);
  return normalizedPriceCents !== null ? currencyFormatter.format(normalizedPriceCents / 100) : '';
}

export function ItemRow({ item, categoryName, onUpdate, onDelete, onEdit }: ItemRowProps) {
  const toggleCheck = (e: React.MouseEvent) => {
    e.stopPropagation();
    void Promise.resolve(onUpdate(item.id, { checked: !item.checked })).catch(() => undefined);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(item);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(item);
  };

  const itemPriceCents = normalizePriceCents(item.priceCents);
  const hasPrice = itemPriceCents !== null && itemPriceCents > 0;
  const hasExtraInfo = Boolean(item.link || item.description);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden mb-3 transition-colors hover:border-brand-beige/50">
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <button
            type="button"
            onClick={toggleCheck}
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${
              item.checked
                ? 'bg-brand-wood border-brand-wood text-white'
                : 'border-stone-300 text-transparent hover:border-brand-wood'
            }`}
          >
            <Check size={14} strokeWidth={3} />
          </button>

          <div className="flex flex-col flex-1 min-w-0">
            <span className={`text-base font-medium transition-all truncate ${item.checked ? 'text-stone-400 line-through' : 'text-stone-800'}`}>
              {item.name}
            </span>
            {categoryName && (
              <span className="mt-1 text-xs font-semibold uppercase tracking-wide text-brand-wood truncate">
                {categoryName}
              </span>
            )}
            {hasPrice && (
              <span className="mt-1 text-sm font-semibold text-brand-wood">
                {formatCurrency(itemPriceCents)}
              </span>
            )}
            {hasExtraInfo && (
              <div className="flex items-center gap-2 mt-1">
                {item.link && <LinkIcon size={12} className="text-brand-wood" />}
                {item.description && <AlignLeft size={12} className="text-brand-wood" />}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 text-stone-400 shrink-0">
          <button
            type="button"
            onClick={handleEdit}
            aria-label="Editar item"
            title="Editar item"
            className="p-1.5 rounded-full text-stone-500 bg-stone-50 hover:text-brand-dark hover:bg-brand-beige/20 transition-colors"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            aria-label="Remover item"
            title="Remover item"
            className="p-1.5 rounded-full text-stone-500 bg-stone-50 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
