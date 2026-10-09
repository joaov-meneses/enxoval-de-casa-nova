// E-mail transacional da Larume (hoje: redefinição de senha).
// Provedor: Resend, pela API HTTP, quando RESEND_API_KEY e MAIL_FROM estão configurados.
// Sem configuração, em desenvolvimento a mensagem aparece no console do servidor (com o link); em produção nada
// é impresso além de um aviso, porque o link de redefinição é um segredo e não deve ir para os logs.

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

export async function sendMail(message: MailMessage) {
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
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new Error(`O provedor de e-mail respondeu ${response.status}. ${detail}`);
    }
    return;
  }
  if (isProductionServer()) {
    console.warn(
      "E-mail não enviado: configure RESEND_API_KEY e MAIL_FROM para habilitar a recuperação de senha por e-mail.",
    );
    return;
  }
  console.log(
    `\n[e-mail simulado] Para: ${message.to}\nAssunto: ${message.subject}\n\n${message.text}\n`,
  );
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
const MAIL_SANS = "'DM Sans','Segoe UI',Helvetica,Arial,sans-serif";
const MAIL_SERIF = "'Playfair Display',Georgia,'Times New Roman',serif";

function layout(title: string, bodyHtml: string) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f5f4ec;padding:32px 16px;font-family:${MAIL_SANS};color:#343b32">
<div style="max-width:480px;margin:0 auto;background:#fdfcf8;border:1px solid #e3e5da;border-radius:16px;padding:32px">
<p style="margin:0 0 20px;font-family:${MAIL_SERIF};font-size:26px;color:#57634b">Larume</p>
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
  const subject = "Redefina a sua senha da Larume";
  const text = `Olá, ${input.name}.

Recebemos um pedido para redefinir a senha da sua conta na Larume. Para criar uma nova senha, abra o link abaixo. Ele vale por ${input.minutes} minutos e só pode ser usado uma vez:

${input.link}

Se não foi você, ignore este e-mail: sua senha continua a mesma.`;
  const html = layout(
    "Vamos criar uma nova senha",
    `<p style="margin:0 0 16px;line-height:1.6">Olá, ${escapeHtml(input.name)}. Recebemos um pedido para redefinir a senha da sua conta.</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(input.link)}" style="display:inline-block;background:#343b32;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:600">Criar nova senha</a></p>
<p style="margin:0 0 12px;line-height:1.6;font-size:14px">O link vale por ${input.minutes} minutos e só pode ser usado uma vez. Se o botão não abrir, copie este endereço no navegador:</p>
<p style="margin:0 0 20px;font-size:13px;word-break:break-all;color:#5b6051">${escapeHtml(input.link)}</p>
<p style="margin:0;line-height:1.6;font-size:14px;color:#5b6051">Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>`,
  );
  return { to: input.to, subject, text, html };
}

export function passwordChangedEmail(input: {
  to: string;
  name: string;
}): MailMessage {
  const subject = "A senha da sua conta na Larume foi alterada";
  const text = `Olá, ${input.name}.

A senha da sua conta na Larume acabou de ser alterada e as sessões abertas foram encerradas. Se foi você, não precisa fazer nada.

Se não reconhece essa alteração, peça um novo link em "Esqueci minha senha" na tela de login.`;
  const html = layout(
    "Sua senha foi alterada",
    `<p style="margin:0 0 16px;line-height:1.6">Olá, ${escapeHtml(input.name)}. A senha da sua conta acabou de ser alterada e as sessões abertas foram encerradas. Se foi você, não precisa fazer nada.</p>
<p style="margin:0;line-height:1.6;font-size:14px;color:#5b6051">Se não reconhece essa alteração, peça um novo link em "Esqueci minha senha" na tela de login.</p>`,
  );
  return { to: input.to, subject, text, html };
}
