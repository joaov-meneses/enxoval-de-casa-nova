import { useEffect, useState, type ReactNode } from "react";
import { analyticsAvailable, analyticsOptedOut, setAnalyticsOptOut } from '../analytics';
import { ArrowLeft } from "lucide-react";
import { Brand } from "./Brand";

const UPDATED = "18 de outubro de 2026";

/**
 * Contato do responsável pelo tratamento dos dados. Preencher antes do lançamento
 * (e-mail ou formulário); enquanto estiver vazio, a página avisa que ele será informado.
 */
const PRIVACY_CONTACT: string | null = null;

const SECTIONS: { title: string; body: ReactNode }[] = [
  {
    title: "Resumo",
    body: (
      <p>
        Guardamos o que é preciso para montar e manter o seu enxoval. Não vendemos
        dados, não usamos cookies de publicidade e você pode pedir acesso,
        correção ou exclusão dos seus dados quando quiser.
      </p>
    ),
  },
  {
    title: "Quais dados coletamos",
    body: (
      <ul>
        <li>
          <strong>Conta:</strong> nome, e-mail e senha. A senha não é guardada em
          texto: só uma versão protegida (hash).
        </li>
        <li>
          <strong>Segurança:</strong> o endereço IP registrado em cadastros e
          logins bem-sucedidos, inclusive em contas criadas por convite, para
          investigar abusos e proteger contas.
        </li>
        <li>
          <strong>Seu enxoval:</strong> nome do enxoval, ambientes, itens, preços,
          links e anotações que você adicionar, itens marcados como comprados e
          descontos ou cashback que registrar.
        </li>
        <li>
          <strong>Respostas do onboarding:</strong> momento da casa nova (por
          exemplo, morar com o par ou sozinho), data prevista da mudança, estado,
          tipo de moradia, número de moradores, espaços escolhidos, o que você já
          tem, estilo de enxoval, faixa de orçamento, preocupações, como pretende
          usar o Casa Mia e a origem do acesso (de qual link ou site você veio).
        </li>
        <li>
          <strong>Acesso:</strong> um cookie de sessão, necessário para manter você
          conectado, e a data do seu último acesso.
        </li>
        <li>
          <strong>Localização:</strong> só se você tocar em &ldquo;Usar minha
          localização&rdquo;. A posição é usada no seu aparelho para descobrir o
          estado. Não enviamos nem guardamos coordenadas: guardamos apenas o estado.
        </li>
        <li>
          <strong>Neste aparelho, antes do cadastro:</strong> as respostas do
          onboarding ficam no armazenamento do seu
          navegador (<em>localStorage</em>) e só vão para os nossos servidores
          quando você cria a conta.
        </li>
      </ul>
    ),
  },
  {
    title: "Para que usamos",
    body: (
      <ul>
        <li>
          Montar o seu plano: ambientes, itens, quantidades, ajuste ao clima do
          seu estado, cronograma de compras pela data da mudança e faixa de
          referência de investimento pelo orçamento informado.
        </li>
        <li>Manter e mostrar o seu enxoval em qualquer aparelho.</li>
        <li>
          Entender o uso do Casa Mia e melhorar o produto. Quando a análise está
          ativa, usamos um identificador interno da conta para medir ações e
          retornos ao longo do tempo, sem enviar nome ou e-mail ao PostHog.
        </li>
        <li>Proteger as contas e prevenir abusos.</li>
      </ul>
    ),
  },
  {
    title: "Quem pode ver os seus dados",
    body: (
      <ul>
        <li>
          <strong>Você</strong> e as pessoas que convidar para o seu enxoval, que
          veem o conteúdo da lista e o seu nome e e-mail.
        </li>
        <li>
          <strong>Equipe de operação:</strong> o painel administrativo mostra
          nome, e-mail, situação da conta, datas de cadastro e de último acesso e
          quantos enxovais a conta tem. Também permite consultar os IPs associados
          à conta para investigar abusos e desativar contas. As respostas do onboarding ficam no banco
          de dados e só são acessadas por quem administra a infraestrutura, para
          operar e melhorar o produto. Isso inclui estado, data da mudança e faixa
          de orçamento: <strong>essas respostas não são visíveis só para você</strong>.
        </li>
      </ul>
    ),
  },
  {
    title: "Compartilhamento e terceiros",
    body: (
      <>
        <p>
          Não vendemos nem compartilhamos os seus dados com anunciantes.
          Quando configurado, o PostHog recebe eventos de uso, como etapas do
          onboarding, criação de itens e ativação de planos, associados a um
          identificador interno. O navegador pode guardar identificadores de
          análise para relacionar visitas. Não enviamos nomes, e-mails, senhas,
          respostas pessoais do onboarding, conteúdo das listas, links de produtos
          ou tokens de acesso nessa análise. Não gravamos sessões nem capturamos
          automaticamente cliques ou formulários. Respeitamos o sinal Do Not Track
          do navegador e você pode desativar a análise neste aparelho abaixo.
        </p>
        <p>
          Medimos também a página visitada, cliques em botões da página inicial,
          a origem das visitas e o desempenho de carregamento e interação.
          Enviamos somente rotas conhecidas, fontes e códigos de campanha permitidos
          e medidas numéricas. Parâmetros de URL, fragmentos, termos de busca,
          identificadores de anúncios e o conteúdo das páginas não são enviados.
        </p>
        <p>
          Para corrigir falhas, também podemos enviar ao PostHog o tipo do erro
          e sua localização no código. As mensagens livres dos erros e o conteúdo
          das requisições não são enviados. A captura no navegador respeita a
          opção de desativar a análise; erros internos do servidor são registrados
          separadamente, sem associá-los à sua conta.
        </p>
        <p>
          Os serviços que sustentam o aplicativo (hospedagem e banco de dados)
          armazenam os dados em nosso nome. As fontes de texto são carregadas do
          Google Fonts, que recebe o endereço IP do seu navegador ao entregá-las.
        </p>
        <p>
          Quando a ajuda do Nino está ativa, enviamos à TypeSafe AI (que opera o modelo
          Jev) apenas o necessário para a sugestão: o nome do item e dos ambientes, o
          tipo de moradia, o número de moradores, o estado, o perfil de gasto e o prazo
          da mudança. Nunca enviamos o seu nome, e-mail ou senha.
        </p>
        <p>
          Para sugerir mais rápido e sem repetir consultas, mantemos um catálogo
          compartilhado de itens de casa. Ele guarda apenas nomes de itens e dados
          agregados (como a faixa de preço comum, publicada só quando há dados de
          vários enxovais), sem ligação com você nem com o seu enxoval. Nomes que
          parecem dados pessoais não entram nele.
        </p>
      </>
    ),
  },
  {
    title: "Por quanto tempo guardamos",
    body: (
      <p>
        Os endereços IP de cadastros e logins são mantidos por até seis meses e
        removidos depois desse prazo. Os dados da conta e as listas são mantidos
        enquanto a conta existir. Se ela for desativada, as listas são preservadas
        até que você peça a exclusão dos dados.

      </p>
    ),
  },
  {
    title: "Seus direitos",
    body: (
      <>
        <p>
          Pela Lei Geral de Proteção de Dados (LGPD), você pode pedir: confirmação
          de que tratamos dados seus; acesso a eles; correção; anonimização,
          bloqueio ou eliminação do que for desnecessário; portabilidade;
          informações sobre com quem os compartilhamos; e revogar o seu
          consentimento quando ele for a base do tratamento.
        </p>
        <p>
          Você mesmo pode corrigir o seu enxoval a qualquer momento dentro do
          aplicativo e exportar a lista em planilha (CSV).
        </p>
      </>
    ),
  },
  {
    title: "Segurança",
    body: (
      <p>
        A sessão usa um cookie protegido contra leitura por scripts (HTTP-only), as
        senhas são guardadas apenas como hash, e as ações de gestão exigem uma
        credencial administrativa separada das contas de clientes.
      </p>
    ),
  },
  {
    title: "Contato",
    body: PRIVACY_CONTACT ? (
      <p>
        Para exercer os seus direitos ou tirar dúvidas, escreva para{" "}
        <a href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>.
      </p>
    ) : (
      <p>
        O Casa Mia ainda não foi lançado. O canal de contato do responsável pelo
        tratamento dos dados será informado aqui antes do lançamento.
      </p>
    ),
  },
  {
    title: "Mudanças nesta política",
    body: (
      <p>
        Se mudarmos o que coletamos ou como usamos, atualizamos esta página e a
        data acima.
      </p>
    ),
  },
];

