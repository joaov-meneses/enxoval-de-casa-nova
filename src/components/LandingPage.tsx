import { Card } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./ui/accordion";
import { Button } from "@/src/components/ui/button";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BedDouble,
  Bath,
  CalendarClock,
  Check,
  ChevronDown,
  Coffee,
  HeartHandshake,
  Home,
  LayoutGrid,
  Link2,
  ListChecks,
  Menu,
  PiggyBank,
  Ruler,
  ShieldCheck,
  Sofa,
  WashingMachine,
  X,
} from "@/src/components/icons";
import { Brand } from "./Brand";
import { HowItWorks } from "./HowItWorks";
import { Nino } from "./Nino";
import { FREE_PLAN_LIMITS, PAID_PLAN_OFFERS, PASS_MONTHS } from "../plans";
import { trackLandingCta } from '../analytics';

const FAQS = [
  [
    "Preciso ter a casa pronta para começar?",
    "De jeito nenhum. Toda casa começa com um primeiro passo: pode ser só a ideia de se mudar. Você cria a lista, vai conquistando um item de cada vez e ajusta tudo quando a vida mudar.",
  ],
  [
    "Quem é o Nino e como ele me ajuda?",
    "O Nino é a casinha-chaveiro do Casa Mia, sempre de pranchetinha em mãos. Na área Ajuda do Nino, você escolhe um ambiente para receber sugestões de itens e ver o que comprar primeiro. Ao adicionar um item, ele também sugere o cômodo e avisa sobre possíveis repetições. As sugestões são dele; as escolhas são suas.",
  ],
  [
    "Como funciona o teste de 2 dias?",
    "Você cadastra o cartão e tem 48 horas completas de acesso a tudo. Depois, a mensalidade é cobrada automaticamente. Avisamos por e-mail e no app; cancele antes do fim para evitar a cobrança. O cancelamento bloqueia também os convidados e preserva sua conta e seus dados.",
  ],
  [
    "Posso montar a lista com outra pessoa?",
    "Pode, e é muito mais gostoso assim. Quem mora com você entra pelo e-mail, edita a mesma lista e acompanha cada conquista junto.",
  ],
  [
    "O que é o Chá de Casa Nova?",
    "É uma página pública só da sua lista. Seus convidados reservam um item ou mandam um Pix direto para você, sem precisar de cadastro, e ainda deixam um recado de carinho.",
  ],
  [
    "Funciona no celular e no computador?",
    "Sim. O Casa Mia se ajusta à tela e fica à mão na loja ou no sofá. No celular, você ainda pode adicionar um atalho à tela inicial pelo navegador.",
  ],
  [
    "Os planos já estão disponíveis para compra?",
    "O teste completo dura 2 dias, com cartão cadastrado. Depois das 48 horas, a assinatura mensal é cobrada automaticamente. Você pode cancelar no app antes do fim para evitar a cobrança.",
  ],
];

const ROOMS = [
  { icon: Coffee, name: "Cozinha" },
  { icon: BedDouble, name: "Quarto" },
  { icon: Sofa, name: "Sala" },
  { icon: Bath, name: "Banheiro" },
  { icon: WashingMachine, name: "Lavanderia" },
];

const FEATURES = [
  {
    icon: LayoutGrid,
    title: "Organização por cômodos",
    text: "Cada canto da casa ganha a sua lista, com cards fáceis de tocar e o progresso de cada espaço à vista.",
    rooms: true,
  },
  {
    icon: Ruler,
    title: "Um plano do tamanho da sua casa",
    text: "Poucas perguntas e o Casa Mia monta a lista pelo clima, pela casa e por quem mora nela, sem o que você não precisa comprar.",
  },
  {
    icon: CalendarClock,
    title: "Cada coisa no seu tempo",
    text: "A semana certa de cada item, a partir da data da mudança, e a faixa de gasto esperada. Você ajusta como preferir.",
  },
  {
    icon: Link2,
    title: "Cole o link, a gente preenche",
    text: "Traga um produto do Mercado Livre, da Amazon ou do Magalu e o Casa Mia busca nome, foto e preço.",
  },
  {
    icon: PiggyBank,
    title: "O dinheiro sempre à vista",
    text: "Quanto você já investiu, quanto falta e quanto economizou com descontos e cashback, tudo num só olhar.",
  },
  {
    icon: HeartHandshake,
    title: "Lista a dois",
    text: "Casais e moradores na mesma lista, em tempo real. Cada conquista aparece para todo mundo.",
  },
];

type Plan = {
  id: string;
  name: string;
  price: string;
  per: string;
  billing: string;
  badge?: string;
  featured?: boolean;
  cta: string;
  features: string[];
};

const PAID_FEATURES = [
  "Cômodos e itens ilimitados",
  "Lista a dois, em tempo real",
  "Dicas do Nino ampliadas",
  "Página do Chá de Casa Nova",
  "Importar e exportar em Excel e CSV",
];

