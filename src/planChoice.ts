import type { PaidPlanId } from './api';

/**
 * O plano que a pessoa clicou nos preços da home. Ele atravessa o cadastro e o onboarding (várias
 * páginas) guardado nesta aba, para a escolha de plano do app abrir com ele marcado. É só uma
 * preferência: a pessoa ainda pode trocar antes de pagar.
 */
const PLAN_CHOICE_KEY = 'casamia.planChoice';

/** Na URL, em português: `?plano=passe` ou `?plano=mensal`. */
const FROM_URL: Record<string, PaidPlanId> = { passe: 'pass', mensal: 'monthly' };
export const PLAN_URL_VALUE: Record<PaidPlanId, string> = { pass: 'passe', monthly: 'mensal' };

export function rememberPlanChoice(plan: PaidPlanId) {
  try {
    window.sessionStorage.setItem(PLAN_CHOICE_KEY, plan);
  } catch {
    /* Sem armazenamento, a escolha de plano abre no padrão. */
  }
}

export function readPlanChoice(): PaidPlanId | undefined {
  try {
    const value = window.sessionStorage.getItem(PLAN_CHOICE_KEY);
    return value === 'pass' || value === 'monthly' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Guarda o `?plano=` de qualquer página que a pessoa abrir, como o link de cadastro da home. */
export function capturePlanChoiceFromUrl() {
  const plan = FROM_URL[new URLSearchParams(window.location.search).get('plano') ?? ''];
  if (plan) rememberPlanChoice(plan);
}