export function PrivacyPage() {
  const [optedOut, setOptedOut] = useState(analyticsOptedOut);
  useEffect(() => {
    document.title = "Política de privacidade | Casa Mia";
  }, []);
  return (
    <main className="privacy-page">
      <header className="privacy-top">
        <a href="/" className="brand-link">
          <Brand />
        </a>
        <a href="/" className="privacy-back">
          <ArrowLeft size={16} /> Voltar ao início
        </a>
      </header>
      <article className="privacy-body">
        <span className="eyebrow">COMO CUIDAMOS DOS SEUS DADOS</span>
        <h1>Política de privacidade</h1>
        <p className="privacy-updated">Última atualização: {UPDATED}</p>
        {analyticsAvailable() && <section>
          <h2>Análise de uso neste aparelho</h2>
          <p aria-live="polite">{optedOut ? 'A análise de uso está desativada neste navegador.' : 'Você pode desativar os eventos opcionais de análise de uso neste navegador.'}</p>
          <button type="button" className="button button-outline" onClick={() => {
            setAnalyticsOptOut(!optedOut);
            setOptedOut(analyticsOptedOut());
          }}>{optedOut ? 'Ativar análise de uso' : 'Desativar análise de uso'}</button>
        </section>}
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.body}
          </section>
        ))}
      </article>
    </main>
  );
}
