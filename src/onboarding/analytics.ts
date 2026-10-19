import { capture } from '../analytics';

export type OnboardingEvent =
  | "onboarding_start"
  | "step_view"
  | "step_complete"
  | "onboarding_back"
  | "plan_ready"
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