const priceInReais = (price: string) => Number(price.replace(/[^\d,]/g, "").replace(",", "."));
const monthlyOffer = PAID_PLAN_OFFERS.find((offer) => offer.id === "monthly");
const passOffer = PAID_PLAN_OFFERS.find((offer) => offer.id === "pass");
const passDiscount = monthlyOffer && passOffer
  ? Math.round((1 - priceInReais(passOffer.price) / (priceInReais(monthlyOffer.price) * PASS_MONTHS)) * 100)
  : 0;

const PLANS: Plan[] = PAID_PLAN_OFFERS.map((offer) => ({
  ...offer,
  badge: offer.id === "pass" && passDiscount > 0 ? `${passDiscount}% de desconto` : undefined,
  billing: offer.id === "pass"
    ? `${PASS_MONTHS} meses de acesso por pagamento único, sem renovação automática. ${passDiscount > 0 ? `${passDiscount}% menos que ${PASS_MONTHS} mensalidades.` : ""}`
    : "2 dias de teste; depois, cobrança mensal automática. Cancele antes do fim do teste para evitar a cobrança.",
  cta: offer.id === "pass" ? "Escolher o Passe" : "Começar teste de 2 dias",
  features: PAID_FEATURES,
}));

const MOCK_ITEMS = [
  { name: "Colchão", room: "Quarto", done: true },
  { name: "Chuveiro e ducha", room: "Banheiro", done: true },
  { name: "Panela de pressão", room: "Cozinha", done: true },
  { name: "Jogo de toalhas", room: "Banheiro", done: false },
];

/** Cada espaço que alguém pode estar montando; a frase troca sozinha no hero. */
const PLACES = [
  "o primeiro lar",
  "o seu quarto",
  "o seu apartamento",
  "a sua chácara",
  "a sua kitnet",
  "a sua casa de praia",
  "o seu estúdio",
  "o seu cantinho",
];
const PLACE_INTERVAL_MS = 1500;

/**
 * "Para quem está montando …" com o final trocando a cada 1,5 s. Para quem usa leitor de tela,
 * fica uma frase fixa (a animação é decorativa). Pausa ao passar o mouse ou focar, e não gira
 * para quem prefere menos movimento.
 */
