import { Button } from "@/src/components/ui/button";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { STEPS as SLIDES } from "./HowItWorks";

/** Tempo que cada captura fica em destaque antes de a próxima deslizar para o lugar. */
const SHOWCASE_MS = 4500;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Vitrine do app para celular e tablet, dentro da cúpula da porta: as mesmas telas do "Como funciona" da home,
 * em molduras de celular que sobem por trás do cartão. A faixa se arrasta com o dedo (rolagem com encaixe,
 * nativa) e avança sozinha. Pausa enquanto a pessoa toca, passa o mouse ou foca
 * nos pontos, e não avança sozinha para quem pede menos movimento.
 */
export function AuthShowcase() {
  const trackRef = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const [tabHidden, setTabHidden] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const goTo = useCallback(
    (next: number) => {
      const track = trackRef.current;
      const slide = track?.children[(next + SLIDES.length) % SLIDES.length] as
        | HTMLElement
        | undefined;
      if (!track || !slide) return;
      // Rola só a faixa (scrollIntoView puxaria a página inteira junto).
      track.scrollTo({
        left: slide.offsetLeft - track.offsetLeft - (track.clientWidth - slide.clientWidth) / 2,
        behavior: reduced ? "auto" : "smooth",
      });
    },
    [reduced],
  );

  // O slide ativo é o que está mais perto do centro da faixa, seja por toque ou por rolagem automática.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const center = track.scrollLeft + track.clientWidth / 2;
      let best = 0;
      let bestDistance = Infinity;
      Array.from(track.children).forEach((child, childIndex) => {
        const slide = child as HTMLElement;
        const distance = Math.abs(
          slide.offsetLeft - track.offsetLeft + slide.clientWidth / 2 - center,
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          best = childIndex;
        }
      });
      setIndex(best);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      track.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const playing = !reduced && !paused && !tabHidden;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => goTo(index + 1), SHOWCASE_MS);
    return () => window.clearTimeout(timer);
  }, [playing, index, goTo]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(index - 1);
    }
  };

  return (
    <section
      className="auth-showcase"
      aria-roledescription="carrossel"
      aria-label="Conheça o Casa Mia por dentro"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setPaused(false);
      }}
      onKeyDown={onKeyDown}
    >
      <ul className="auth-showcase-track" ref={trackRef} aria-live={playing ? "off" : "polite"}>
        {SLIDES.map((slide, slideIndex) => (
          <li
            key={slide.title}
            className={`auth-showcase-slide${slideIndex === index ? " is-active" : ""}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${slideIndex + 1} de ${SLIDES.length}: ${slide.title}`}
          >
            <div className="auth-showcase-phone">
              <img
                src={slide.image}
                alt={slide.alt}
                width={780}
                height={1688}
                decoding="async"
                draggable={false}
              />
            </div>
          </li>
        ))}
      </ul>
      <ol className="auth-showcase-dots" aria-label="Escolher captura">
        {SLIDES.map((slide, slideIndex) => (
          <li key={slide.title}>
            <Button variant="brand" size="brand"
              type="button"
              className={`auth-showcase-dot${slideIndex === index ? " is-active" : ""}`}
              onClick={() => goTo(slideIndex)}
              aria-label={`${slideIndex + 1} de ${SLIDES.length}: ${slide.title}`}
              aria-current={slideIndex === index ? "true" : undefined}
            >
              <span aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ol>
    </section>
  );
}
