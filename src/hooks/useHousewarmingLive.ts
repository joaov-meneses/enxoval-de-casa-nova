import { useEffect, useRef } from 'react';

/** Database changes prompt a fresh authorized read; the screens keep their 15-second fallback. */
export function useHousewarmingLive(path: string, refresh: () => void) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource(path);
    const changed = () => { if (document.visibilityState !== 'hidden') latest.current(); };
    source.addEventListener('refresh', changed);
    return () => { source.removeEventListener('refresh', changed); source.close(); };
  }, [path]);
}
