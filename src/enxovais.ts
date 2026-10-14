import type { SelectOption } from "./components/Select";
import type { EnxovalSummary } from "./types";

/**
 * Opções do seletor de enxoval. Os enxovais da própria pessoa e os que ela só usa como convidada ficam em grupos
 * separados, para ninguém confundir a lista de outra pessoa com a sua. Sem nenhum compartilhado, a lista segue simples.
 */
export function enxovalSelectOptions(enxovais: EnxovalSummary[]): SelectOption[] {
  const hasShared = enxovais.some((enxoval) => enxoval.role !== "owner");
  const own = enxovais.filter((enxoval) => enxoval.role === "owner");
  const shared = enxovais.filter((enxoval) => enxoval.role !== "owner");

  return [
    ...own.map((enxoval) => ({
      value: enxoval.id,
      label: enxoval.name,
      group: hasShared ? "Meus enxovais" : undefined,
    })),
    ...shared.map((enxoval) => ({
      value: enxoval.id,
      label: `${enxoval.name} · de ${enxoval.ownerName}`,
      group: "Compartilhados comigo",
    })),
  ];
}

const ACTIVE_ENXOVAL_KEY = "casamia.activeEnxoval";

/** Último enxoval aberto por esta pessoa neste aparelho. Só uma conveniência: o servidor confere o acesso. */
export function readStoredEnxovalId(): string | undefined {
  try {
    return window.localStorage.getItem(ACTIVE_ENXOVAL_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function storeEnxovalId(enxovalId: string | null) {
  try {
    if (enxovalId) window.localStorage.setItem(ACTIVE_ENXOVAL_KEY, enxovalId);
    else window.localStorage.removeItem(ACTIVE_ENXOVAL_KEY);
  } catch {
    /* Sem armazenamento, o app abre o primeiro enxoval da lista. */
  }
}
