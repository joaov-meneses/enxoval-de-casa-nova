// Modelos dos e-mails de ciclo de vida. Toda mensagem leva o link de preferências e o descadastro com um clique.
import { escapeHtml, layout, type MailMessage } from '../mailer.ts';
import type { FlowKey } from './policy.ts';

export interface LifecycleContext {
  to: string;
  name: string;
  flow: FlowKey;
  /** Passo sem o sufixo de data (`w8`, `1d`, `d21`...). */
  step: string;
  baseUrl: string;
  preferencesToken: string;
  pendingCount?: number;
  doneCount?: number;
  totalCount?: number;
  topItems?: string[];
}

function campaignLink(baseUrl: string, path: string, flow: FlowKey, step: string) {
  const url = new URL(path, baseUrl);
  url.searchParams.set('utm_source', 'newsletter');
  url.searchParams.set('utm_medium', 'email');
  url.searchParams.set('utm_campaign', `lifecycle-${flow.replace('_', '-')}`);
  url.searchParams.set('utm_content', step);
  return url.toString();
}

const COUNTDOWN: Record<string, { subject: string; lead: string }> = {
  w12: { subject: 'Faltam 12 semanas para a sua mudança', lead: 'Dá tempo de pesquisar com calma e esperar boas ofertas. Comece pelos itens grandes.' },
  w8: { subject: 'Faltam 8 semanas: hora dos itens que demoram a chegar', lead: 'Móveis e eletrodomésticos costumam levar semanas para chegar. Esta é a janela para pedir.' },
  w4: { subject: 'Faltam 4 semanas para a mudança', lead: 'Hora de fechar o essencial e deixar para depois o que pode esperar.' },
  w1: { subject: 'Falta 1 semana: prepare a primeira noite', lead: 'Cama, banho e o básico da cozinha garantem uma primeira noite tranquila.' },
  w0: { subject: 'É semana de mudança!', lead: 'Boa mudança! O Casa Mia continua com a sua lista para o que faltar.' },
  after1: { subject: 'Como foi a primeira semana na casa nova?', lead: 'Sentiu falta de algo? Anote na lista para não esquecer.' },
};

function content(input: LifecycleContext) {
  const items = input.topItems ?? [];
  switch (input.flow) {
    case 'funnel_resume':
      return {
        subject: 'Seu plano da casa nova está quase pronto',
        title: 'Faltam poucas perguntas',
        lead: 'O Nino precisa de mais algumas respostas para montar a lista da sua casa. Se você começou neste aparelho, continua de onde parou.',
        cta: 'Continuar meu plano',
        path: '/comecar',
        items: [],
      };
    case 'first_value':
      return {
        subject: input.step === '1d' ? 'Por onde começar o seu enxoval' : input.step === '3d' ? 'Marque o primeiro item da lista' : 'Três itens para começar',
        title: 'O primeiro item é o mais difícil',
        lead: 'Quando comprar ou ganhar algo, marque na lista: o Nino reorganiza o resto pela data da mudança.',
        cta: 'Ver minha lista',
        path: '/app',
        items,
      };
    case 'countdown': {
      const copy = COUNTDOWN[input.step] ?? COUNTDOWN.w4;
      return {
        subject: copy.subject,
        title: copy.subject,
        lead: `${copy.lead}${input.pendingCount ? ` Ainda faltam ${input.pendingCount} ${input.pendingCount === 1 ? 'item' : 'itens'} na sua lista.` : ''}`,
        cta: 'Ver o planejamento',
        path: '/app/plano',
        items: input.step === 'w0' || input.step === 'after1' ? [] : items,
      };
    }
    case 'inactive':
      return {
        subject: 'Sua lista da casa nova continua aqui',
        title: 'Sua lista continua aqui',
        lead: input.totalCount
          ? `Você já tem ${input.doneCount ?? 0} de ${input.totalCount} itens. Que tal mais um esta semana?`
          : 'Quando quiser voltar, a sua lista está do jeito que você deixou.',
        cta: 'Abrir minha lista',
        path: '/app',
        items,
      };
  }
}

export function lifecycleEmail(input: LifecycleContext): MailMessage {
  const copy = content(input);
  const firstName = input.name.trim().split(/\s+/)[0] || 'Olá';
  const cta = campaignLink(input.baseUrl, copy.path, input.flow, input.step);
  const preferences = `${input.baseUrl}/preferencias?token=${encodeURIComponent(input.preferencesToken)}`;
  // O cabeçalho List-Unsubscribe faz o descadastro com um clique (POST, RFC 8058). O link do rodapé abre a página
  // com um botão de confirmação: verificadores de link que abrem URLs sozinhos não descadastram ninguém.
  const oneClick = `${input.baseUrl}/api/preferences/unsubscribe?token=${encodeURIComponent(input.preferencesToken)}`;
  const unsubscribe = `${preferences}&acao=cancelar`;
  const itemsHtml = copy.items.length
    ? `<p style="margin:0 0 8px;font-size:15px;line-height:1.6">Para começar:</p><ul style="margin:0 0 20px;padding-left:20px;font-size:15px;line-height:1.6">${copy.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '';
  const itemsText = copy.items.length ? `\n\nPara começar:\n${copy.items.map(item => `- ${item}`).join('\n')}` : '';
  const footer = 'Você recebe este e-mail porque pediu lembretes e dicas do Casa Mia.';
  return {
    to: input.to,
    subject: copy.subject,
    from: process.env.MARKETING_MAIL_FROM?.trim() || undefined,
    headers: {
      'List-Unsubscribe': `<${oneClick}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    text: `${firstName},\n\n${copy.lead}${itemsText}\n\n${copy.cta}: ${cta}\n\n${footer}\nMudar preferências: ${preferences}\nCancelar: ${unsubscribe}`,
    html: layout(copy.title, `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${escapeHtml(firstName)},</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">${escapeHtml(copy.lead)}</p>
${itemsHtml}<p style="margin:0 0 28px"><a href="${escapeHtml(cta)}" style="display:inline-block;background:#a34c30;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">${escapeHtml(copy.cta)}</a></p>
<p style="margin:0;font-size:12px;line-height:1.6;color:#7a6a5e">${escapeHtml(footer)} <a href="${escapeHtml(preferences)}" style="color:#7a6a5e">Mudar preferências</a> · <a href="${escapeHtml(unsubscribe)}" style="color:#7a6a5e">Cancelar</a></p>`),
  };
}
