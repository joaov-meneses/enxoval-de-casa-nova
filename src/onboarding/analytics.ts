export type OnboardingEvent =
  | "onboarding_start"
  | "step_view"
  | "step_complete"
  | "onboarding_back"
  | "plan_ready"
  | "signup_submit"
  | "signup_success";

/**
 * Dispara um evento de DOM em vez de depender de um provedor de analytics.
 * Quem medir o funil basta escutar:
 *   window.addEventListener("larume:onboarding", (e) => send(e.detail))
 */
export function track(
  event: OnboardingEvent,
  detail: Record<string, string | number | boolean> = {},
) {
  window.dispatchEvent(
    new CustomEvent("larume:onboarding", { detail: { event, ...detail } }),
  );
}
