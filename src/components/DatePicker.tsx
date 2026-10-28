import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { CalendarDays, ChevronLeft, ChevronRight } from './icons';
import './datePicker.css';

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const toIso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const fromIso = (value: string) => { const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day); };
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const addMonths = (date: Date, months: number) => {
  const last = new Date(date.getFullYear(), date.getMonth() + months + 1, 0).getDate();
  return new Date(date.getFullYear(), date.getMonth() + months, Math.min(date.getDate(), last));
};
const startOfToday = () => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate()); };

/** Campo de data com calendário próprio: o seletor nativo do navegador não aceita o estilo do Casa Mia. */
export function DatePicker({ value, onChange, placeholder = 'Escolher uma data', disablePast = false }: {
  value: string | null; onChange: (value: string | null) => void; placeholder?: string; disablePast?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(() => value ? fromIso(value) : startOfToday());
  const [month, setMonth] = useState(() => new Date(focused.getFullYear(), focused.getMonth(), 1));
  const grid = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);
  const today = startOfToday();
  const selected = value ? fromIso(value) : null;

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${toIso(focused)}"]`)?.focus();
  }, [focused, month, open]);

  function openChange(next: boolean) {
    if (next) {
      const start = selected ?? today;
      setFocused(start); setMonth(new Date(start.getFullYear(), start.getMonth(), 1));
      moveFocus.current = true;
    }
    setOpen(next);
  }
  function goTo(date: Date) {
    setFocused(date);
    if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    moveFocus.current = true;
  }
  function pick(date: Date | null) {
    onChange(date ? toIso(date) : null);
    setOpen(false);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focused, -1), ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7), ArrowDown: () => addDays(focused, 7),
      Home: () => addDays(focused, -focused.getDay()), End: () => addDays(focused, 6 - focused.getDay()),
      PageUp: () => addMonths(focused, -1), PageDown: () => addMonths(focused, 1),
    };
    if (!moves[event.key]) return;
    event.preventDefault();
    goTo(moves[event.key]());
  }

  const first = addDays(month, -month.getDay());
  const days = Array.from({ length: 42 }, (_, index) => addDays(first, index));
  const monthLabel = month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const isPast = (date: Date) => disablePast && date < today;

  return <Popover open={open} onOpenChange={openChange}>
    <PopoverTrigger asChild>
      <button type="button" className="date-picker-trigger" data-empty={!value || undefined}>
        <CalendarDays size={18} aria-hidden="true" />
        <span>{selected ? selected.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : placeholder}</span>
      </button>
    </PopoverTrigger>
    <PopoverContent className="date-picker-pop" align="start" sideOffset={8} onOpenAutoFocus={event => { event.preventDefault(); grid.current?.querySelector<HTMLButtonElement>(`[data-day="${toIso(focused)}"]`)?.focus(); }}>
      <div className="date-picker-head">
        <button type="button" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mês anterior"><ChevronLeft size={18} /></button>
        <strong aria-live="polite">{monthLabel}</strong>
        <button type="button" onClick={() => setMonth(addMonths(month, 1))} aria-label="Próximo mês"><ChevronRight size={18} /></button>
      </div>
      <div className="date-picker-grid" ref={grid} role="group" aria-label={monthLabel} onKeyDown={onKeyDown}>
        {WEEKDAYS.map((day, index) => <span key={index} className="date-picker-weekday" aria-hidden="true">{day}</span>)}
        {days.map(date => {
          const key = toIso(date);
          const isSelected = selected !== null && key === toIso(selected);
          const outside = date.getMonth() !== month.getMonth();
          const blocked = isPast(date) && !isSelected;
          return <button key={key} type="button" data-day={key} tabIndex={key === toIso(focused) ? 0 : -1}
            className="date-picker-day" data-outside={outside || undefined} data-today={key === toIso(today) || undefined}
            aria-pressed={isSelected} aria-disabled={blocked || undefined} aria-current={key === toIso(today) ? 'date' : undefined}
            aria-label={date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            onFocus={() => setFocused(date)} onClick={() => { if (!blocked) pick(date); }}>
            {date.getDate()}
          </button>;
        })}
      </div>
      <div className="date-picker-foot">
        <button type="button" onClick={() => pick(null)} disabled={!value}>Limpar</button>
        <button type="button" onClick={() => pick(today)}>Hoje</button>
      </div>
    </PopoverContent>
  </Popover>;
}
