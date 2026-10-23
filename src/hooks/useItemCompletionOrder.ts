import { useLayoutEffect, useRef, useState } from "react";
import type { EnxovalItem } from "../types";

const COMPLETION_DELAY_MS = 2500;
const EXIT_DURATION_MS = 280;

type Completion = { phase: "waiting" | "exiting" | "settled"; order: number };

/** Keep the confirmation in place, then send the completed row to the tail. */
export function useItemCompletionOrder(
  items: EnxovalItem[],
  workspaceId?: string,
) {
  const [completions, setCompletions] = useState<Map<string, Completion>>(
    new Map(),
  );
  const previous = useRef(new Map<string, boolean>());
  const scope = useRef(workspaceId);
  const sequence = useRef(1);
  const timers = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    if (scope.current !== workspaceId) {
      timers.current.forEach(window.clearTimeout);
      timers.current.clear();
      previous.current.clear();
      sequence.current = 1;
      scope.current = workspaceId;
      setCompletions(new Map());
    }

    const current = new Map(items.map((item) => [item.id, item.checked]));
    for (const [id, checked] of previous.current) {
      if (current.get(id)) continue;
      window.clearTimeout(timers.current.get(id));
      timers.current.delete(id);
      if (checked)
        setCompletions((value) => {
          const next = new Map(value);
          next.delete(id);
          return next;
        });
    }

    for (const item of items) {
      if (!item.checked || previous.current.get(item.id) !== false) continue;
      setCompletions((value) =>
        new Map(value).set(item.id, { phase: "waiting", order: 0 }),
      );
      timers.current.set(
        item.id,
        window.setTimeout(() => {
          const finish = () => {
            const order = ++sequence.current;
            timers.current.delete(item.id);
            setCompletions((value) =>
              new Map(value).set(item.id, { phase: "settled", order }),
            );
          };
          if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            finish();
            return;
          }
          setCompletions((value) =>
            new Map(value).set(item.id, { phase: "exiting", order: 0 }),
          );
          timers.current.set(
            item.id,
            window.setTimeout(finish, EXIT_DURATION_MS),
          );
        }, COMPLETION_DELAY_MS),
      );
    }
    previous.current = current;
  }, [items, workspaceId]);

  useLayoutEffect(
    () => () => {
      timers.current.forEach(window.clearTimeout);
      timers.current.clear();
    },
    [],
  );

  const pendingIds = new Set(
    [...completions]
      .filter(([, completion]) => completion.phase !== "settled")
      .map(([id]) => id),
  );
  const orderOf = (item: EnxovalItem) => {
    if (!item.checked || pendingIds.has(item.id)) return 0;
    return completions.get(item.id)?.order ?? 1;
  };

  return { completions, pendingIds, orderOf };
}
