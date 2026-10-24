import { createContext, useContext, useId, useMemo, useState, type ReactNode } from 'react';
import type { EnxovalItem } from '../types';
import type { Placement } from '../planning/purchasePlan';
import { buildPurchasePlan, weekRange, weekLabel } from '../planning/purchasePlan';
import type { SpendingTier } from '../planning/spending';
import { purchaseLeadTime, type SchedulingInput } from '../planning/scheduling';
import { weekOptions } from '../planning/weekOptions';
import { Dialog } from './Dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Select } from './Select';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';

export type TimingUpdates = Pick<EnxovalItem, 'buyWeek' | 'leadTimeWeeks' | 'researchWeeks' | 'hasTemporarySolution' | 'dependsOnItemId'>;
export function purchaseDateLabel(week: number, moveDate: string | null) {
  if (!moveDate) return week === 0 ? 'Na semana da mudança' : `${weekLabel(week)} da mudança`;
  const date = weekRange(moveDate, week).end;
  return `Comprar até ${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date)}`;
}

export function PurchaseTimingFields({ item, items, value, onChange, disabled, showPlanningFields = true }: {
  item: EnxovalItem; items: EnxovalItem[]; value: SchedulingInput;
  onChange: (updates: SchedulingInput) => void; disabled?: boolean; showPlanningFields?: boolean;
}) {
  const id = useId();
  const lead = purchaseLeadTime(item);
  const candidates = useMemo(() => items.filter(candidate => {
    const seen = new Set([item.id]);
    let next: EnxovalItem | undefined = candidate;
    while (next) {
      if (seen.has(next.id)) return false;
      seen.add(next.id);
      next = items.find(entry => entry.id === next!.dependsOnItemId);
    }
    return true;
  }), [item.id, items]);
  return <div className="purchase-timing-fields">
    <div className="pp-field">
      <Label htmlFor={`${id}-delivery`}>Entrega, montagem e instalação</Label>
      <Input id={`${id}-delivery`} type="number" inputMode="numeric" min={0} max={52} step={1}
        placeholder={`${lead.delivery} semanas (estimativa)`} value={value.leadTimeWeeks ?? ''} disabled={disabled}
        onChange={event => onChange({ ...value, leadTimeWeeks: event.target.value === '' ? null : Number(event.target.value) })} />
      <small>Prazo em semanas. Em branco, usamos a estimativa do catálogo. Zero significa pronta entrega.</small>
    </div>
    {showPlanningFields && <>
      <div className="pp-field">
        <Label htmlFor={`${id}-research`}>Tempo para pesquisar e escolher</Label>
        <Input id={`${id}-research`} type="number" inputMode="numeric" min={0} max={12} step={1}
          placeholder="1 semana (sugestão)" value={value.researchWeeks ?? ''} disabled={disabled}
          onChange={event => onChange({ ...value, researchWeeks: event.target.value === '' ? null : Number(event.target.value) })} />
        <small>Quantas semanas você precisa para comparar preços e escolher o produto antes de comprar.</small>
      </div>
      <div className="pp-field purchase-timing-wide">
        <Label htmlFor={`${id}-dependency`}>Preciso definir outro item antes</Label>
        <Select id={`${id}-dependency`} ariaLabel="Item que precisa ser definido antes" value={value.dependsOnItemId ?? ''}
          options={[{ value: '', label: 'Nenhum item' }, ...candidates.map(entry => ({ value: entry.id, label: entry.name }))]}
          disabled={disabled} onChange={id => onChange({ ...value, dependsOnItemId: id || null })} />
        <small>Por exemplo: definir a cama antes do colchão para confirmar as medidas.</small>
      </div>
      <div className="purchase-timing-wide">
        <Label className="purchase-timing-check" htmlFor={`${id}-temporary`}>
          <Checkbox id={`${id}-temporary`} checked={value.hasTemporarySolution ?? false} disabled={disabled}
            onCheckedChange={checked => onChange({ ...value, hasTemporarySolution: checked === true })} />
          Já tenho uma solução temporária
        </Label>
        <p className="pp-hint">A substituição pode chegar a partir do segundo mês. Se houver um prazo específico, escolha a semana manualmente.</p>
      </div>
    </>}
  </div>;
}

