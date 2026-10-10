import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { animate, AnimatePresence, motion } from "motion/react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { parseLocalDate, toISODate } from "../../onboarding/plan";

/* ------------------------------------------------------------- animações */

export const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.08 } },
};

export const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const },
  },
};

/** Conteúdo que entra em cascata. Com movimento reduzido, aparece de uma vez. */
export function Stagger({
  children,
  className,
  reduced,
}: {
  children: ReactNode;
  className?: string;
  reduced: boolean;
}) {
  return (
    <motion.div
      className={className}
      variants={reduced ? undefined : listVariants}
      initial={reduced ? false : "hidden"}
      animate="show"
    >
      {children}
    </motion.div>
  );
}

export function CountUp({
  to,
  reduced,
  duration = 1.1,
  className,
}: {
  to: number;
  reduced: boolean;
  duration?: number;
  className?: string;
}) {
  const [value, setValue] = useState(reduced ? to : 0);
  useEffect(() => {
    if (reduced) {
      setValue(to);
      return;
    }
    const controls = animate(0, to, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setValue(Math.round(latest)),
    });
    return () => controls.stop();
  }, [to, reduced, duration]);
  return <span className={className}>{value}</span>;
}

const CONFETTI = ["#c2603f", "#e7b89a", "#5c6643", "#c9a46c", "#f1dfbf"];

export function Confetti({ reduced }: { reduced: boolean }) {
  if (reduced) return null;
  return (
    <span className="ob-confetti" aria-hidden="true">
      {Array.from({ length: 16 }, (_, i) => {
        const angle = ((i * 360) / 16 + (i % 2) * 11) * (Math.PI / 180);
        const distance = 44 + (i % 3) * 16;
        return (
          <motion.span
            key={i}
            style={{ background: CONFETTI[i % CONFETTI.length] }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
            animate={{
              x: Math.cos(angle) * distance,
              y: Math.sin(angle) * distance,
              opacity: 0,
              scale: 0.5,
              rotate: i * 40,
            }}
            transition={{ duration: 0.95, ease: "easeOut" }}
          />
        );
      })}
    </span>
  );
}

/** Círculo com ícone, no lugar das ilustrações de personagem. */
export function Ring({
  children,
  reduced,
  size = "lg",
}: {
  children: ReactNode;
  reduced: boolean;
  size?: "md" | "lg";
}) {
  return (
    <motion.div
      className={`ob-ring ob-ring-${size}`}
      initial={reduced ? false : { scale: 0.82, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 180, damping: 18 }}
      aria-hidden="true"
    >
      <span className="ob-ring-inner">{children}</span>
    </motion.div>
  );
}

/* ---------------------------------------------------------------- opções */

export interface Option<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
  icon?: ReactNode;
  /** Texto curto à direita (ex.: contagem de itens). */
  meta?: string;
  locked?: boolean;
}

export function RadioOptions<T extends string | number>({
  legend,
  name,
  value,
  options,
  onChange,
  reduced,
}: {
  legend: string;
  name: string;
  value: T | null;
  options: Option<T>[];
  onChange: (value: T) => void;
  reduced: boolean;
}) {
  return (
    <fieldset className="ob-fieldset">
      <legend className="ob-sr">{legend}</legend>
      <Stagger className="ob-options" reduced={reduced}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <motion.label
              key={String(option.value)}
              className="ob-option"
              data-selected={selected}
              variants={reduced ? undefined : itemVariants}
              whileTap={reduced ? undefined : { scale: 0.985 }}
            >
              <input
                type="radio"
                name={name}
                value={String(option.value)}
                checked={selected}
                onChange={() => onChange(option.value)}
              />
              {option.icon && <span className="ob-option-icon">{option.icon}</span>}
              <span className="ob-option-text">
                <strong>{option.label}</strong>
                {option.hint && <small>{option.hint}</small>}
              </span>
              {option.meta && <span className="ob-option-meta">{option.meta}</span>}
              <Tick selected={selected} reduced={reduced} shape="round" />
            </motion.label>
          );
        })}
      </Stagger>
    </fieldset>
  );
}

export function CheckOptions<T extends string>({
  legend,
  name,
  values,
  options,
  onToggle,
  reduced,
}: {
  legend: string;
  name: string;
  values: T[];
  options: Option<T>[];
  onToggle: (value: T) => void;
  reduced: boolean;
}) {
  return (
    <fieldset className="ob-fieldset">
      <legend className="ob-sr">{legend}</legend>
      <Stagger className="ob-options" reduced={reduced}>
        {options.map((option) => {
          const selected = values.includes(option.value);
          return (
            <motion.label
              key={option.value}
              className="ob-option"
              data-selected={selected}
              variants={reduced ? undefined : itemVariants}
              whileTap={reduced ? undefined : { scale: 0.985 }}
            >
              <input
                type="checkbox"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onToggle(option.value)}
              />
              {option.icon && <span className="ob-option-icon">{option.icon}</span>}
              <span className="ob-option-text">
                <strong>{option.label}</strong>
                {option.hint && <small>{option.hint}</small>}
              </span>
              {option.meta && <span className="ob-option-meta">{option.meta}</span>}
              <Tick selected={selected} reduced={reduced} shape="square" />
            </motion.label>
          );
        })}
      </Stagger>
    </fieldset>
  );
}

