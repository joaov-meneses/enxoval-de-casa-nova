import { formatWeekRange, periodOfWeek, weekLabel } from "./purchasePlan";

export interface WeekOption {
  value: string;
  label: string;
  /** Período ao qual a semana pertence: agrupa as opções na lista. */
  group?: string;
}

/** Semanas oferecidas na escolha manual; semanas fora daqui só aparecem se já estiverem gravadas. */
export const FIRST_WEEK_OPTION = -12;
export const LAST_WEEK_OPTION = 52;

/**
 * Opções para escolher a semana de compra de um item: a primeira devolve a escolha ao algoritmo
 * (`auto`), as demais são semanas à mão. Com a data da mudança, cada semana mostra também os dias.
 */
export function weekOptions(options: {
  moveDate: string | null;
  /** Semana atual do item (sugerida ou escolhida). */
  week: number;
  manual: boolean;
}): WeekOption[] {
  const { moveDate, week, manual } = options;
  const weeks: number[] = [];
  for (let w = FIRST_WEEK_OPTION; w <= LAST_WEEK_OPTION; w += 1) weeks.push(w);
  if (manual && !weeks.includes(week)) {
    weeks.push(week);
    weeks.sort((a, b) => a - b);
  }
  return [
    {
      value: "auto",
      label: manual ? "Voltar para a sugestão" : `Sugestão · ${weekLabel(week)}`,
    },
    ...weeks.map((w) => ({
      value: String(w),
      label: moveDate ? `${weekLabel(w)} · ${formatWeekRange(moveDate, w)}` : weekLabel(w),
      group: periodOfWeek(w).label,
    })),
  ];
}
