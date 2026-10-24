// Volta ao app pelo link de um e-mail de ciclo de vida. O link leva `lm` (id da mensagem); o parâmetro sai da URL
// na hora e fica guardado nesta aba até a pessoa estar com a sessão aberta (pode precisar entrar antes). O servidor
// só conta para a dona da mensagem, uma vez por mensagem.
const PENDING_KEY = 'casamia:lifecycle:return';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readPending() {
  try { return sessionStorage.getItem(PENDING_KEY); } catch { return null; }
}

function writePending(value: string | null) {
  try {
    if (value) sessionStorage.setItem(PENDING_KEY, value);
    else sessionStorage.removeItem(PENDING_KEY);
  } catch { /* Sem armazenamento, a medição vale só para esta página. */ }
}

/** Tira `lm` da URL (sem recarregar) e devolve o id, se for válido. */
export function takeMessageParam(location: Pick<Location, 'href'> = window.location) {
  const url = new URL(location.href);
  const value = url.searchParams.get('lm');
  if (value === null) return null;
  url.searchParams.delete('lm');
  try { window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`); } catch { /* Opcional. */ }
  return UUID.test(value) ? value : null;
}

export function recordLifecycleReturn() {
  const fromUrl = takeMessageParam();
  if (fromUrl) writePending(fromUrl);
  const messageId = readPending();
  if (!messageId) return;
  // fetch direto: sem sessão (401) a tentativa fica para a próxima página, sem disparar o aviso de sessão expirada.
  void fetch('/api/lifecycle/returned', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId }),
  }).then(response => {
    if (response.status !== 401) writePending(null);
  }).catch(() => undefined);
}
