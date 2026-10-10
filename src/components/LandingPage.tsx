import { useEffect, useState } from "react";
import {
  ArrowRight,
  BedDouble,
  Bath,
  Check,
  ChevronDown,
  Coffee,
  Gift,
  HeartHandshake,
  Lightbulb,
  ListChecks,
  Menu,
  MessageCircleHeart,
  QrCode,
  ShieldCheck,
  Sofa,
  WashingMachine,
  X,
} from "lucide-react";
import { Brand } from "./Brand";
import { HowItWorks } from "./HowItWorks";
import { Nino } from "./Nino";

const FAQS = [
  [
    "Preciso ter a casa pronta para começar?",
    "De jeito nenhum. Toda casa começa com um primeiro passo: pode ser só a ideia de se mudar. Você cria a lista, vai conquistando um item de cada vez e ajusta tudo quando a vida mudar.",
  ],
  [
    "Quem é o Nino e como ele me ajuda?",
    "O Nino é a casinha-chaveiro que acompanha a sua mudança. Ele segura a trena, lembra do que não pode faltar no primeiro dia e ajuda a decidir o que fica para depois, sem julgar nenhuma escolha.",
  ],
  [
    "O plano gratuito tem prazo para acabar?",
    "Não. Você começa agora, sem cartão, com 2 cômodos e até 5 itens em cada um. Quando a sua casa crescer, é só abrir as portas dos outros cômodos em um plano pago.",
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
    "Ainda não. Os valores desta página são os previstos para o lançamento. Hoje não há cobrança, assinatura ativa nem pedido de cartão: você cria a conta e começa a montar o seu lar.",
  ],
];

