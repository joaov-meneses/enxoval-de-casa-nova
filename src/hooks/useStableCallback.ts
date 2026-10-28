import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Função com identidade fixa que sempre chama a versão mais recente de `fn`. Serve para passar callbacks a
 * componentes memorizados (como a linha de item) sem que cada render do pai os faça redesenhar.
 */
export function useStableCallback<Args extends unknown[], Result>(fn: (...args: Args) => Result) {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: Args) => ref.current(...args), []);
}
