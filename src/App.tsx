import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Home, Sparkles, PieChart } from 'lucide-react';
import { EnxovalItem, Category } from './types';
import { defaultItems, CATEGORIES } from './data';
import { ItemRow } from './components/ItemRow';
import { AddItemModal } from './components/AddItemModal';

export default function App() {
  const [items, setItems] = useState<EnxovalItem[]>(() => {
    const saved = localStorage.getItem('enxoval_items');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return defaultItems;
      }
    }
    return defaultItems;
  });

  const [activeCategory, setActiveCategory] = useState<Category>('Cozinha');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('enxoval_items', JSON.stringify(items));
  }, [items]);

  const updateItem = (id: string, updates: Partial<EnxovalItem>) => {
    setItems(current => 
      current.map(item => item.id === id ? { ...item, ...updates } : item)
    );
  };

  const addItem = (name: string, category: Category) => {
    const newItem: EnxovalItem = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      category,
      checked: false,
      link: '',
      description: ''
    };
    setItems(current => [...current, newItem]);
    setActiveCategory(category);
  };

  const filteredItems = items.filter(item => item.category === activeCategory);
  
  // Progress calculations
  const progressStats = useMemo(() => {
    const total = items.length;
    const completed = items.filter(i => i.checked).length;
    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { total, completed, percentage };
  }, [items]);

  return (
    <div className="min-h-screen bg-stone-50 pb-24 font-sans text-brand-dark">
      {/* Header */}
      <header className="bg-white px-6 pt-12 pb-6 shadow-sm sticky top-0 z-20">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-brand-wood mb-1">
              <Home size={20} />
              <span className="text-xs font-bold tracking-widest uppercase">Lista Completa</span>
            </div>
            <h1 className="font-serif text-3xl font-bold text-stone-900 leading-tight">
              Enxoval<br />de Casa Nova
            </h1>
          </div>
          
          <div className="flex flex-col items-center justify-center bg-stone-50 w-16 h-16 rounded-full border-4 border-brand-beige relative overflow-hidden shadow-inner">
             <span className="text-lg font-bold text-brand-wood z-10">{progressStats.percentage}%</span>
             <div 
               className="absolute bottom-0 left-0 w-full bg-brand-beige/30 transition-all duration-500 ease-in-out" 
               style={{ height: `${progressStats.percentage}%` }}
             />
          </div>
        </div>
        
        {/* Category Scroll */}
        <div className="max-w-2xl mx-auto mt-6 -mx-6 px-6 overflow-x-auto no-scrollbar">
          <div className="flex gap-2 min-w-max pb-2">
            {CATEGORIES.map(cat => {
              const catItems = items.filter(i => i.category === cat);
              const catCompleted = catItems.filter(i => i.checked).length;
              
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                    activeCategory === cat
                      ? 'bg-brand-wood text-white shadow-md'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {cat}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeCategory === cat ? 'bg-white/20' : 'bg-stone-200'}`}>
                    {catCompleted}/{catItems.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto p-4 mt-2">
        <div className="mb-4 flex items-center justify-between text-sm text-stone-500 font-medium px-1">
          <span>Progresso de {activeCategory}</span>
          <span>{filteredItems.filter(i => i.checked).length} de {filteredItems.length} itens</span>
        </div>

        <div className="space-y-1">
          {filteredItems.length > 0 ? (
            filteredItems.map(item => (
              <ItemRow 
                key={item.id} 
                item={item} 
                onUpdate={updateItem} 
              />
            ))
          ) : (
            <div className="text-center py-12 px-4">
              <Sparkles className="w-12 h-12 text-stone-300 mx-auto mb-4" />
              <h3 className="text-lg font-serif text-stone-600 mb-2">Nenhum item aqui</h3>
              <p className="text-sm text-stone-400">
                Toque no botão abaixo para adicionar itens à categoria {activeCategory}.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Floating Action Button */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30">
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-brand-dark text-white rounded-full pl-4 pr-5 py-3 shadow-lg shadow-brand-dark/30 flex items-center gap-2 hover:bg-black transition-transform hover:scale-105 active:scale-95"
        >
          <div className="bg-white/20 rounded-full p-1">
            <Plus size={20} strokeWidth={2.5} />
          </div>
          <span className="font-medium">Adicionar Item</span>
        </button>
      </div>

      <AddItemModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={addItem}
        defaultCategory={activeCategory}
      />
    </div>
  );
}
