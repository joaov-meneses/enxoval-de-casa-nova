// "Parcelas por mês" no Planejamento (Fase 11.1): quanto da renda de cada mês já está comprometido com parcelas,
// mais a previsão dos itens pendentes pela semana de compra, contra o teto mensal que o casal escolher.
import type React from "react";
import { useEffect, useId, useMemo, useState } from "react";
import { CreditCard, TriangleAlert } from "@/src/components/icons";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { formatMonth, monthlyFlow, type FlowMonth } from "../planning/installments";
import type { PurchasePlan } from "../planning/purchasePlan";
import type { EnxovalItem, EnxovalSummary } from "../types";
import "./installmentsPlan.css";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const wholeMoney = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/**
 * Escala das colunas: raiz do valor (potência 0,6) com piso. Em escala linear, um mês de R$ 240 ao lado de um de R$ 5,8 mil
 * vira um risco e o outro uma torre; assim a diferença continua visível sem ficar discrepante. Os valores seguem escritos.
 */
export function barRatio(cents: number, max: number) {
  if (cents <= 0 || max <= 0) return 0;
  return Math.min(1, Math.max(0.14, Math.pow(cents / max, 0.6)));
}

function MonthBar({ month, max, budget }: { month: FlowMonth; max: number; budget: number | null }) {
  const total = month.committedCents + month.forecastCents;
  const over = budget !== null && total > budget;
  // A coluna inteira usa a escala; o trecho assumido ocupa a parte proporcional dela.
  const column = barRatio(total, max);
  const height = (cents: number) => `calc(var(--flow-plot) * ${total > 0 ? (column * cents) / total : 0})`;
  const label = `${formatMonth(month.month)}: ${money.format(month.committedCents / 100)} em parcelas assumidas${
    month.forecastCents ? ` e ${money.format(month.forecastCents / 100)} previstos` : ""
  }${over ? ", acima do teto" : ""}`;
  return (
    <li className={`flow-month${over ? " is-over" : ""}`}>
      <button type="button" className="flow-bar-hit" aria-label={label}>
        <span className="flow-bar" aria-hidden="true">
          <span className="flow-bar-value">{total > 0 ? `R$ ${compact.format(total / 100)}` : ""}</span>
          {month.forecastCents > 0 && <span className="flow-seg is-forecast" style={{ height: height(month.forecastCents) }} />}
          {month.committedCents > 0 && <span className="flow-seg is-committed" style={{ height: height(month.committedCents) }} />}
        </span>
        <span className="flow-tooltip" role="tooltip">
          <strong>{formatMonth(month.month)}</strong>
          <span>Parcelas assumidas: {money.format(month.committedCents / 100)}</span>
          {month.forecastCents > 0 && <span>Previsão: {money.format(month.forecastCents / 100)}</span>}
          {over && budget !== null && <span className="flow-tooltip-over">{money.format((total - budget) / 100)} acima do teto</span>}
        </span>
      </button>
      <span className="flow-month-label" aria-hidden="true">
        {over && <TriangleAlert size={11} aria-hidden="true" />}
        {formatMonth(month.month).replace("/20", "/")}
      </span>
    </li>
  );
}

