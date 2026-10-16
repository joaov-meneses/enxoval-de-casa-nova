/**
 * Planos da conta e travas do plano gratuito. O servidor aplica os limites; o app só usa os
 * mesmos números para explicar à pessoa o que aconteceu.
 */

/** `founder`: contas que já existiam antes do freemium, com tudo liberado (sem cobrança). */
export const ACCOUNT_PLANS = ['free', 'monthly', 'semiannual', 'annual', 'founder'] as const;
export type AccountPlan = (typeof ACCOUNT_PLANS)[number];

export interface PlanLimits {
  /** Enxovais dos quais a conta é dona. */
  enxovais: number | null;
  /** Ambientes (cômodos) por enxoval. */
  environments: number | null;
  /** Itens em cada ambiente. */
  itemsPerEnvironment: number | null;
}

export const FREE_PLAN_LIMITS: PlanLimits = { enxovais: 1, environments: 2, itemsPerEnvironment: 5 };
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
}

/** Preços previstos para o lançamento, na ordem em que aparecem (landing e convite para assinar). */
export const PAID_PLAN_OFFERS: PaidPlanOffer[] = [
  { id: 'semiannual', name: 'Semestral', price: 'R$ 19,90', per: '/mês', billing: 'Cobrado R$ 119,40 a cada 6 meses', badge: 'Mais Escolhido', featured: true },
  { id: 'annual', name: 'Anual', price: 'R$ 14,90', per: '/mês', billing: 'Cobrado R$ 178,80 por ano', badge: '50% de desconto' },
  { id: 'monthly', name: 'Mensal', price: 'R$ 29,90', per: '/mês', billing: 'Flexibilidade total, mês a mês' },
];
