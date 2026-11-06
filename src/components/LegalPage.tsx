import { useEffect, useState, type FormEvent } from 'react';
import { SUPPORT_EMAIL, LEGAL_UPDATED, MERCHANT } from '../../shared/legal';
import { ApiError, sendFeedback } from '../api';
import { ArrowLeft } from './icons';
import { Brand } from './Brand';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

const CDC_URL = 'https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html';
const DECREE_URL = 'https://www2.camara.leg.br/legin/fed/decret/2013/decreto-7962-15-marco-2013-775557-publicacaooriginal-139266-pe.html';

function RefundRequest() {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [protocol, setProtocol] = useState('');
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNeedsLogin(false);
    try {
      const result = await sendFeedback({
        kind: 'other', area: 'account', contactOk: true,
        title: 'Pedido de arrependimento e reembolso',
        description: `Solicito o cancelamento da contratação e o reembolso pelo direito de arrependimento.\n${note.trim()}`.trim(),
      });
      setProtocol(result.id);
      setNote('');
    } catch (cause) {
      const loggedOut = cause instanceof ApiError && cause.status === 401;
      setNeedsLogin(loggedOut);
      setError(loggedOut
        ? 'Entre na conta usada na contratação para registrar o pedido pelo app. Você também pode solicitar pelo e-mail abaixo.'
        : cause instanceof Error ? cause.message : 'Não foi possível enviar agora. Tente de novo ou use nosso e-mail.');
    } finally {
      setBusy(false);
    }
  }
  return <section id="solicitar" aria-labelledby="refund-request-title">
    <h2 id="refund-request-title">Solicitar pelo app</h2>
    <p>Use a conta da contratação. O pedido fica registrado na nossa central de atendimento e você recebe a confirmação na tela, com um protocolo. Não é necessário justificar o arrependimento.</p>
    {protocol ? <div role="status" className="legal-notice">
      <p><strong>Pedido recebido.</strong> Protocolo: <span className="legal-protocol">{protocol}</span>.</p>
      <p>Guarde esta confirmação. Nossa equipe dará continuidade pelo e-mail da sua conta e informará o andamento do reembolso.</p>
    </div> : <form onSubmit={submit} className="legal-request-form">
      <label htmlFor="refund-note">Informações para localizar a contratação (opcional)</label>
      <Textarea id="refund-note" value={note} onChange={event => setNote(event.target.value)} maxLength={1000} rows={3} disabled={busy} />
      <p className="legal-form-help">Podemos identificar a conta pelo seu acesso. Uma data ou referência do pagamento pode ajudar.</p>
      {error && <p role="alert">{error} {needsLogin && <a href="/login">Entrar na conta</a>}</p>}
      <Button type="submit" variant="brand" size="brand" className="legal-submit" disabled={busy}>{busy ? 'Enviando pedido…' : 'Solicitar cancelamento e reembolso'}</Button>
    </form>}
    <p>Também atendemos pelo e-mail <a href={`mailto:${SUPPORT_EMAIL}?subject=Pedido%20de%20arrependimento%20e%20reembolso%20-%20Casa%20Mia`}>{SUPPORT_EMAIL}</a>, inclusive se você não conseguir entrar na conta.</p>
  </section>;
}

function RefundPolicy() {
  return <>
    <section>
      <h2>Arrependimento em 7 dias</h2>
      <p>Nas contratações online do Casa Mia, você pode desistir em até <strong>7 dias corridos</strong>, contados da contratação ou do recebimento/disponibilização do serviço, conforme o caso, observada a interpretação mais favorável ao consumidor. Esse direito está previsto no artigo 49 do Código de Defesa do Consumidor.</p>
      <p>O reembolso é integral, sem multa ou desconto de taxas, sobre os valores efetivamente pagos pela contratação desfeita, com a atualização devida por lei. O uso do serviço ou de um cupom não elimina esse direito.</p>
    </section>
    <section>
      <h2>Teste gratuito e planos</h2>
      <p>O teste gratuito, quando oferecido, é independente do prazo legal de arrependimento. As condições e a data de eventual cobrança aparecem antes da contratação. Se nenhuma cobrança ocorreu, o cancelamento evita cobranças futuras e não há valor a estornar.</p>
      <p>A política vale para o Mensal e para o Passe da Casa Nova. O Passe é um pagamento único para 12 meses de acesso. O Mensal tem renovação automática, que será interrompida ao desfazer a contratação.</p>
    </section>
    <RefundRequest />
    <section>
      <h2>Confirmação e devolução dos valores</h2>
      <p>Confirmamos o recebimento pelo canal utilizado. Para pedidos feitos pelo app, a confirmação aparece assim que o registro é concluído. Não é preciso cancelar antes de enviar o pedido de arrependimento.</p>
      <p>Ao exercer o direito, solicitaremos imediatamente o cancelamento ou estorno ao processador do pagamento e confirmaremos o procedimento. O momento em que o crédito aparece na fatura ou conta depende do meio de pagamento e da instituição financeira; isso não condiciona o direito nem adia nossa solicitação de devolução.</p>
      <p>O atendimento à demanda é encaminhado em até cinco dias, sem alterar as providências imediatas exigidas para o arrependimento. Para o reembolso, a equipe pode confirmar informações estritamente necessárias para localizar e proteger a contratação.</p>
    </section>
    <section>
      <h2>Cancelamento e outros direitos</h2>
      <p>Cancelar a assinatura no app interrompe a renovação e encerra o acesso, conforme a confirmação exibida. O cancelamento comum não equivale, sozinho, a um pedido de reembolso: para solicitar a devolução, use o formulário desta página ou nosso e-mail.</p>
      <p>Depois do prazo de arrependimento, permanecem os direitos previstos em lei para problemas no serviço, cobranças indevidas e demais situações aplicáveis. Pedidos relativos a renovações são analisados conforme a contratação e a legislação, sem limitação de direitos legais.</p>
    </section>
  </>;
}

