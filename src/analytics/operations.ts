import { describeControl } from './operationalPrivacy';

type Sink = (event: `application.${string}`, properties: Record<string, unknown>) => void;

/** Log delegated UI actions, including controls added later by dialogs and routes. Never captures typed values. */
export function startActionLogging(capture: Sink) {
  const action = (event: Event) => {
    try {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const element = target.closest('button,a,input,select,textarea,form,[role="button"],[role="checkbox"],[role="switch"],[role="tab"],[role="menuitem"],[role="option"]');
      if (!element) return;
      capture('application.ui.action', {
        action: event.type, ...describeControl(element as HTMLInputElement, element.closest('form')), trusted: event.isTrusted,
      });
    } catch { /* Diagnostics never interrupt an interaction. */ }
  };
  for (const name of ['click', 'change', 'submit']) document.addEventListener(name, action, true);
  return () => {
    for (const name of ['click', 'change', 'submit']) document.removeEventListener(name, action, true);
  };
}