const ROOMS = [
  { icon: Coffee, name: "Cozinha" },
  { icon: BedDouble, name: "Quarto" },
  { icon: Sofa, name: "Sala" },
  { icon: Bath, name: "Banheiro" },
  { icon: WashingMachine, name: "Lavanderia" },
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

const PLANS: Plan[] = [
  {
    id: "gratis",
    name: "Gratuito",
    price: "R$ 0",
    per: "",
    billing: "Para começar agora, sem cartão",
    cta: "Começar Grátis",
    features: [
      "2 cômodos com até 5 itens cada",
      "Lista do Primeiro Dia",
      "3 dicas do Nino por mês",
      "No celular e no computador",
    ],
  },
  {
    id: "semestral",
    name: "Semestral",
    price: "R$ 19,90",
    per: "/mês",
    billing: "Cobrado R$ 119,40 a cada 6 meses",
    badge: "Mais Escolhido",
    featured: true,
    cta: "Quero o Semestral",
    features: PAID_FEATURES,
  },
  {
    id: "anual",
    name: "Anual",
    price: "R$ 14,90",
    per: "/mês",
    billing: "Cobrado R$ 178,80 por ano",
    badge: "50% de desconto",
    cta: "Quero o Anual",
    features: PAID_FEATURES,
  },
  {
    id: "mensal",
    name: "Mensal",
    price: "R$ 29,90",
    per: "/mês",
    billing: "Flexibilidade total, mês a mês",
    cta: "Quero o Mensal",
    features: PAID_FEATURES,
  },
];

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

export function LandingPage({ signedIn }: { signedIn: boolean }) {
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
  const start = signedIn ? "/app" : "/comecar";
  const closeMenu = () => setMenuOpen(false);

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
          <a href="#como-funciona" onClick={closeMenu}>
            Como Funciona
          </a>
          <a href="#nino" onClick={closeMenu}>
            O Nino
          </a>
          <a href="#cha" onClick={closeMenu}>
            Chá de Casa Nova
          </a>
          <a href="#planos" onClick={closeMenu}>
            Preços
          </a>
          <a className="cm-nav-login" href={signedIn ? "/app" : "/login"}>
            {signedIn ? "Meu lar" : "Entrar"}
          </a>
        </nav>
        <div className="cm-header-actions">
          <a className="cm-login" href={signedIn ? "/app" : "/login"}>
            {signedIn ? "Meu lar" : "Entrar"}
          </a>
          <a className="cm-btn cm-btn-primary cm-btn-sm" href={start}>
            Começar Grátis
          </a>
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
              Chega de planilhas estressantes e compras por impulso. O Casa Mia
              organiza seu enxoval, protege seu orçamento com inteligência
              artificial e celebra cada conquista do seu novo lar.
            </p>
            <div className="cm-hero-actions">
              <a className="cm-btn cm-btn-primary cm-btn-lg" href={start}>
                Criar Minha Lista Grátis (Sem Cartão) <ArrowRight size={18} />
              </a>
              <a
                className="cm-btn cm-btn-ghost cm-btn-lg"
                href="#como-funciona"
              >
                Ver como funciona
              </a>
            </div>
            <ul className="cm-hero-notes">
              <li>
                <Check size={15} /> Sem cartão de crédito
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
              <h2>O conselheiro da sua mudança.</h2>
              <p>
                O Nino é uma casinha-chaveiro com a barriguinha em forma de
                porta em arco. Ele segura a trena, calcula as suas prioridades e
                nunca julga: só ajuda a decidir o que vem primeiro.
              </p>
              <blockquote>
                “Respira! A gente pode deixar a luminária decorativa para o mês
                que vem e focar no colchão agora.”
                <cite>Nino</cite>
              </blockquote>
              <ul className="cm-checks">
                <li>
                  <Check size={16} /> Lembra do que não pode faltar no primeiro
                  dia
                </li>
                <li>
                  <Check size={16} /> Comemora com você cada item riscado
                </li>
                <li>
                  <Check size={16} /> Fala baixinho quando o orçamento aperta
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
            <article className="cm-card">
              <h3>Organização por cômodos</h3>
              <p>
                Cada canto da casa ganha a sua lista, com cards fáceis de tocar
                e o progresso de cada espaço à vista.
              </p>
              <ul className="cm-rooms">
                {ROOMS.map((room) => (
                  <li key={room.name}>
                    <room.icon size={18} strokeWidth={1.7} /> {room.name}
                  </li>
                ))}
              </ul>
            </article>
            <article className="cm-card">
              <span className="cm-card-icon">
                <Lightbulb size={22} strokeWidth={1.7} />
              </span>
              <h3>Inteligência de compra</h3>
              <p>
                A IA do Jev avisa se faltou algo do Primeiro Dia e corta compras
                redundantes, para você gastar o mínimo e morar bem.
              </p>
            </article>
            <article className="cm-card">
              <span className="cm-card-icon">
                <HeartHandshake size={22} strokeWidth={1.7} />
              </span>
              <h3>Lista a dois</h3>
              <p>
                Casais e moradores na mesma lista, em tempo real. Cada conquista
                aparece para todo mundo.
              </p>
            </article>
          </div>
        </section>

        <section className="cm-cha" id="cha">
          <div className="cm-wrap cm-cha-grid">
            <div className="cm-cha-copy">
              <span className="cm-eyebrow">Chá de Casa Nova</span>
              <h2>Quem ama vocês escolhe como presentear.</h2>
              <p>
                Compartilhe uma página só da sua lista. Os convidados reservam
                um item ou mandam um Pix direto para vocês, sem intermediários e
                sem precisar criar conta.
              </p>
              <ul className="cm-checks">
                <li>
                  <Gift size={16} /> “Vou presentear com este item”, com reserva
                  em tempo real
                </li>
                <li>
                  <QrCode size={16} /> Pix com QR Code e copia-e-cola
                </li>
                <li>
                  <MessageCircleHeart size={16} /> Um recado de boas-vindas de
                  cada convidado
                </li>
              </ul>
            </div>
            <div className="cm-cha-card" aria-hidden="true">
              <strong>Chá de Casa Nova da Ana e do Léo</strong>
              <p>
                Estamos montando nosso cantinho e ficaremos muito felizes com a
                sua presença e carinho!
              </p>
              <ul>
                <li>
                  <span>Jogo de pratos</span>
                  <small>Vou presentear</small>
                </li>
                <li className="is-reserved">
                  <span>Cafeteira</span>
                  <small>Reservado por Maria</small>
                </li>
                <li>
                  <span>Presentear via Pix</span>
                  <small>
                    <QrCode size={13} /> Pix
                  </small>
                </li>
              </ul>
            </div>
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
              <article
                key={plan.id}
                className={`cm-plan${plan.featured ? " is-featured" : ""}`}
              >
                {plan.badge && (
                  <span className="cm-plan-badge">{plan.badge}</span>
                )}
                <h3>{plan.name}</h3>
                <p className="cm-plan-price">
                  <strong>{plan.price}</strong>
                  {plan.per && <span>{plan.per}</span>}
                </p>
                <p className="cm-plan-billing">{plan.billing}</p>
                <a
                  className={`cm-btn ${plan.featured ? "cm-btn-primary" : "cm-btn-outline"}`}
                  href={start}
                >
                  {plan.cta}
                </a>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <Check size={15} /> {feature}
                    </li>
                  ))}
                </ul>
              </article>
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
          <div className="cm-faq-list">
            {FAQS.map(([question, answer], index) => (
              <div className="cm-faq-item" key={question}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={faq === index}
                    aria-controls={`cm-faq-${index}`}
                    onClick={() => setFaq(faq === index ? null : index)}
                  >
                    {question}
                    <ChevronDown size={18} aria-hidden="true" />
                  </button>
                </h3>
                <div
                  id={`cm-faq-${index}`}
                  role="region"
                  hidden={faq !== index}
                >
                  <p>{answer}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="cm-final cm-wrap">
          <Nino pose="wave" size={120} className="cm-final-nino" />
          <h2>Toda casa começa com um primeiro passo.</h2>
          <p>Que tal colocar a cama ou o chuveiro na lista agora?</p>
          <a className="cm-btn cm-btn-primary cm-btn-lg" href={start}>
            Começar Grátis <ArrowRight size={18} />
          </a>
          <small>Sem pressa. Sem cartão. Do seu jeito.</small>
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
          <a href="#como-funciona">Como Funciona</a>
          <a href="#planos">Preços</a>
          <a href="/privacidade">Privacidade</a>
        </nav>
        <span className="cm-footer-copy">
          © {new Date().getFullYear()} Casa Mia
        </span>
      </footer>
    </div>
  );
}
