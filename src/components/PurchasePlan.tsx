import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./ui/collapsible";
import { Badge } from "@/src/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Disclosure, DisclosureTrigger } from "@/src/components/ui/disclosure";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { Input } from "@/src/components/ui/input";
import { useId, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  ChevronDown,
  Clock3,
  MapPin,
  Plus,
  Sparkles,
  Wallet,
} from "@/src/components/icons";
import type { EnxovalCategory, EnxovalItem, EnxovalSummary } from "../types";
import {
  buildPurchasePlan,
  roomOfCategory,
  tierTotals,
  VERDICT_LABEL,
  weekRange,
  type Period,
  type PeriodSummary,
  type PlannedItem,
  type Verdict,
} from "../planning/purchasePlan";
import {
  SPENDING_TIER_INFO,
  SPENDING_TIERS,
  type Band,
  type SpendingTier,
} from "../planning/spending";
import { regionalSuggestions, ROOM_CATEGORY_NAME } from "../planning/regional";
import { weekOptions } from "../planning/weekOptions";
import { citiesOfState, cityById, TRAIT_COPY } from "../onboarding/regions";
import { STATES, stateInfo } from "../onboarding/plan";
import { ITEM_STATUS_META, netPriceCents } from "../itemStatus";
import { NinoAssistant } from "./NinoAssistant";
import { Select, type SelectOption } from "./Select";

export interface PlanningUpdates {
  moveDate?: string | null;
  spendingTier?: SpendingTier;
  state?: string | null;
  city?: string | null;
}

interface PurchasePlanViewProps {
  enxoval: EnxovalSummary;
  items: EnxovalItem[];
  categories: EnxovalCategory[];
  /** Só quem é dono do enxoval altera data, lugar e perfil de gasto. */
  canEdit: boolean;
  onUpdateEnxoval: (updates: PlanningUpdates) => Promise<void>;
  onUpdateItem: (id: string, updates: { buyWeek: number | null }) => Promise<void>;
  onAddItem: (
    name: string,
    categoryId?: string,
    categoryName?: string,
  ) => Promise<void>;
}

const wholeReais = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const dayMonth = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
});

const money = (cents: number) => wholeReais.format(cents / 100);
const range = (band: Band) =>
  band.maxCents === 0 ? "—" : `${money(band.minCents)} a ${money(band.maxCents)}`;

function periodDates(moveDate: string, period: Period) {
  if (period.id === "before") {
    return `Até ${dayMonth.format(weekRange(moveDate, -1).end)}`;
  }
  if (period.id === "later") {
    return `A partir de ${dayMonth.format(weekRange(moveDate, period.fromWeek).start)}`;
  }
  const start = weekRange(moveDate, period.fromWeek).start;
  const end = weekRange(moveDate, period.toWeek).end;
  return `${dayMonth.format(start)} a ${dayMonth.format(end)}`;
}

const VERDICT_ICON: Record<Verdict, typeof Check> = {
  empty: CircleDashed,
  no_prices: CircleDashed,
  below: ArrowDown,
  within: CircleCheck,
  above: ArrowUp,
};

const VERDICT_HELP: Record<Verdict, string> = {
  empty: "Nenhum item deste período custa dinheiro.",
  no_prices: "Informe o preço dos itens para comparar com a faixa esperada.",
  below: "Os itens com preço custam menos do que a faixa esperada para o seu perfil.",
  within: "Os itens com preço estão dentro da faixa esperada para o seu perfil.",
  above: "Os itens com preço custam mais do que a faixa esperada para o seu perfil.",
};

function Meter({
  band,
  planned,
  spent,
}: {
  band: Band;
  planned: number;
  spent: number;
}) {
  const scale = Math.max(band.maxCents, planned, spent, 1) * 1.08;
  const at = (cents: number) => `${Math.min(100, (cents / scale) * 100)}%`;
  return (
    <div
      className="pp-meter"
      role="img"
      aria-label={`Faixa de referência ${range(band)}. Previsto ${money(planned)}. Já gasto ${money(spent)}.`}
    >
      <span
        className="pp-meter-band"
        style={{
          left: at(band.minCents),
          width: `${((band.maxCents - band.minCents) / scale) * 100}%`,
        }}
      />
      <span className="pp-meter-spent" style={{ width: at(spent) }} />
      {planned > 0 && (
        <span className="pp-meter-planned" style={{ left: at(planned) }} />
      )}
    </div>
  );
}

