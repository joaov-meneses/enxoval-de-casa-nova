import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ChevronDown, ChevronUp, Link as LinkIcon, AlignLeft, ExternalLink, Trash2 } from 'lucide-react';
import type { EnxovalItem } from '../types';

interface ItemRowProps {
  key?: React.Key;
  item: EnxovalItem;
  onUpdate: (id: string, updates: Partial<EnxovalItem>) => void;
  onDelete: (item: EnxovalItem) => void;
}

export function ItemRow({ item, onUpdate, onDelete }: ItemRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleCheck = (e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdate(item.id, { checked: !item.checked });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(item);
  };

  const hasExtraInfo = item.link || item.description;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden mb-3 transition-colors hover:border-brand-beige/50">
      <div
        className="p-4 flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-4 flex-1">
          <button
            type="button"
            onClick={toggleCheck}
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
              item.checked
                ? 'bg-brand-wood border-brand-wood text-white'
                : 'border-stone-300 text-transparent hover:border-brand-wood'
            }`}
          >
            <Check size={14} strokeWidth={3} />
          </button>

          <div className="flex flex-col flex-1">
            <span className={`text-base font-medium transition-all ${item.checked ? 'text-stone-400 line-through' : 'text-stone-800'}`}>
              {item.name}
            </span>
            {hasExtraInfo && !isExpanded && (
              <div className="flex items-center gap-2 mt-1">
                {item.link && <LinkIcon size={12} className="text-brand-wood" />}
                {item.description && <AlignLeft size={12} className="text-brand-wood" />}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 text-stone-400">
          <button
            type="button"
            onClick={handleDelete}
            aria-label="Remover item"
            title="Remover item"
            className="p-1.5 rounded-full text-stone-300 hover:text-red-600 hover:bg-red-50 transition-colors"
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
                    value={item.link}
                    onChange={(e) => onUpdate(item.id, { link: e.target.value })}
                    placeholder="https://..."
                    className="flex-1 px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood bg-white"
                  />
                  {item.link && (
                    <a
                      href={item.link.startsWith('http') ? item.link : `https://${item.link}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-brand-wood text-white rounded-lg hover:bg-brand-wood/90 transition-colors"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1">
                  Detalhes / Descrição
                </label>
                <textarea
                  value={item.description}
                  onChange={(e) => onUpdate(item.id, { description: e.target.value })}
                  placeholder="Ex: Comprar na cor branca, voltagem 110v..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood bg-white resize-none"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}