/**
 * Planos da conta e travas do plano gratuito. O servidor aplica os limites; o app só usa os
 * mesmos números para explicar à pessoa o que aconteceu.
 */

/**
 * `monthly`: assinatura mensal. `pass`: Passe da Casa Nova, pagamento único com 12 meses de acesso (vale só até a data de
 * validade). `founder`: contas que já existiam antes do freemium, com tudo liberado (sem cobrança).
 */
export const ACCOUNT_PLANS = ['free', 'monthly', 'pass', 'founder'] as const;
export type AccountPlan = (typeof ACCOUNT_PLANS)[number];

export interface PlanLimits {
  /** Enxovais dos quais a conta é dona. */
  enxovais: number | null;
  /** Ambientes (cômodos) por enxoval. */
  environments: number | null;
  /** Itens em cada ambiente. */
  itemsPerEnvironment: number | null;
}

export const FREE_PLAN_LIMITS: PlanLimits = { enxovais: 1, environments: 2, itemsPerEnvironment: 10 };
const UNLIMITED: PlanLimits = { enxovais: null, environments: null, itemsPerEnvironment: null };

export function isAccountPlan(value: unknown): value is AccountPlan {
  return typeof value === 'string' && (ACCOUNT_PLANS as readonly string[]).includes(value);
}

export function planLimits(plan: AccountPlan): PlanLimits {
  return plan === 'free' ? FREE_PLAN_LIMITS : UNLIMITED;
}

export const LIMIT_CODES = ['LIMIT_REACHED_ENXOVAIS', 'LIMIT_REACHED_ENVIRONMENTS', 'LIMIT_REACHED_ITEMS'] as const;
export type LimitCode = (typeof LIMIT_CODES)[number];

export function isLimitCode(value: unknown): value is LimitCode {
  return typeof value === 'string' && (LIMIT_CODES as readonly string[]).includes(value);
}

export interface PaidPlanOffer {
  id: Exclude<AccountPlan, 'free' | 'founder'>;
  name: string;
  price: string;
  per: string;
  billing: string;
  badge?: string;
  featured?: boolean;
  /** Pagamento único (sem renovação automática) em vez de assinatura. */
  oneTime?: boolean;
}

/** Meses de acesso do Passe da Casa Nova. */
export const PASS_MONTHS = 12;

/**
 * Preços do lançamento, na ordem em que aparecem (landing e convite para assinar). O mensal cheio é a âncora:
 * a partir do quarto mês, o Passe sai mais barato.
 */
export const PAID_PLAN_OFFERS: PaidPlanOffer[] = [
  { id: 'pass', name: 'Passe da Casa Nova', price: 'R$ 99', per: ' pagamento único', billing: `${PASS_MONTHS} meses de acesso, sem renovação automática. Equivale a 3 meses do plano mensal.`, badge: 'Melhor custo-benefício', featured: true, oneTime: true },
  { id: 'monthly', name: 'Mensal', price: 'R$ 29,90', per: '/mês', billing: 'Flexibilidade total: cancele quando quiser' },
];