function PlanRow({
  entry,
  moveDate,
  canPickWeek,
  busy,
  onPickWeek,
}: {
  entry: PlannedItem<EnxovalItem>;
  moveDate: string | null;
  canPickWeek: boolean;
  busy: boolean;
  onPickWeek: (id: string, week: number | null) => void;
}) {
  const { item, placement, band, bandSource, overdue } = entry;
  const realBand = bandSource === "real";
  const manual = placement.source === "manual";
  const options = useMemo(
    () => weekOptions({ moveDate, week: placement.week, manual }),
    [manual, moveDate, placement.week],
  );
  const price = netPriceCents(item);
  const done = !entry.pending;

  return (
    <li className={`pp-row${done ? " is-done" : ""}`}>
      <div className="pp-row-main">
        <strong className="pp-row-name">{item.name}</strong>
        <span className="pp-row-meta">
          {done && <> · {ITEM_STATUS_META[item.status].label}</>}
          {overdue && <b className="pp-late"> · Atrasado</b>}
        </span>
        <span className="pp-row-reason">
          {manual ? (
            <>
              <Check size={12} aria-hidden="true" /> Semana escolhida por você
            </>
          ) : (
            placement.reason
          )}
        </span>
      </div>
      <div className="pp-row-price">
        {price > 0 ? (
          <>
            <strong>{money(price)}</strong>
            {realBand && price > band.maxCents && (
              <span className="pp-row-above" title={`Outras listas costumam pagar ${money(band.minCents)} a ${money(band.maxCents)} no seu perfil de gasto`}>
                acima do comum
              </span>
            )}
          </>
        ) : realBand ? (
          <div className="pp-price-estimate" title="O que outras listas pagaram por este item, no seu perfil de gasto (só agregados, sem dados de ninguém)">
            <span className="pp-price-label">Outras listas pagam</span>
            <span className="pp-price-range"><span>{money(band.minCents)}</span><span className="pp-price-to">a</span><span>{money(band.maxCents)}</span></span>
          </div>
        ) : (
          <div className="pp-price-estimate" title="Faixa esperada para o seu perfil de gasto">
            <span className="pp-price-label">Faixa estimada</span>
            <span className="pp-price-range"><span>{money(band.minCents)}</span><span className="pp-price-to">a</span><span>{money(band.maxCents)}</span></span>
          </div>
        )}
      </div>
      <div className="pp-row-week">
        <Select
          ariaLabel={`Semana de compra de ${item.name}`}
          value={manual ? String(placement.week) : "auto"}
          options={options}
          disabled={!canPickWeek || busy}
          onChange={(value) =>
            onPickWeek(item.id, value === "auto" ? null : Number(value))
          }
        />
      </div>
    </li>
  );
}

const ROWS_COLLAPSED = 6;

