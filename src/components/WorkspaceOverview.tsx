import { currentWeek, type PurchasePlan } from '../planning/purchasePlan';
import { priceReferenceOpportunity } from '../planning/priceOpportunity';
import { RoomIcon } from "./RoomIcon";
import { Card } from "@/src/components/ui/card";
import { Progress } from "./ui/progress";
import { Button } from "@/src/components/ui/button";
import { useState } from "react";
import {
  ArrowUpRight,
  BadgePercent,
  Check,
  ChevronDown,
  CircleCheck,
  Flame,
  PiggyBank,
  Coffee,
  BedDouble,
  BedSingle,
  Bath,
  Microwave,
  Monitor,
  Sofa,
  TreePalm,
  WashingMachine,
  Package,
  Plus,
  Wallet,
} from "@/src/components/icons";
import type { EnxovalCategory, EnxovalItem } from "../types";
import {
  buyOpportunities,
  computeSavings,
  savingsEquivalent,
  storeLabel,
} from "../priceTracking";
import { ExportMenu } from "./ExportMenu";
import { ImportItemsButton } from "./ImportItemsDialog";
import { GiftsPanel, HouseDocumentsPanel } from "./HomeRecords";
import { formatMonth, monthlyFlow } from "../planning/installments";
import {
  activeItems,
  doneItems,
  isPendingStatus,
  ITEM_STATUSES,
  ITEM_STATUS_META,
  itemSavingsCents,
  netPriceCents,
  pendingItems,
  sumBought,
  sumItemDiscounts,
  sumPending,
  sumReceived,
} from "../itemStatus";

const currencyFormat = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Valor em reais com o "R$" menor, para o número ser o que se lê primeiro. O texto continua "R$ 80,00". */
function Money({ cents }: { cents: number }) {
  return (
    <span className="money">
      {currencyFormat
        .formatToParts(cents / 100)
        .map((part, index) =>
          part.type === "currency" ? (
            <small key={index}>{part.value}</small>
          ) : (
            part.value
          ),
        )}
    </span>
  );
}

interface RoomSummary {
  cat: EnxovalCategory;
  total: number;
  checked: number;
  progress: number;
}

/** Linha do resumo: ambiente, barra de progresso e quantos itens já foram conquistados. Abre o ambiente. */
function RoomMini({
  room,
  onOpen,
}: {
  room: RoomSummary;
  onOpen: (id: string) => void;
}) {
  return (
    <li>
      <Button variant="brand" size="brand"
        type="button"
        className="stat-room"
        onClick={() => onOpen(room.cat.id)}
        aria-label={`Abrir ${room.cat.name}: ${room.checked} de ${room.total} itens conquistados`}
      >
        <span className="stat-room-name">{room.cat.name}</span>
        <Progress className="stat-room-bar" value={room.progress * 100} aria-hidden="true" />
        <b>
          {room.checked}/{room.total}
        </b>
      </Button>
    </li>
  );
}


function safeStoreUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

