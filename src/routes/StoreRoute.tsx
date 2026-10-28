// Modo loja (Fase 11.6): na loja física, só o que falta, com letra grande, preço-alvo e medidas, para riscar rápido.
// Funciona com sinal ruim: o retrato do enxoval fica no aparelho e as compras feitas sem conexão esperam numa fila.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Search, ShoppingBag, TriangleAlert, X } from "../components/icons";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ItemCompletionDialog } from "../components/ItemCompletionDialog";
import { RoomIcon } from "../components/RoomIcon";
import { ApiError, updateItem as updateItemRequest } from "../api";
import { capture } from "../analytics";
import { cheapestOffer } from "../priceTracking";
import { itemBand } from "../planning/purchasePlan";
import {
  applyPending,
  flushChanges,
  pendingChanges,
  queueChange,
  saveStoreSnapshot,
  type QueuedChange,
  type QueuedUpdates,
} from "../storeOffline";
import type { EnxovalCategory, EnxovalItem, EnxovalSummary } from "../types";
import "./storeRoute.css";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const wholeMoney = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Compara o preço da etiqueta com a meta, o menor preço online e a faixa do perfil de gasto. */
export function worthIt(item: EnxovalItem, tagCents: number, tier: EnxovalSummary["spendingTier"]) {
  const lines: { tone: "good" | "bad" | "neutral"; text: string }[] = [];
  const target = item.priceTracking?.targetPriceCents ?? null;
  if (target) {
    lines.push(
      tagCents <= target
        ? { tone: "good", text: `Abaixo do que você planejou (meta ${money.format(target / 100)}).` }
        : { tone: "bad", text: `${money.format((tagCents - target) / 100)} acima da sua meta.` },
    );
  }
  const online = [item.priceTracking?.lowestPriceCents60d, item.priceTracking?.currentPriceCents, cheapestOffer(item)?.currentPriceCents]
    .filter((value): value is number => typeof value === "number" && value > 0);
  if (online.length) {
    const lowest = Math.min(...online);
    lines.push(
      tagCents <= lowest
        ? { tone: "good", text: `Mais barato que o menor preço online (${money.format(lowest / 100)}).` }
        : { tone: "bad", text: `${money.format((tagCents - lowest) / 100)} acima do menor preço online.` },
    );
  }
  const { band } = itemBand(item, tier);
  if (band.maxCents > 0) {
    const range = `${wholeMoney.format(band.minCents / 100)} a ${wholeMoney.format(band.maxCents / 100)}`;
    lines.push(
      tagCents < band.minCents
        ? { tone: "good", text: `Abaixo da faixa do seu perfil (${range}).` }
        : tagCents > band.maxCents
          ? { tone: "bad", text: `Acima da faixa do seu perfil (${range}).` }
          : { tone: "neutral", text: `Dentro da faixa do seu perfil (${range}).` },
    );
  }
  if (lines.length === 0 && item.priceCents) {
    lines.push(
      tagCents <= item.priceCents
        ? { tone: "good", text: `Até o preço que você anotou (${money.format(item.priceCents / 100)}).` }
        : { tone: "bad", text: `${money.format((tagCents - item.priceCents) / 100)} acima do preço que você anotou.` },
    );
  }
  return lines;
}

