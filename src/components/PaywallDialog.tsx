import { Button } from "@/src/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { Check } from "@/src/components/icons";
import { Dialog } from "./Dialog";
import { Nino } from "./Nino";
import { capture } from '../analytics';
import {
  PaywallPeek,
  PaywallTimeline,
  readPaywallVariant,
} from "./PaywallExtras";
import {
  fetchBillingStatus,
  LIMIT_REACHED_EVENT,
  startCheckout,
  syncBilling,
  type BillingStatus,
  type LimitReachedDetail,
} from "../api";
import {
  FREE_PLAN_LIMITS,
  PAID_PLAN_OFFERS,
  type LimitCode,
  type PaidPlanOffer,
} from "../plans";

/** Pede para abrir a tela de planos sem que nenhum limite tenha sido atingido (botão "Planos" do menu). */
export const OPEN_PLANS_EVENT = "casamia:open-plans";

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
export function PaywallDialog({
  onPlanChanged,
  categories = [],
  items = [],
}: {
  /** O que a pessoa já montou: a espiada mostra o que está por trás do limite. */
  categories?: { id: string; name: string }[];
  items?: { categoryId: string }[];
  /** A assinatura mudou o plano da conta: o app relê os dados para liberar os limites. */
  onPlanChanged?: () => void;
}) {
  const [limit, setLimit] = useState<LimitReachedDetail | null>(null);
  const [isPlansOpen, setIsPlansOpen] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<PaidPlanOffer["id"] | null>(
    null,
  );
  const [error, setError] = useState("");
  const [result, setResult] = useState<"success" | "canceled" | null>(null);
  const [boughtPass, setBoughtPass] = useState(false);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const isOpen = limit !== null || isPlansOpen;
  const variant = useMemo(() => readPaywallVariant(), []);

  // Ao abrir a tela de planos, lê a situação da conta (Passe em vigor e até quando).
  useEffect(() => {
    if (!isOpen) return;
    fetchBillingStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [isOpen]);

  useEffect(() => {
    const onLimit = (event: Event) => {
      capture('plans_viewed', { source: 'limit', reason: (event as CustomEvent<LimitReachedDetail>).detail.code });
      setError("");
      setLimit((event as CustomEvent<LimitReachedDetail>).detail);
    };
    const onOpenPlans = () => {
      capture('plans_viewed', { source: 'menu' });
      setError("");
      setIsPlansOpen(true);
    };
    window.addEventListener(LIMIT_REACHED_EVENT, onLimit);
    window.addEventListener(OPEN_PLANS_EVENT, onOpenPlans);
    return () => {
      window.removeEventListener(LIMIT_REACHED_EVENT, onLimit);
      window.removeEventListener(OPEN_PLANS_EVENT, onOpenPlans);
    };
  }, []);

  // Volta do checkout da Stripe: confirma a assinatura sem esperar o webhook e libera o plano.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("assinatura");
    if (outcome !== "sucesso" && outcome !== "cancelada") return;
    params.delete("assinatura");
    const bought = params.get("plano");
    params.delete("plano");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
    if (outcome === "cancelada") {
      setResult("canceled");
      return;
    }
    setResult("success");
    setBoughtPass(bought === "pass");
    syncBilling()
      .then(() => onPlanChanged?.())
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasPass = status?.plan === "pass";

  const close = () => {
    setLimit(null);
    setIsPlansOpen(false);
    setResult(null);
    setError("");
  };

  const subscribe = async (plan: PaidPlanOffer["id"]) => {
    setPendingPlan(plan);
    setError("");
    try {
      const { url } = await startCheckout(plan);
      window.location.assign(url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível abrir o pagamento agora.",
      );
      setPendingPlan(null);
    }
  };

  if (result) {
    return (
      <Dialog
        title={
          result === "success"
            ? boughtPass
              ? "Passe da Casa Nova ativado!"
              : "Assinatura confirmada!"
            : "Pagamento não concluído"
        }
        isOpen
        onClose={close}
      >
        <div className="paywall">
          <div className="paywall-intro">
            <Nino pose="wave" size={96} />
            <p>
              {result === "success"
                ? "Obrigado por apoiar o Casa Mia! Estamos liberando o seu plano: em instantes, cômodos e itens ficam sem limites."
                : "Nada foi cobrado. Quando quiser, é só conhecer os planos de novo."}
            </p>
          </div>
          <Button variant="brand" size="brand"
            type="button"
            className="button button-dark"
            onClick={close}
            data-dialog-autofocus
          >
            Continuar
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      title={limit ? TITLES[limit.code] : "Planos do Casa Mia"}
      isOpen={isOpen}
      onClose={close}
    >
      <div className="paywall">
        <div className="paywall-intro">
          <Nino pose="wave" size={96} />
          <p>Acesso completo a todos os recursos. Sua conta e seus dados ficam preservados após o cancelamento.</p>
        </div>
        <ul className="paywall-plans" aria-label="Planos">
          {PAID_PLAN_OFFERS.filter((offer) => offer.id === "pass" || !hasPass).map((offer) => (
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
              <Button variant="brand" size="brand"
                type="button"
                className={`button button-small ${offer.featured ? "button-dark" : "button-outline"} paywall-plan-action`}
                disabled={pendingPlan !== null}
                onClick={() => void subscribe(offer.id)}
                aria-label={`${offer.oneTime ? "Comprar" : "Assinar"} ${offer.name}`}
              >
                {pendingPlan === offer.id
                  ? "Abrindo..."
                  : offer.oneTime
                    ? hasPass
                      ? "Estender"
                      : "Comprar"
                    : "Assinar"}
              </Button>
            </li>
          ))}
        </ul>
        {error && (
          <p className="paywall-error" role="alert">
            {error}
          </p>
        )}
        {hasPass && status?.passExpiresAt && (
          <p className="paywall-note">
            Seu Passe vale até{" "}
            {new Date(status.passExpiresAt).toLocaleDateString("pt-BR")}.
            Estender soma mais 12 meses ao que resta.
          </p>
        )}
        <p className="paywall-note">
          O pagamento é feito num ambiente seguro da Stripe. Tudo o que você já
          cadastrou continua com você, mesmo quando o acesso termina.
        </p>
        <Button variant="brand" size="brand"
          type="button"
          className="button button-outline"
          onClick={close}
        >
          Agora não
        </Button>
      </div>
    </Dialog>
  );
}
