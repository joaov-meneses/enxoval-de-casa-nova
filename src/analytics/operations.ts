type Sink = (event: `application.${string}`, properties: Record<string, unknown>) => void;

/** Log delegated UI actions, including controls added later by dialogs and routes. */
export function startActionLogging(capture: Sink) {
  const action = (event: Event) => {
    try {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const element = target.closest('button,a,input,select,textarea,form,[role="button"],[role="checkbox"],[role="switch"],[role="tab"],[role="menuitem"],[role="option"]');
      if (!element) return;
      const control = element as HTMLInputElement;
      const form = element.closest('form');
      const fields = form ? Array.from(form.querySelectorAll('input,select,textarea')).map(field => {
        const input = field as HTMLInputElement;
        return { name: input.name, id: input.id, type: input.type, value: input.value, checked: input.checked };
      }) : undefined;
      capture('application.ui.action', {
        action: event.type, tag: element.tagName.toLowerCase(), id: element.id,
        name: control.name, type: control.type, value: control.value, checked: control.checked,
        label: element.getAttribute('aria-label'), text: element.textContent?.trim(),
        href: element.getAttribute('href'), role: element.getAttribute('role'),
        expanded: element.getAttribute('aria-expanded'), selected: element.getAttribute('aria-selected'),
        fields, trusted: event.isTrusted,
      });
    } catch { /* Diagnostics never interrupt an interaction. */ }
  };
  for (const name of ['click', 'change', 'submit']) document.addEventListener(name, action, true);
  return () => {
    for (const name of ['click', 'change', 'submit']) document.removeEventListener(name, action, true);
  };
}