function WorthIt({ item, tier }: { item: EnxovalItem; tier: EnxovalSummary["spendingTier"] }) {
  const [text, setText] = useState("");
  const cents = Number(text.replace(/\D/g, "")) || 0;
  const lines = cents > 0 ? worthIt(item, cents, tier) : [];
  return (
    <div className="store-worth">
      <label className="store-worth-input">
        <span>Preço da etiqueta</span>
        <Input
          inputMode="numeric"
          placeholder="R$ 0,00"
          value={text}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").slice(0, 10);
            setText(digits ? money.format(Number(digits) / 100) : "");
          }}
        />
      </label>
      {cents > 0 && (
        <ul className="store-worth-lines" aria-live="polite">
          {lines.length === 0 ? (
            <li className="is-neutral">Ainda não há preço de referência para comparar este item.</li>
          ) : (
            lines.map((line) => (
              <li key={line.text} className={`is-${line.tone}`}>
                {line.text}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function isNetworkError(err: unknown) {
  return err instanceof ApiError ? err.status === 0 : err instanceof TypeError;
}

export default function StoreRoute({
  enxoval,
  items,
  categories,
  categoryId,
  offlineOnly = false,
  onCategory,
  onExit,
  onSaved,
  showToast,
}: {
  enxoval: EnxovalSummary;
  items: EnxovalItem[];
  categories: EnxovalCategory[];
  categoryId: string;
  /** Aberto sem conexão a partir do retrato salvo: tudo vai para a fila. */
  offlineOnly?: boolean;
  onCategory: (id: string) => void;
  onExit: () => void;
  /** Itens que o servidor devolveu (ao riscar online ou ao enviar a fila). */
  onSaved: (items: EnxovalItem[]) => void;
  showToast?: (text: string, undo?: () => Promise<void> | void) => void;
}) {
  const [query, setQuery] = useState("");
  const [online, setOnline] = useState(() => !offlineOnly && navigator.onLine);
  const [queue, setQueue] = useState<QueuedChange[]>([]);
  const [completing, setCompleting] = useState<EnxovalItem | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [offlineReady, setOfflineReady] = useState(offlineOnly);
  const [offlineCheckDone, setOfflineCheckDone] = useState(false);
  const flushing = useRef(false);

  useEffect(() => {
    capture("store_mode_opened", { offline: !online });
    // Só ao entrar no modo loja.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retrato do enxoval no aparelho, para abrir o modo loja mesmo sem conexão.
  useEffect(() => {
    if (offlineOnly) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const shell = !import.meta.env.PROD ? Promise.resolve(false) : 'serviceWorker' in navigator
      ? Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 20_000); })]) : Promise.resolve(false);
    void Promise.all([saveStoreSnapshot({ enxovalId: enxoval.id, enxoval, items, categories }), shell]).then(([snapshot, prepared]) => {
      if (alive) { setOfflineReady(snapshot && prepared); setOfflineCheckDone(true); }
    });
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [enxoval, items, categories, offlineOnly]);

  const refreshQueue = async () => setQueue(await pendingChanges(enxoval.id));

  const flush = async () => {
    if (flushing.current || offlineOnly) return;
    flushing.current = true;
    setSyncing(true);
    try {
      const pending = await pendingChanges(enxoval.id);
      if (pending.length === 0) return;
      const result = await flushChanges(enxoval.id, (itemId, updates) => updateItemRequest(itemId, updates));
      if (result.saved.length) onSaved(result.saved);
      capture("store_mode_offline_sync", { count: result.sent });
      if (result.sent) showToast?.(`${result.sent} ${result.sent === 1 ? "alteração enviada" : "alterações enviadas"} ao voltar a conexão.`);
    } finally {
      flushing.current = false;
      setSyncing(false);
      await refreshQueue();
    }
  };

  useEffect(() => {
    void refreshQueue().then(() => {
      if (navigator.onLine) void flush();
    });
    const goOnline = () => {
      setOnline(!offlineOnly);
      void flush();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enxoval.id, offlineOnly]);

  // Tela ligada enquanto o modo loja está aberto (onde o navegador permite).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let stopped = false;
    let requesting = false;
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    const request = async () => {
      if (stopped || requesting || lock || !wakeLock || document.visibilityState !== "visible") return;
      requesting = true;
      try {
        const acquired = await wakeLock.request("screen");
        if (stopped || document.visibilityState !== 'visible') await acquired.release();
        else lock = acquired;
      } catch {
        lock = null;
      } finally {
        requesting = false;
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
      else { const held = lock; lock = null; void held?.release().catch(() => undefined); }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      stopped = true;
      void lock?.release().catch(() => undefined);
    };
  }, []);

  const shown = useMemo(() => applyPending(items, queue), [items, queue]);
  const pending = shown.filter((item) => item.status === "researching");
  const roomsWithPending = categories.filter((category) => pending.some((item) => item.categoryId === category.id));
  const term = normalize(query);
  const visible = pending.filter(
    (item) =>
      (!categoryId || item.categoryId === categoryId) &&
      (!term || normalize(`${item.name} ${item.description} ${item.selectedVariation ?? ""}`).includes(term)),
  );
  const groups = categories
    .map((category) => ({ category, items: visible.filter((item) => item.categoryId === category.id) }))
    .filter((group) => group.items.length > 0);

  async function save(item: EnxovalItem, updates: QueuedUpdates) {
    if (online && !offlineOnly) {
      try {
        const saved = await updateItemRequest(item.id, updates);
        onSaved([saved]);
        return "online" as const;
      } catch (err) {
        if (!isNetworkError(err)) throw err;
        setOnline(false);
      }
    }
    const queuedUpdates = updates.status === 'bought' && !updates.purchasedAt
      ? { ...updates, purchasedAt: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) } : updates;
    if (!(await queueChange({ enxovalId: enxoval.id, itemId: item.id, updates: queuedUpdates })))
      throw new Error("Sem conexão e sem espaço no aparelho para guardar a alteração. Tente de novo quando o sinal voltar.");
    await refreshQueue();
    return "queued" as const;
  }

  async function confirm(item: EnxovalItem, paidCents: number | null, details: QueuedUpdates) {
    const updates: QueuedUpdates = {
      status: "bought",
      checked: true,
      ...(paidCents !== null ? { priceCents: paidCents, ...(item.discountCents > paidCents ? { discountCents: paidCents } : {}) } : {}),
      ...details,
    };
    const where = await save(item, updates);
    capture("store_mode_item_checked", { offline: where === "queued" });
    showToast?.(where === "queued" ? `${item.name}: guardado no aparelho, envia quando a conexão voltar.` : `Riscado da lista: ${item.name}.`, async () => {
      await save(item, { status: "researching", checked: false });
    });
  }

  return (
    <div className="store-mode">
      <header className="store-head">
        <Button variant="brand" size="brand" type="button" className="store-exit" onClick={onExit} aria-label="Sair do modo loja">
          <ArrowLeft size={20} aria-hidden="true" />
        </Button>
        <div>
          <h2>
            <ShoppingBag size={20} aria-hidden="true" /> Modo loja
          </h2>
          <p>{pending.length === 0 ? "Nada falta por aqui." : `${pending.length} ${pending.length === 1 ? "item falta" : "itens faltam"} em ${enxoval.name}`}</p>
        </div>
      </header>

      {(!online || queue.length > 0) && (
        <p className={`store-status${online ? "" : " is-offline"}`} role="status">
          {!online && <TriangleAlert size={16} aria-hidden="true" />}
          {!online ? "Sem conexão. " : ""}
          {queue.length > 0
            ? `${queue.length} ${queue.length === 1 ? "alteração aguardando" : "alterações aguardando"} conexão${syncing ? " (enviando…)" : "."}`
            : "Você pode continuar riscando: enviamos quando o sinal voltar."}
        </p>
      )}

      {import.meta.env.PROD && online && <p className="store-offline-readiness" role="status">
        {offlineReady ? 'Disponível para abrir sem conexão neste aparelho.' : offlineCheckDone
          ? 'A abertura offline não ficou disponível. Mantenha esta tela aberta ao usar sem sinal.'
          : 'Preparando para abrir sem conexão. Mantenha esta tela aberta por alguns instantes.'}
      </p>}
      <div className="store-search">
        <Search size={20} aria-hidden="true" />
        <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar item" aria-label="Buscar item no modo loja" />
        {query && (
          <Button variant="brand" size="brand" type="button" className="store-search-clear" aria-label="Limpar busca" onClick={() => setQuery("")}>
            <X size={18} aria-hidden="true" />
          </Button>
        )}
      </div>

      {roomsWithPending.length > 1 && (
        <div className="store-chips" role="group" aria-label="Filtrar por ambiente">
          <Button variant="brand" size="brand" type="button" aria-pressed={!categoryId} className="store-chip" onClick={() => onCategory("")}>
            Todos
          </Button>
          {roomsWithPending.map((category) => (
            <Button variant="brand" size="brand" key={category.id} type="button" aria-pressed={categoryId === category.id} className="store-chip" onClick={() => onCategory(category.id)}>
              {category.name}
            </Button>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <p className="store-empty">{term ? "Nenhum item com esse nome." : "Tudo deste ambiente já foi conquistado."}</p>
      ) : (
        groups.map(({ category, items: groupItems }) => (
          <section key={category.id} className="store-group" aria-label={category.name}>
            <h3>
              <RoomIcon name={category.name} size={18} /> {category.name}
            </h3>
            <ul>
              {groupItems.map((item) => {
                const target = item.priceTracking?.targetPriceCents ?? null;
                const { band } = itemBand(item, enxoval.spendingTier);
                return (
                  <li key={item.id} className="store-item">
                    <div className="store-item-body">
                      <strong>{item.name}</strong>
                      <span className="store-item-meta">
                        {item.quantity > 1 && <span>{item.quantity} un.</span>}
                        {item.selectedVariation && <span>{item.selectedVariation}</span>}
                        {target ? (
                          <span>Meta: {money.format(target / 100)}</span>
                        ) : item.priceCents ? (
                          <span>Anotado: {money.format(item.priceCents / 100)}</span>
                        ) : band.maxCents > 0 ? (
                          <span>Faixa: {wholeMoney.format(band.minCents / 100)} a {wholeMoney.format(band.maxCents / 100)}</span>
                        ) : null}
                      </span>
                      {item.description && <p className="store-item-notes">{item.description}</p>}
                      <Button
                        variant="brand"
                        size="brand"
                        type="button"
                        className="store-worth-toggle"
                        aria-expanded={open === item.id}
                        onClick={() => setOpen((current) => (current === item.id ? null : item.id))}
                      >
                        Vale a pena?
                      </Button>
                      {open === item.id && <WorthIt item={item} tier={enxoval.spendingTier} />}
                    </div>
                    <Button variant="brand" size="brand" type="button" className="store-buy" onClick={() => setCompleting(item)}>
                      Comprei
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {completing && (
        <ItemCompletionDialog
          compact
          itemName={completing.name}
          suggestedPriceCents={completing.priceCents || completing.priceTracking?.currentPriceCents || null}
          initialInstallments={completing.installments ?? 1}
          onClose={() => setCompleting(null)}
          onConfirm={(_status, paidCents, details) => confirm(completing, paidCents, details)}
        />
      )}
    </div>
  );
}
