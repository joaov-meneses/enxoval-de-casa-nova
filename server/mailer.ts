import { getLogger } from './logger.ts';
// E-mail transacional do Casa Mia (redefinição de senha e convite para um enxoval).
// Provedor: Resend, pela API HTTP, quando RESEND_API_KEY e MAIL_FROM estão configurados.
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Mensagens "enviadas" quando MAIL_DRIVER=memory. Existe só para os testes lerem o link sem provedor real. */
export const mailOutbox: MailMessage[] = [];

export function isProductionServer() {
  return (
    process.env.NODE_ENV === "production" || process.argv.includes("--production")
  );
}

type MailDriver = "resend" | "memory" | "console";

function mailDriver(): MailDriver {
  if (process.env.MAIL_DRIVER === "memory") return "memory";
  if (process.env.RESEND_API_KEY && process.env.MAIL_FROM) return "resend";
  return "console";
}

/**
 * Endereço público do app, usado nos links dos e-mails. Vem da configuração (APP_URL) e nunca do cabeçalho
 * Host da requisição, para ninguém conseguir fazer o servidor enviar um link de redefinição para outro domínio.
 */
export function appBaseUrl(): string | null {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) {
    try {
      const url = new URL(configured);
      return ["http:", "https:"].includes(url.protocol) ? configured : null;
    } catch {
      return null;
    }
  }
  return isProductionServer()
    ? null
    : `http://localhost:${process.env.PORT ?? 3000}`;
}

/**
 * Verdadeiro quando um e-mail enviado de fato chega a alguém: Resend configurado, caixa em memória (testes) ou
 * desenvolvimento (console). Em produção sem Resend nada sairia, então ações que dependem do e-mail avisam o erro.
 */
export function canDeliverMail() {
  return mailDriver() !== "console" || !isProductionServer();
}

export async function sendMail(message: MailMessage) {
  const started = Date.now();
  const log = getLogger().child({ mail: message, driver: mailDriver() });
  log.info({ event: 'mail.started' }, 'Preparing transactional email.');
  try {
    await deliverMail(message);
    log.info({ event: canDeliverMail() ? 'mail.completed' : 'mail.skipped', duration_ms: Date.now() - started }, 'Email delivery finished.');
  } catch (err) {
    log.error({ event: 'mail.failed', err, duration_ms: Date.now() - started }, 'Email delivery failed.');
    throw err;
  }
}

async function deliverMail(message: MailMessage) {
  const driver = mailDriver();
  if (driver === "memory") {
    mailOutbox.push(message);
    return;
  }
  if (driver === "resend") {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    const detail = await response.text();
    getLogger().info({ event: 'mail.provider.response', status: response.status, body: detail, to: message.to }, 'Email provider response.');
    if (!response.ok) {
      throw new Error(`O provedor de e-mail respondeu ${response.status}. ${detail}`);
    }
    return;
  }
  getLogger().warn({ event: 'mail.simulated', mail: message, production: isProductionServer() }, 'Email provider is not configured.');
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Clientes de e-mail quase nunca carregam fontes da web, então cada pilha começa pela fonte da marca (usada
// onde estiver instalada) e cai em fontes presentes na maioria dos dispositivos.
const MAIL_SANS = "'Nunito','Segoe UI',Helvetica,Arial,sans-serif";
const MAIL_SERIF = "'Fraunces',Georgia,'Times New Roman',serif";

function layout(title: string, bodyHtml: string) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#fbf3e6;padding:32px 16px;font-family:${MAIL_SANS};color:#3b2a20">
<div style="max-width:480px;margin:0 auto;background:#fffaf1;border:1px solid #ecdcc3;border-radius:16px;padding:32px">
<p style="margin:0 0 20px;font-family:${MAIL_SERIF};font-size:26px;font-weight:600;color:#c2603f">Casa Mia</p>
<h1 style="margin:0 0 16px;font-family:${MAIL_SERIF};font-size:24px;font-weight:400;line-height:1.3">${escapeHtml(title)}</h1>
${bodyHtml}
</div></body></html>`;
}

export function passwordResetEmail(input: {
  to: string;
  name: string;
  link: string;
  minutes: number;
}): MailMessage {
  const subject = "Redefina a sua senha do Casa Mia";
  const text = `Olá, ${input.name}.

Recebemos um pedido para redefinir a senha da sua conta no Casa Mia. Para criar uma nova senha, abra o link abaixo. Ele vale por ${input.minutes} minutos e só pode ser usado uma vez:

${input.link}

Se não foi você, ignore este e-mail: sua senha continua a mesma.`;
  const html = layout(
    "Vamos criar uma nova senha",
    `<p style="margin:0 0 16px;line-height:1.6">Olá, ${escapeHtml(input.name)}. Recebemos um pedido para redefinir a senha da sua conta.</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(input.link)}" style="display:inline-block;background:#b5532f;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:600">Criar nova senha</a></p>
<p style="margin:0 0 12px;line-height:1.6;font-size:14px">O link vale por ${input.minutes} minutos e só pode ser usado uma vez. Se o botão não abrir, copie este endereço no navegador:</p>
<p style="margin:0 0 20px;font-size:13px;word-break:break-all;color:#6a5648">${escapeHtml(input.link)}</p>
<p style="margin:0;line-height:1.6;font-size:14px;color:#6a5648">Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>`,
  );
  return { to: input.to, subject, text, html };
}

export function invitationEmail(input: {
  to: string;
  inviterName: string;
  enxovalName: string;
  link: string;
  days: number;
  accountExists: boolean;
}): MailMessage {
  const subject = `${input.inviterName} convidou você para o enxoval "${input.enxovalName}"`;
  const next = input.accountExists
    ? "Abra o link abaixo e entre com a sua conta do Casa Mia para aceitar."
    : "Abra o link abaixo, crie a sua senha e pronto: você já entra no enxoval.";
  const text = `${input.inviterName} convidou você para montar o enxoval "${input.enxovalName}" no Casa Mia. Vocês dois editam a mesma lista.

${next}

${input.link}

O convite vale por ${input.days} dias. Se você não esperava por ele, é só ignorar este e-mail.`;
  const html = layout(
    "Você foi convidado(a) para um enxoval",
    `<p style="margin:0 0 16px;line-height:1.6"><strong>${escapeHtml(input.inviterName)}</strong> convidou você para montar o enxoval <strong>${escapeHtml(input.enxovalName)}</strong>. Vocês dois editam a mesma lista.</p>
<p style="margin:0 0 24px;line-height:1.6">${escapeHtml(next)}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(input.link)}" style="display:inline-block;background:#b5532f;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:600">Aceitar convite</a></p>
<p style="margin:0 0 12px;line-height:1.6;font-size:14px">Se o botão não abrir, copie este endereço no navegador:</p>
<p style="margin:0 0 20px;font-size:13px;word-break:break-all;color:#6a5648">${escapeHtml(input.link)}</p>
<p style="margin:0;line-height:1.6;font-size:14px;color:#6a5648">O convite vale por ${input.days} dias. Se você não esperava por ele, é só ignorar este e-mail.</p>`,
  );
  return { to: input.to, subject, text, html };
}

export function passwordChangedEmail(input: {
  to: string;
  name: string;
}): MailMessage {
  const subject = "A senha da sua conta no Casa Mia foi alterada";
  const text = `Olá, ${input.name}.

