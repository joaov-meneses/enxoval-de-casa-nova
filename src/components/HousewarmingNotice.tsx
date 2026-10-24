import { useEffect, useState } from 'react';
import { fetchHousewarmingNotifications } from '../api';
import { Gift } from './icons';
import { Button } from './ui/button';
import type { HousewarmingEntry } from '../housewarming';
import { useHousewarmingLive } from '../hooks/useHousewarmingLive';

export function HousewarmingNotice({ enxovalId, onOpen }: { enxovalId: string; onOpen: () => void }) {
  const [notice, setNotice] = useState<{ unreadCount: number; latest: HousewarmingEntry | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useHousewarmingLive(`/api/enxovais/${encodeURIComponent(enxovalId)}/housewarming/events`, () => setAttempt(value => value + 1));
  useEffect(() => {
    let alive = true;
    let loading = false;
    const refresh = async () => {
      if (document.visibilityState === 'hidden' || loading) return;
      loading = true;
      try { const data = await fetchHousewarmingNotifications(enxovalId); if (alive) setNotice(data); }
      catch { /* The workspace already handles access and connection errors. Retry on the next refresh. */ }
      finally { loading = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    window.addEventListener('focus', refresh);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [enxovalId, attempt]);
  if (!notice?.unreadCount) return null;
  return <Button variant="brand" size="brand" className="housewarming-notice" onClick={onOpen}>
    <Gift size={22} aria-hidden="true" />
    <span><strong>{notice.unreadCount} {notice.unreadCount === 1 ? 'novidade no seu Chá' : 'novidades no seu Chá'}</strong>
      {notice.latest && <span>{notice.latest.name}{notice.latest.kind === 'reservation' ? ` reservou ${notice.latest.itemName}.` : ' deixou um recado para sua casa nova.'}</span>}
    </span><span>Ver carinho recebido</span>
  </Button>;
}
