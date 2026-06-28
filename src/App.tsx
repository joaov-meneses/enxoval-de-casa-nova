import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Home, Sparkles, LogOut, User } from 'lucide-react';
import type { AuthUser, EnxovalCategory, EnxovalItem } from './types';
import { ApiError, createItem as createItemRequest, fetchBootstrap, login as loginRequest, logout as logoutRequest, register as registerRequest, updateItem as updateItemRequest } from './api';
import { ItemRow } from './components/ItemRow';
import { AddItemModal } from './components/AddItemModal';

type AuthMode = 'login' | 'register';

interface AuthScreenProps {
  onAuthenticated: (data: { user: AuthUser; categories: EnxovalCategory[]; items: EnxovalItem[] }) => void;
}

function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const data = mode === 'login'
        ? await loginRequest(email, password)
        : await registerRequest(name, email, password);
      onAuthenticated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-10 font-sans text-brand-dark flex items-center justify-center">
      <div className="w-full max-w-md bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-100">
          <div className="flex items-center gap-2 text-brand-wood mb-2">
            <Home size={20} />
            <span className="text-xs font-bold tracking-widest uppercase">Enxoval</span>
          </div>
          <h1 className="font-serif text-3xl font-bold text-stone-900 leading-tight">
            Enxoval de Casa Nova
          </h1>
        </div>

        <div className="grid grid-cols-2 border-b border-stone-100">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`py-3 text-sm font-semibold transition-colors ${mode === 'login' ? 'bg-brand-dark text-white' : 'text-stone-500 hover:bg-stone-50'}`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`py-3 text-sm font-semibold transition-colors ${mode === 'register' ? 'bg-brand-dark text-white' : 'text-stone-500 hover:bg-stone-50'}`}
          >
            Criar conta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Nome</label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
                placeholder="Seu nome"
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
              placeholder="voce@email.com"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
              placeholder="Mínimo de 6 caracteres"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 bg-brand-dark text-white rounded-xl font-medium text-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [items, setItems] = useState<EnxovalItem[]>([]);
  const [categories, setCategories] = useState<EnxovalCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const applyBootstrap = (data: { user: AuthUser; categories: EnxovalCategory[]; items: EnxovalItem[] }) => {
    setUser(data.user);
    setCategories(data.categories);
    setItems(data.items);
    setActiveCategoryId(current => current || data.categories[0]?.id || '');
  };

  useEffect(() => {
    let isMounted = true;

    fetchBootstrap()
      .then(data => {
        if (isMounted) applyBootstrap(data);
      })
      .catch(err => {
        if (!isMounted) return;
        if (err instanceof ApiError && err.status === 401) {
          setUser(null);
          return;
        }
        setError(err instanceof Error ? err.message : 'Não foi possível carregar seus dados.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const activeCategory = categories.find(category => category.id === activeCategoryId) ?? categories[0];
  const filteredItems = activeCategory ? items.filter(item => item.categoryId === activeCategory.id) : [];

  const progressStats = useMemo(() => {
    const total = items.length;
    const completed = items.filter(i => i.checked).length;
    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
    return { total, completed, percentage };
  }, [items]);

  const updateItem = (id: string, updates: Partial<EnxovalItem>) => {
    setItems(current =>
      current.map(item => item.id === id ? { ...item, ...updates } : item)
    );

    const payload: Parameters<typeof updateItemRequest>[1] = {};
    if (typeof updates.name === 'string') payload.name = updates.name;
    if (typeof updates.checked === 'boolean') payload.checked = updates.checked;
    if (typeof updates.link === 'string') payload.link = updates.link;
    if (typeof updates.description === 'string') payload.description = updates.description;
    if (typeof updates.categoryId === 'string') payload.categoryId = updates.categoryId;

    if (Object.keys(payload).length === 0) return;

    void updateItemRequest(id, payload).catch(err => {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a alteração.');
    });
  };

  const addItem = async (name: string, categoryId?: string, categoryName?: string) => {
    const result = await createItemRequest({ name, categoryId, categoryName });

    setCategories(current => {
      if (current.some(category => category.id === result.category.id)) return current;
      return [...current, result.category].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    });

    setItems(current => [...current, result.item]);
    setActiveCategoryId(result.category.id);
  };

  const handleLogout = async () => {
    await logoutRequest().catch(() => undefined);
    setUser(null);
    setItems([]);
    setCategories([]);
    setActiveCategoryId('');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-50 font-sans text-brand-dark flex items-center justify-center">
        <div className="text-center">
          <Home className="w-10 h-10 text-brand-wood mx-auto mb-3" />
          <p className="text-sm text-stone-500 font-medium">Carregando lista...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={applyBootstrap} />;
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-24 font-sans text-brand-dark">
      <header className="bg-white px-6 pt-12 pb-6 shadow-sm sticky top-0 z-20">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-brand-wood mb-1">
              <Home size={20} />
              <span className="text-xs font-bold tracking-widest uppercase">Lista Completa</span>
            </div>
            <h1 className="font-serif text-3xl font-bold text-stone-900 leading-tight">
              Enxoval<br />de Casa Nova
            </h1>
            <div className="mt-3 flex items-center gap-2 text-xs text-stone-500">
              <User size={14} />
              <span className="truncate max-w-[190px]">{user.email}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="ml-1 inline-flex items-center gap-1 text-stone-500 hover:text-brand-dark transition-colors"
              >
                <LogOut size={14} />
                Sair
              </button>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center bg-stone-50 w-16 h-16 rounded-full border-4 border-brand-beige relative overflow-hidden shadow-inner shrink-0">
             <span className="text-lg font-bold text-brand-wood z-10">{progressStats.percentage}%</span>
             <div
               className="absolute bottom-0 left-0 w-full bg-brand-beige/30 transition-all duration-500 ease-in-out"
               style={{ height: `${progressStats.percentage}%` }}
             />
          </div>
        </div>

        <div className="max-w-2xl mx-auto mt-6 -mx-6 px-6 overflow-x-auto no-scrollbar">
          <div className="flex gap-2 min-w-max pb-2">
            {categories.map(cat => {
              const catItems = items.filter(i => i.categoryId === cat.id);
              const catCompleted = catItems.filter(i => i.checked).length;

              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategoryId(cat.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                    activeCategory?.id === cat.id
                      ? 'bg-brand-wood text-white shadow-md'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {cat.name}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeCategory?.id === cat.id ? 'bg-white/20' : 'bg-stone-200'}`}>
                    {catCompleted}/{catItems.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 mt-2">
        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="mb-4 flex items-center justify-between text-sm text-stone-500 font-medium px-1">
          <span>Progresso de {activeCategory?.name ?? 'categoria'}</span>
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
                Toque no botão abaixo para adicionar itens à categoria {activeCategory?.name ?? 'selecionada'}.
              </p>
            </div>
          )}
        </div>
      </main>

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
        defaultCategoryId={activeCategory?.id ?? ''}
        categories={categories}
      />
    </div>
  );
}