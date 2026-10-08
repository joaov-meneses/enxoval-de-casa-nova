import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Heart,
  LayoutGrid,
  ListChecks,
  Menu,
  Play,
  Plus,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
  X,
  Coffee,
  BedDouble,
  Sofa,
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
    "Ainda não. Os valores desta página são uma demonstração da proposta do produto. Não há cobrança, assinatura ativa nem solicitação de cartão. Você pode explorar o aplicativo pela demonstração.",
  ],
];

export function LandingPage({ signedIn }: { signedIn: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [faq, setFaq] = useState<number | null>(0);
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
          <a href="#como-funciona" onClick={() => setMenuOpen(false)}>
            Como funciona
          </a>
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
          <a className="button button-dark button-small" href={signedIn ? "/app" : "/comecar"}>
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
              <a href={signedIn ? "/app" : "/comecar"} className="button button-dark">
                Começar meu enxoval <ArrowRight size={18} />
              </a>
              <a href="/demo" className="button button-text">
                <span className="play-circle">
                  <Play size={12} fill="currentColor" />
                </span>{" "}
                Explorar demonstração
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
        <section
          className="steps-section page-width section-space"
          id="como-funciona"
        >
          <div className="section-heading">
            <span className="eyebrow">
              MENOS LISTAS PERDIDAS. MAIS CASA PRONTA.
            </span>
            <h2>
              Um novo lar começa
              <br />
              com pequenos passos.
            </h2>
            <p>Você cuida dos sonhos. A gente ajuda a organizar o caminho.</p>
          </div>
          <div className="steps-grid">
            {[
              {
                n: "01",
                icon: LayoutGrid,
                title: "Dê um lugar aos seus planos",
                text: "Comece com uma lista sugerida ou crie a sua. Organize por ambiente e deixe tudo com a sua cara.",
              },
              {
                n: "02",
                icon: Heart,
                title: "Reúna seus favoritos",
                text: "Guarde links, preços e observações. Aquela panela que você amou nunca mais se perde em uma conversa.",
              },
              {
                n: "03",
                icon: Check,
                title: "Celebre cada conquista",
                text: "Marque o que já comprou, acompanhe os gastos e veja seu lar ganhar forma, um item de cada vez.",
              },
            ].map((s) => (
              <article className="step" key={s.n}>
                <div className="step-top">
                  <span className="feature-icon">
                    <s.icon size={24} strokeWidth={1.4} />
                  </span>
                  <span className="step-number">{s.n}</span>
                </div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </article>
            ))}
          </div>
        </section>
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
              <a className="text-link" href="/demo">
                Conhecer meu futuro enxoval <ArrowRight size={17} />
              </a>
            </div>
          </div>
        </section>
        <section className="rooms-section page-width section-space">
          <div className="rooms-intro">
            <span className="eyebrow">CADA CANTO CONTA UMA HISTÓRIA</span>
            <h2>
              Da cozinha ao seu
              <br />
              cantinho favorito.
            </h2>
            <p>
              Listas sugeridas para você lembrar do essencial
              <br />e abrir espaço para o que é só seu.
            </p>
          </div>
          <div className="room-grid">
            {[
              {
                icon: Coffee,
                name: "Cozinha",
                desc: "Receitas para novos começos",
                color: "sand",
              },
              {
                icon: BedDouble,
                name: "Quarto",
                desc: "Seu lugar de recarregar",
                color: "sage",
              },
              {
                icon: Bath,
                name: "Banheiro",
                desc: "Cuidado em cada detalhe",
                color: "rose",
              },
              {
                icon: Sofa,
                name: "Sala de estar",
                desc: "Espaço para boas histórias",
                color: "cream",
              },
            ].map((r) => (
              <a className={`room-card ${r.color}`} href="/demo" key={r.name}>
                <r.icon size={34} strokeWidth={1.2} />
                <strong>{r.name}</strong>
                <span>{r.desc}</span>
                <ArrowUpRight className="room-arrow" size={18} />
              </a>
            ))}
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
              <p>Uma proposta de planos para cada momento do seu lar.</p>
            </div>
            <div className="pricing-grid">
              <article className="price-card">
                <span className="plan-name">Primeiros passos</span>
                <p>Para começar a tirar os sonhos do papel.</p>
                <div className="price">
                  Grátis<span>para dar o primeiro passo</span>
                </div>
                <a href={signedIn ? "/app" : "/comecar"} className="button button-outline">
                  Começar meu enxoval <ArrowRight size={17} />
                </a>
                <ul>
                  {[
                    "Seu primeiro enxoval",
                    "Lista sugerida por ambiente",
                    "Links, preços e anotações",
                    "Acesso no celular e computador",
                  ].map((t) => (
                    <li key={t}>
                      <Check size={16} />
                      {t}
                    </li>
                  ))}
                </ul>
              </article>
              <article className="price-card featured">
                <span className="plan-badge">
                  <Sparkles size={13} /> MAIS ESPAÇO PARA SONHAR
                </span>
                <span className="plan-name">Casa completa</span>
                <p>Para cuidar de todos os detalhes, juntos.</p>
                <div className="price">
                  R$ 14
                  <span>
                    ,90 <small>/ mês</small>
                  </span>
                </div>
                <a href="/demo" className="button button-dark">
                  Experimentar a demonstração <ArrowRight size={17} />
                </a>
                <ul>
                  {[
                    "Tudo do Primeiros passos",
                    "Vários enxovais no mesmo lugar",
                    "Organização compartilhada",
                    "Descontos e cashback",
                    "Exportação da lista em CSV",
                  ].map((t) => (
                    <li key={t}>
                      <Check size={16} />
                      {t}
                    </li>
                  ))}
                </ul>
              </article>
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
          <a href={signedIn ? "/app" : "/comecar"} className="button button-dark">
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
          <a href="#como-funciona">Como funciona</a>
          <a href="#planos">Planos</a>
          <a href="/demo">Demonstração</a>
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
