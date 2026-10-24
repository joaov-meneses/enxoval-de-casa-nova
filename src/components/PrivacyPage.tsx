import { Button } from "@/src/components/ui/button";
import { useEffect, useState, type ReactNode } from "react";
import { consentRequired, onConsentChange, openConsentPreferences, readConsent } from '../analytics/consent';
import { ArrowLeft } from "@/src/components/icons";
import { Brand } from "./Brand";

const UPDATED = "22 de outubro de 2026";

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
        dados. Cookies de análise e de anúncios só são usados se você permitir, e
        e-mails de lembretes e dicas só chegam se você pedir. Você pode pedir acesso,
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
          <strong>Segurança:</strong> o endereço IP e a identificação do
          navegador (user-agent) registrados em cadastros e logins
          bem-sucedidos, inclusive em contas criadas por convite; um
          identificador aleatório do aparelho, guardado num cookie do Casa Mia
          (não serve para seguir você em outros sites), com o tipo de navegador
          e sistema; e o IP de tentativas de login que falharam. Usamos esses
          dados para confirmar o seu e-mail, investigar abusos, bloquear
          acessos indevidos e proteger contas. Bloqueios definitivos são
          sempre decididos por uma pessoa da equipe, e você pode pedir revisão.
        </li>
        <li>
          <strong>Seu enxoval:</strong> nome do enxoval, ambientes, itens, preços,
          links e anotações que você adicionar, itens marcados como comprados e
          descontos ou cashback que registrar. Também parcelas, meio de pagamento,
          data da compra, garantia, loja e quem do enxoval vai comprar cada item,
          quando você informar.
        </li>
        <li>
          <strong>Presentes:</strong> o nome de quem deu cada presente e o recado
          que veio com ele, se você anotar. São dados de outras pessoas, informados
          por você: ficam só no seu enxoval, visíveis para quem participa dele, e
          saem junto com o enxoval ou a conta. O botão de agradecer pelo WhatsApp
          só abre o aplicativo com a mensagem; não guardamos telefones.
        </li>
        <li>
          <strong>Chá de Casa Nova:</strong> quando você publica um convite, quem
          tiver o link pode ver título, mensagem, data, itens escolhidos e a chave
          Pix cadastrada. A chave Pix pode ser um dado pessoal; você pode usar uma
          chave aleatória e tirar a página do ar a qualquer momento. Convidados
          informam nome, e-mail e recado ao reservar um presente; recados avulsos
          pedem apenas nome e mensagem. Esses dados ficam visíveis só aos moradores,
          servem para organizar os presentes e saem junto com o item, o enxoval ou
          a conta, conforme o vínculo. Não inscrevemos convidados em campanhas.
          O Pix vai direto à conta indicada; o Casa Mia não recebe o dinheiro nem
          confirma a transferência.
        </li>
        <li>
          <strong>Notas fiscais, garantias e manuais:</strong> as fotos e os PDFs
          que você enviar para os itens. Ficam num armazenamento privado, só quem
          participa do enxoval consegue baixar (por links que expiram em 5
          minutos), e são apagados junto com o item, o enxoval ou a conta. Notas
          fiscais podem conter o seu nome, CPF e endereço.
        </li>
        <li>
          <strong>Modo loja neste aparelho:</strong> para funcionar com sinal
          ruim, o modo loja guarda neste navegador uma cópia da lista do enxoval e
          as alterações ainda não enviadas, até a conexão voltar.
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
          <strong>Cobrança e notas fiscais:</strong> nome ou razão social, CPF ou
          CNPJ, dados de cobrança informados no checkout, valores pagos e notas
          emitidas. Usamos a Stripe para pagamentos e, quando a emissão fiscal
          está habilitada, a integração direta com o Emissor Público Nacional para emitir a NFS-e. Não guardamos os dados
          completos do cartão. Registros fiscais podem ser mantidos após a
          exclusão da conta para cumprir obrigações legais, com acesso restrito.
        </li>
        <li>
          <strong>Origem do cadastro:</strong> de qual campanha, site ou anúncio
          você chegou (parâmetros UTM, domínio de origem e a primeira página
          vista), guardada neste aparelho por até 90 dias e na conta ao se
          cadastrar. O identificador de clique do Google Ads ou da Meta (gclid,
          fbclid) e o identificador do Google Analytics só são guardados com a
          sua permissão para anúncios e análise.
        </li>
        <li>
          <strong>E-mails de lembretes e dicas:</strong> se você marcar essa
          opção, guardamos quando e como deu a permissão e os e-mails que
          enviamos (qual mensagem e quando), para respeitar o limite de envios
          e medir se eles ajudam. Você pode pausar ou cancelar pelo link em
          todo e-mail.
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
          retornos ao longo do tempo. Os registros operacionais podem incluir
          nome, e-mail e os dados usados nas ações.
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
          Não vendemos os seus dados. Só com a sua permissão para análise, o
          PostHog recebe eventos de uso, como etapas do onboarding, criação de
          itens e ativação de planos, associados a um identificador interno, e o
          navegador guarda identificadores de análise para relacionar visitas.
          Também registramos navegação, cliques, alterações de campos,
          formulários e chamadas da API com os dados reais usados nessas ações.
          Não gravamos sessões. Respeitamos o sinal Do Not Track do navegador.
        </p>
        <p>
          Com a sua permissão, o Google (Tag Manager, Google Analytics e Google
          Ads) recebe as páginas visitadas, sem identificadores, e marcos como
          cadastro, plano montado e início de assinatura, para sabermos quais
          anúncios trazem pessoas. Com a permissão para anúncios, quando um
          pagamento é confirmado, o servidor informa ao Google o valor e o
          identificador do Google Analytics guardado no cadastro, nunca o seu
          nome ou e-mail. Sem permissão, nada disso é enviado. PostHog e Google
          operam fora do Brasil.
        </p>
        <p>
          Medimos também a página visitada, cliques em botões da página inicial,
          a origem das visitas e o desempenho de carregamento e interação.
          Os eventos de aquisição e desempenho usam rotas conhecidas, fontes e
          códigos de campanha permitidos e medidas numéricas. Os registros
          operacionais preservam a URL e os dados reais das ações.
        </p>
        <p>
          Para operar o aplicativo e investigar falhas, os registros técnicos
          preservam mensagens de erro, stack traces, dados de requisições e
          respostas e informações da conta. Esses registros podem conter dados
          pessoais, conteúdo das listas, respostas do onboarding, URLs, senhas e
          tokens presentes na operação. Os registros do servidor são independentes
          da preferência de análise do navegador e podem ser enviados ao PostHog.
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
        Os endereços IP e a identificação do navegador de cadastros e logins
        são mantidos por até seis meses e removidos depois desse prazo. O IP de
        tentativas de login que falharam é removido em um dia, e o de bloqueios
        encerrados, seis meses depois do fim. Os aparelhos ligados à conta são
        mantidos enquanto ela existir. Os dados da conta e as listas são mantidos
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

function consentSummary() {
  const choice = readConsent();
  if (!choice) return "Você ainda não escolheu: nada de análise ou anúncios está ativo neste navegador.";
  if (choice.analytics && choice.marketing) return "Análise de uso e medição de anúncios estão permitidas neste navegador.";
  if (choice.analytics) return "Só a análise de uso está permitida neste navegador.";
  return "Análise de uso e medição de anúncios estão desativadas neste navegador.";
}

export function PrivacyPage() {
  const [summary, setSummary] = useState(consentSummary);
  useEffect(() => {
    document.title = "Política de privacidade | Casa Mia";
  }, []);
  useEffect(() => onConsentChange(() => setSummary(consentSummary())), []);
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
        {consentRequired() && <section>
          <h2>Preferências de privacidade</h2>
          <p aria-live="polite">{summary}</p>
          <Button variant="brand" size="brand" type="button" className="button button-outline" onClick={openConsentPreferences}>
            Mudar preferências
          </Button>
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