function Terms() {
  return <>
    <section>
      <h2>Quem oferece o Casa Mia</h2>
      <p>O Casa Mia é oferecido por <strong>{MERCHANT.name}</strong>, CNPJ {MERCHANT.cnpj}, com endereço em {MERCHANT.address}. Nosso canal eletrônico de atendimento é <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
      <p>Estes termos descrevem o uso do app e sua contratação online. Devem ser lidos com a <a href="/privacidade">Política de Privacidade</a> e a <a href="/reembolso">Política de Cancelamento e Reembolso</a>. Você pode conservar estes textos pela função de imprimir ou salvar do navegador.</p>
    </section>
    <section>
      <h2>O serviço e sua conta</h2>
      <p>O app ajuda a organizar o enxoval, planejar compras, registrar itens e compartilhar a organização com convidados, conforme o plano contratado. Preços e sugestões de compra são referências: confira as condições com a loja antes de comprar um item. O pagamento do plano do Casa Mia não inclui os produtos das lojas indicadas na sua lista.</p>
      <p>Informe dados corretos, mantenha suas credenciais protegidas e respeite os dados e permissões das outras pessoas. Você responde pelo conteúdo que registra e pelos convites que envia. O serviço não pode ser usado para fraude, acesso indevido ou conteúdo ilícito.</p>
    </section>
    <section>
      <h2>Planos, preço e cobrança</h2>
      <p>O preço, os recursos, a duração do acesso e as condições de pagamento são apresentados no app e confirmados no checkout antes da conclusão. O <strong>Mensal</strong> renova automaticamente a cada mês até o cancelamento. O <strong>Passe da Casa Nova</strong> dá 12 meses de acesso por pagamento único, sem renovação automática.</p>
      <p>Quando houver teste gratuito, o checkout informa sua duração, o cartão exigido e a cobrança prevista após o teste. Para evitar essa cobrança, cancele antes do fim do período. O teste não substitui nem reduz o direito legal de arrependimento.</p>
      <p>Cupons seguem as condições divulgadas na oferta. Um desconto apenas na primeira cobrança não altera o preço das renovações seguintes. O valor final deve ser conferido antes de confirmar a contratação. O processamento do pagamento é realizado pela Stripe.</p>
    </section>
    <section>
      <h2>Cancelamento e reembolso</h2>
      <p>Você pode cancelar a assinatura pelo app. A confirmação explica os efeitos sobre o acesso do titular e dos convidados. Para desistir de uma contratação online, há o direito de arrependimento de 7 dias, com devolução integral dos valores devidos nos termos da lei. Veja como solicitar na <a href="/reembolso">política de reembolso</a>.</p>
      <p>Falhas no serviço e cobranças indevidas podem ser comunicadas pelo mesmo canal. Nenhuma cláusula destes termos exclui garantias ou direitos obrigatórios do consumidor.</p>
    </section>
    <section>
      <h2>Dados, atendimento e mudanças</h2>
      <p>O tratamento dos dados e as opções de privacidade estão descritos na <a href="/privacidade">Política de Privacidade</a>. Cancelar o plano não apaga automaticamente a conta; pedidos sobre seus dados podem ser encaminhados ao contato informado.</p>
      <p>Atendemos dúvidas, reclamações, cancelamentos e solicitações pelo app ou por <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Não há telefone de suporte divulgado neste momento.</p>
      <p>Alterações relevantes nestes termos serão comunicadas, com atualização da data desta página e respeito às condições já contratadas e à legislação brasileira. Permanecem disponíveis os órgãos de defesa do consumidor e o Judiciário competente.</p>
    </section>
  </>;
}

export function LegalPage({ kind }: { kind: 'terms' | 'refunds' }) {
  const title = kind === 'terms' ? 'Termos de Uso' : 'Cancelamento e reembolso';
  useEffect(() => { document.title = `${title} | Casa Mia`; }, [title]);
  return <main className="privacy-page legal-page">
    <header className="privacy-top">
      <a href="/" className="brand-link"><Brand /></a>
      <a href="/" className="privacy-back"><ArrowLeft size={16} /> Voltar ao início</a>
    </header>
    <article className="privacy-body">
      <span className="eyebrow">INFORMAÇÕES DA SUA CONTRATAÇÃO</span>
      <h1>{title}</h1>
      <p className="privacy-updated">Última atualização: {LEGAL_UPDATED}</p>
      {kind === 'terms' ? <Terms /> : <RefundPolicy />}
      <section id="contato">
        <h2>Contato</h2>
        <p><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
        <p>{MERCHANT.name} · CNPJ {MERCHANT.cnpj}<br />{MERCHANT.address}</p>
        <p>Referências: <a href={CDC_URL} target="_blank" rel="noopener noreferrer">Código de Defesa do Consumidor, artigo 49</a> e <a href={DECREE_URL} target="_blank" rel="noopener noreferrer">Decreto nº 7.962/2013</a>.</p>
      </section>
      <nav className="legal-links" aria-label="Políticas do Casa Mia">
        <a href="/termos">Termos de Uso</a><a href="/privacidade">Privacidade</a><a href="/reembolso">Cancelamento e reembolso</a>
      </nav>
    </article>
  </main>;
}
