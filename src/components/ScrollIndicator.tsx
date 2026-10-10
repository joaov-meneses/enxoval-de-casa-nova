import { useEffect, useState, type RefObject } from "react";

/**
 * Trilho fino abaixo de uma lista rolável na horizontal: o trecho escuro mostra
 * quanto da lista está visível e onde. Some quando tudo cabe na tela.
 */
export function ScrollIndicator({
  targetRef,
}: {
  targetRef: RefObject<HTMLElement | null>;
}) {
  const [thumb, setThumb] = useState<{ width: number; left: number } | null>(
    null,
  );

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = target;
      if (scrollWidth - clientWidth < 2) {
        setThumb(null);
        return;
      }
      const width = Math.max(12, (clientWidth / scrollWidth) * 100);
      const progress = scrollLeft / (scrollWidth - clientWidth);
      setThumb({ width, left: progress * (100 - width) });
    };
    update();
    target.addEventListener("scroll", update, { passive: true });
    // A lista cresce ou encolhe ao criar/remover ambientes ou girar o aparelho.
    const observer = new ResizeObserver(update);
    observer.observe(target);
    for (const child of Array.from(target.children)) observer.observe(child);
    return () => {
      target.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [targetRef]);

  if (!thumb) return null;
  return (
    <div className="scroll-indicator" aria-hidden="true">
      <span style={{ width: `${thumb.width}%`, left: `${thumb.left}%` }} />
    </div>
  );
}
