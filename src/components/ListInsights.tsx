import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import {
  CalendarClock,
  CalendarDays,
  Gift,
  LoaderCircle,
  Plus,
  Receipt,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  UserCheck,
  X,
} from "@/src/components/icons";
import {
  QUICK_FILTER_TITLE,
  type ListInsightsData,
  type QuickFilter,
  type RoomSuggestion,
} from "../listInsights";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * Atalhos logo acima da lista: o que comprar esta semana, o que baixou de preço e as compras que ainda
 * não têm valor. Cada atalho é um filtro. Com um filtro de atalho ligado, sobra só a etiqueta para desligá-lo.
 */
export function ListInsights({
  data,
  active,
  onFilter,
  onSetMoveDate,
}: {
  data: ListInsightsData;
  active: QuickFilter | null;
  onFilter: (filter: QuickFilter | null) => void;
  /** Sem data da mudança: leva ao Planejamento. Ausente para quem não pode editar o enxoval. */
  onSetMoveDate?: () => void;
}) {
  if (active) {
    return (
      <div className="list-insights" role="group" aria-label="Filtro rápido">
        <Button
          variant="brand"
          size="brand"
          type="button"
          className="list-insight is-active"
          onClick={() => onFilter(null)}
          aria-label={`Remover filtro: ${QUICK_FILTER_TITLE[active]}`}
        >
          {QUICK_FILTER_TITLE[active]}
          <X size={14} aria-hidden="true" />
        </Button>
      </div>
    );
  }

  const chips = [];
  if (data.week && data.week.count > 0) {
    const { count, totalCents, unpricedCount } = data.week;
    chips.push(
      <Button
        key="week"
        variant="brand"
        size="brand"
        type="button"
        className="list-insight is-week"
        onClick={() => onFilter("week")}
      >
        <CalendarClock size={14} aria-hidden="true" />
        <span>
          <strong>Esta semana:</strong> {plural(count, "item", "itens")}
          {totalCents > 0 && <> · ~{money.format(totalCents / 100)}</>}
          {unpricedCount > 0 && totalCents > 0 && (
            <span className="list-insight-muted"> (+{unpricedCount} sem preço)</span>
          )}
        </span>
      </Button>,
    );
  } else if (!data.week && onSetMoveDate) {
    chips.push(
      <Button
        key="move-date"
        variant="brand"
        size="brand"
        type="button"
        className="list-insight is-hint"
        onClick={onSetMoveDate}
      >
        <CalendarDays size={14} aria-hidden="true" />
        <span>Informe a data da mudança para ver o que comprar a cada semana</span>
      </Button>,
    );
  }
  if (data.dealsCount > 0) {
    chips.push(
      <Button
        key="deals"
        variant="brand"
        size="brand"
        type="button"
        className="list-insight is-deal"
        onClick={() => onFilter("deals")}
      >
        <TrendingDown size={14} aria-hidden="true" />
        <span>
          {data.dealsCount === 1 ? "1 item baixou de preço" : `${data.dealsCount} itens baixaram de preço`}
        </span>
      </Button>,
    );
  }
  if (data.boughtUnpricedCount > 0) {
    chips.push(
      <Button
        key="bought-unpriced"
        variant="brand"
        size="brand"
        type="button"
        className="list-insight is-warning"
        onClick={() => onFilter("boughtUnpriced")}
        title="Sem o valor pago, a compra não entra em Já investimos"
      >
        <Receipt size={14} aria-hidden="true" />
        <span>
          {plural(data.boughtUnpricedCount, "compra sem valor", "compras sem valor")} · registrar
        </span>
      </Button>,
    );
  }
  // Enxoval dividido: os itens que a própria pessoa ficou de comprar.
  if (data.mineCount) {
    chips.push(
      <Button key="mine" variant="brand" size="brand" type="button" className="list-insight is-mine" onClick={() => onFilter("mine")}>
        <UserCheck size={14} aria-hidden="true" />
        <span>Meus itens ({data.mineCount})</span>
      </Button>,
    );
  }
  if (data.thanksCount) {
    chips.push(
      <Button key="thanks" variant="brand" size="brand" type="button" className="list-insight is-gift" onClick={() => onFilter("thanks")}>
        <Gift size={14} aria-hidden="true" />
        <span>{plural(data.thanksCount, "agradecimento pendente", "agradecimentos pendentes")}</span>
      </Button>,
    );
  }
  if (data.warrantyCount) {
    chips.push(
      <Button key="warranty" variant="brand" size="brand" type="button" className="list-insight is-warning" onClick={() => onFilter("warranty")}>
        <ShieldCheck size={14} aria-hidden="true" />
        <span>{data.warrantyCount === 1 ? "1 garantia vence em 30 dias" : `${data.warrantyCount} garantias vencem em 30 dias`}</span>
      </Button>,
    );
  }
  if (chips.length === 0) return null;
  return (
    <div className="list-insights" role="group" aria-label="Atalhos da lista">
      {chips}
    </div>
  );
}

/**
 * Rodapé do ambiente: itens comuns do cômodo que ainda faltam na lista, para adicionar com um toque.
 * A pessoa pode esconder o bloco; ele volta ao trocar de ambiente.
 */
export function RoomSuggestions({
  roomName,
  suggestions,
  onAdd,
}: {
  roomName: string;
  suggestions: RoomSuggestion[];
  onAdd: (name: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");
  if (hidden || suggestions.length === 0) return null;

  async function add(name: string) {
    setAdding(name);
    setError("");
    try {
      await onAdd(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível adicionar o item.");
    } finally {
      setAdding(null);
    }
  }

  return (
    <section className="room-suggestions" aria-label={`Sugestões para ${roomName}`}>
      <div className="room-suggestions-head">
        <Sparkles size={16} aria-hidden="true" />
        <p>
          <strong>Quem monta {roomName.toLowerCase()} também costuma ter</strong>
          <span>Itens comuns que ainda não estão na sua lista.</span>
        </p>
        <Button
          variant="brand"
          size="brand"
          type="button"
          className="room-suggestions-close"
          onClick={() => setHidden(true)}
          aria-label="Esconder sugestões"
        >
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
      <ul>
        {suggestions.map((suggestion) => (
          <li key={suggestion.name}>
            <Button
              variant="brand"
              size="brand"
              type="button"
              className="room-suggestion"
              disabled={adding !== null}
              onClick={() => void add(suggestion.name)}
            >
              {adding === suggestion.name ? (
                <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Plus size={14} aria-hidden="true" />
              )}
              {suggestion.name}
              {suggestion.essential && <small>essencial</small>}
            </Button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="room-suggestions-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
