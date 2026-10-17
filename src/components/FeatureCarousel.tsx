import { useCallback, useEffect, useId, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { Nino } from "./Nino";

/** Cada slide é uma funcionalidade de alto valor, com a captura real da tela (sem dados pessoais). */
export const SLIDES = [
  {
    kicker: "Plano sob medida",
    title: "Um plano do tamanho da sua casa.",
    text: "Poucas perguntas e o Casa Mia monta a lista pensada para o seu clima, a sua casa e quem mora nela, com quantidades ajustadas e sem o que você não precisa comprar.",
    image: "/images/carrossel/carrossel-01-plano.webp",
    alt: "Tela do Casa Mia dizendo que o plano está pronto, com 64 itens essenciais e 183 no plano completo.",
  },
  {
    kicker: "Lista por cômodo",
    title: "Uma lista que dá gosto de riscar.",
    text: "Cada item com preço, link e observações. Marque o que você conquistou e acompanhe a casa tomando forma, peça por peça.",
    image: "/images/carrossel/carrossel-02-lista.webp",
    alt: "Lista do Meu enxoval no Casa Mia, com itens do Quarto riscados como conquistados e o progresso de 14 de 165 itens.",
  },
  {
    kicker: "Planejamento",
    title: "Cada coisa no seu tempo.",
    text: "O Casa Mia sugere a semana certa de cada item a partir da data da mudança e mostra a faixa de gasto esperada. Você ajusta como preferir.",
    image: "/images/carrossel/carrossel-03-quando-comprar.webp",
    alt: "Tela Quando comprar cada coisa, com a data da mudança, o perfil de gasto e a faixa de valores esperada.",
  },
  {
    kicker: "Nino",
    title: "O Nino diz o que vem primeiro.",
    text: "Ele olha a sua casa e o prazo da mudança e sugere o próximo passo. Só sugere: a decisão é sua.",
    image: "/images/carrossel/carrossel-04-nino.webp",
    alt: "Cartão Ajuda do Nino no Casa Mia, com o mascote e as perguntas sobre o próximo item de um ambiente e o que conquistar primeiro.",
    nino: true,
  },
  {
    kicker: "Importar por link",
    title: "Cole o link, a gente preenche.",
    text: "Traga um produto do Mercado Livre, da Amazon ou do Magalu e o Casa Mia busca nome, foto e preço. Depois acompanha se ele ficou mais barato.",
    image: "/images/carrossel/carrossel-05-link.webp",
    alt: "Janela Novo item do Casa Mia com o campo Importar por link e o botão Buscar informações.",
  },
  {
    kicker: "Visão da casa",
    title: "Veja a casa ganhando forma.",
    text: "Progresso, quanto já foi investido e quanto você economizou com descontos e cashback, tudo num só olhar.",
    image: "/images/carrossel/carrossel-06-visao-geral.webp",
    alt: "Visão geral do Casa Mia com os cartões Seu progresso, Seu dinheiro e Você economizou.",
  },
  {
    kicker: "Lista a dois",
    title: "Montem juntos, em tempo real.",
    text: "Convide quem mora com você por e-mail. Vocês editam a mesma lista e cada conquista aparece para todo mundo.",
    image: "/images/carrossel/carrossel-07-lista-a-dois.webp",
    alt: "Janela Convidar pessoa do Casa Mia, com o campo de e-mail e a explicação de que a pessoa convidada edita a lista junto.",
  },
] as const;

/** Tempo que cada slide fica na tela. Longo o bastante para ler o título e a frase. */
const SLIDE_MS = 6500;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Carrossel das funcionalidades do Casa Mia: um slide por vez, que avança sozinho.
 * Pausa ao passar o mouse ou ao focar nos controles, tem botão de pausa e setas para navegar,
 * e não avança sozinho para quem pede menos movimento.
 */
export function FeatureCarousel({
  tone = "light",
  className = "",
}: {
  tone?: "light" | "dark";
  className?: string;
}) {
  const baseId = useId();
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
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

  const playing = !reduced && !userPaused && !hovered && !focused && !tabHidden;

  // O índice no efeito faz o relógio recomeçar a cada troca, inclusive quando a pessoa navega.
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(
      () => setIndex((current) => (current + 1) % SLIDES.length),
      SLIDE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playing, index]);

  const go = useCallback(
    (next: number) => setIndex((next + SLIDES.length) % SLIDES.length),
    [],
  );
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(index - 1);
    }
  };

  return (
    <section
      className={`cm-carousel cm-carousel-${tone} ${className}`.trim()}
      aria-roledescription="carrossel"
      aria-label="Funcionalidades do Casa Mia"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setFocused(false);
      }}
      onKeyDown={onKeyDown}
    >
      <div
        className="cm-carousel-stage"
        id={`${baseId}-stage`}
        aria-live={playing ? "off" : "polite"}
      >
        {SLIDES.map((slide, slideIndex) => {
          const active = slideIndex === index;
          return (
            <div
              key={slide.title}
              className={`cm-carousel-slide${active ? " is-active" : ""}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${slideIndex + 1} de ${SLIDES.length}: ${slide.kicker}`}
              aria-hidden={!active}
              // `inert` tira os slides escondidos da ordem de foco (atributo já aceito pelos navegadores).
              inert={!active}
            >
              <figure className="cm-carousel-shot">
                <img
                  src={slide.image}
                  alt={active ? slide.alt : ""}
                  loading={slideIndex === 0 ? "eager" : "lazy"}
                  decoding="async"
                  width={1000}
                  height={533}
                />
              </figure>
              <div className="cm-carousel-copy">
                <span className="cm-carousel-kicker">{slide.kicker}</span>
                <h3>{slide.title}</h3>
                <p>{slide.text}</p>
                {"nino" in slide && slide.nino && (
                  <Nino pose="think" size={56} className="cm-carousel-nino" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="cm-carousel-controls">
        <button
          type="button"
          className="cm-carousel-arrow"
          onClick={() => go(index - 1)}
          aria-label="Funcionalidade anterior"
          aria-controls={`${baseId}-stage`}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <ol className="cm-carousel-dots" aria-label="Escolher funcionalidade">
          {SLIDES.map((slide, slideIndex) => {
            const active = slideIndex === index;
            return (
              <li key={slide.title}>
                <button
                  type="button"
                  className={`cm-carousel-dot${active ? " is-active" : ""}${
                    active && playing ? " is-running" : ""
                  }`}
                  style={{ ["--cm-slide-ms" as string]: `${SLIDE_MS}ms` }}
                  onClick={() => go(slideIndex)}
                  aria-label={`${slideIndex + 1} de ${SLIDES.length}: ${slide.kicker}`}
                  aria-current={active ? "true" : undefined}
                  aria-controls={`${baseId}-stage`}
                >
                  <span aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          className="cm-carousel-arrow"
          onClick={() => go(index + 1)}
          aria-label="Próxima funcionalidade"
          aria-controls={`${baseId}-stage`}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        {!reduced && (
          <button
            type="button"
            className="cm-carousel-arrow cm-carousel-pause"
            onClick={() => setUserPaused((current) => !current)}
            aria-label={
              userPaused ? "Retomar a troca automática" : "Pausar a troca automática"
            }
            aria-pressed={userPaused}
          >
            {userPaused ? (
              <Play size={16} aria-hidden="true" />
            ) : (
              <Pause size={16} aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    </section>
  );
}
