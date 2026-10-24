import { Card } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Accordion } from "radix-ui";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BedDouble,
  Bath,
  Check,
  ChevronDown,
  Coffee,
  Home,
  Menu,
  ShieldCheck,
  Sofa,
  WashingMachine,
  X,
} from "./landing-icons";
import { Brand } from "./Brand";
import { HowItWorks } from "./HowItWorks";
import { Nino } from "./Nino";
import { PAID_PLAN_OFFERS, PASS_MONTHS } from "../plans";
import type { PaidPlanId } from "../api";
import { trackLandingCta } from '../analytics';
import { consentRequired, openConsentPreferences } from '../analytics/consent';
import { PLAN_URL_VALUE } from '../planChoice';

const FAQS = [
  [
    "Preciso ter a casa pronta para começar?",
    "De jeito nenhum. Toda casa começa com um primeiro passo: pode ser só a ideia de se mudar. Você cria a lista, vai conquistando um item de cada vez e ajusta tudo quando a vida mudar.",
  ],
  [
    "Como funciona o teste de 2 dias?",
    "O teste é do plano Mensal. Você cadastra o cartão e tem 48 horas completas de acesso a tudo, sem cobrança. A gente avisa por e-mail 24 horas antes; se cancelar no app antes do fim, nada é cobrado. Se continuar, a mensalidade passa a ser cobrada todo mês no cartão.",
  ],
  [
    "Posso montar a lista com outra pessoa?",
    "Pode, e é muito mais gostoso assim. Quem mora com você entra pelo e-mail e usa a mesma lista pela sua assinatura, sem pagar nada. O que um risca, o outro vê ao abrir o app. Se a sua assinatura terminar, o acesso dessa pessoa pausa junto com o seu.",
  ],
  [
    "O que é o Chá de Casa Nova?",
    "É uma página pública só da sua lista, que chega em breve aos planos pagos. Com ela, seus convidados vão poder reservar um item ou mandar um Pix direto para você, sem precisar de cadastro, e deixar um recado de carinho.",
  ],
  [
    "Funciona no celular e no computador?",
    "Sim. O Casa Mia se ajusta à tela e fica à mão na loja ou no sofá. No celular, você ainda pode adicionar um atalho à tela inicial pelo navegador.",
  ],
  [
    "Passe ou Mensal: qual escolho?",
    "O Passe da Casa Nova é para quem vai montar a casa ao longo dos meses: R$ 99 de uma vez, 12 meses de acesso e nenhuma renovação, o mesmo que 3 meses do Mensal. O Mensal serve para a reta final da mudança ou para experimentar antes: 2 dias grátis com cartão e depois R$ 29,90 por mês, até você cancelar. Quando os 12 meses do Passe acabam, o acesso termina sem cobrança e a sua conta continua guardada.",
  ],
];

type Plan = {
  id: PaidPlanId;
  name: string;
  price: string;
  per: string;
  billing: string;
  badge?: string;
  featured?: boolean;
  cta: string;
};

/** O que os dois planos liberam: a lista aparece uma vez, abaixo dos cartões. */
const PAID_FEATURES = [
  "Cômodos e itens ilimitados",
  "Lista a dois, com quem mora com você",
  "Sugestões do Nino para cada cômodo",
  "Página do Chá de Casa Nova (em breve)",
  "Importar e exportar em Excel e CSV",
];

const passOffer = PAID_PLAN_OFFERS.find((offer) => offer.id === "pass");

const PLANS: Plan[] = PAID_PLAN_OFFERS.map((offer) => ({
  ...offer,
  billing: offer.id === "pass"
    ? offer.billing
    : `2 dias grátis com cartão; depois, ${offer.price.replace(" ", " ")} por mês até você cancelar.`,
  cta: offer.id === "pass" ? "Escolher o Passe" : "Começar teste de 2 dias",
}));

const HERO_BENEFITS = [
  "Quantidades na medida da casa",
  "Aviso de itens repetidos",
];

/** Exemplo ilustrativo do progresso por cômodo (não são dados de ninguém). */
const ROOM_PROGRESS = [
  { icon: Coffee, name: "Cozinha", done: 9, total: 14 },
  { icon: BedDouble, name: "Quarto", done: 6, total: 8 },
  { icon: Bath, name: "Banheiro", done: 7, total: 7 },
  { icon: Sofa, name: "Sala", done: 2, total: 9 },
  { icon: WashingMachine, name: "Lavanderia", done: 1, total: 6 },
];

