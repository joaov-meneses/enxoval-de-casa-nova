import { CalendarCheck, Lock, PartyPopper, Unlock } from "@/src/components/icons";
import { CATALOG } from "../onboarding/catalog";
import type { RoomKey } from "../onboarding/types";
import { roomOfCategory } from "../planning/purchasePlan";
import { FREE_PLAN_LIMITS, PASS_MONTHS } from "../plans";

/** Variações do convite para os planos: `control` é a versão sem bloco extra. */
export type PaywallVariant = "peek" | "timeline" | "control";

const VARIANTS: PaywallVariant[] = ["peek", "timeline", "control"];

/**
 * Versão exibida. O padrão é a espiada; `?paywall=timeline` ou `?paywall=control` na URL mostram as outras,
 * para comparar no celular e no computador antes de decidir (e para testar depois).
 */
export function readPaywallVariant(): PaywallVariant {
  try {
    const value = new URLSearchParams(window.location.search).get("paywall");
    if (VARIANTS.includes(value as PaywallVariant)) return value as PaywallVariant;
  } catch {
    // Sem acesso à URL (ambiente restrito): vale o padrão.
  }
  return "peek";
}

const LOCKABLE_ROOMS: { room: RoomKey; name: string }[] = [
  { room: "cozinha", name: "Cozinha" },
  { room: "banheiro", name: "Banheiro" },
  { room: "quarto", name: "Quarto" },
  { room: "sala", name: "Sala" },
  { room: "servico", name: "Área de serviço" },
  { room: "quartoExtra", name: "Quarto extra" },
  { room: "escritorio", name: "Escritório" },
  { room: "externa", name: "Área externa" },
];

/** Itens que o catálogo da Casa Mia sugere para cada cômodo (a cozinha soma os eletrodomésticos). */
const CATALOG_COUNTS = CATALOG.reduce<Partial<Record<RoomKey, number>>>((counts, entry) => {
  const room = entry.room === "eletro" ? "cozinha" : entry.room;
  counts[room] = (counts[room] ?? 0) + 1;
  return counts;
}, {});

interface PeekProps {
  categories: { id: string; name: string }[];
  items: { categoryId: string }[];
}

/**
 * Espiada no que está por trás do limite: o que a pessoa já montou e os cômodos que ainda não cabem no plano
 * gratuito, com quantos itens o catálogo sugere para cada um.
 */
export function PaywallPeek({ categories, items }: PeekProps) {
  const owned = new Set<RoomKey | null>(
    categories.map((category) => roomOfCategory(category.name)).map((room) => (room === "eletro" ? "cozinha" : room)),
  );
  const locked = LOCKABLE_ROOMS.filter(({ room }) => !owned.has(room));
  const lockedItems = locked.reduce((sum, { room }) => sum + (CATALOG_COUNTS[room] ?? 0), 0);
  const full = categories.filter(
    (category) =>
      FREE_PLAN_LIMITS.itemsPerEnvironment !== null &&
      items.filter((item) => item.categoryId === category.id).length >= FREE_PLAN_LIMITS.itemsPerEnvironment,
  ).length;

  if (categories.length === 0 && locked.length === 0) return null;
  return (
    <div className="paywall-peek">
      <p className="paywall-peek-now">
        <strong>
          {categories.length} {categories.length === 1 ? "cômodo" : "cômodos"} e {items.length}{" "}
          {items.length === 1 ? "item" : "itens"}
        </strong>{" "}
        no seu enxoval
        {full > 0 && <span>, {full === 1 ? "1 já está cheio" : `${full} já estão cheios`}</span>}
      </p>
      {locked.length > 0 && (
        <>
          <ul className="paywall-locked" aria-label="Cômodos que os planos pagos liberam">
            {locked.map(({ room, name }) => (
              <li key={room}>
                <Lock size={14} aria-hidden="true" />
                {name}
                <small>{CATALOG_COUNTS[room] ?? 0}</small>
              </li>
            ))}
          </ul>
          <p className="paywall-peek-total">
            São {lockedItems} itens sugeridos esperando por você.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Linha do tempo do Passe: não há período de teste, então o que ela explica é o que acontece com o acesso e com
 * os dados, principalmente que não há renovação automática.
 */
export function PaywallTimeline() {
  const steps = [
    {
      icon: Unlock,
      title: "Hoje",
      text: "Você paga uma vez só e tudo é liberado na hora: cômodos e itens sem limite.",
    },
    {
      icon: PartyPopper,
      title: `Nos próximos ${PASS_MONTHS} meses`,
      text: "Monte a casa sem pressa, com lista a dois, Nino e a página do Chá de Casa Nova.",
    },
    {
      icon: CalendarCheck,
      title: "Quando o Passe terminar",
      text: "Nada é cobrado de novo. Seu enxoval continua com você; só voltam os limites do plano gratuito.",
    },
  ];
  return (
    <ol className="paywall-timeline" aria-label="Como funciona o Passe da Casa Nova">
      {steps.map(({ icon: Icon, title, text }) => (
        <li key={title}>
          <span className="paywall-timeline-dot" aria-hidden="true">
            <Icon size={15} />
          </span>
          <div>
            <strong>{title}</strong>
            <p>{text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
