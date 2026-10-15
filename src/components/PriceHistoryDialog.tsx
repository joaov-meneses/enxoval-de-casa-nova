import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Flame, LoaderCircle } from "lucide-react";
import type { EnxovalItem, ItemPriceHistory } from "../types";
import { fetchItemPriceHistory } from "../api";
import { priceChange, storeLabel } from "../priceTracking";
import { Dialog } from "./Dialog";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const shortDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});
const longDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
});

const WIDTH = 320;
const HEIGHT = 150;
const PAD = { left: 10, right: 10, top: 14, bottom: 24 };

interface Point {
  time: number;
  cents: number;
}

/** Pontos do gráfico no preço que o item acompanha (normal ou Pix); pontos sem esse preço ficam de fora. */
function seriesOf(history: ItemPriceHistory): Point[] {
  return history.points.flatMap((point) => {
    const cents = history.priceBasis === "pix" ? point.pixPriceCents : point.priceCents;
    const time = Date.parse(point.date);
    return cents && Number.isFinite(time) ? [{ time, cents }] : [];
  });
}

function PriceChart({
  points,
  initialCents,
  targetCents,
}: {
  points: Point[];
  initialCents: number | null;
  targetCents: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const geometry = useMemo(() => {
    const values = [
      ...points.map((point) => point.cents),
      ...(initialCents ? [initialCents] : []),
      ...(targetCents ? [targetCents] : []),
    ];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = max - min || max * 0.1 || 1;
    const low = min - spread * 0.12;
    const high = max + spread * 0.12;
    const t0 = points[0].time;
    const span = points[points.length - 1].time - t0;
    const x = (time: number) =>
      PAD.left +
      (span === 0
        ? (WIDTH - PAD.left - PAD.right) / 2
        : ((time - t0) / span) * (WIDTH - PAD.left - PAD.right));
    const y = (cents: number) =>
      PAD.top + (1 - (cents - low) / (high - low)) * (HEIGHT - PAD.top - PAD.bottom);
    return { x, y };
  }, [points, initialCents, targetCents]);

  const { x, y } = geometry;
  const baseY = HEIGHT - PAD.bottom;
  const line = points
    .map((point, index) => `${index ? "L" : "M"}${x(point.time).toFixed(1)} ${y(point.cents).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(points[points.length - 1].time).toFixed(1)} ${baseY} L${x(points[0].time).toFixed(1)} ${baseY} Z`;
  const last = points[points.length - 1];
  const active = hover === null ? null : points[hover];

  function moveHover(clientX: number, rect: DOMRect) {
    const position = ((clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    points.forEach((point, index) => {
      if (Math.abs(x(point.time) - position) < Math.abs(x(points[nearest].time) - position))
        nearest = index;
    });
    setHover(nearest);
  }

  return (
    <div className="price-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Gráfico de preços: de ${money.format(points[0].cents / 100)} para ${money.format(last.cents / 100)} em ${points.length} registros.`}
        onPointerMove={(event) => moveHover(event.clientX, event.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}
      >
        <line className="price-chart-axis" x1={PAD.left} x2={WIDTH - PAD.right} y1={baseY} y2={baseY} />
        {initialCents ? (
          <line className="price-chart-initial" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(initialCents)} y2={y(initialCents)} />
        ) : null}
        {targetCents ? (
          <line className="price-chart-target" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(targetCents)} y2={y(targetCents)} />
        ) : null}
        {points.length > 1 ? (
          <>
            <path className="price-chart-area" d={area} />
            <path className="price-chart-line" d={line} />
          </>
        ) : null}
        {active ? (
          <line className="price-chart-cursor" x1={x(active.time)} x2={x(active.time)} y1={PAD.top} y2={baseY} />
        ) : null}
        <circle className="price-chart-dot" cx={x(last.time)} cy={y(last.cents)} r={4} />
        {active && active !== last ? (
          <circle className="price-chart-dot" cx={x(active.time)} cy={y(active.cents)} r={4} />
        ) : null}
        <text className="price-chart-tick" x={PAD.left} y={HEIGHT - 6}>
          {shortDate.format(points[0].time)}
        </text>
        {points.length > 1 ? (
          <text className="price-chart-tick" x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end">
            {shortDate.format(last.time)}
          </text>
        ) : null}
      </svg>
      {active ? (
        <div
          className="price-chart-tip"
          style={{ left: `${(x(active.time) / WIDTH) * 100}%` }}
          aria-hidden="true"
        >
          <strong>{money.format(active.cents / 100)}</strong>
          <span>{longDate.format(active.time)}</span>
        </div>
      ) : null}
      <table className="sr-only">
        <caption>Histórico de preços</caption>
        <thead>
          <tr><th>Data</th><th>Preço</th></tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.time}>
              <td>{longDate.format(point.time)}</td>
              <td>{money.format(point.cents / 100)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PriceHistoryDialog({
  item,
  isOpen,
  onClose,
}: {
  item: EnxovalItem;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<ItemPriceHistory | null>(null);
  const [error, setError] = useState("");
  const tracking = item.priceTracking;

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setHistory(null);
    setError("");
    fetchItemPriceHistory(item.id, 60)
      .then((data) => {
        if (!cancelled) setHistory(data);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Não foi possível carregar o histórico.");
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, item.id]);

  const points = history ? seriesOf(history) : [];
  const change = priceChange(tracking);
  const storeUrl = history?.url ?? tracking?.url;

  return (
    <Dialog title="Histórico de preços" isOpen={isOpen} onClose={onClose}>
      <div className="price-history">
        <p className="price-history-name">{item.name}</p>
        {tracking ? (
          <div className="price-history-summary">
            <div>
              <span className="price-history-label">Preço hoje</span>
              <strong>
                {tracking.currentPriceCents ? money.format(tracking.currentPriceCents / 100) : "—"}
              </strong>
            </div>
            <div>
              <span className="price-history-label">Quando você cadastrou</span>
              <strong>
                {tracking.initialPriceCents ? money.format(tracking.initialPriceCents / 100) : "—"}
              </strong>
            </div>
            {change && change.direction !== "same" ? (
              <div>
                <span className="price-history-label">Diferença</span>
                <strong className={change.direction === "down" ? "is-down" : "is-up"}>
                  {change.direction === "down" ? "−" : "+"}
                  {money.format(Math.abs(change.deltaCents) / 100)} ({change.percent}%)
                </strong>
              </div>
            ) : null}
          </div>
        ) : null}
        {tracking?.isLowestIn60d ? (
          <p className="price-history-lowest">
            <Flame size={14} aria-hidden="true" /> Menor preço dos últimos 60 dias
          </p>
        ) : null}

        {!history && !error ? (
          <div className="price-history-loading" role="status">
            <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> Carregando histórico...
          </div>
        ) : null}
        {error ? <p role="alert" className="form-error">{error}</p> : null}
        {history && points.length === 0 ? (
          <p className="price-history-empty">Ainda não há registros de preço para este item.</p>
        ) : null}
        {history && points.length > 0 ? (
          <>
            <PriceChart
              points={points}
              initialCents={history.initialPriceCents}
              targetCents={history.targetPriceCents}
            />
            <ul className="price-history-legend">
              <li><i className="legend-line" aria-hidden="true" /> Preço na loja</li>
              {history.initialPriceCents ? (
                <li><i className="legend-initial" aria-hidden="true" /> Preço em que você cadastrou</li>
              ) : null}
              {history.targetPriceCents ? (
                <li><i className="legend-target" aria-hidden="true" /> Preço que você quer</li>
              ) : null}
            </ul>
            {points.length === 1 ? (
              <p className="price-history-empty">
                Começamos a acompanhar agora. Voltamos a conferir o preço a cada 12 horas e o gráfico vai se completando.
              </p>
            ) : null}
          </>
        ) : null}

        {storeUrl ? (
          <a
            className="button button-dark price-history-store"
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ir para a loja{tracking ? ` (${storeLabel(tracking.domain)})` : ""}
            <ExternalLink size={15} aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </Dialog>
  );
}