function PlanRoomGroup({ name, entries, initiallyOpen, moveDate, canPickWeek, busyId, onPickWeek }: {
  name: string;
  entries: PlannedItem<EnxovalItem>[];
  initiallyOpen: boolean;
  moveDate: string | null;
  canPickWeek: boolean;
  busyId: string | null;
  onPickWeek: (id: string, week: number | null) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? entries : entries.slice(0, ROWS_COLLAPSED);
  return (
    <Disclosure className="pp-room-group" open={initiallyOpen}>
      <DisclosureTrigger>
        <span className="pp-room-name">{name}</span>
        <span className="pp-room-count">{entries.length} {entries.length === 1 ? "item" : "itens"}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </DisclosureTrigger>
      <ul className="pp-rows">
        {shown.map((entry) => <PlanRow key={entry.item.id} entry={entry}
          moveDate={moveDate} canPickWeek={canPickWeek} busy={busyId === entry.item.id}
          onPickWeek={onPickWeek} />)}
      </ul>
      {entries.length > ROWS_COLLAPSED && (
        <Button variant="brand" size="brand" type="button" className="pp-more" aria-expanded={showAll}
          onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Mostrar menos" : `Ver mais ${entries.length - ROWS_COLLAPSED} neste ambiente`}
        </Button>
      )}
    </Disclosure>
  );
}

/**
 * Uma etapa da mudança. Fechada, mostra só o essencial (nome, datas, quantos itens faltam, faixa e veredito);
 * ao tocar, abre os números e a lista de itens a resolver.
 */
function PeriodCard({
  step,
  summary,
  moveDate,
  canPickWeek,
  busyId,
  onPickWeek,
}: {
  step: number;
  summary: PeriodSummary<EnxovalItem>;
  moveDate: string | null;
  canPickWeek: boolean;
  busyId: string | null;
  onPickWeek: (id: string, week: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const baseId = useId();
  const bodyId = `${baseId}-body`;
  const { period } = summary;
  // Só o que ainda falta resolver é listado: comprados, ganhos e "já tenho" ficam de fora (mas contam nos números do período).
  const entries = summary.entries.filter((entry) => entry.pending);
  const groups = new Map<string, { name: string; entries: typeof entries }>();
  for (const entry of entries) {
    const key = entry.item.categoryId;
    const group = groups.get(key);
    if (group) group.entries.push(entry);
    else groups.set(key, { name: entry.item.category, entries: [entry] });
  }
  const verdict = summary.verdict;
  const VerdictIcon = VERDICT_ICON[verdict];

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section
        className={`pp-card pp-period${summary.current ? " is-current" : ""}${open ? " is-open" : ""}`}
        aria-labelledby={`${baseId}-title`}
      >
        <h3 id={`${baseId}-title`} className="pp-period-title">
          <CollapsibleTrigger asChild>
            <Button
              variant="brand"
              size="brand"
              type="button"
              className="pp-period-toggle"
              aria-expanded={open}
              aria-controls={bodyId}
            >
              <span
                className={`pp-step${summary.completed ? " is-done" : ""}`}
                aria-hidden="true"
              >
                {summary.completed ? (
                  <Check size={16} strokeWidth={2.6} />
                ) : (
                  step
                )}
              </span>
              <span className="pp-period-text">
                <span className="pp-period-name">
                  {period.label}
                  {summary.current && (
                    <em className="pp-now">Você está aqui</em>
                  )}
                </span>
                <span className="pp-period-sub">
                  {moveDate ? periodDates(moveDate, period) : period.hint} ·{" "}
                  {entries.length === 0
                    ? "Nada na fila"
                    : `${entries.length} ${entries.length === 1 ? "item a resolver" : "itens a resolver"}`}
                </span>
                {verdict !== "empty" && (
                  <span className="pp-period-band">
                    Faixa esperada: {range(summary.band)}
                  </span>
                )}
              </span>
              <span className="pp-badges">
                {summary.completed && (
                  <Badge asChild variant="outline">
                    <span className="pp-badge is-done">
                      <Check size={13} aria-hidden="true" /> Concluído
                    </span>
                  </Badge>
                )}
                {summary.overdueCount > 0 && (
                  <Badge asChild variant="outline">
                    <span className="pp-badge is-late">
                      <Clock3 size={13} aria-hidden="true" />{" "}
                      {summary.overdueCount}{" "}
                      {summary.overdueCount === 1 ? "atrasado" : "atrasados"}
                    </span>
                  </Badge>
                )}
                {verdict !== "empty" && (
                  <Badge asChild variant="outline">
                    <span className={`pp-badge pp-verdict is-${verdict}`}>
                      <VerdictIcon size={13} aria-hidden="true" />
                      {VERDICT_LABEL[verdict]}
                    </span>
                  </Badge>
                )}
              </span>
              <ChevronDown
                size={18}
                aria-hidden="true"
                className="pp-period-chevron"
              />
            </Button>
          </CollapsibleTrigger>
        </h3>

        <CollapsibleContent id={bodyId} className="pp-period-body">
          {verdict !== "empty" && (
            <div className="pp-figures">
              <dl>
                <div>
                  <dt>Faixa esperada</dt>
                  <dd>{range(summary.band)}</dd>
                </div>
                <div>
                  <dt>Você planejou</dt>
                  <dd>
                    {summary.plannedCents > 0
                      ? money(summary.plannedCents)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Você gastou</dt>
                  <dd>
                    {money(summary.spentCents)}
                    {summary.reached && (
                      <small>
                        <Check size={11} aria-hidden="true" /> chegou à faixa
                      </small>
                    )}
                  </dd>
                </div>
              </dl>
              <Meter
                band={summary.band}
                planned={summary.plannedCents}
                spent={summary.spentCents}
              />
              <p className="pp-figures-note">
                {VERDICT_HELP[verdict]}
                {summary.unpricedCount > 0 && verdict !== "no_prices" && (
                  <>
                    {" "}
                    {summary.unpricedCount}{" "}
                    {summary.unpricedCount === 1
                      ? "item sem preço fica"
                      : "itens sem preço ficam"}{" "}
                    fora da comparação.
                  </>
                )}
                {summary.doneCount > 0 && (
                  <>
                    {" "}
                    {summary.doneCount}{" "}
                    {summary.doneCount === 1
                      ? "item já resolvido não aparece"
                      : "itens já resolvidos não aparecem"}{" "}
                    na lista.
                  </>
                )}
              </p>
            </div>
          )}

          <div className="pp-room-groups">
            {[...groups].map(([id, group], index) => (
              <PlanRoomGroup
                key={id}
                name={group.name}
                entries={group.entries}
                initiallyOpen={index === 0}
                moveDate={moveDate}
                canPickWeek={canPickWeek}
                busyId={busyId}
                onPickWeek={onPickWeek}
              />
            ))}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

export function PurchasePlanView({
  enxoval,
  items,
  categories,
  canEdit,
  onUpdateEnxoval,
  onUpdateItem,
  onAddItem,
}: PurchasePlanViewProps) {
  const [error, setError] = useState("");
  const [tiersOpen, setTiersOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [addingName, setAddingName] = useState<string | null>(null);
  const baseId = useId();

  const plan = useMemo(
    () =>
      buildPurchasePlan(items, {
        tier: enxoval.spendingTier,
        moveDate: enxoval.moveDate,
      }),
    [items, enxoval.spendingTier, enxoval.moveDate],
  );
  const totals = useMemo(() => tierTotals(items), [items]);
  const populated = plan.periods.filter((period) => period.entries.length > 0);

  const suggestions = useMemo(
    () =>
      regionalSuggestions({
        uf: enxoval.state,
        city: enxoval.city,
        existingNames: items.map((item) => item.name),
      }),
    [enxoval.state, enxoval.city, items],
  );

  const city = cityById(enxoval.city);
  const placeName = city?.name ?? (enxoval.state ? stateInfo(enxoval.state).name : "");
  const cityOptions = useMemo<SelectOption[]>(
    () => [
      { value: "", label: "Outra cidade" },
      ...citiesOfState(enxoval.state).map((entry) => ({
        value: entry.id,
        label: entry.name,
      })),
    ],
    [enxoval.state],
  );

  async function saveEnxoval(updates: PlanningUpdates) {
    setSaving(true);
    setError("");
    try {
      await onUpdateEnxoval(updates);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível salvar a alteração.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function pickWeek(id: string, week: number | null) {
    setBusyItemId(id);
    setError("");
    try {
      await onUpdateItem(id, { buyWeek: week });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível salvar a semana.",
      );
    } finally {
      setBusyItemId(null);
    }
  }

  async function addSuggestion(name: string, room: keyof typeof ROOM_CATEGORY_NAME) {
    const existing =
      categories.find((category) => roomOfCategory(category.name) === room) ??
      (room === "quarto"
        ? categories.find((category) => /sala e quarto/i.test(category.name))
        : undefined);
    setAddingName(name);
    setError("");
    try {
      await onAddItem(
        name,
        existing?.id,
        existing ? undefined : ROOM_CATEGORY_NAME[room],
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Não foi possível adicionar o item.",
      );
    } finally {
      setAddingName(null);
    }
  }

  const hasMoveDate = Boolean(enxoval.moveDate);
  const tierInfo = SPENDING_TIER_INFO[enxoval.spendingTier];

  return (
    <div className="pp">
      <div className="workspace-welcome">
        <div>
          <h2>Quando comprar cada coisa</h2>
          <p>
            Cada item tem uma semana de compra, contada a partir da mudança. Sugerimos
            uma semana pela necessidade e pelo prazo de entrega, e você pode trocar a
            que quiser.
          </p>
        </div>
      </div>

      {error && (
        <div className="pp-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" /> {error}
        </div>
      )}

      <section className="pp-card pp-settings" aria-labelledby={`${baseId}-set`}>
        <h3 id={`${baseId}-set`}>Sua mudança</h3>
        {!canEdit && (
          <p className="pp-hint">
            Só quem criou o enxoval altera a data, o lugar e o perfil de gasto.
          </p>
        )}
        <div className="pp-fields">
          <div className="pp-field">
            <Label htmlFor={`${baseId}-date`}>
              <CalendarDays size={14} aria-hidden="true" /> Data da mudança
            </Label>
            <div className="pp-date">
              <Input
                id={`${baseId}-date`}
                type="date"
                value={enxoval.moveDate ?? ""}
                disabled={!canEdit || saving}
                onChange={(event) =>
                  void saveEnxoval({ moveDate: event.target.value || null })
                }
              />
              {hasMoveDate && canEdit && (
                <Button variant="brand" size="brand"
                  type="button"
                  className="pp-link"
                  disabled={saving}
                  onClick={() => void saveEnxoval({ moveDate: null })}
                >
                  Ainda não sei
                </Button>
              )}
            </div>
            {!hasMoveDate && (
              <small>Sem a data, mostramos as semanas, mas não os dias nem os atrasos.</small>
            )}
          </div>
          <div className="pp-field">
            <Label htmlFor={`${baseId}-state`}>
              <MapPin size={14} aria-hidden="true" /> Estado
            </Label>
            <Select
              id={`${baseId}-state`}
              value={enxoval.state ?? ""}
              disabled={!canEdit || saving}
              options={[
                ...(enxoval.state ? [] : [{ value: "", label: "Escolha o estado" }]),
                ...STATES.map((state) => ({ value: state.uf, label: state.name })),
              ]}
              onChange={(uf) => uf && void saveEnxoval({ state: uf })}
            />
          </div>
          <div className="pp-field">
            <Label htmlFor={`${baseId}-city`}>Cidade</Label>
            <Select
              id={`${baseId}-city`}
              value={enxoval.city ?? ""}
              disabled={!canEdit || saving || !enxoval.state}
              options={cityOptions}
              onChange={(value) => void saveEnxoval({ city: value || null })}
            />
          </div>
        </div>
        {city && city.traits.length > 0 && (
          <p className="pp-city-note">
            <MapPin size={13} aria-hidden="true" />
            <span>
              {city.name}: {city.traits.map((trait) => TRAIT_COPY[trait]).join("; ")}.
            </span>
          </p>
        )}

        <fieldset
          className={`pp-tiers${tiersOpen ? " is-open" : ""}`}
          disabled={!canEdit || saving}
        >
          <legend>Perfil de gasto</legend>
          {/* Só no celular: mostra o perfil escolhido e abre a lista ao tocar. No desktop a lista fica sempre à vista. */}
          <Button variant="brand" size="brand"
            type="button"
            className="pp-tier-toggle"
            aria-expanded={tiersOpen}
            aria-controls={`${baseId}-tier-grid`}
            onClick={() => setTiersOpen((open) => !open)}
          >
            <span>
              <strong>{tierInfo.label}</strong>
              <small>
                {tierInfo.tagline} · {range(totals[enxoval.spendingTier])}
              </small>
            </span>
            <ChevronDown size={18} aria-hidden="true" />
          </Button>
          <p className="pp-hint pp-tier-intro">
            Define a faixa de referência de cada item e de cada período. São valores
            de referência para orientar, não preços de loja: o preço de cada item é
            sempre o que você informa.
          </p>
          <RadioGroup value={enxoval.spendingTier} onValueChange={value => { setTiersOpen(false); void saveEnxoval({ spendingTier: value as SpendingTier }); }} aria-label="Faixa de gastos" className="pp-tier-grid" id={`${baseId}-tier-grid`}>
            {SPENDING_TIERS.map((tier) => {
              const info = SPENDING_TIER_INFO[tier];
              return (
                <Label
                  key={tier}
                  htmlFor={`${baseId}-tier-${tier}`}
                  className={`pp-tier${enxoval.spendingTier === tier ? " is-selected" : ""}`}
                >
                  <RadioGroupItem id={`${baseId}-tier-${tier}`} value={tier} className="choice-control" />
                  <strong>{info.label}</strong>
                  <span>{info.tagline}</span>
                  <small>{range(totals[tier])}</small>
                </Label>
              );
            })}
          </RadioGroup>
          <p className="pp-hint">{tierInfo.detail}</p>
        </fieldset>
      </section>

      <section className="pp-summary" aria-label="Resumo do planejamento">
        <div className="is-band">
          <span>
            <Wallet size={14} aria-hidden="true" /> Faixa esperada
          </span>
          <strong>{range(plan.totals.band)}</strong>
          <small>Perfil {tierInfo.label}, para o enxoval todo</small>
        </div>
        <div className="is-planned">
          <span>Você planejou</span>
          <strong>
            {plan.totals.plannedCents > 0 ? money(plan.totals.plannedCents) : "—"}
          </strong>
          <small>
            {plan.totals.unpricedCount > 0
              ? `${plan.totals.unpricedCount} ${plan.totals.unpricedCount === 1 ? "item ainda sem preço" : "itens ainda sem preço"}`
              : "Todos os itens têm preço"}
          </small>
        </div>
        <div className="is-spent">
          <span>Você gastou</span>
          <strong>{money(plan.totals.spentCents)}</strong>
          <small>
            {plan.totals.overdueCount > 0
              ? `${plan.totals.overdueCount} ${plan.totals.overdueCount === 1 ? "item atrasado" : "itens atrasados"}`
              : hasMoveDate
                ? "Nada atrasado"
                : "Informe a data para ver atrasos"}
          </small>
        </div>
      </section>

      <NinoAssistant
        enxovalId={enxoval.id}
        categories={categories}
        items={items}
        onAddItem={onAddItem}
      />

      {populated.length === 0 ? (
        <p className="pp-empty">
          Quando houver itens no enxoval, eles aparecem aqui, organizados por período.
        </p>
      ) : (
        <>
          <div className="pp-section-head">
            <h3>Etapas da compra</h3>
            <p>Toque em uma etapa para ver os itens e escolher a semana de cada um.</p>
          </div>
          {populated.map((summary, index) => (
          <PeriodCard
            step={index + 1}
            key={summary.period.id}
            summary={summary}
            moveDate={enxoval.moveDate}
            canPickWeek
            busyId={busyItemId}
            onPickWeek={(id, week) => void pickWeek(id, week)}
          />
          ))}
        </>
      )}

      {enxoval.state && suggestions.length > 0 && (
        <Disclosure className="pp-card pp-suggestions">
          <DisclosureTrigger>
            <Sparkles size={16} aria-hidden="true" />
            <span>
              {suggestions.length}{" "}
              {suggestions.length === 1 ? "sugestão" : "sugestões"} para quem mora em{" "}
              {placeName}
            </span>
            <ChevronDown size={16} aria-hidden="true" />
          </DisclosureTrigger>
          <p className="pp-hint">
            Itens que o catálogo recomenda pelo lugar, e que ainda não estão na sua
            lista.
            {!city && " Escolha a cidade acima para ver também as sugestões por clima local."}
          </p>
          <ul className="pp-suggest-list">
            {suggestions.map((suggestion) => (
              <li key={suggestion.name}>
                <div>
                  <strong>{suggestion.name}</strong>
                  <span>
                    {ROOM_CATEGORY_NAME[suggestion.room]}
                    {suggestion.note && <> · {suggestion.note}</>}
                  </span>
                </div>
                <Button variant="brand" size="brand"
                  type="button"
                  className="button button-outline button-small"
                  disabled={addingName !== null}
                  onClick={() => void addSuggestion(suggestion.name, suggestion.room)}
                >
                  <Plus size={14} aria-hidden="true" />
                  {addingName === suggestion.name ? "Adicionando…" : "Adicionar"}
                </Button>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      <Disclosure className="pp-how">
        <DisclosureTrigger>
          <span className="pp-how-icon" aria-hidden="true">
            <CircleHelp size={20} />
          </span>
          <span className="pp-how-text">
            <strong>Como a semana é sugerida?</strong>
            <small>Toque para entender a lógica das datas</small>
          </span>
          <ChevronDown size={18} aria-hidden="true" className="pp-how-chevron" />
        </DisclosureTrigger>
        <ul>
          <li>
            <b>Primeira noite:</b> cama, colchão, toalhas e o que não dá para ficar sem
            ficam na semana anterior à mudança.
          </li>
          <li>
            <b>Compras grandes e essenciais</b> (geladeira, fogão, sofá) vêm cerca de 8
            semanas antes, porque entrega e montagem levam tempo; as de valor médio,
            cerca de 5.
          </li>
          <li>
            <b>Essenciais pequenos</b> entram perto da mudança. O que evita problema
            logo no começo (como antimofo em clima úmido) vai para a primeira semana.
          </li>
          <li>
            <b>Opcionais</b> só começam depois da 4ª semana e são distribuídos ao longo
            de cerca de 16 semanas, para o gasto não pesar de uma vez. Primeiro o que se
            usa todo dia; varanda e quarto extra por último.
          </li>
          <li>
            Escolher uma semana à mão vale mais que a sugestão e não é mexida quando você
            compra ou informa preços.
          </li>
        </ul>
      </Disclosure>
    </div>
  );
}
