import type { BillingStatus } from './api';

interface Entry {
  status: BillingStatus | null;
  pending: Promise<BillingStatus | null> | null;
}

// Só nesta sessão da página. Nunca persiste permissões no navegador.
const entries = new Map<string, Entry>();

export const subscriptionScope = (userId: string, enxovalId?: string) => JSON.stringify([userId, enxovalId ?? null]);

export function cachedSubscriptionStatus(scope: string) {
  return entries.get(scope)?.status ?? null;
}

export function rememberSubscriptionStatus(scope: string, status: BillingStatus) {
  const entry = entries.get(scope);
  if (entry) entry.status = status;
}

export function clearSubscriptionStatus(scope?: string) {
  if (scope !== undefined) entries.delete(scope);
  else entries.clear();
}

/** Consultas simultâneas compartilham a rede; logout/invalidação descarta respostas em trânsito. */
export function loadSubscriptionStatus(scope: string, request: () => Promise<BillingStatus>): Promise<BillingStatus | null> {
  let entry = entries.get(scope);
  if (!entry) {
    entry = { status: null, pending: null };
    entries.set(scope, entry);
  }
  if (entry.pending) return entry.pending;
  const current = entry;
  current.pending = request().then(status => {
    if (entries.get(scope) !== current) return null;
    current.status = status;
    return status;
  }).catch(error => {
    if (entries.get(scope) !== current) return null;
    throw error;
  }).finally(() => { current.pending = null; });
  return current.pending;
}

/** A revalidação em segundo plano não estende o prazo já confirmado pelo servidor. */
export function subscriptionAllowsAccess(status: BillingStatus | null, now = Date.now()) {
  if (!status?.accessAllowed) return false;
  const deadline = status.plan === 'monthly' && status.status === 'trialing'
    ? status.trialEndsAt
    : status.plan === 'pass' ? status.passExpiresAt : null;
  return !deadline || (Number.isFinite(Date.parse(deadline)) && Date.parse(deadline) > now);
}
