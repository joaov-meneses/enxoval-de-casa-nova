import { useState } from "react";
import {
  ArrowUpRight,
  BadgePercent,
  Check,
  ChevronDown,
  CircleCheck,
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
} from "lucide-react";
import type { EnxovalCategory, EnxovalItem } from "../types";
import { ExportMenu } from "./ExportMenu";
import { ImportItemsButton } from "./ImportItemsDialog";
import {
  activeItems,
  doneItems,
  isInactiveStatus,
  isPendingStatus,
  ITEM_STATUSES,
  ITEM_STATUS_META,
  itemSavingsCents,
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
      <button
        type="button"
        className="stat-room"
        onClick={() => onOpen(room.cat.id)}
        aria-label={`Abrir ${room.cat.name}: ${room.checked} de ${room.total} itens conquistados`}
      >
        <span className="stat-room-name">{room.cat.name}</span>
        <span className="stat-room-bar" aria-hidden="true">
          <span style={{ width: `${room.progress * 100}%` }} />
        </span>
        <b>
          {room.checked}/{room.total}
        </b>
      </button>
    </li>
  );
}

export function RoomIcon({ name, size = 18 }: { name: string; size?: number }) {
  const Icon = /cozinha/i.test(name)
    ? Coffee
    : /extra|h[óo]spede|visita/i.test(name)
      ? BedSingle
      : /quarto/i.test(name)
        ? BedDouble
        : /banheiro|lavabo/i.test(name)
          ? Bath
          : /sala/i.test(name)
            ? Sofa
            : /servi[çc]o|lavanderia/i.test(name)
              ? WashingMachine
              : /eletro/i.test(name)
                ? Microwave
                : /home\s*office|escrit[óo]rio/i.test(name)
                  ? Monitor
                  : /varanda|sacada|quintal|jardim/i.test(name)
                    ? TreePalm
                    : Package;
  return <Icon size={size} strokeWidth={1.6} />;
}

type RoomOrder = "default" | "pending" | "progress";