export function InstallmentsPlan({
  enxoval,
  items,
  plan,
  canEdit,
  onSaveBudget,
}: {
  enxoval: EnxovalSummary;
  items: EnxovalItem[];
  plan: PurchasePlan<EnxovalItem>;
  canEdit: boolean;
  onSaveBudget: (cents: number | null) => Promise<void>;
}) {
  const flow = useMemo(() => monthlyFlow(items, plan, enxoval.moveDate), [items, plan, enxoval.moveDate]);
  const budget = enxoval.monthlyBudgetCents ?? null;
  const [budgetText, setBudgetText] = useState(budget ? money.format(budget / 100) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setBudgetText(budget ? money.format(budget / 100) : ""), [budget]);
  const id = useId();
  const max = Math.max(1, budget ?? 0, ...flow.months.map((month) => month.committedCents + month.forecastCents));
  const overCount = budget === null ? 0 : flow.months.filter((month) => month.committedCents + month.forecastCents > budget).length;
  const hasInstallments = items.some((item) => (item.installments ?? 1) > 1);

  async function saveBudget() {
    const cents = Number(budgetText.replace(/\D/g, "")) || null;
    if (cents === budget) return;
    setSaving(true);
    setError("");
    try {
      await onSaveBudget(cents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o teto mensal.");
    } finally {
      setSaving(false);
    }
  }

  async function clearBudget() {
    setSaving(true); setError("");
    try { await onSaveBudget(null); setBudgetText(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível remover o orçamento."); }
    finally { setSaving(false); }
  }

  return (
    <section className="pp-card flow-card" aria-labelledby={`${id}-title`}>
      <div className="flow-head">
        <h3 id={`${id}-title`}>
          <CreditCard size={16} aria-hidden="true" /> Orçamento e compras por mês
        </h3>
        <p className="pp-hint">
          Compras à vista e parcelas já assumidas, mais a previsão dos itens que faltam. O orçamento ajuda a distribuir as compras opcionais.
        </p>
      </div>

      <dl className="flow-stats">
        <div>
          <dt>Comprometido nos próximos 3 meses</dt>
          <dd>{money.format(flow.committedNext3Cents / 100)}</dd>
        </div>
        <div>
          <dt>Última parcela</dt>
          <dd>{flow.lastInstallmentMonth ? formatMonth(flow.lastInstallmentMonth) : "—"}</dd>
        </div>
        {flow.interestCents > 0 && (
          <div>
            <dt>Juros informados</dt>
            <dd>{money.format(flow.interestCents / 100)}</dd>
          </div>
        )}
      </dl>

      <div className="flow-budget">
        <Label htmlFor={`${id}-budget`}>Quanto você pode destinar à casa por mês?</Label>
        <div className="flow-budget-row">
          <Input
            id={`${id}-budget`}
            inputMode="numeric"
            placeholder="Sem teto mensal"
            value={budgetText}
            disabled={!canEdit || saving}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, "").slice(0, 10);
              setBudgetText(digits ? money.format(Number(digits) / 100) : "");
            }}
            onBlur={() => void saveBudget()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void saveBudget();
              }
            }}
          />
          {canEdit && budget !== null && (
            <Button variant="brand" size="brand" type="button" className="pp-link" disabled={saving} onClick={() => void clearBudget()}>
              Tirar teto
            </Button>
          )}
        </div>
        <small>
          {!canEdit
            ? "Só quem criou o enxoval define o teto."
            : overCount > 0
              ? `${overCount} ${overCount === 1 ? "mês passa" : "meses passam"} do teto.`
              : enxoval.moveDate ? "O planejamento respeita este valor ao distribuir os opcionais. Itens sem preço usam estimativas." : "Informe a data da mudança para distribuir as compras pelo orçamento mensal."}
        </small>
        {error && <p className="pp-error" role="alert">{error}</p>}
      </div>

      {flow.months.length === 0 ? (
        <p className="pp-empty">
          {hasInstallments || items.some((item) => item.status === "bought")
            ? "Nenhuma parcela a partir deste mês."
            : "Ao marcar um item como comprado, informe as parcelas: elas aparecem aqui mês a mês."}
        </p>
      ) : (
        <>
          <ul className="flow-legend" aria-label="Legenda">
            <li><i className="flow-key is-committed" aria-hidden="true" /> Parcelas assumidas</li>
            <li><i className="flow-key is-forecast" aria-hidden="true" /> Previsão dos itens pendentes</li>
            {budget !== null && <li><i className="flow-key is-budget" aria-hidden="true" /> Teto de {wholeMoney.format(budget / 100)}</li>}
          </ul>
          <div className="flow-chart" role="group" aria-label="Parcelas por mês">
            {budget !== null && budget <= max && (
              <span className="flow-budget-line" style={{ "--ratio": barRatio(budget, max) } as React.CSSProperties} aria-hidden="true" />
            )}
            <ol className="flow-months">
              {flow.months.map((month) => (
                <MonthBar key={month.month} month={month} max={max} budget={budget} />
              ))}
            </ol>
          </div>
          {flow.unscheduledCount > 0 && (
            <p className="pp-hint">
              {flow.unscheduledCount} {flow.unscheduledCount === 1 ? "item pendente ficou" : "itens pendentes ficaram"} fora da previsão: informe a data da mudança para encaixá-los nos meses.
            </p>
          )}
          <details className="flow-table">
            <summary>Ver em tabela</summary>
            <table>
              <thead>
                <tr><th scope="col">Mês</th><th scope="col">Parcelas assumidas</th><th scope="col">Previsão</th><th scope="col">Total</th></tr>
              </thead>
              <tbody>
                {flow.months.map((month) => (
                  <tr key={month.month}>
                    <th scope="row">{formatMonth(month.month)}</th>
                    <td>{money.format(month.committedCents / 100)}</td>
                    <td>{money.format(month.forecastCents / 100)}</td>
                    <td>{money.format((month.committedCents + month.forecastCents) / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
