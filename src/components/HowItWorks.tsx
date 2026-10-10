import { useEffect, useRef } from "react";
import { Check } from "lucide-react";

const STEPS = [
  {
    title: "Conte como é a sua casa",
    text: "Poucas perguntas, em cerca de 2 minutos: com quem você mora, o tipo de moradia e a data da mudança. Sem e-mail por enquanto.",
    bullets: [
      "Apartamento, casa ou kitnet",
      "Você escolhe quais cômodos entram no plano",
      "Sem data da mudança? Tudo bem, dá para começar assim",
    ],
    image: "/images/como-funciona/passo-1-conte.webp",
    alt: "Tela do Casa Mia perguntando quais espaços da casa você quer equipar, com Cozinha, Banheiro, Sala de estar e Quarto principal marcados e o número de itens de cada um.",
  },
  {
    title: "Receba um plano feito para o seu lar",
    text: "O Casa Mia monta a lista por ambiente, com o essencial do primeiro dia no começo e o resto organizado para depois.",
    bullets: [
      "Cada ambiente tem o próprio progresso",
      "Veja quanto falta investir em cada espaço",
      "Ordene por pendentes ou por mais avançados",
    ],
    image: "/images/como-funciona/passo-2-plano.webp",
    alt: "Visão geral do Casa Mia mostrando 42% conquistado, o resumo de valores investidos e a lista de ambientes (Cozinha, Quarto, Banheiro, Sala de Estar e Área de Serviço) com a barra de progresso de cada um.",
  },
  {
    title: "Conquiste e risque, item por item",
    text: "Marque cada peça como comprei, ganhei ou já tenho. Preço, link e observações ficam no próprio item, sempre à mão.",
    bullets: [
      "Comprei, ganhei ou já tenho: cada conquista conta",
      "Anote preço, link da loja e observações",
      "Importe ou exporte tudo em planilha",
    ],
    image: "/images/como-funciona/passo-3-conquiste.webp",
    alt: "Lista do ambiente Cozinha no Casa Mia, com 50% conquistado, itens riscados como Jogo de panelas e Jogo de pratos de cerâmica e itens a comprar com preço.",
  },
  {
    title: "Organizem juntos, no mesmo ritmo",
    text: "Convide quem vai montar a casa com você. Vocês editam a mesma lista e acompanham as conquistas e o orçamento juntos.",
    bullets: [
      "Convite pelo e-mail de quem já tem conta",
      "Todo mundo vê cada item conquistado",
      "Resumo do que já foi investido e do que falta",
    ],
    image: "/images/como-funciona/passo-4-juntos.webp",
    alt: "Menu do Casa Mia com o cartão Organizem juntos, mostrando as iniciais de duas pessoas e o botão Convidar pessoas, acima da lista de ambientes.",
  },
];

/**
 * "Como funciona" em linha do tempo: uma espinha central se preenche conforme a pessoa rola,
 * e cada etapa entra com as telas reais do app. Sem JavaScript (ou com "reduzir movimento"),
 * tudo aparece de uma vez, sem animação.
 */
export function HowItWorks() {
  const timeline = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const root = timeline.current;
    if (!root) return;
    const steps = Array.from(
      root.querySelectorAll<HTMLElement>(".cm-how-step"),
    );
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.style.setProperty("--p", "1");
      for (const step of steps) step.classList.add("is-reached");
      return;
    }
    root.classList.add("is-animated");

    const update = () => {
      const mark = window.innerHeight * 0.55;
      const rect = root.getBoundingClientRect();
      const progress = Math.min(
        1,
        Math.max(0, (mark - rect.top) / rect.height),
      );
      root.style.setProperty("--p", progress.toFixed(4));
      for (const step of steps) {
        const box = step.getBoundingClientRect();
        step.classList.toggle("is-reached", box.top + box.height / 2 < mark);
      }
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          reveal.unobserve(entry.target);
        }
      },
      { threshold: 0.18 },
    );
    for (const step of steps) reveal.observe(step);

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      reveal.disconnect();
    };
  }, []);

  return (
    <section className="cm-how" id="como-funciona">
      <div className="cm-wrap">
        <div className="cm-heading">
          <span className="cm-eyebrow">Como funciona</span>
          <h2>Um passo de cada vez, sem pressa e sem exageros.</h2>
          <p>Você cuida dos sonhos. A gente ajuda a organizar o caminho.</p>
        </div>
        <ol className="cm-timeline" ref={timeline}>
          {STEPS.map((step, index) => (
            <li className="cm-how-step" key={step.title}>
              <div className="cm-how-copy">
                <span className="cm-how-num">0{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                <ul className="cm-checks">
                  {step.bullets.map((bullet) => (
                    <li key={bullet}>
                      <Check size={16} /> {bullet}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="cm-phone">
                <img
                  src={step.image}
                  alt={step.alt}
                  width={780}
                  height={1688}
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
