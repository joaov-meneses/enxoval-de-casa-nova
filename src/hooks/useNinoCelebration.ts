import { useEffect, useState } from "react";
import type { NinoCelebration } from "../nino";

/** Só recebe conquistas confirmadas pelo servidor; o prazo continua ao trocar de tela. */
export function useNinoCelebration(enxovalId?: string) {
  const [event, setEvent] = useState<(NinoCelebration & { enxovalId: string }) | null>(null);
  useEffect(() => {
    if (!event) return;
    const timer = window.setTimeout(() => setEvent(null), 4000);
    return () => window.clearTimeout(timer);
  }, [event]);
  useEffect(() => setEvent(null), [enxovalId]);
  return {
    celebration: event?.enxovalId === enxovalId ? event : null,
    celebrate: (item: NinoCelebration) => {
      if (enxovalId) setEvent({ ...item, enxovalId });
    },
  };
}
