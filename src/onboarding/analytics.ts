import { capture, setPersonProperties } from '../analytics';
import { allowedProperties } from '../analytics/events';
import type { OnboardingMetrics } from './metrics';

export type OnboardingEvent =
  | "onboarding_start"
  | "step_view"
  | "step_complete"
  | "onboarding_back"
  | "plan_ready"
  | "commitment_signed"
  | "signup_submit"
  | "signup_success";

/**
 * Preserva o contrato DOM e encaminha somente as propriedades previstas ao PostHog.
 * Os nomes legados de signup aqui significam salvar o onboarding, não criar a conta.
 */
export function track(
  event: OnboardingEvent,
  detail: Record<string, string | number | boolean> = {},
) {
  capture(event === 'signup_submit' ? 'onboarding_submit' : event === 'signup_success' ? 'onboarding_complete' : event, detail);
  window.dispatchEvent(
    new CustomEvent("casamia:onboarding", { detail: { event, ...detail } }),
  );
}

/**
 * Funil concluído: o evento leva as respostas em categorias e faixas, e elas também viram propriedades da pessoa,
 * para quebrar funis, retenção e conversão por moradia, orçamento, preocupações etc. O esquema de
 * `onboarding_complete` decide o que passa (nada de nome, data exata ou texto livre).
 */
export function trackOnboardingComplete(metrics: OnboardingMetrics) {
  track("signup_success", metrics);
  setPersonProperties(allowedProperties("onboarding_complete", metrics));
}