function Tick({
  selected,
  reduced,
  shape,
}: {
  selected: boolean;
  reduced: boolean;
  shape: "round" | "square";
}) {
  return (
    <span className={`ob-tick ob-tick-${shape}`} aria-hidden="true">
      <AnimatePresence initial={false}>
        {selected && (
          <motion.span
            key="check"
            className="ob-tick-check"
            initial={reduced ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            exit={reduced ? undefined : { scale: 0 }}
            transition={{ type: "spring", stiffness: 520, damping: 22 }}
          >
            <Check size={15} strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/* ---------------------------------------------------------------- roleta */

const WHEEL_ROW = 56;

export function WheelPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const initialIndex = Math.max(
    options.findIndex((o) => o.value === value),
    0,
  );
  const [active, setActive] = useState(initialIndex);
  const commitTimer = useRef<number | null>(null);
  const frame = useRef(0);
  const drag = useRef<{
    id: number;
    startY: number;
    startTop: number;
    moved: boolean;
    samples: { t: number; y: number }[];
  } | null>(null);
  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollTop = initialIndex * WHEEL_ROW;
    // Só posiciona na montagem; depois a própria roleta controla o valor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (commitTimer.current) window.clearTimeout(commitTimer.current);
      cancelAnimationFrame(frame.current);
    },
    [],
  );

  const commit = useCallback(
    (index: number) => {
      const option = options[index];
      if (option) onChange(option.value);
    },
    [onChange, options],
  );

  const scrollToIndex = useCallback(
    (index: number, smooth = true) => {
      const clamped = Math.min(Math.max(index, 0), options.length - 1);
      setActive(clamped);
      listRef.current?.scrollTo({
        top: clamped * WHEEL_ROW,
        behavior: smooth ? "smooth" : "auto",
      });
      commit(clamped);
    },
    [commit, options.length],
  );

  // Quando o valor muda por fora (ex.: localização), a roleta acompanha.
  useEffect(() => {
    const index = options.findIndex((o) => o.value === value);
    if (index >= 0 && index !== active && !drag.current) {
      setActive(index);
      listRef.current?.scrollTo({ top: index * WHEEL_ROW, behavior: "smooth" });
    }
    // Só reage ao valor recebido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Mouse: clicar e puxar. No toque, a rolagem nativa já funciona.
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const list = listRef.current;
    if (!list) return;
    drag.current = {
      id: event.pointerId,
      startY: event.clientY,
      startTop: list.scrollTop,
      moved: false,
      samples: [{ t: event.timeStamp, y: event.clientY }],
    };
    // O ponteiro só é capturado quando o arrasto começa; capturar já aqui
    // faria o navegador entregar o clique à lista e não ao item tocado.
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    const list = listRef.current;
    if (!current || !list || current.id !== event.pointerId) return;
    const delta = event.clientY - current.startY;
    if (!current.moved) {
      if (Math.abs(delta) < 4) return;
      current.moved = true;
      list.setPointerCapture(event.pointerId);
      list.style.scrollSnapType = "none";
      list.dataset.dragging = "true";
    }
    list.scrollTop = current.startTop - delta;
    current.samples.push({ t: event.timeStamp, y: event.clientY });
    if (current.samples.length > 6) current.samples.shift();
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    const list = listRef.current;
    if (!current || !list || current.id !== event.pointerId) return;
    drag.current = null;
    if (list.hasPointerCapture(event.pointerId)) {
      list.releasePointerCapture(event.pointerId);
    }
    if (!current.moved) return;

    // Inércia curta: a velocidade do fim do gesto empurra a roleta um pouco além.
    const first = current.samples[0];
    const last = current.samples[current.samples.length - 1];
    const elapsed = Math.max(last.t - first.t, 1);
    // Se a pessoa parou antes de soltar, não há impulso.
    const paused = event.timeStamp - last.t > 80;
    const velocity = paused || elapsed > 160 ? 0 : (last.y - first.y) / elapsed;
    const target = list.scrollTop - velocity * 220;
    const index = Math.min(
      Math.max(Math.round(target / WHEEL_ROW), 0),
      options.length - 1,
    );
    list.style.scrollSnapType = "";
    delete list.dataset.dragging;
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 0);
    scrollToIndex(index);
  };

  const handleScroll = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const top = listRef.current?.scrollTop ?? 0;
      const index = Math.min(
        Math.max(Math.round(top / WHEEL_ROW), 0),
        options.length - 1,
      );
      setActive(index);
      if (commitTimer.current) window.clearTimeout(commitTimer.current);
      commitTimer.current = window.setTimeout(() => commit(index), 140);
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") scrollToIndex(active + 1);
    else if (event.key === "ArrowUp") scrollToIndex(active - 1);
    else if (event.key === "Home") scrollToIndex(0);
    else if (event.key === "End") scrollToIndex(options.length - 1);
    else if (event.key.length === 1 && /\p{L}/u.test(event.key)) {
      const letter = event.key.toLowerCase();
      const from = options.findIndex(
        (o, i) => i > active && o.label.toLowerCase().startsWith(letter),
      );
      const next =
        from >= 0
          ? from
          : options.findIndex((o) => o.label.toLowerCase().startsWith(letter));
      if (next >= 0) scrollToIndex(next);
    } else return;
    event.preventDefault();
  };

  return (
    <div className="ob-wheel">
      <span className="ob-wheel-band" aria-hidden="true" />
      <div
        ref={listRef}
        className="ob-wheel-list"
        role="listbox"
        tabIndex={0}
        aria-label={label}
        aria-activedescendant={`${uid}-${options[active]?.value}`}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {options.map((option, index) => (
          <div
            key={option.value}
            id={`${uid}-${option.value}`}
            role="option"
            aria-selected={index === active}
            className="ob-wheel-item"
            onClick={() => {
              if (!suppressClick.current) scrollToIndex(index);
            }}
          >
            {option.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- calendário */

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});
const dayLabelFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatLongDate(iso: string) {
  return dayLabelFormatter.format(parseLocalDate(iso));
}

export function addMonthsISO(from: Date, months: number) {
  const target = new Date(from.getFullYear(), from.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(from.getDate(), lastDay));
  return toISODate(target);
}

export function CalendarPicker({
  value,
  onSelect,
  reduced,
}: {
  value: string | null;
  onSelect: (iso: string) => void;
  reduced: boolean;
}) {
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const initial = value ? parseLocalDate(value) : today;
  const [view, setView] = useState({
    year: initial.getFullYear(),
    month: initial.getMonth(),
  });
  const [direction, setDirection] = useState(1);

  // Quando um atalho muda a data, o calendário acompanha.
  useEffect(() => {
    if (!value) return;
    const date = parseLocalDate(value);
    setView((current) =>
      current.year === date.getFullYear() && current.month === date.getMonth()
        ? current
        : { year: date.getFullYear(), month: date.getMonth() },
    );
  }, [value]);

  const first = new Date(view.year, view.month, 1);
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const leading = first.getDay();
  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const atCurrentMonth =
    view.year === today.getFullYear() && view.month === today.getMonth();

  const shift = (delta: number) => {
    setDirection(delta);
    const next = new Date(view.year, view.month + delta, 1);
    setView({ year: next.getFullYear(), month: next.getMonth() });
  };

  const monthKey = `${view.year}-${view.month}`;

  return (
    <div className="ob-calendar">
      <div className="ob-calendar-head">
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={atCurrentMonth}
          aria-label="Mês anterior"
        >
          <ChevronLeft size={18} />
        </button>
        <strong aria-live="polite">{monthFormatter.format(first)}</strong>
        <button type="button" onClick={() => shift(1)} aria-label="Próximo mês">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="ob-calendar-week" aria-hidden="true">
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <motion.div
          key={monthKey}
          className="ob-calendar-grid"
          custom={direction}
          initial={reduced ? false : { opacity: 0, x: direction * 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduced ? undefined : { opacity: 0, x: direction * -18 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {cells.map((day, index) => {
            if (day === null) return <span key={`blank-${index}`} />;
            const date = new Date(view.year, view.month, day);
            const iso = toISODate(date);
            const selected = iso === value;
            const past = date < today;
            return (
              <button
                key={iso}
                type="button"
                className="ob-day"
                data-today={date.getTime() === today.getTime()}
                aria-pressed={selected}
                aria-label={dayLabelFormatter.format(date)}
                disabled={past}
                onClick={() => onSelect(iso)}
              >
                {selected && (
                  <motion.span
                    layoutId="ob-day-pill"
                    className="ob-day-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  />
                )}
                <span className="ob-day-number">{day}</span>
              </button>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Pizza de preenchimento usada em "Você já tem alguma coisa?". */
export function Pie({ fill }: { fill: 0 | 1 | 2 }) {
  const r = 9;
  const c = 11;
  const angle = fill === 1 ? 90 : 270;
  const rad = (angle * Math.PI) / 180;
  const x = c + r * Math.sin(rad);
  const y = c - r * Math.cos(rad);
  const large = angle > 180 ? 1 : 0;
  return (
    <svg width="24" height="24" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth="1.6" />
      {fill > 0 && (
        <path
          d={`M ${c} ${c} L ${c} ${c - r} A ${r} ${r} 0 ${large} 1 ${x} ${y} Z`}
          fill="currentColor"
        />
      )}
    </svg>
  );
}
