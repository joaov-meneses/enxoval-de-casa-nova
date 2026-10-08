import { useEffect, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Brand } from "./Brand";

const UPDATED = "7 de outubro de 2026";

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
          <strong>Seu enxoval:</strong> nome do enxoval, ambientes, itens, preços,
          links e anotações que você adicionar, itens marcados como comprados e
          descontos ou cashback que registrar.
        </li>
        <li>
          <strong>Respostas do onboarding:</strong> momento da casa nova (por
          exemplo, morar com o par ou sozinho), data prevista da mudança, estado,
          tipo de moradia, número de moradores, espaços escolhidos, o que você já
          tem, estilo de enxoval, faixa de orçamento, preocupações, como pretende
          usar a Larume e a origem do acesso (de qual link ou site você veio).
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
          onboarding e os dados da demonstração ficam no armazenamento do seu
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
          Entender, de forma agregada, quem usa a Larume e melhorar o produto, sem
          identificar você.
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
          quantos enxovais a conta tem. As respostas do onboarding ficam no banco
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
          Não vendemos nem compartilhamos os seus dados com anunciantes. No momento,
          não usamos ferramentas de análise nem de publicidade de terceiros, e não
          enviamos e-mails.
        </p>
        <p>
          Os serviços que sustentam o aplicativo (hospedagem e banco de dados)
          armazenam os dados em nosso nome. As fontes de texto são carregadas do
          Google Fonts, que recebe o endereço IP do seu navegador ao entregá-las.
        </p>
      </>
    ),
  },
  {
    title: "Por quanto tempo guardamos",
    body: (
      <p>
        Enquanto a sua conta existir. Se a conta for desativada, as listas são
        preservadas até que você peça a exclusão dos dados.
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
        A Larume ainda não foi lançada. O canal de contato do responsável pelo
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
  useEffect(() => {
    document.title = "Política de privacidade | Larume";
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