A senha da sua conta no Casa Mia acabou de ser alterada e as sessões abertas foram encerradas. Se foi você, não precisa fazer nada.

Se não reconhece essa alteração, peça um novo link em "Esqueci minha senha" na tela de login.`;
  const html = layout(
    "Sua senha foi alterada",
    `<p style="margin:0 0 16px;line-height:1.6">Olá, ${escapeHtml(input.name)}. A senha da sua conta acabou de ser alterada e as sessões abertas foram encerradas. Se foi você, não precisa fazer nada.</p>
<p style="margin:0;line-height:1.6;font-size:14px;color:#6a5648">Se não reconhece essa alteração, peça um novo link em "Esqueci minha senha" na tela de login.</p>`,
  );
  return { to: input.to, subject, text, html };
}

/** Aviso interno de uma nova mensagem da central de ajuda (vai para FEEDBACK_TO_EMAIL). */
export function feedbackNotificationEmail(input: {
  to: string;
  kindLabel: string;
  title: string;
  userName: string;
  userEmail: string;
  replyTo: string;
  lines: { label: string; value: string }[];
  link: string | null;
}): MailMessage {
  const subject = `[Casa Mia] ${input.kindLabel}: ${input.title}`;
  const text = [
    `${input.kindLabel} de ${input.userName} <${input.userEmail}>`,
    input.replyTo ? `Pode responder para: ${input.replyTo}` : "Não pediu resposta por e-mail.",
    "",
    ...input.lines.map((line) => `${line.label}: ${line.value}`),
    ...(input.link ? ["", `Abrir no painel: ${input.link}`] : []),
  ].join("\n");
  const rows = input.lines
    .map(
      (line) =>
        `<p style="margin:0 0 12px;line-height:1.55"><strong style="display:block;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#6a5648">${escapeHtml(line.label)}</strong>${escapeHtml(line.value).replaceAll("\n", "<br>")}</p>`,
    )
    .join("");
  const html = layout(
    input.title,
    `<p style="margin:0 0 16px;line-height:1.6;font-size:14px;color:#6a5648">${escapeHtml(input.kindLabel)} de <strong>${escapeHtml(input.userName)}</strong> (${escapeHtml(input.userEmail)}). ${input.replyTo ? `Pode responder para ${escapeHtml(input.replyTo)}.` : "Não pediu resposta por e-mail."}</p>${rows}${input.link ? `<p style="margin:20px 0 0"><a href="${escapeHtml(input.link)}" style="color:#b5532f;font-weight:600">Abrir no painel</a></p>` : ""}`,
  );
  return { to: input.to, subject, text, html };
}

export interface PriceOpportunity {
  itemName: string;
  enxovalName: string;
  priceCents: number;
  /**
   * `lowest`: menor preço já visto; `target`: caiu até o valor que a pessoa pediu para ser avisada; `below_common`:
   * está no preço mais baixo que outras listas costumam pagar (até o p10 da faixa comum do catálogo).
   */
  reason: "lowest" | "target" | "below_common";
  url: string;
  /** Faixa comum do item (p10 a p90), vinda só de agregados de várias listas, quando há amostra suficiente. */
  commonRange?: { p10: number; p90: number } | null;
}

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const REASON_TEXT: Record<PriceOpportunity["reason"], string> = {
  lowest: "Menor preço histórico!",
  target: "Chegou ao preço que você queria!",
  below_common: "Mais barato do que outras listas costumam pagar!",
};

function opportunityLine(opportunity: PriceOpportunity) {
  const verb = opportunity.reason === "below_common" ? "está por" : "caiu para";
  return `${opportunity.itemName} ${verb} ${brl.format(opportunity.priceCents / 100)} (${REASON_TEXT[opportunity.reason]})`;
}

function commonRangeText(opportunity: PriceOpportunity) {
  const range = opportunity.commonRange;
  return range ? `Faixa comum: ${brl.format(range.p10 / 100)} a ${brl.format(range.p90 / 100)}.` : "";
}

/** Aviso de preço: um e-mail por pessoa, com todos os itens que baixaram na mesma rodada. */
export function priceOpportunityEmail(input: {
  to: string;
  name: string;
  opportunities: PriceOpportunity[];
}): MailMessage {
  const [first] = input.opportunities;
  const many = input.opportunities.length > 1;
  const subject = many
    ? `${input.opportunities.length} itens do seu enxoval baixaram de preço`
    : first.reason === "below_common"
      ? `${first.itemName} está abaixo do preço comum`
      : `${first.itemName} baixou de preço`;
  const lines = input.opportunities.map(opportunityLine);
  const text = `Olá, ${input.name}.