function RotatingPlace() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % PLACES.length),
      PLACE_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, [paused]);
  return (
    <span
      className="cm-eyebrow cm-rotator"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span className="sr-only">Para quem está montando {PLACES[0]}</span>
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
  const [faq, setFaq] = useState<number | null>(0);
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
  const startLabel = signedIn || authLoading ? "Acessar meu lar" : "Começar teste de 2 dias";
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
            Como Funciona
          </a>
          <a href="#nino" onClick={() => { trackLandingCta('view_nino', 'navigation'); closeMenu(); }}>
            O Nino
          </a>
          <a href="#planos" onClick={() => { trackLandingCta('view_pricing', 'navigation'); closeMenu(); }}>
            Preços
          </a>
          {!authLoading && <Button asChild variant="brand" size="brand"><a className={`cm-nav-login cm-btn ${signedIn ? "cm-btn-primary is-signed-in" : "cm-login-secondary"}`} href={signedIn ? "/app" : "/login"} onClick={() => trackLandingCta(signedIn ? 'open_app' : 'login', 'navigation')}>
            {signedIn ? <><Home size={18} /> Acessar meu lar</> : "Entrar"}
          </a></Button>}
        </nav>
        <div className="cm-header-actions">
          {!authLoading && <Button asChild variant="brand" size="brand"><a className={`cm-login cm-btn cm-btn-sm ${signedIn ? "cm-btn-primary is-signed-in" : "cm-login-secondary"}`} href={signedIn ? "/app" : "/login"} onClick={() => trackLandingCta(signedIn ? 'open_app' : 'login', 'header')}>
            {signedIn ? <><Home size={18} /> Acessar meu lar</> : "Entrar"}
          </a></Button>}
          {!signedIn && !authLoading && <Button asChild variant="brand" size="brand"><a className="cm-btn cm-btn-primary cm-btn-sm cm-trial-cta" href={start} onClick={() => trackStart('header')}>
            Testar por 2 dias
          </a></Button>}
          <Button variant="brand" size="brand"
            type="button"
            className="cm-menu-toggle"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </Button>
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
              Chega de planilhas estressantes e compras por impulso. O Casa Mia
              organiza seu enxoval, protege seu orçamento com inteligência
              artificial e celebra cada conquista do seu novo lar.
            </p>
            <div className="cm-hero-actions">
              <Button asChild variant="brand" size="brand"><a className="cm-btn cm-btn-primary cm-btn-lg cm-trial-cta" href={start} onClick={() => trackStart('hero')}>
                {startLabel} <ArrowRight size={18} />
              </a></Button>
              <Button asChild variant="brand" size="brand"><a
                className="cm-btn cm-btn-ghost cm-btn-lg"
                href="#como-funciona"
                onClick={() => trackLandingCta('view_how_it_works', 'hero')}
              >
                Ver como funciona
              </a></Button>
            </div>
            <ul className="cm-hero-notes">
              <li>
                <Check size={15} /> {signedIn || authLoading ? "Seu enxoval sempre à mão" : "48 horas de acesso completo"}
              </li>
              <li>
                <Check size={15} /> Do seu jeito, no seu tempo
              </li>
            </ul>
          </div>
          <div className="cm-hero-visual">
            <AppMock />
            <Nino pose="wave" size={190} className="cm-hero-nino" />
          </div>
        </section>

        <HowItWorks />

        <section className="cm-nino" id="nino">
          <div className="cm-wrap cm-nino-grid">
            <div className="cm-nino-figure">
              <Nino
                pose="think"
                size={250}
                title="Nino, a casinha-chaveiro do Casa Mia, com uma pranchetinha"
              />
            </div>
            <div className="cm-nino-copy">
              <span className="cm-eyebrow">Conheça o Nino</span>
              <h2>Uma ajudinha para o seu cantinho.</h2>
              <p>
                Com jeitinho de casinha e pranchetinha na mão, o Nino é o
                mascote do Casa Mia. Ele ajuda a organizar a lista e as
                prioridades, para você cuidar do seu novo lar uma escolha de cada vez.
              </p>
              <div className="cm-nino-note">
                <strong>Um cômodo de cada vez, do seu jeitinho.</strong>
                <p>
                  Na área Ajuda do Nino, escolha um ambiente e peça uma sugestão.
                  Você decide o que entra na lista.
                </p>
              </div>
              <ul className="cm-checks">
                <li>
                  <Check size={16} /> Sugere o próximo item para cada ambiente
                </li>
                <li>
                  <Check size={16} /> Ajuda a escolher o que comprar primeiro
                </li>
                <li>
                  <Check size={16} /> Ao adicionar itens, sugere o cômodo e avisa sobre possíveis repetições
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="cm-section cm-wrap" id="recursos">
          <div className="cm-heading">
            <span className="cm-eyebrow">Feito para o seu lar</span>
            <h2>Tudo o que a sua casa nova pede, no lugar certo.</h2>
          </div>
          <div className="cm-features">
            {FEATURES.map((feature) => (
              <Card key={feature.title} asChild className="block gap-0"><article className="cm-card">
                <span className="cm-card-icon">
                  <feature.icon size={24} strokeWidth={1.7} aria-hidden="true" />
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
                {feature.rooms && (
                  <ul className="cm-rooms">
                    {ROOMS.map((room) => (
                      <li key={room.name}>
                        <room.icon size={16} strokeWidth={1.7} /> {room.name}
                      </li>
                    ))}
                  </ul>
                )}
              </article></Card>
            ))}
          </div>
        </section>

        <section className="cm-section cm-wrap" id="planos">
          <div className="cm-heading">
            <span className="cm-eyebrow">Preços</span>
            <h2>Comece de graça. Cresça quando a casa crescer.</h2>
            <p>Sem letras miúdas: você vê o que paga antes de escolher.</p>
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
                <Button asChild variant="brand" size="brand"><a
                  className={`cm-btn ${plan.featured ? "cm-btn-primary" : "cm-btn-outline"}`}
                  href={start}
                  onClick={() => trackStart('pricing')}
                >
                  {signedIn || authLoading ? "Acessar meu lar" : plan.cta}
                </a></Button>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <Check size={15} /> {feature}
                    </li>
                  ))}
                </ul>
              </article></Card>
            ))}
          </div>
          <p className="cm-disclaimer">
            <ShieldCheck size={15} /> Os valores são os previstos para o
            lançamento. Por enquanto, nenhuma cobrança é realizada.
          </p>
        </section>

        <section className="cm-section cm-wrap cm-faq" id="duvidas">
          <div className="cm-heading">
            <span className="cm-eyebrow">Dúvidas</span>
            <h2>Conversa franca, do jeito que a gente gosta.</h2>
          </div>
          <Accordion type="single" collapsible className="cm-faq-list">
            {FAQS.map(([question, answer], index) => (
              <AccordionItem className="cm-faq-item" key={question} value={`faq-${index}`}>
                <AccordionTrigger>{question}</AccordionTrigger>
                <AccordionContent><p>{answer}</p></AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="cm-final cm-wrap">
          <Nino pose="wave" size={120} className="cm-final-nino" />
          <h2>Toda casa começa com um primeiro passo.</h2>
          <p>Que tal colocar a cama ou o chuveiro na lista agora?</p>
          <Button asChild variant="brand" size="brand"><a className="cm-btn cm-btn-primary cm-btn-lg" href={start} onClick={() => trackStart('footer_cta')}>
            {signedIn || authLoading ? "Acessar meu lar" : "Testar por 2 dias"} <ArrowRight size={18} />
          </a></Button>
          {!signedIn && !authLoading && <small>Cartão necessário. Cancele antes do fim para evitar a cobrança.</small>}
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
          <a href="#como-funciona" onClick={() => trackLandingCta('view_how_it_works', 'footer')}>Como Funciona</a>
          <a href="#planos" onClick={() => trackLandingCta('view_pricing', 'footer')}>Preços</a>
          <a href="/privacidade">Privacidade</a>
        </nav>
        <span className="cm-footer-copy">
          © {new Date().getFullYear()} Casa Mia
        </span>
      </footer>
    </div>
  );
}
