import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ChevronDown, ChevronUp, Link as LinkIcon, AlignLeft, ExternalLink, Trash2, DollarSign } from 'lucide-react';
import type { EnxovalItem } from '../types';

interface ItemRowProps {
  key?: React.Key;
  item: EnxovalItem;
  categoryName?: string;
  onUpdate: (id: string, updates: Partial<EnxovalItem>) => Promise<void> | void;
  onDelete: (item: EnxovalItem) => void;
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

function priceTextToCents(value: string) {
  const digits = value.replace(/\D/g, '');
  const cents = digits ? Number(digits) : 0;
  return cents > 0 ? cents : null;
}

function formatPriceInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 12);
  return digits ? currencyFormatter.format(Number(digits) / 100) : '';
}

function getProductUrl(link: string) {
  const trimmedLink = link.trim();
  if (!trimmedLink) return '';
  return trimmedLink.startsWith('http') ? trimmedLink : `https://${trimmedLink}`;
}

export function ItemRow({ item, categoryName, onUpdate, onDelete }: ItemRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [linkDraft, setLinkDraft] = useState(item.link);
  const [descriptionDraft, setDescriptionDraft] = useState(item.description);
  const [priceText, setPriceText] = useState(formatCurrency(item.priceCents));
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setLinkDraft(item.link);
    setDescriptionDraft(item.description);
    setPriceText(formatCurrency(item.priceCents));
    setSaveError('');
  }, [item.id, item.link, item.description, item.priceCents]);

  const toggleCheck = (e: React.MouseEvent) => {
    e.stopPropagation();
    void Promise.resolve(onUpdate(item.id, { checked: !item.checked })).catch(() => undefined);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(item);
  };

  const handlePriceChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPriceText(formatPriceInput(event.target.value));
  };

  const handleSaveDetails = async () => {
    setIsSavingDetails(true);
    setSaveError('');

    try {
      const nextLink = linkDraft.trim();
      const nextDescription = descriptionDraft.trim();
      const nextPriceCents = priceTextToCents(priceText);

      await onUpdate(item.id, {
        link: nextLink,
        description: nextDescription,
        priceCents: nextPriceCents
      });

      setLinkDraft(nextLink);
      setDescriptionDraft(nextDescription);
      setPriceText(formatCurrency(nextPriceCents));
      setIsExpanded(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Nao foi possivel salvar os detalhes.');
    } finally {
      setIsSavingDetails(false);
    }
  };

  const productUrl = getProductUrl(linkDraft);
  const itemPriceCents = normalizePriceCents(item.priceCents);
  const hasPrice = itemPriceCents !== null && itemPriceCents > 0;
  const hasExtraInfo = item.link || item.description || hasPrice;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden mb-3 transition-colors hover:border-brand-beige/50">
      <div
        className="p-4 flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
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
              <span className="mt-1 text-sm font-semibold text-stone-700">
                {formatCurrency(itemPriceCents)}
              </span>
            )}
            {hasExtraInfo && !isExpanded && (
              <div className="flex items-center gap-2 mt-1">
                {item.link && <LinkIcon size={12} className="text-brand-wood" />}
                {item.description && <AlignLeft size={12} className="text-brand-wood" />}
                {hasPrice && <DollarSign size={12} className="text-brand-wood" />}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 text-stone-400 shrink-0">
          <button
            type="button"
            onClick={handleDelete}
            aria-label="Remover item"
            title="Remover item"
            className="p-1.5 rounded-full text-stone-500 bg-stone-50 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={15} />
          </button>
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-stone-50 border-t border-stone-100"
          >
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1">
                  Link do Produto
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={linkDraft}
                    onChange={(e) => setLinkDraft(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 min-w-0 px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood bg-white"
                  />
                  {productUrl && (
                    <a
                      href={productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-brand-wood text-white rounded-lg hover:bg-brand-wood/90 transition-colors shrink-0"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1">
                  Preco
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={priceText}
                  onChange={handlePriceChange}
                  placeholder="R$ 0,00"
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1">
                  Detalhes / Descricao
                </label>
                <textarea
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  placeholder="Ex: Comprar na cor branca, voltagem 110v..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood bg-white resize-none"
                />
              </div>

              {saveError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {saveError}
                </p>
              )}

              <button
                type="button"
                onClick={() => void handleSaveDetails()}
                disabled={isSavingDetails}
                className="w-full py-3 bg-brand-dark text-white rounded-xl font-medium text-base hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingDetails ? 'Salvando...' : 'Salvar detalhes'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}