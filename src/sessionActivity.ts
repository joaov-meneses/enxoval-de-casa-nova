// Activity stays in memory. The server controls idle expiry and the absolute deadline.
export const SESSION_EXPIRED_EVENT = 'casamia:session-expired';
export const SESSION_AUTHENTICATED_EVENT = 'casamia:session-authenticated';

let authenticated = false;
let lastSent = 0;
let pending = false;
let authVersion = 0;

async function recordActivity() {
  if (document.visibilityState !== 'visible' || pending || Date.now() - lastSent < 60000) return;
  lastSent = Date.now();
  pending = true;
  const startedVersion = authVersion;
  try {
    const response = await fetch('/api/auth/activity', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    if (response.ok && startedVersion === authVersion) authenticated = true;
    else if (response.status === 401 && authenticated && startedVersion === authVersion) {
      authenticated = false;
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
  } catch { /* A network outage does not log the person out. */ }
  finally { pending = false; }
}

function onInteraction(event: Event) {
  if (event.isTrusted) void recordActivity();
}

export function startSessionActivity() {
  const onAuthenticated = () => { authenticated = true; authVersion++; };
  const onVisible = () => { if (document.visibilityState === 'visible') void recordActivity(); };
  const onExpired = () => { authenticated = false; authVersion++; };
  for (const name of ['pointerdown', 'keydown', 'scroll']) window.addEventListener(name, onInteraction, { passive: true, capture: true });
  window.addEventListener('focus', onVisible);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener(SESSION_AUTHENTICATED_EVENT, onAuthenticated);
  window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
  void recordActivity();
  return () => {
    for (const name of ['pointerdown', 'keydown', 'scroll']) window.removeEventListener(name, onInteraction, true);
    window.removeEventListener('focus', onVisible);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener(SESSION_AUTHENTICATED_EVENT, onAuthenticated);
    window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  };
}
