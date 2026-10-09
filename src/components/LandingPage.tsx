import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Heart,
  ListChecks,
  Menu,
  Plus,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
  X,
  Coffee,
  BedDouble,
  Bath,
} from "lucide-react";
import { Brand } from "./Brand";

const faqs = [
  [
    "Preciso ter a casa pronta para começar?",
    "Não! A Larume acompanha seu planejamento desde a primeira ideia. Crie o enxoval, salve o que você gostou e vá marcando cada conquista no seu tempo.",
  ],
  [
    "Posso organizar meu enxoval com outra pessoa?",
    "Sim. Você pode adicionar uma pessoa que já tenha uma conta na Larume pelo e-mail dela. Os membros podem editar a mesma lista e acompanhar as compras juntos.",
  ],
  [
    "Funciona no celular e no computador?",
    "Sim. A interface se adapta à sua tela. No celular, você pode deslizar entre ambientes, puxar para atualizar e adicionar um atalho à tela inicial pelo navegador.",
  ],
  [
    "Posso guardar links de qualquer loja?",
    "Sim. Cada item tem espaço para um link, preço e anotações. Você escolhe onde comprar e mantém as referências organizadas por ambiente.",
  ],
  [
    "Os planos já estão disponíveis para compra?",
    "Ainda não. Os valores desta página são uma demonstração da proposta do produto. Não há cobrança, assinatura ativa nem solicitação de cartão.",
  ],
];

const MONTHLY_PRICE = 19.99;
const ANNUAL_PRICE = 49.9;
const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
/** Quanto o anual economiza em relação a 12 meses no plano mensal. */
const ANNUAL_SAVING = Math.round(
  (1 - ANNUAL_PRICE / (MONTHLY_PRICE * 12)) * 100,
);

type PlanId = "annual" | "monthly";

const PLANS: {
  id: PlanId;
  name: string;
  billing: string;
  price: string;
  badge?: string;
}[] = [
  {
    id: "annual",
    name: "Anual",
    billing: `${brl(ANNUAL_PRICE)} cobrados por ano`,
    price: brl(ANNUAL_PRICE / 12),
    badge: `MELHOR VALOR · ECONOMIZE ${ANNUAL_SAVING}%`,
  },
  {
    id: "monthly",
    name: "Mensal",
    billing: "Cobrado todo mês",
    price: brl(MONTHLY_PRICE),
  },
];

const PLAN_FEATURES = [
  "Vários enxovais no mesmo lugar",
  "Lista sugerida por ambiente",
  "Links, preços e anotações",
  "Organização compartilhada",
  "Descontos e cashback",
  "Importação e exportação em Excel e CSV",
  "Acesso no celular e no computador",
];

