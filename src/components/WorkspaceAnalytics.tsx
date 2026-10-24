import { useEffect, useRef } from 'react';
import { capture } from '../analytics';
import type { WorkspaceView } from '../appRoute';

/** Mount inside SubscriptionAccess so blocked screens never count as workspace views. */
export function WorkspaceAnalytics({ userId, enxovalId, view }: {
  userId: string; enxovalId?: string; view: WorkspaceView;
}) {
  const previous = useRef('');
  useEffect(() => {
    if (!enxovalId) return;
    const key = `${userId}:${enxovalId}:${view}`;
    if (previous.current === key) return;
    previous.current = key;
    capture('workspace_viewed', { view });
  }, [userId, enxovalId, view]);
  return null;
}