const TimingContext = createContext<((item: EnxovalItem) => void) | null>(null);
export function PurchaseTimingButton({ item }: { item: EnxovalItem }) {
  const open = useContext(TimingContext);
  return open ? <Button variant="brand" size="brand" type="button" className="pp-link purchase-timing-open"
    aria-label={`Ajustar sugestão de ${item.name}`} onClick={() => open(item)}>Por que esta semana? Ajustar</Button> : null;
}

export function PurchaseTimingProvider({ children, items, moveDate, tier, monthlyBudgetCents, placements, onUpdate }: {
  children: ReactNode; items: EnxovalItem[]; moveDate: string | null;
  tier: SpendingTier; monthlyBudgetCents?: number | null;
  placements: Map<string, { placement: Placement }>; onUpdate: (id: string, updates: TimingUpdates) => Promise<void>;
}) {
  const [selected, setSelected] = useState<EnxovalItem | null>(null);
  return <TimingContext.Provider value={setSelected}>{children}
    {selected && <TimingDialog key={selected.id} item={items.find(item => item.id === selected.id) ?? selected} items={items}
      moveDate={moveDate} tier={tier} monthlyBudgetCents={monthlyBudgetCents} placement={placements.get(selected.id)?.placement} onClose={() => setSelected(null)} onUpdate={onUpdate} />}
  </TimingContext.Provider>;
}

function TimingDialog({ item, items, moveDate, tier, monthlyBudgetCents, placement, onClose, onUpdate }: {
  item: EnxovalItem; items: EnxovalItem[]; moveDate: string | null; placement?: Placement;
  tier: SpendingTier; monthlyBudgetCents?: number | null;
  onClose: () => void; onUpdate: (id: string, updates: TimingUpdates) => Promise<void>;
}) {
  const [value, setValue] = useState<SchedulingInput>({ leadTimeWeeks: item.leadTimeWeeks ?? null, researchWeeks: item.researchWeeks ?? null,
    hasTemporarySolution: item.hasTemporarySolution ?? false, dependsOnItemId: item.dependsOnItemId ?? null });
  const [week, setWeek] = useState(item.buyWeek == null ? 'auto' : String(item.buyWeek));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const preview = useMemo(() => buildPurchasePlan(items.map(entry => entry.id === item.id
    ? { ...entry, ...value, buyWeek: week === 'auto' ? null : Number(week) } : entry),
    { tier, moveDate, monthlyBudgetCents }).byId.get(item.id)?.placement ?? placement,
    [item.id, items, value, week, tier, moveDate, monthlyBudgetCents, placement]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await onUpdate(item.id, { ...value, buyWeek: week === 'auto' ? null : Number(week) }); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return <Dialog title={`Quando comprar: ${item.name}`} isOpen onClose={onClose} busy={busy} className="purchase-timing-dialog">
    <form onSubmit={save}>
      <div className="purchase-timing-body">
        <p className="pp-hint">{preview?.reason}</p>
        {preview && <p className="purchase-timing-date" aria-live="polite">{purchaseDateLabel(preview.week, moveDate)}</p>}
        <div className="pp-field"><Label>Semana de compra</Label>
          <Select ariaLabel="Semana de compra" value={week} disabled={busy}
            options={weekOptions({ moveDate, week: item.buyWeek ?? placement?.week ?? 0, manual: item.buyWeek != null })} onChange={setWeek} />
          <small>A semana escolhida por você prevalece sobre a sugestão automática.</small>
        </div>
        <PurchaseTimingFields item={item} items={items} value={value} onChange={setValue} disabled={busy} />
        {error && <p className="pp-error" role="alert">{error}</p>}
      </div>
      <div className="purchase-timing-footer">
        <Button variant="brand" size="brand" type="button" className="button button-outline" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="brand" size="brand" type="submit" className="button button-dark" disabled={busy}>{busy ? 'Salvando…' : 'Salvar planejamento'}</Button>
      </div>
    </form>
  </Dialog>;
}