/** Dores das personas do manual de marca, lado a lado com o que o Casa Mia faz. */
const CALM_PAIRS = [
  ["Esquecer o abridor de lata e só perceber na hora de usar", "O essencial do Primeiro Dia vem no começo da lista"],
  ["Comprar em dobro por insegurança", "Aviso gentil quando um item pode ser repetido"],
  ["Planilha que ninguém mais atualiza", "Uma lista só, que você e quem mora com você editam juntos"],
];

const NINO_SUGGESTIONS = [
  { label: "Próximo item da Cozinha", title: "Panela de pressão", note: "Essencial do Primeiro Dia" },
  { label: "Um aviso amigo", title: "Torradeira", note: "Você já tem airfryer e forno elétrico. Dá para deixar para depois." },
];

/** Dentro do passo 02 do "Como funciona": o progresso de cada cômodo, no estilo do app. */
function RoomProgress() {
  return (
    <figure className="cm-rooms-example">
      <figcaption>Exemplo: cada cômodo com o próprio progresso</figcaption>
      <ul className="cm-rooms-progress">
        {ROOM_PROGRESS.map((room) => {
          const complete = room.done === room.total;
          return (
            <li key={room.name} className={complete ? "is-complete" : undefined}>
              <span className="cm-card-icon"><room.icon size={22} strokeWidth={1.7} aria-hidden="true" /></span>
              <div>
                <strong>{room.name}</strong>
                <small>{room.done} de {room.total} itens{complete ? " · Completo" : ""}</small>
                <span
                  className="cm-progress-bar"
                  role="img"
                  aria-label={`${room.name}: ${room.done} de ${room.total} itens conquistados`}
                >
                  <span style={{ width: `${Math.round((room.done / room.total) * 100)}%` }} />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

const MOCK_ITEMS = [
  { name: "Colchão", room: "Quarto", done: true },
  { name: "Chuveiro e ducha", room: "Banheiro", done: true },
  { name: "Panela de pressão", room: "Cozinha", done: true },
  { name: "Jogo de toalhas", room: "Banheiro", done: false },
];

/**
 * Os espaços que a frase do hero percorre, na ordem em que aparecem. São só quatro de propósito:
 * três trocas de 1,5 s somam 4,5 s, abaixo dos 5 s de movimento automático que o DESIGN.md e a
 * WCAG 2.2.2 aceitam sem um botão de pausa. A frase para no último.
 */
const PLACES = [
  "o primeiro lar",
  "a sua kitnet",
  "o seu apartamento",
  "o lar de vocês dois",
];
const PLACE_INTERVAL_MS = 1500;

/**
 * "Para quem está montando …" com o final trocando a cada 1,5 s até o último lugar. Para quem
 * usa leitor de tela, fica uma frase fixa (a animação é decorativa). Pausa ao passar o mouse e
 * não gira para quem prefere menos movimento.
 */
function RotatingPlace() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const finished = index === PLACES.length - 1;
  useEffect(() => {
    if (paused || finished || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const timer = window.setTimeout(() => setIndex((current) => current + 1), PLACE_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [paused, finished, index]);
  return (
    <span
      className="cm-eyebrow cm-rotator"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span className="sr-only">Para quem está montando {PLACES[PLACES.length - 1]}</span>
      <span aria-hidden="true">
        Para quem está montando{" "}
        <span className="cm-rotator-window">
          <span key={index} className="cm-rotator-word">
            {PLACES[index]}
          </span>
        </span>
      </span>
    </span>
  );
}

/** Prévia do app: a porta em arco enche de luz conforme os itens são conquistados. */
function AppMock() {
  return (
    <div className="cm-mock" aria-hidden="true">
      <div className="cm-mock-top">
        <span>Meu Lar</span>
        <small>Apê da Ana e do Léo</small>
      </div>
      <div className="cm-mock-door">
        <svg viewBox="0 0 120 150" width="96" height="120">
          <defs>
            <clipPath id="cm-arch">
              <path d="M16 142 V62 a44 44 0 0 1 88 0 V142 Z" />
            </clipPath>
            <linearGradient id="cm-glow" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#fcc97a" />
              <stop offset="1" stopColor="#fff3d6" />
            </linearGradient>
          </defs>
          <path d="M16 142 V62 a44 44 0 0 1 88 0 V142 Z" fill="#f6e7d2" />
          <rect
            x="0"
            y="64"
            width="120"
            height="90"
            fill="url(#cm-glow)"
            clipPath="url(#cm-arch)"
          />
          <path
            d="M16 142 V62 a44 44 0 0 1 88 0 V142 Z"
            fill="none"
            stroke="#a34c30"
            strokeWidth="6"
            strokeLinejoin="round"
          />
          <rect x="8" y="140" width="104" height="9" rx="4" fill="#a34c30" />
        </svg>
        <div>
          <strong>8 de 12</strong>
          <span>itens do Primeiro Dia</span>
        </div>
      </div>
      <p className="cm-mock-shared">
        <span className="cm-mock-avatars">
          <span>A</span>
          <span>L</span>
        </span>
        Ana e Léo editam esta lista
      </p>
      <ul className="cm-mock-list">
        {MOCK_ITEMS.map((item) => (
          <li key={item.name} className={item.done ? "is-done" : undefined}>
            <span className="cm-mock-check">
              {item.done && <Check size={13} strokeWidth={3} />}
            </span>
            <span className="cm-mock-name">{item.name}</span>
            <small>{item.room}</small>
          </li>
        ))}
      </ul>
      <p className="cm-mock-note">
        Mais uma peça no lugar! A sua casa está tomando forma.
      </p>
    </div>
  );
}

export function LandingPage({ signedIn, authLoading = false }: { signedIn: boolean; authLoading?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  // No topo o menu fica sem fundo; ao rolar, vira a barra de vidro.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    document.title = "Casa Mia | Enxoval de casa nova";
  }, []);
  const start = signedIn || authLoading ? "/app" : "/cadastro";
  const startLabel = signedIn || authLoading ? "Acessar meu lar" : "Começar minha lista";
  const closeMenu = () => setMenuOpen(false);
  const trackStart = (position: 'header' | 'hero' | 'pricing' | 'footer_cta') => trackLandingCta(signedIn || authLoading ? 'open_app' : 'start_trial', position);

  return (
    <div className="cm-page">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>

      <header className={`cm-header${scrolled ? " is-scrolled" : ""}`}>
        <a
          href="/"
          className="brand-link"
          aria-label="Casa Mia, página inicial"
        >
          <Brand />
        </a>
        <nav
          className={`cm-nav${menuOpen ? " is-open" : ""}`}
          aria-label="Navegação principal"
        >
          <a href="#como-funciona" onClick={() => { trackLandingCta('view_how_it_works', 'navigation'); closeMenu(); }}>
            Como funciona
          </a>
          <a href="#nino" onClick={() => { trackLandingCta('view_nino', 'navigation'); closeMenu(); }}>
            O Nino
          </a>
          <a href="#planos" onClick={() => { trackLandingCta('view_pricing', 'navigation'); closeMenu(); }}>
            Preços
          </a>
          {!authLoading && <a className={`cm-nav-login cm-btn ${signedIn ? "cm-btn-primary is-signed-in" : "cm-login-secondary"}`} href={signedIn ? "/app" : "/login"} onClick={() => trackLandingCta(signedIn ? 'open_app' : 'login', 'navigation')}>
            {signedIn ? <><Home size={18} /> Acessar meu lar</> : "Entrar"}
          </a>}
        </nav>
        <div className="cm-header-actions">
          {!authLoading && <a className={`cm-login cm-btn cm-btn-sm ${signedIn ? "cm-btn-primary is-signed-in" : "cm-login-secondary"}`} href={signedIn ? "/app" : "/login"} onClick={() => trackLandingCta(signedIn ? 'open_app' : 'login', 'header')}>
            {signedIn ? <><Home size={18} /> Acessar meu lar</> : "Entrar"}
          </a>}
          {!signedIn && !authLoading && <a className="cm-btn cm-btn-primary cm-btn-sm" href={start} onClick={() => trackStart('header')}>
            Começar minha lista
          </a>}
          <button
            type="button"
            className="cm-menu-toggle"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      <main id="conteudo">
        <section className="cm-hero cm-wrap">
          <div className="cm-hero-copy">
            <RotatingPlace />
            <h1>
              Transforme o sonho da casa nova em uma lista que dá para riscar,{" "}
              <em>item por item.</em>
            </h1>
            <p>
              Uma lista só para vocês dois: cada um risca do próprio celular, e o Nino
              lembra o essencial do Primeiro Dia, o que a casa precisa para funcionar
              já na primeira noite.
            </p>
            <div className="cm-hero-actions">
              <a className="cm-btn cm-btn-primary cm-btn-lg" href={start} onClick={() => trackStart('hero')}>
                {startLabel} <ArrowRight size={18} />
              </a>
              <a
                className="cm-btn cm-btn-ghost cm-btn-lg"
                href="#como-funciona"
                onClick={() => trackLandingCta('view_how_it_works', 'hero')}
              >
                Ver como funciona
              </a>
            </div>
            {!signedIn && !authLoading && (
              <p className="cm-hero-terms">
                Primeiro você monta a lista; depois escolhe entre o Passe ({passOffer?.price.replace(" ", " ")}, {PASS_MONTHS}{" "}meses)
                e o Mensal com 2 dias grátis, que pede o cartão.
              </p>
            )}
            <ul className="cm-hero-notes">
              {(signedIn || authLoading) && (
                <li>
                  <Check size={15} /> Seu enxoval sempre à mão
                </li>
              )}
              {HERO_BENEFITS.map((benefit) => (
                <li key={benefit}>
                  <Check size={15} /> {benefit}
                </li>
              ))}
            </ul>
          </div>
          <div className="cm-hero-visual">
            <AppMock />
            <Nino pose="wave" size={190} className="cm-hero-nino" />
          </div>
        </section>

        <HowItWorks extras={{ 1: <RoomProgress /> }} />

        <section className="cm-nino" id="nino">
          <div className="cm-wrap cm-nino-grid">
            <div className="cm-nino-figure">
              <Nino
                pose="think"
                size={250}
                loading="lazy"
                title="Nino, a casinha-chaveiro do Casa Mia, com uma pranchetinha"
              />
            </div>
            <div className="cm-nino-copy">
              <span className="cm-eyebrow">Conheça o Nino</span>
              <h2>Uma ajudinha para o seu cantinho.</h2>
              <p>
                Com jeitinho de casinha e pranchetinha na mão, o Nino é o
                mascote do Casa Mia. Ele ajuda a organizar a lista e as
                prioridades, para vocês cuidarem do novo lar uma escolha de cada vez.
              </p>
              <div className="cm-nino-demo" role="group" aria-label="Exemplo de sugestões do Nino">
                {NINO_SUGGESTIONS.map((suggestion) => (
                  <div className="cm-nino-suggestion" key={suggestion.title}>
                    <small>{suggestion.label}</small>
                    <strong>{suggestion.title}</strong>
                    <span>{suggestion.note}</span>
                  </div>
                ))}
              </div>
              <p className="cm-nino-how">
                Na área Ajuda do Nino, escolha um cômodo e peça uma sugestão. Ao
                adicionar um item, ele também sugere o cômodo e avisa sobre possíveis
                repetições. As sugestões são dele; as escolhas são de vocês.
              </p>
            </div>
          </div>
        </section>

        <section className="cm-section cm-wrap cm-calm" id="da-bagunca-a-calma">
          <div className="cm-calm-intro">
            <div className="cm-heading">
              <span className="cm-eyebrow">Da bagunça à calma</span>
              <h2>Menos susto, mais casa em ordem.</h2>
              <p>Toda mudança tem os seus imprevistos. Veja o que muda quando a lista cuida deles com vocês.</p>
            </div>
            <div className="cm-calm-couple" aria-hidden="true">
              <span className="cm-mock-avatars">
                <span>A</span>
                <span>L</span>
              </span>
              <p>
                <strong>Apê da Ana e do Léo</strong>
                Uma lista, dois celulares. Exemplo ilustrativo.
              </p>
            </div>
          </div>
          <ul className="cm-calm-list">
            {CALM_PAIRS.map(([before, after]) => (
              <li key={before}>
                <p className="cm-calm-before"><span>Antes</span>{before}</p>
                <p className="cm-calm-after"><span>Com o Casa Mia</span>{after}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="cm-section cm-wrap" id="planos">
          <div className="cm-heading">
            <span className="cm-eyebrow">Preços</span>
            <h2>Um ano de casa nova num pagamento só, ou um mês de cada vez.</h2>
            <p>Sem letras miúdas: você monta a lista primeiro e escolhe a assinatura depois.</p>
          </div>
          <div className="cm-plans">
            {PLANS.map((plan) => (
              <Card key={plan.id} asChild className="block gap-0"><article
                className={`cm-plan${plan.featured ? " is-featured" : ""}`}
              >
                {plan.badge && (
                  <Badge asChild variant="outline"><span className="cm-plan-badge">{plan.badge}</span></Badge>
                )}
                <h3>{plan.name}</h3>
                <p className="cm-plan-price">
                  <strong>{plan.price}</strong>
                  {plan.per && <span>{plan.per}</span>}
                </p>
                <p className="cm-plan-billing">{plan.billing}</p>
                <a
                  className={`cm-btn ${plan.featured ? "cm-btn-primary" : "cm-btn-outline"}`}
                  href={`${start}?plano=${PLAN_URL_VALUE[plan.id]}`}
                  onClick={() => trackStart('pricing')}
                >
                  {signedIn || authLoading ? `Ver o ${plan.name} no app` : plan.cta}
                </a>
              </article></Card>
            ))}
          </div>
          <div className="cm-plan-includes">
            <h3>Os dois planos liberam tudo</h3>
            <ul>
              {PAID_FEATURES.map((feature) => (
                <li key={feature}>
                  <Check size={15} /> {feature}
                </li>
              ))}
            </ul>
          </div>
          <p className="cm-disclaimer">
            <ShieldCheck size={15} /> Os 2 dias grátis são só do Mensal e pedem o cartão.
            Cancele no app antes de 48 horas e nada é cobrado.
          </p>
        </section>

        <section className="cm-section cm-wrap cm-faq" id="duvidas">
          <div className="cm-heading">
            <span className="cm-eyebrow">Dúvidas</span>
            <h2>Conversa franca, do jeito que a gente gosta.</h2>
          </div>
          <Accordion.Root type="single" collapsible className="cm-faq-list">
            {FAQS.map(([question, answer], index) => (
              <Accordion.Item className="cm-faq-item border-b last:border-b-0" key={question} value={`faq-${index}`}>
                <Accordion.Header className="flex">
                  <Accordion.Trigger className="flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50">
                    {question}
                    <ChevronDown size={16} className="pointer-events-none size-4 shrink-0 translate-y-0.5 text-muted-foreground transition-transform duration-200" />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                  <div className="pt-0 pb-4"><p>{answer}</p></div>
                </Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        </section>

        <section className="cm-final cm-wrap">
          <Nino pose="wave" size={120} className="cm-final-nino" loading="lazy" />
          <h2>Toda casa começa com um primeiro passo.</h2>
          <p>Que tal colocar a cama ou o chuveiro na lista agora?</p>
          <a className="cm-btn cm-btn-primary cm-btn-lg" href={start} onClick={() => trackStart('footer_cta')}>
            {signedIn || authLoading ? "Acessar meu lar" : "Começar minha lista"} <ArrowRight size={18} />
          </a>
        </section>
      </main>

      <footer className="cm-footer cm-wrap">
        <div className="cm-footer-brand">
          <a
            href="/"
            className="brand-link"
            aria-label="Casa Mia, página inicial"
          >
            <Brand />
          </a>
          <p>Feito com carinho para quem está montando o próprio cantinho.</p>
        </div>
        <nav className="cm-footer-links" aria-label="Rodapé">
          <a href="#como-funciona" onClick={() => trackLandingCta('view_how_it_works', 'footer')}>Como funciona</a>
          <a href="#planos" onClick={() => trackLandingCta('view_pricing', 'footer')}>Preços</a>
          <a href="/como-o-nino-escolhe">Como o Nino escolhe</a>
          <a href="/privacidade">Privacidade</a>
          {consentRequired() && (
            <a href="/privacidade" onClick={(event) => { event.preventDefault(); openConsentPreferences(); }}>
              Preferências de privacidade
            </a>
          )}
        </nav>
        <span className="cm-footer-copy">
          © {new Date().getFullYear()} Casa Mia
        </span>
      </footer>
    </div>
  );
}
