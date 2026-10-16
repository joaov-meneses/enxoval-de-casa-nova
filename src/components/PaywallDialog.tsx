import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Dialog } from "./Dialog";
import { Nino } from "./Nino";
import { LIMIT_REACHED_EVENT, type LimitReachedDetail } from "../api";
import { FREE_PLAN_LIMITS, PAID_PLAN_OFFERS, type LimitCode } from "../plans";

const TITLES: Record<LimitCode, string> = {
  LIMIT_REACHED_ENVIRONMENTS: "Sua casa está crescendo!",
  LIMIT_REACHED_ITEMS: "Este cômodo está cheio de planos!",
  LIMIT_REACHED_ENXOVAIS: "Mais uma casa a caminho?",
};

const UNLOCKS = [
  "Cômodos e itens ilimitados",
  "Mais de um enxoval",
  "Lista a dois, em tempo real",
  "Página do Chá de Casa Nova",
];

/**
 * Convite acolhedor para os planos pagos. Abre sozinho quando o servidor recusa algo pelo
 * limite do plano gratuito (evento disparado em `api.ts`), por cima da janela onde a pessoa estava.
 */
export function PaywallDialog() {
  const [limit, setLimit] = useState<LimitReachedDetail | null>(null);

  useEffect(() => {
    const onLimit = (event: Event) =>
      setLimit((event as CustomEvent<LimitReachedDetail>).detail);
    window.addEventListener(LIMIT_REACHED_EVENT, onLimit);
    return () => window.removeEventListener(LIMIT_REACHED_EVENT, onLimit);
  }, []);

  return (
    <Dialog
      title={limit ? TITLES[limit.code] : ""}
      isOpen={limit !== null}
      onClose={() => setLimit(null)}
    >
      <div className="paywall">
        <div className="paywall-intro">
          <Nino pose="wave" size={96} />
          <p>
            No plano gratuito, você pode testar até{" "}
            {FREE_PLAN_LIMITS.environments} cômodos com{" "}
            {FREE_PLAN_LIMITS.itemsPerEnvironment} itens cada. Vamos abrir as
            portas de todos os cômodos do seu lar?
          </p>
        </div>
        <ul className="paywall-unlocks" aria-label="O que os planos pagos liberam">
          {UNLOCKS.map((text) => (
            <li key={text}>
              <Check size={15} aria-hidden="true" /> {text}
            </li>
          ))}
        </ul>
        <ul className="paywall-plans" aria-label="Planos">
          {PAID_PLAN_OFFERS.map((offer) => (
            <li
              key={offer.id}
              className={offer.featured ? "is-featured" : undefined}
            >
              <span className="paywall-plan-name">
                {offer.name}
                {offer.badge && <small>{offer.badge}</small>}
              </span>
              <span className="paywall-plan-price">
                <strong>{offer.price}</strong>
                {offer.per}
              </span>
              <span className="paywall-plan-billing">{offer.billing}</span>
            </li>
          ))}
        </ul>
        <p className="paywall-note">
          As assinaturas abrem em breve. Até lá, nada é cobrado e tudo o que você
          já cadastrou continua com você.
        </p>
        <button
          type="button"
          className="button button-dark"
          onClick={() => setLimit(null)}
          data-dialog-autofocus
        >
          Entendi
        </button>
      </div>
    </Dialog>
  );
}