export function LandingPage({ signedIn }: { signedIn: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [faq, setFaq] = useState<number | null>(0);
  const [plan, setPlan] = useState<PlanId>("annual");
  useEffect(() => {
    document.title = "Larume — seu lar começa com um plano";
  }, []);
  return (
    <div className="marketing-page">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="site-header">
        <a href="/" className="brand-link">
          <Brand />
        </a>
        <nav
          className={`site-nav ${menuOpen ? "is-open" : ""}`}
          aria-label="Navegação principal"
        >
          <a href="#recursos" onClick={() => setMenuOpen(false)}>
            Feito para você
          </a>
          <a href="#planos" onClick={() => setMenuOpen(false)}>
            Planos
          </a>
          <a href="#duvidas" onClick={() => setMenuOpen(false)}>
            Dúvidas
          </a>
        </nav>
        <div className="header-actions">
          <a className="login-link" href={signedIn ? "/app" : "/login"}>
            {signedIn ? "Meu enxoval" : "Entrar"}
          </a>
          <a
            className="button button-dark button-small"
            href={signedIn ? "/app" : "/comecar"}
          >
            Começar meu enxoval <ArrowUpRight size={16} />
          </a>
          <button
            className="menu-toggle icon-button"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main id="conteudo">
        <section className="hero page-width">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="tiny-sun">✳</span> PARA TODOS OS SEUS NOVOS
              COMEÇOS
            </span>
            <h1>
              Uma casa nova.
              <br />
              Mil possibilidades.
              <br />
              <em>
                Um lugar para
                <br className="hero-break" /> organizar tudo.
              </em>
            </h1>
            <p>
              Do primeiro jogo de pratos ao último detalhe.
              <br className="desktop-break" /> Planeje seu enxoval, cuide do
              orçamento e transforme
              <br className="desktop-break" /> uma lista de desejos no seu
              próximo lar.
            </p>
            <div className="hero-actions">
              <a
                href={signedIn ? "/app" : "/comecar"}
                className="button button-dark"
              >
                Começar meu enxoval <ArrowRight size={18} />
              </a>
            </div>
            <div className="hero-reassurance">
              <span>
                <Check size={14} /> Sem cartão de crédito
              </span>
              <span>
                <Check size={14} /> No seu ritmo
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <img
              className="hero-photo"
              src="/images/larume-home.webp"
              alt="Sala acolhedora com sofá de linho, mesa de madeira e uma caixa de mudança"
              fetchPriority="high"
              width="1536"
              height="1024"
            />
            <span className="photo-caption">
              SEU PRÓXIMO CAPÍTULO COMEÇA AQUI.
            </span>
            <div className="floating-note">
              <span className="note-icon">
                <Heart size={20} />
              </span>
              <div>
                <strong>
                  Tem cara de casa.
                  <br />
                  Tem jeito de começo.
                </strong>
                <span>Cada detalhe, uma conquista.</span>
              </div>
            </div>
            <div className="floating-progress">
              <div className="progress-note-top">
                <span className="mini-home">
                  <Brand compact />
                </span>
                <div>
                  <strong>Nosso primeiro apê</strong>
                  <span>Um sonho saindo do papel</span>
                </div>
                <span className="note-percentage">68%</span>
              </div>
              <div className="progress-track">
                <span style={{ width: "68%" }} />
              </div>
              <div className="progress-note-bottom">
                <span>34 de 50 itens conquistados</span>
                <span>
                  Quase lá <Sparkles size={12} />
                </span>
              </div>
            </div>
          </div>
        </section>
        <div className="benefit-ribbon">
          <div className="page-width">
            <span>
              <ListChecks /> Cada detalhe no seu lugar
            </span>
            <span>
              <Wallet /> Orçamento sem surpresas
            </span>
            <span>
              <Users /> Um plano para fazer juntos
            </span>
            <span>
              <Smartphone /> Sempre com você
            </span>
          </div>
        </div>
        <section className="features-section section-space" id="recursos">
          <div className="page-width feature-layout">
            <div
              className="product-preview"
              aria-label="Exemplo ilustrativo de uma lista de enxoval"
            >
              <div className="preview-toolbar">
                <Brand />
                <span>
                  Seu lar, tomando forma <Heart size={12} />
                </span>
              </div>
              <div className="preview-body">
                <span className="eyebrow">CADA CONQUISTA CONTA</span>
                <h3>
                  Nosso primeiro apê <span>☀</span>
                </h3>
                <div className="preview-stats">
                  <div>
                    <span>Já investimos</span>
                    <strong>
                      R$ 3.240<span>,00</span>
                    </strong>
                  </div>
                  <div>
                    <span>Nosso progresso</span>
                    <strong>
                      24 <span>/ 40 itens</span>
                    </strong>
                    <div className="progress-track">
                      <span style={{ width: "60%" }} />
                    </div>
                  </div>
                </div>
                <div className="preview-tabs">
                  <span className="active">
                    <Coffee size={14} /> Cozinha
                  </span>
                  <span>
                    <BedDouble size={14} /> Quarto
                  </span>
                  <span>
                    <Bath size={14} /> Banheiro
                  </span>
                </div>
                {[
                  {
                    name: "Jogo de pratos de cerâmica",
                    price: "R$ 249,90",
                    done: true,
                  },
                  {
                    name: "Conjunto de talheres",
                    price: "R$ 189,00",
                    done: true,
                  },
                  { name: "Jogo de panelas", price: "R$ 629,90", done: false },
                  {
                    name: "Taças para os primeiros brindes",
                    price: "R$ 159,90",
                    done: false,
                  },
                ].map((item) => (
                  <div
                    className={`preview-item ${item.done ? "done" : ""}`}
                    key={item.name}
                  >
                    <span className="preview-check">
                      {item.done && <Check size={12} />}
                    </span>
                    <span>{item.name}</span>
                    <b>{item.price}</b>
                  </div>
                ))}
                <span className="preview-add">
                  <Plus size={14} /> Um novo desejo para a lista
                </span>
              </div>
              <span className="preview-label">
                Uma prévia do seu novo cantinho de organização
              </span>
            </div>
            <div className="feature-copy">
              <span className="eyebrow">PENSADO PARA A VIDA REAL</span>
              <h2>
                Tudo o que importa.
                <br />
                <em>Junto, de verdade.</em>
              </h2>
              <p>
                Chega de dividir seus planos entre planilhas, prints e
                mensagens. Seu enxoval merece um cantinho só dele.
              </p>
              <div className="feature-list">
                <div>
                  <Wallet />
                  <span>
                    <strong>Seu orçamento, às claras</strong>
                    <p>
                      Preços, gastos, descontos e cashback em uma visão simples.
                    </p>
                  </span>
                </div>
                <div>
                  <Users />
                  <span>
                    <strong>Melhor quando é a dois. Ou mais.</strong>
                    <p>
                      Compartilhe a lista e organize cada decisão com quem faz
                      parte desse começo.
                    </p>
                  </span>
                </div>
                <div>
                  <Smartphone />
                  <span>
                    <strong>Da loja para a lista, em um toque</strong>
                    <p>
                      No sofá com o computador ou passeando pela loja com o
                      celular. A Larume vai junto.
                    </p>
                  </span>
                </div>
              </div>
              <a className="text-link" href={signedIn ? "/app" : "/comecar"}>
                Conhecer meu futuro enxoval <ArrowRight size={17} />
              </a>
            </div>
          </div>
        </section>
        <section className="pricing-section section-space" id="planos">
          <div className="page-width">
            <div className="section-heading">
              <span className="eyebrow">ESPAÇO PARA O SEU PRÓXIMO PASSO</span>
              <h2>
                Grandes começos.
                <br />
                <em>Planos descomplicados.</em>
              </h2>
              <p>
                Dois planos, com os mesmos recursos. Escolha como prefere pagar.
              </p>
            </div>
            <div className="plan-picker">
              <div className="plan-includes">
                <h3>Tudo incluído, em qualquer plano</h3>
                <ul>
                  {PLAN_FEATURES.map((t) => (
                    <li key={t}>
                      <Check size={16} />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="plan-choice">
                <fieldset className="plan-options">
                  <legend className="sr-only">Escolha seu plano</legend>
                  {PLANS.map((option) => (
                    <label
                      key={option.id}
                      className={`plan-option${plan === option.id ? " is-selected" : ""}${option.badge ? " has-badge" : ""}`}
                    >
                      {option.badge && (
                        <span className="plan-option-badge">
                          {option.badge}
                        </span>
                      )}
                      <input
                        type="radio"
                        name="plano"
                        value={option.id}
                        checked={plan === option.id}
                        onChange={() => setPlan(option.id)}
                      />
                      <span className="plan-option-row">
                        <span className="plan-option-check" aria-hidden="true">
                          <Check size={14} strokeWidth={2.5} />
                        </span>
                        <span className="plan-option-text">
                          <strong>{option.name}</strong>
                          <small>{option.billing}</small>
                        </span>
                        <span className="plan-option-price">
                          <strong>{option.price}</strong>
                          <small>/mês</small>
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <a
                  href={signedIn ? "/app" : "/comecar"}
                  className="button button-dark plan-cta"
                >
                  Começar meu enxoval <ArrowRight size={17} />
                </a>
                <p className="plan-summary" aria-live="polite">
                  {plan === "annual"
                    ? `Plano anual: ${brl(ANNUAL_PRICE)} por ano, o equivalente a ${brl(ANNUAL_PRICE / 12)} por mês.`
                    : `Plano mensal: ${brl(MONTHLY_PRICE)} por mês.`}
                </p>
              </div>
            </div>
            <p className="pricing-disclaimer">
              <ShieldCheck size={15} /> Planos e valores ilustrativos. Nenhuma
              cobrança será realizada.
            </p>
          </div>
        </section>
        <section className="faq-section page-width section-space" id="duvidas">
          <div>
            <span className="eyebrow">PODE CHEGAR, A CASA É SUA</span>
            <h2>
              Alguma dúvida
              <br />
              antes de começar?
            </h2>
            <p>A gente ajuda com os primeiros passos.</p>
          </div>
          <div className="faq-list">
            {faqs.map(([q, a], i) => (
              <div className={`faq-item ${faq === i ? "open" : ""}`} key={q}>
                <h3>
                  <button
                    aria-expanded={faq === i}
                    aria-controls={`faq-${i}`}
                    onClick={() => setFaq(faq === i ? null : i)}
                  >
                    {q}
                    <ChevronDown size={18} />
                  </button>
                </h3>
                <div id={`faq-${i}`} hidden={faq !== i}>
                  <p>{a}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="final-cta page-width">
          <span className="cta-sun">✳</span>
          <span className="eyebrow">O LAR QUE VOCÊ IMAGINA COMEÇA AQUI</span>
          <h2>
            Vamos dar espaço
            <br />
            ao seu novo começo?
          </h2>
          <p>Uma lista hoje. Um lar com a sua cara amanhã.</p>
          <a
            href={signedIn ? "/app" : "/comecar"}
            className="button button-dark"
          >
            Criar meu enxoval <ArrowRight size={18} />
          </a>
          <span className="cta-footnote">
            Sem pressa. Sem cartão. Do seu jeito.
          </span>
        </section>
      </main>
      <footer className="site-footer page-width">
        <div>
          <a href="/" className="brand-link">
            <Brand />
          </a>
          <p>Seu lar começa com um plano.</p>
        </div>
        <div className="footer-links">
          <a href="#planos">Planos</a>
          <a href="/privacidade">Privacidade</a>
        </div>
        <span>
          Feito com cuidado, para novos começos.
          <br />© {new Date().getFullYear()} Larume
        </span>
      </footer>
    </div>
  );
}
