// Modelos dos e-mails de ciclo de vida. Toda mensagem leva o link de preferências e o descadastro com um clique.
import { escapeHtml, layout, type MailMessage } from '../mailer.ts';
import type { FlowKey, MilestoneKind } from './policy.ts';

/** Texto de uma campanha da equipe (/admin): assunto, parágrafos, botão e página de destino no app. */
export interface CustomContent { subject: string; body: string; cta: string; path: string }

export interface LifecycleContext {
  to: string;
  name: string;
  flow: FlowKey | 'campaign';
  /** Passo sem o sufixo de data (`w8`, `1d`, `d21`...). */
  step: string;
  baseUrl: string;
  preferencesToken: string;
  /** Id da mensagem em lifecycle_messages: o link leva `lm` para medir a volta ao app por fluxo. */
  messageId?: string;
  pendingCount?: number;
  doneCount?: number;
  totalCount?: number;
  topItems?: string[];
  overdueCount?: number;
  overdueItems?: string[];
  milestone?: { kind: MilestoneKind; label: string | null };
  inviteEmail?: string;
  custom?: CustomContent;
}

function campaignLink(baseUrl: string, path: string, flow: LifecycleContext['flow'], step: string, messageId?: string) {
  const url = new URL(path, baseUrl);
  url.searchParams.set('utm_source', 'newsletter');
  url.searchParams.set('utm_medium', 'email');
  url.searchParams.set('utm_campaign', `lifecycle-${flow.replaceAll('_', '-')}`);
  url.searchParams.set('utm_content', step);
  if (messageId) url.searchParams.set('lm', messageId);
  return url.toString();
}

const MILESTONE_COPY: Record<MilestoneKind, (label: string | null) => { subject: string; lead: string }> = {
  room50: label => ({
    subject: `Metade de ${label ?? 'um ambiente'} já está garantida`,
    lead: `Você já conquistou metade dos itens de ${label ?? 'um ambiente'}. O Nino comemorou por aqui.`,
  }),
  room100: label => ({
    subject: `${label ?? 'Um ambiente'} completo!`,
    lead: `Todos os itens de ${label ?? 'um ambiente'} estão conquistados. Um cômodo a menos para se preocupar.`,
  }),
  overall80: () => ({
    subject: 'Seu enxoval está 80% pronto',
    lead: 'Faltam poucos itens para a casa ficar completa. Que tal ver o que ainda falta?',
  }),
};

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
    case 'campaign': {
      const custom = input.custom!;
      return { subject: custom.subject, title: custom.subject, lead: custom.body, cta: custom.cta, path: custom.path, items: [] };
    }
    case 'overdue': {
      const count = input.overdueCount ?? input.overdueItems?.length ?? 0;
      return {
        subject: count === 1 ? '1 item passou da semana de compra' : `${count} itens passaram da semana de compra`,
        title: 'Itens atrasados no planejamento',
        lead: 'A semana sugerida para estes itens já passou. Vale comprar agora ou escolher outra semana no planejamento.',
        cta: 'Ver o planejamento',
        path: '/app/plano',
        items: (input.overdueItems ?? []).slice(0, 5),
      };
    }
    case 'milestone': {
      const copy = MILESTONE_COPY[input.milestone?.kind ?? 'overall80'](input.milestone?.label ?? null);
      return { subject: copy.subject, title: copy.subject, lead: copy.lead, cta: 'Ver minha lista', path: '/app', items: [] };
    }
    case 'invite_stalled':
      return {
        subject: 'Seu convite ainda não foi aceito',
        title: 'O convite está esperando',
        lead: `${input.inviteEmail ? `O convite para ${input.inviteEmail}` : 'Seu convite'} ainda não foi aceito. Se precisar, reenvie pelo menu Convidar: o link novo substitui o anterior.`,
        cta: 'Abrir o enxoval',
        path: '/app',
        items: [],
      };
    case 'post_move':
      return {
        subject: 'Um mês na casa nova: como foi?',
        title: 'Como foi montar a casa?',
        lead: 'Faz um mês da sua mudança. De 0 a 10, quanto você indicaria o Casa Mia para quem vai montar a casa? Leva um clique.',
        cta: 'Responder',
        path: '/pesquisa',
        items: [],
      };
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

/** Botões de 0 a 10 da pesquisa de pós-mudança: cada um abre /pesquisa com a nota marcada. */
function surveyLink(input: LifecycleContext, score?: number) {
  const url = new URL(campaignLink(input.baseUrl, '/pesquisa', input.flow, input.step, input.messageId));
  url.searchParams.set('token', input.preferencesToken);
  if (score !== undefined) url.searchParams.set('nota', String(score));
  return url.toString();
}

export function lifecycleEmail(input: LifecycleContext): MailMessage {
  const copy = content(input);
  const firstName = input.name.trim().split(/\s+/)[0] || 'Olá';
  const isSurvey = input.flow === 'post_move';
  const cta = isSurvey ? surveyLink(input) : campaignLink(input.baseUrl, copy.path, input.flow, input.step, input.messageId);
  const preferences = `${input.baseUrl}/preferencias?token=${encodeURIComponent(input.preferencesToken)}`;
  // O cabeçalho List-Unsubscribe faz o descadastro com um clique (POST, RFC 8058). O link do rodapé abre a página
  // com um botão de confirmação: verificadores de link que abrem URLs sozinhos não descadastram ninguém.
  const oneClick = `${input.baseUrl}/api/preferences/unsubscribe?token=${encodeURIComponent(input.preferencesToken)}`;
  const unsubscribe = `${preferences}&acao=cancelar`;
  const itemsTitle = input.flow === 'overdue' ? 'Atrasados:' : 'Para começar:';
  const itemsHtml = copy.items.length
    ? `<p style="margin:0 0 8px;font-size:15px;line-height:1.6">${itemsTitle}</p><ul style="margin:0 0 20px;padding-left:20px;font-size:15px;line-height:1.6">${copy.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '';
  const itemsText = copy.items.length ? `\n\n${itemsTitle}\n${copy.items.map(item => `- ${item}`).join('\n')}` : '';
  const footer = 'Você recebe este e-mail porque pediu lembretes e dicas do Casa Mia.';
  const scoreButton = (score: number) =>
    `<a href="${escapeHtml(surveyLink(input, score))}" style="display:inline-block;min-width:22px;text-align:center;border:1px solid #ecdcc3;border-radius:8px;padding:4px 6px;margin:0 2px;color:#a34c30;text-decoration:none;font-weight:700">${score}</a>`;
  const ctaHtml = isSurvey
    ? `<p style="margin:0 0 28px;line-height:2.4">${Array.from({ length: 11 }, (_, score) => scoreButton(score)).join('')}</p>`
    : `<p style="margin:0 0 28px"><a href="${escapeHtml(cta)}" style="display:inline-block;background:#a34c30;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">${escapeHtml(copy.cta)}</a></p>`;
  // Campanhas podem ter vários parágrafos (linha em branco entre eles).
  const leadHtml = copy.lead.split(/\n{2,}/).map(paragraph =>
    `<p style="margin:0 0 20px;font-size:15px;line-height:1.6">${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`).join('\n');
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
${leadHtml}
${itemsHtml}${ctaHtml}
<p style="margin:0;font-size:12px;line-height:1.6;color:#7a6a5e">${escapeHtml(footer)} <a href="${escapeHtml(preferences)}" style="color:#7a6a5e">Mudar preferências</a> · <a href="${escapeHtml(unsubscribe)}" style="color:#7a6a5e">Cancelar</a></p>`),
  };
}
