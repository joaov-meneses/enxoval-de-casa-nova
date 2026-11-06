import { useEffect, type RefObject } from "react";

/* Controles que o botão flutuante não deve cobrir quando a página está no topo. As lixeiras dos itens ficam de fora
   de propósito, para o botão não sumir sempre na lista. */
const FAB_AVOID =
  "#workspace-main :is(.overview-room > small, .overview-room > svg, .list-search > button, .list-mobile-actions button, .stats-compact-toggle, .rooms-toolbar button, .overview-order button)";
const TOP_THRESHOLD = 8;
/* O botão quica até 8px para cima. */
const BOUNCE_MARGIN = 8;

/**
 * Faz o botão flutuante "ceder" (atributo data-yield no próprio botão) só no topo da página e só quando ele cobriria
 * um dos controles de FAB_AVOID. Sem setState: o atributo é aplicado direto no elemento, em scroll (rAF), resize e
 * mudança do layout. Só age no celular/tablet (max-width: 1023px).
 */
export function useFabYield(
  ref: RefObject<HTMLElement | null>,
  deps: unknown[],
) {
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    let frame = 0;

    const compute = () => {
      frame = 0;
      const fab = ref.current;
      if (!fab) return;
      let shouldYield = false;
      if (mq.matches && window.scrollY <= TOP_THRESHOLD) {
        // visibility e opacity não alteram o rect do botão, então ele pode ser medido cedido ou não.
        const r = fab.getBoundingClientRect();
        const left = r.left - BOUNCE_MARGIN;
        const right = r.right + BOUNCE_MARGIN;
        const top = r.top - BOUNCE_MARGIN;
        const bottom = r.bottom + BOUNCE_MARGIN;
        shouldYield = Array.from(document.querySelectorAll(FAB_AVOID)).some(
          (el) => {
            const b = el.getBoundingClientRect();
            return (
              b.width > 0 &&
              b.height > 0 &&
              b.left < right &&
              b.right > left &&
              b.top < bottom &&
              b.bottom > top
            );
          },
        );
      }
      fab.toggleAttribute("data-yield", shouldYield);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(compute);
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    mq.addEventListener("change", schedule);
    const main = document.getElementById("workspace-main");
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (main) observer?.observe(main);
    /* A lista monta depois do primeiro cálculo e o botão volta de display:none (item aberto, aviso de desfazer): recalcula
       em mudanças de DOM no conteúdo e nos atributos do próprio botão. O rAF junta várias mudanças num único cálculo, e
       o filtro de atributos evita reagir ao próprio data-yield. */
    const mutations = new MutationObserver(schedule);
    /* Observa o contêiner do app (e não só #workspace-main), que pode ser remontado durante o carregamento. */
    const root = ref.current?.closest(".workspace-app") ?? main ?? document.body;
    mutations.observe(root, { childList: true, subtree: true });
    if (ref.current)
      mutations.observe(ref.current, {
        attributes: true,
        attributeFilter: ["data-item-expanded", "class"],
      });
    void document.fonts?.ready.then(schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      mq.removeEventListener("change", schedule);
      observer?.disconnect();
      mutations.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