/** Quanto os itens acompanhados já baixaram desde o cadastro e quais valem a compra hoje. */
function SavingsThermometer({
  items,
  allItems,
}: {
  items: EnxovalItem[];
  allItems: EnxovalItem[];
}) {
  const summary = computeSavings(items);
  if (summary.trackedItemsCount === 0) return null;
  const opportunities = buyOpportunities(items).slice(0, 4);
  const equivalent = savingsEquivalent(allItems, summary.totalSavingsCents);
  const savedShare = summary.totalInitialCents
    ? Math.min(100, Math.round((summary.totalSavingsCents / summary.totalInitialCents) * 100))
    : 0;
  const format = (cents: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  const hasSavings = summary.totalSavingsCents > 0;

  return (
    <section className="savings-card" aria-labelledby="savings-title">
      <div className="savings-main">
        <span className="stat-icon sage" aria-hidden="true">
          <PiggyBank size={20} />
        </span>
        <div>
          <h3 id="savings-title" className="savings-title">
            Termômetro de economia
          </h3>
          {hasSavings ? (
            <>
              <p className="savings-value">
                Economia potencial acumulada: <strong>{format(summary.totalSavingsCents)}</strong>
              </p>
              <p className="savings-note">
                {equivalent.length > 0
                  ? `Comprando agora, a economia equivale a ${equivalent.join(" e ")}. Os preços mudam, então vale conferir na loja.`
                  : `São ${summary.itemsWithDropsCount} ${summary.itemsWithDropsCount === 1 ? "item" : "itens"} mais ${summary.itemsWithDropsCount === 1 ? "barato" : "baratos"} que no dia em que você cadastrou.`}
              </p>
            </>
          ) : (
            <p className="savings-value">
              Os preços dos {summary.trackedItemsCount}{" "}
              {summary.trackedItemsCount === 1 ? "item acompanhado" : "itens acompanhados"} ainda não baixaram.
              {summary.totalIncreaseCents > 0
                ? ` Subiram ${format(summary.totalIncreaseCents)} no total.`
                : ""}
            </p>
          )}
          <div
            className="savings-meter"
            role="meter"
            aria-label="Economia em relação aos preços cadastrados"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={savedShare}
          >
            <span style={{ width: `${savedShare}%`, minWidth: hasSavings ? 6 : 0 }} />
          </div>
          <p className="savings-detail">
            {savedShare}% abaixo do cadastrado · {summary.itemsAtLowestPriceCount}{" "}
            {summary.itemsAtLowestPriceCount === 1 ? "item no menor preço" : "itens no menor preço"} dos últimos 60 dias
          </p>
        </div>
      </div>
      {opportunities.length > 0 && (
        <div className="savings-deals">
          <h4>Oportunidades de compra hoje</h4>
          <ul>
            {opportunities.map(({ item, tracking, change }) => {
              const url = safeStoreUrl(tracking.url);
              return (
                <li key={item.id}>
                  <span className="savings-deal-name">
                    {item.name}
                    <small>{storeLabel(tracking.domain)}</small>
                  </span>
                  <span className="savings-deal-price">
                    {tracking.currentPriceCents !== null && format(tracking.currentPriceCents)}
                    {change.direction === "down" && (
                      <b>
                        −{format(Math.abs(change.deltaCents))} ({change.percent}%)
                      </b>
                    )}
                    {tracking.isLowestIn60d && (
                      <b className="is-lowest">
                        <Flame size={11} aria-hidden="true" /> menor em 60 dias
                      </b>
                    )}
                  </span>
                  {url && (
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      Ver na loja
                      <ArrowUpRight size={12} aria-hidden="true" />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

type RoomOrder = "default" | "pending" | "progress";

const ROOM_ORDERS: { id: RoomOrder; label: string }[] = [
  { id: "default", label: "Minha ordem" },
  { id: "pending", label: "Mais na fila" },
  { id: "progress", label: "Mais conquistados" },
];

export function WorkspaceOverview({
  items,
  categories,
  name,
  enxovalId,
  discountCents,
  onCategory,
  onImported,
  onAddCategory,
  onShowUnpriced,
  purchasePlan, moveDate = null, onPlanning,
  view,
  scope,
}: {
  purchasePlan?: PurchasePlan<EnxovalItem> | null;
  moveDate?: string | null;
  onPlanning?: () => void;
  items: EnxovalItem[];
  categories: EnxovalCategory[];
  name: string;
  enxovalId: string;
  discountCents: number;
  onCategory: (id: string) => void;
  /** Recarrega o enxoval depois de uma importação de planilha. */
  onImported: () => void | Promise<void>;
  /** Abre o formulário de novo ambiente. */
  onAddCategory: () => void;
  /** Abre a lista só com os itens pendentes que ainda não têm preço. */
  onShowUnpriced?: () => void;
  view: "list" | "overview";
  /** Quando há um ambiente aberto, os cartões resumem só os itens dele. */
  scope?: { name: string; items: EnxovalItem[] };
}) {
  // Descontos e cashback são do enxoval inteiro: não entram na conta de um ambiente.
  const dueCount = moveDate && purchasePlan ? [...purchasePlan.byId.values()].filter(entry => entry.pending && entry.placement.week <= currentWeek(moveDate)).length : 0;
  const opportunityCount = items.filter(item => priceReferenceOpportunity(item)).length;
  const statsItems = scope ? scope.items : items;
  const statsDiscountCents = scope ? 0 : discountCents;
  const statsActive = activeItems(statsItems);
  const done = doneItems(statsItems);
  // Só o que foi comprado conta como investimento; itens ganhos entram em descontos e cashback.
  const spent = Math.max(0, sumBought(statsItems) - statsDiscountCents);
  const receivedCents = sumReceived(statsItems);
  const receivedCount = statsItems.filter(
    (i) => i.status === "received",
  ).length;
  // Desconto geral (antigo, sem item) + descontos registrados nos itens + valor cheio dos itens ganhos.
  const discountsCents = statsDiscountCents + sumItemDiscounts(statsItems);
  const savedCents = discountsCents + receivedCents;
  const boughtDiscountsCents =
    statsDiscountCents +
    sumItemDiscounts(statsItems.filter((i) => i.status === "bought"));
  // Compras antes dos descontos: a conta mostrada no cartão é compras - descontos = investido.
  const boughtGrossCents =
    sumBought(statsItems) +
    sumItemDiscounts(statsItems.filter((i) => i.status === "bought"));
  const pending = pendingItems(statsItems);
  const planned = sumPending(statsItems);
  const unpriced = pending.filter((i) => !i.priceCents).length;
  const largestPurchase = pending.reduce<EnxovalItem | undefined>(
    (largest, item) =>
      (item.priceCents ?? 0) > 0 && (!largest || netPriceCents(item) > netPriceCents(largest))
        ? item
        : largest,
    undefined,
  );
  const percentage = statsActive.length
    ? Math.round((done.length / statsActive.length) * 100)
    : 0;
  // Parcelas já assumidas (só as compras feitas: a previsão dos pendentes fica no Planejamento).
  const committedFlow = monthlyFlow(statsItems.filter((item) => item.status === "bought"), null, null);
  const money = (c: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(c / 100);

  const [roomOrder, setRoomOrder] = useState<RoomOrder>("default");
  const [statsOpen, setStatsOpen] = useState(false);
  const rooms = categories.map((cat) => {
    const all = activeItems(items.filter((i) => i.categoryId === cat.id));
    const roomPending = pendingItems(all);
    const checked = doneItems(all).length;
    const roomSpent = sumBought(all);
    const roomPlanned = sumPending(all);
    const roomUnpriced = roomPending.filter((i) => !i.priceCents).length;
    const n = roomPending.length;
    const meta: string[] = [];
    if (!all.length) meta.push("Nenhum item ainda");
    else if (!n) meta.push("Tudo conquistado");
    else if (!checked)
      meta.push(`${n} ${n === 1 ? "item" : "itens"} para começar`);
    else meta.push(`${n} na fila`);
    if (n && roomPlanned > 0) meta.push(`${money(roomPlanned)} a investir`);
    else if (!n && roomSpent > 0) meta.push(`${money(roomSpent)} investidos`);
    if (roomUnpriced > 0) meta.push(`${roomUnpriced} sem preço`);
    return {
      cat,
      total: all.length,
      checked,
      pending: n,
      progress: all.length ? checked / all.length : 0,
      done: all.length > 0 && n === 0,
      meta: meta.join(" · "),
    };
  });
  // Ambientes com itens, do mais adiantado ao com mais itens na fila (só faz sentido comparar com 2 ou mais).
  const rankedRooms = rooms
    .filter((room) => room.total > 0)
    .sort((a, b) => b.progress - a.progress || b.total - a.total);
  const compareRooms = !scope && rankedRooms.length >= 2;
  const leaderRooms = rankedRooms.slice(0, 2);
  const laggardRoom = rankedRooms.length >= 3 ? rankedRooms.at(-1) : undefined;
  // Com um ambiente aberto (ou só um ambiente), o cartão mostra a divisão por situação.
  const statusRows = ITEM_STATUSES.map((status) => ({
    status,
    count: statsItems.filter((item) => item.status === status).length,
  })).filter((row) => row.count > 0);
  const topSavings = statsItems
    .map((item) => ({ item, cents: itemSavingsCents(item) }))
    .filter((entry) => entry.cents > 0)
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 2);

  // "Comece por aqui" só aparece enquanto nada foi conquistado no enxoval inteiro.
  const startHereId =
    items.length > 0 && !items.some((i) => i.checked)
      ? rooms.find((r) => r.total > 0)?.cat.id
      : undefined;
  const orderedRooms =
    roomOrder === "default"
      ? rooms
      : [...rooms].sort((a, b) =>
          roomOrder === "pending"
            ? b.pending - a.pending
            : b.progress - a.progress || b.total - a.total,
        );
  return (
    <>
      {view === "overview" && onPlanning && items.length > 0 && <section className="pp-card purchase-next-actions">
        <h3>Suas próximas compras</h3>
        <p>{moveDate ? `${dueCount} ${dueCount === 1 ? 'item precisa' : 'itens precisam'} da sua atenção nesta semana.` : 'Defina a data da mudança para ver suas próximas compras.'}</p>
        {opportunityCount > 0 && <p>{opportunityCount} {opportunityCount === 1 ? 'item com preço abaixo da referência recente.' : 'itens com preços abaixo da referência recente.'}</p>}
        {!!purchasePlan?.budgetConflicts.length && <p>Há compras acima do seu orçamento mensal para revisar.</p>}
        <Button variant="brand" size="brand" className="button button-outline" onClick={onPlanning}>Ver planejamento</Button>
      </section>}
      {/* Na lista, o título do ambiente já orienta: a frase de boas-vindas fica só em Meu Lar. */}
      {view === "overview" && (
        <div className="workspace-welcome">
          <div>
            <h2>Seu lar está ganhando forma.</h2>
            <p>Um olhar sobre tudo o que vocês já construíram.</p>
          </div>
        </div>
      )}
      <SavingsThermometer items={statsItems} allItems={items} />
      <p className="stats-scope">
        {scope ? (
          <>
            Resumo de <strong>{scope.name}</strong>
          </>
        ) : view === "overview" ? (
          <>
            Resumo <strong>geral do enxoval</strong>
          </>
        ) : (
          <>
            Resumo <strong>de todos os ambientes</strong>
          </>
        )}
      </p>
      {/* Telas pequenas: resumo compacto com detalhes complementares sob demanda. */}
      <section className="stats-compact" data-open={statsOpen} aria-label="Resumo em poucos números">
        <div className="stats-compact-main">
          <strong className="stats-compact-percent">
            {percentage}
            <small>%</small>
          </strong>
          <span className="stats-compact-detail">
            {done.length} de {statsActive.length}{" "}
            {statsActive.length === 1 ? "conquistado" : "conquistados"}
          </span>
          <Button variant="brand" size="brand"
            type="button"
            className="stats-compact-toggle"
            aria-expanded={statsOpen}
            aria-controls="stats-mobile-details"
            onClick={() => setStatsOpen((open) => !open)}
          >
            {statsOpen ? "Ocultar" : "Detalhes"}
            <ChevronDown size={14} aria-hidden="true" />
          </Button>
        </div>
        <Progress className="progress-track" value={percentage} aria-hidden="true" />
        <dl className={`stats-compact-grid${savedCents > 0 ? "" : " is-two"}`}>
          <div>
            <dt>Já investimos</dt>
            <dd>
              <Money cents={spent} />
            </dd>
          </div>
          <div>
            <dt>Ainda a investir</dt>
            <dd>
              {pending.length === 0 ? (
                <Money cents={0} />
              ) : planned > 0 ? (
                <Money cents={planned} />
              ) : (
                "—"
              )}
            </dd>
          </div>
          {/* "Economizou R$ 0,00" só lembra o que ainda não aconteceu: a economia aparece com o primeiro valor. */}
          {savedCents > 0 && (
            <div>
              <dt>Economizou</dt>
              <dd>
                <Money cents={savedCents} />
              </dd>
            </div>
          )}
        </dl>
        <div id="stats-mobile-details" className="stats-insights-reveal" data-open={statsOpen} aria-hidden={!statsOpen} inert={!statsOpen}>
        <div className="stats-insights-clip"><div className="stats-insights">
          <Card asChild className="block gap-0"><article className="stats-insight">
            <span className="stats-insight-label">Preços a pesquisar</span>
            <strong>{unpriced}<small> de {pending.length} na fila</small></strong>
            <p>{unpriced > 0
              ? "Complete os preços para saber quanto falta investir."
              : pending.length > 0
                ? "Todos os itens na fila já têm preço informado."
                : "Nada na fila por aqui."}</p>
            {unpriced > 0 && onShowUnpriced && (
              <Button variant="brand" size="brand" type="button" className="stat-link" onClick={onShowUnpriced}>
                Revisar preços <ArrowUpRight size={14} aria-hidden="true" />
              </Button>
            )}
          </article></Card>
          <Card asChild className="block gap-0"><article className="stats-insight">
            <span className="stats-insight-label">Maior compra prevista</span>
            {largestPurchase ? <>
              <strong><Money cents={netPriceCents(largestPurchase)} /></strong>
              <p className="stats-insight-name">{largestPurchase.name}</p>
              <p>O maior valor entre as compras que faltam.</p>
            </> : <>
              <strong>—</strong>
              <p>{pending.length > 0
                ? "Informe os preços para identificar a compra de maior valor."
                : "Tudo conquistado. Nenhuma compra para planejar."}</p>
            </>}
          </article></Card>
        </div></div>
        </div>
      </section>
      <div
        id="stats-details"
        className={`workspace-stats${savedCents > 0 ? "" : " is-without-savings"}`}
      >
        <Card asChild className="block gap-0"><article className="stat-progress">
          <span className="stat-icon sage">
            <CircleCheck size={20} />
          </span>
          <span className="stat-label">Seu progresso</span>
          <strong>
            {percentage}
            <small>%</small>
          </strong>
          <span className="stat-detail">
            {done.length} de {statsActive.length}{" "}
            {statsActive.length === 1
              ? "item conquistado"
              : "itens conquistados"}
          </span>
          <Progress className="progress-track" value={percentage} aria-label="Progresso do enxoval" />
          <ul className="stat-legend stat-progress-legend">
            {compareRooms ? (
              <>
                <li>
                  <i className="stat-dot stat-dot-todo" aria-hidden="true" />
                  <span>Na fila</span>
                  <b>{pending.length}</b>
                </li>
              </>
            ) : (
              statusRows.map(({ status, count }) => (
                <li key={status}>
                  <i
                    className={`stat-dot ${
                      isPendingStatus(status)
                          ? "stat-dot-todo"
                          : "stat-dot-done"
                    }`}
                    aria-hidden="true"
                  />
                  <span>{ITEM_STATUS_META[status].label}</span>
                  <b>{count}</b>
                </li>
              ))
            )}
          </ul>
          {compareRooms && (
            <div className="stat-extra">
              <span className="stat-sublabel">Mais adiantados</span>
              <ul className="stat-rooms">
                {leaderRooms.map((room) => (
                  <RoomMini key={room.cat.id} room={room} onOpen={onCategory} />
                ))}
              </ul>
              {laggardRoom && (
                <>
                  <span className="stat-sublabel">Com mais itens na fila</span>
                  <ul className="stat-rooms">
                    <RoomMini room={laggardRoom} onOpen={onCategory} />
                  </ul>
                </>
              )}
            </div>
          )}
        </article></Card>
        <Card asChild className="block gap-0"><article className="stat-money">
          <span className="stat-icon sand">
            <Wallet size={20} />
          </span>
          <span className="stat-label">Seu dinheiro</span>
          <dl className="stat-receipt">
            {/* Sem desconto, "Compras" repetiria o valor de "Já investimos": a conta só aparece quando há o que subtrair. */}
            {boughtDiscountsCents > 0 && (
              <div>
                <dt>Compras</dt>
                <dd>
                  <Money cents={boughtGrossCents} />
                </dd>
              </div>
            )}
            {boughtDiscountsCents > 0 && (
              <div>
                <dt>Descontos e cashback</dt>
                <dd>
                  − <Money cents={boughtDiscountsCents} />
                </dd>
              </div>
            )}
            <div className="stat-receipt-total">
              <dt>Já investimos</dt>
              <dd>
                <Money cents={spent} />
              </dd>
            </div>
          </dl>
          <div className="stat-next">
            <span className="stat-next-label">Ainda a investir</span>
            <strong>
              {pending.length === 0 ? (
                <Money cents={0} />
              ) : planned > 0 ? (
                <Money cents={planned} />
              ) : (
                "—"
              )}
            </strong>
            <span className="stat-detail">
              {pending.length === 0
                ? "Nenhum item na fila."
                : planned > 0
                  ? `${pending.length} ${
                      pending.length === 1 ? "item na fila" : "itens na fila"
                    }${unpriced > 0 ? `, ${unpriced} sem preço.` : "."}`
                  : "Sem estimativa: nenhum item na fila tem preço ainda."}
            </span>
            {committedFlow.committedNext3Cents > 0 && (
              <span className="stat-detail stat-installments">
                Comprometido nos próximos 3 meses: <b><Money cents={committedFlow.committedNext3Cents} /></b>
                {committedFlow.lastInstallmentMonth && <> · Última parcela: {formatMonth(committedFlow.lastInstallmentMonth)}</>}
              </span>
            )}
            {unpriced > 0 && onShowUnpriced && (
              <Button variant="brand" size="brand"
                type="button"
                className="stat-link"
                onClick={onShowUnpriced}
              >
                Ver os {unpriced} {unpriced === 1 ? "item" : "itens"} sem preço
                <ArrowUpRight size={14} aria-hidden="true" />
              </Button>
            )}
          </div>
        </article></Card>
{savedCents > 0 && (
                <Card asChild className="block gap-0"><article className="stat-savings">
          <span className="stat-icon amber">
            <BadgePercent size={20} />
          </span>
          <span className="stat-label">Você economizou</span>
          <strong>
            <Money cents={savedCents} />
          </strong>
          <>
              <div
                className="stat-split"
                role="img"
                aria-label={`Descontos e cashback ${money(discountsCents)} e itens ganhos ${money(receivedCents)}`}
              >
                {discountsCents > 0 && (
                  <span
                    className="stat-split-discount"
                    style={{ flexGrow: discountsCents }}
                  />
                )}
                {receivedCents > 0 && (
                  <span
                    className="stat-split-gift"
                    style={{ flexGrow: receivedCents }}
                  />
                )}
              </div>
              <ul className="stat-legend">
                {discountsCents > 0 && (
                  <li>
                    <i
                      className="stat-dot stat-dot-discount"
                      aria-hidden="true"
                    />
                    <span>Descontos e cashback</span>
                    <b>
                      <Money cents={discountsCents} />
                    </b>
                  </li>
                )}
                {receivedCents > 0 && (
                  <li>
                    <i className="stat-dot stat-dot-gift" aria-hidden="true" />
                    <span>
                      {receivedCount}{" "}
                      {receivedCount === 1 ? "item ganho" : "itens ganhos"}
                    </span>
                    <b>
                      <Money cents={receivedCents} />
                    </b>
                  </li>
                )}
              </ul>
              {topSavings.length > 0 && (
                <div className="stat-extra">
                  <span className="stat-sublabel">Maiores economias</span>
                  <ul className="stat-top">
                    {topSavings.map(({ item, cents }) => (
                      <li key={item.id}>
                        <span className="stat-top-name" title={item.name}>
                          {item.name}
                        </span>
                        <span className="stat-top-kind">
                          {item.status === "received" ? "ganho" : "desconto"}
                        </span>
                        <b>
                          <Money cents={cents} />
                        </b>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </>
        </article></Card>
        )}
      </div>
      {view === "overview" && (
        <div className="overview-grid">
          <section className="overview-rooms">
            <div className="rooms-toolbar">
              <h3 className="rooms-toolbar-title">
                Ambientes{" "}
                <span className="rooms-count">{categories.length}</span>
              </h3>
              <div className="rooms-toolbar-actions">
                <ImportItemsButton
                  enxovalId={enxovalId}
                  items={items}
                  categories={categories}
                  onImported={onImported}
                />
                <ExportMenu
                  categories={categories}
                  items={items}
                  enxovalName={name}
                />
                <Button variant="brand" size="brand"
                  type="button"
                  className="panel-add"
                  onClick={onAddCategory}
                >
                    <Plus size={17} strokeWidth={2.2} aria-hidden="true" /> Novo ambiente
                </Button>
              </div>
            </div>
            {categories.length > 1 && (
              <div
                className="overview-order"
                role="group"
                aria-label="Ordenar ambientes"
              >
                {ROOM_ORDERS.map((o) => (
                  <Button variant="brand" size="brand"
                    key={o.id}
                    type="button"
                    aria-pressed={roomOrder === o.id}
                    onClick={() => setRoomOrder(o.id)}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
            )}
            <div className="overview-room-list">
              {orderedRooms.map((room) => (
                <Button variant="brand" size="brand"
                  key={room.cat.id}
                  className={`overview-room${room.done ? " is-done" : ""}`}
                  onClick={() => onCategory(room.cat.id)}
                >
                  <span className="feature-icon">
                    <RoomIcon name={room.cat.name} />
                  </span>
                  <span className="overview-room-body">
                    <strong>
                      {room.cat.name}
                      {room.cat.id === startHereId && (
                        <em className="overview-start">Comece por aqui</em>
                      )}
                    </strong>
                    <Progress className="progress-track" value={room.progress * 100} aria-hidden="true" />
                    <span className="overview-room-meta">{room.meta}</span>
                  </span>
                  {/* Ambiente vazio: "Nenhum item ainda" já está na linha; "0/0" não diria nada. */}
                  {room.total > 0 && (
                    <>
                      <small aria-hidden="true">
                        {room.checked}/{room.total}
                      </small>
                      <span className="sr-only">
                        {room.checked} de {room.total}{" "}
                        {room.total === 1
                          ? "item conquistado"
                          : "itens conquistados"}
                      </span>
                    </>
                  )}
                  <ArrowUpRight size={17} aria-hidden="true" />
                </Button>
              ))}
            </div>
          </section>
          <GiftsPanel items={items} enxovalName={name} />
          <HouseDocumentsPanel enxovalId={enxovalId} items={items} categories={categories} />
        </div>
      )}
    </>
  );
}