const ROOM_ORDERS: { id: RoomOrder; label: string }[] = [
  { id: "default", label: "Padrão" },
  { id: "pending", label: "Pendentes" },
  { id: "progress", label: "Avançados" },
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
  view,
  scope,
}: {
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
  const percentage = statsActive.length
    ? Math.round((done.length / statsActive.length) * 100)
    : 0;
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
    else meta.push(`${n} ${n === 1 ? "pendente" : "pendentes"}`);
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
  // Ambientes com itens, do mais adiantado ao mais atrasado (só faz sentido comparar com 2 ou mais).
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
      <div className="workspace-welcome">
        <div>
          <h2>
            {view === "overview"
              ? "Seu lar está ganhando forma."
              : "Pequenos detalhes. Grandes começos."}
          </h2>
          <p>
            {view === "overview"
              ? "Um olhar sobre tudo o que vocês já construíram."
              : "Organize os desejos, acompanhe as compras e aproveite o caminho."}
          </p>
        </div>
        {view === "overview" && (
          <div className="workspace-welcome-actions">
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
          </div>
        )}
      </div>
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
      {/* Telas pequenas: resumo em uma linha de leitura; os cartões completos abrem em "Detalhes". */}
      <section className="stats-compact" aria-label="Resumo em poucos números">
        <div className="stats-compact-main">
          <strong className="stats-compact-percent">
            {percentage}
            <small>%</small>
          </strong>
          <span className="stats-compact-detail">
            {done.length} de {statsActive.length}{" "}
            {statsActive.length === 1 ? "conquistado" : "conquistados"}
          </span>
          <button
            type="button"
            className="stats-compact-toggle"
            aria-expanded={statsOpen}
            aria-controls="stats-details"
            onClick={() => setStatsOpen((open) => !open)}
          >
            {statsOpen ? "Ocultar" : "Detalhes"}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="progress-track" aria-hidden="true">
          <span
            style={{
              width: `${percentage}%`,
              minWidth: done.length > 0 ? 8 : 0,
            }}
          />
        </div>
        <dl className="stats-compact-grid">
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
          <div>
            <dt>Economizou</dt>
            <dd>
              <Money cents={savedCents} />
            </dd>
          </div>
        </dl>
      </section>
      <div
        id="stats-details"
        className={`workspace-stats${statsOpen ? " is-open" : ""}`}
      >
        <article className="stat-progress">
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
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Progresso do enxoval"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentage}
          >
            <span
              style={{
                width: `${percentage}%`,
                // Com poucos itens conquistados a barra ainda precisa ser visível.
                minWidth: done.length > 0 ? 8 : 0,
              }}
            />
          </div>
          <ul className="stat-legend stat-progress-legend">
            {compareRooms ? (
              <>
                <li>
                  <i className="stat-dot stat-dot-todo" aria-hidden="true" />
                  <span>Pendentes</span>
                  <b>{pending.length}</b>
                </li>
                {statsItems.length > statsActive.length && (
                  <li>
                    <i className="stat-dot stat-dot-out" aria-hidden="true" />
                    <span>Fora da lista</span>
                    <b>{statsItems.length - statsActive.length}</b>
                  </li>
                )}
              </>
            ) : (
              statusRows.map(({ status, count }) => (
                <li key={status}>
                  <i
                    className={`stat-dot ${
                      isInactiveStatus(status)
                        ? "stat-dot-out"
                        : isPendingStatus(status)
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
                  <span className="stat-sublabel">Mais atrasado</span>
                  <ul className="stat-rooms">
                    <RoomMini room={laggardRoom} onOpen={onCategory} />
                  </ul>
                </>
              )}
            </div>
          )}
        </article>
        <article className="stat-money">
          <span className="stat-icon sand">
            <Wallet size={20} />
          </span>
          <span className="stat-label">Seu dinheiro</span>
          <dl className="stat-receipt">
            <div>
              <dt>Compras</dt>
              <dd>
                <Money cents={boughtGrossCents} />
              </dd>
            </div>
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
                ? "Nenhum item pendente."
                : planned > 0
                  ? `${pending.length} ${
                      pending.length === 1 ? "item pendente" : "itens pendentes"
                    }${unpriced > 0 ? `, ${unpriced} sem preço.` : "."}`
                  : "Sem estimativa: nenhum item pendente tem preço ainda."}
            </span>
            {unpriced > 0 && onShowUnpriced && (
              <button
                type="button"
                className="stat-link"
                onClick={onShowUnpriced}
              >
                Ver os {unpriced} {unpriced === 1 ? "item" : "itens"} sem preço
                <ArrowUpRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </article>
        <article className="stat-savings">
          <span className="stat-icon amber">
            <BadgePercent size={20} />
          </span>
          <span className="stat-label">Você economizou</span>
          <strong>
            <Money cents={savedCents} />
          </strong>
          {savedCents > 0 ? (
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
          ) : (
            <span className="stat-detail">
              Marque itens como Ganhei ou registre descontos para ver o quanto
              você economizou.
            </span>
          )}
        </article>
      </div>
      {view === "overview" && (
        <div className="overview-grid">
          <section className="overview-rooms">
            <div className="rooms-toolbar">
              <h3 className="rooms-toolbar-title">
                Ambientes
                <span className="rooms-count">{categories.length}</span>
              </h3>
              <button
                type="button"
                className="panel-add"
                onClick={onAddCategory}
              >
                <Plus size={15} strokeWidth={2.2} aria-hidden="true" /> Novo
                <span className="sr-only"> ambiente</span>
              </button>
            </div>
            {categories.length > 1 && (
              <div
                className="overview-order"
                role="group"
                aria-label="Ordenar ambientes"
              >
                {ROOM_ORDERS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={roomOrder === o.id}
                    onClick={() => setRoomOrder(o.id)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            <div className="overview-room-list">
              {orderedRooms.map((room) => (
                <button
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
                    <span className="progress-track" aria-hidden="true">
                      <span style={{ width: `${room.progress * 100}%` }} />
                    </span>
                    <span className="overview-room-meta">{room.meta}</span>
                  </span>
                  <small aria-hidden="true">
                    {room.checked}/{room.total}
                  </small>
                  <span className="sr-only">
                    {room.checked} de {room.total}{" "}
                    {room.total === 1
                      ? "item conquistado"
                      : "itens conquistados"}
                  </span>
                  <ArrowUpRight size={17} aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
