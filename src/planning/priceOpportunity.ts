import type { EnxovalItem } from '../types';
import { netPriceCents } from '../itemStatus';

/** A current comparison, never a forecast of a future promotion. */
export function priceReferenceOpportunity(item: EnxovalItem, now = new Date()) {
  const reference = item.catalog?.priceRange;
  if (item.status !== 'researching' || (item.quantity ?? 1) !== 1 || !reference?.updatedAt || reference.samples < 5 || reference.p50 <= 0) return null;
  const age = now.getTime() - Date.parse(reference.updatedAt);
  if (!Number.isFinite(age) || age < 0 || age > 14 * 86_400_000) return null;
  const tracking = item.priceTracking;
  const cents = tracking ? tracking.inStock && tracking.status === 'ok' ? tracking.currentPriceCents : null : netPriceCents(item);
  const observed = tracking?.lastCheckedAt ?? item.updatedAt;
  const observedAge = now.getTime() - Date.parse(observed ?? '');
  if (!Number.isFinite(observedAge) || observedAge < 0 || observedAge > 14 * 86_400_000 || !cents || cents > reference.p50 * .95) return null;
  return { percent: Math.round((1 - cents / reference.p50) * 100), cents, samples: reference.samples, updatedAt: reference.updatedAt,
    source: reference.source === 'serpapi' ? 'ofertas comparáveis' : 'valores informados em outras listas' };
}