${many ? "Estes itens do seu enxoval baixaram de preço:" : "Uma boa notícia sobre o seu enxoval:"}

${input.opportunities.map((opportunity, index) => `- ${lines[index]}${opportunity.commonRange ? `\n  ${commonRangeText(opportunity)}` : ""}\n  ${opportunity.url}`).join("\n")}

Os preços mudam o tempo todo: confira na loja antes de comprar. Para parar de receber estes avisos, desligue "Avisar quando o preço cair" no item.`;
  const html = layout(
    many ? "Seus itens baixaram de preço" : "Seu item baixou de preço",
    `<p style="margin:0 0 16px;line-height:1.6">Olá, ${escapeHtml(input.name)}. ${many ? "Estes itens do seu enxoval baixaram de preço:" : "Uma boa notícia sobre o seu enxoval:"}</p>
${input.opportunities
  .map(
    (opportunity, index) =>
      `<p style="margin:0 0 14px;line-height:1.5"><strong>${escapeHtml(lines[index])}</strong><br><span style="font-size:13px;color:#6a5648">${escapeHtml(opportunity.enxovalName)}${opportunity.commonRange ? ` · ${escapeHtml(commonRangeText(opportunity))}` : ""}</span><br><a href="${escapeHtml(opportunity.url)}" style="color:#b5532f;font-weight:600">Ver na loja</a></p>`,
  )
  .join("\n")}
<p style="margin:16px 0 0;line-height:1.6;font-size:14px;color:#6a5648">Os preços mudam o tempo todo: confira na loja antes de comprar. Para parar de receber estes avisos, desligue "Avisar quando o preço cair" no item.</p>`,
  );
  return { to: input.to, subject, text, html };
}

export function trialEmail(input: { to: string; endsAt: Date; reminder: boolean }): MailMessage {
  const deadline = input.endsAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const subject = input.reminder ? 'Seu teste do Casa Mia termina em até 24 horas' : 'Seu teste de 2 dias do Casa Mia começou';
  const text = `${input.reminder ? 'Seu teste está acabando.' : 'Você tem 48 horas completas de acesso a todos os recursos, incluindo convidados, importação e exportação.'} O teste termina em ${deadline} (horário de Brasília). Após esse horário, o valor mensal informado no checkout será cobrado automaticamente no cartão cadastrado. Para evitar a cobrança, cancele antes desse horário em ${appBaseUrl()}/app, no botão "Cancelar assinatura". O cancelamento bloqueia imediatamente o acesso ao enxoval para você e seus convidados, inclusive importação e exportação. Sua conta e seus dados serão preservados.`;
  return { to: input.to, subject, text, html: layout(subject, `<p style="line-height:1.6">${escapeHtml(text)}</p>`) };
}
