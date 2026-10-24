import { ChevronRight } from "@/src/components/icons";
import { Nino } from "./Nino";
import type { EnxovalItem } from "../types";
import type { PlannedItem, PurchasePlan } from "../planning/purchasePlan";

/**
 * Primeiro Dia primeiro: entre os itens na fila, o próximo é o da semana mais cedo, com os essenciais na
 * frente (a mesma ordem das etapas do Planejamento). `categoryId` limita a escolha ao ambiente aberto.
 */
export function pickNextStep(
  plan: PurchasePlan<EnxovalItem> | null,
  categoryId?: string,
  userId?: string,
): { entry: PlannedItem<EnxovalItem>; queued: number } | null {
  if (!plan) return null;
  const queue = plan.periods
    .flatMap((period) => period.entries)
    .filter((entry) => entry.pending && (!categoryId || entry.item.categoryId === categoryId));
  // Num enxoval dividido, o próximo passo é da própria pessoa ou de ninguém ainda; o que está com outra pessoa fica para ela.
  const mine = userId
    ? queue.find((entry) => !entry.item.assigneeId || entry.item.assigneeId === userId)
    : queue[0];
  return queue.length > 0 ? { entry: mine ?? queue[0], queued: queue.length } : null;
}

/**
 * Cartão do Nino no topo da lista: um único próximo passo, em vez de todos os itens com o mesmo peso.
 * O cartão inteiro é o botão, para caber numa linha no celular sem perder a área de toque.
 */
export function NextStepCard({
  entry,
  queued,
  countdown,
  onOpen,
}: {
  entry: PlannedItem<EnxovalItem>;
  queued: number;
  /** "Faltam 34 dias para a mudança": só existe com a data da mudança. */
  countdown?: string | null;
  onOpen: (itemId: string) => void;
}) {
  const others = queued - 1;
  return (
    <button type="button" className="next-step-card" onClick={() => onOpen(entry.item.id)}>
      <Nino pose="think" size={52} className="next-step-nino" />
      <span className="next-step-body">
        {countdown && <span className="next-step-countdown">{countdown}</span>}
        <span className="next-step-title">
          Próximo passo: <span className="next-step-name">{entry.item.name}</span>
        </span>
        <span className="next-step-reason">
          {entry.placement.reason}
          {others > 0 && (
            <span className="next-step-queue">
              {" "}
              Depois dele, {others === 1 ? "mais 1 item" : `mais ${others} itens`} na fila.
            </span>
          )}
        </span>
      </span>
      <span className="next-step-open">
        <span className="next-step-open-label">Ver item</span>
        <ChevronRight size={18} aria-hidden="true" />
      </span>
    </button>
  );
}
