export const SUPPORT_EMAIL = 'contato@devspot.com.br';
export const LEGAL_UPDATED = '6 de novembro de 2026';
/** A política de privacidade mudou depois dos termos (registros técnicos e analytics sem dados digitados). */
export const PRIVACY_UPDATED = '8 de novembro de 2026';
export const MERCHANT = {
  name: 'DEVSPOT TECNOLOGIA LTDA',
  cnpj: '62.429.185/0001-01',
  address: 'Rua Francisco Drumond, 41, sala 02, Centro, Camaçari — BA, CEP 42800-063',
} as const;

/** A origem vem da configuração validada do app, nunca de um link enviado pelo cliente. */
export function checkoutPolicyText(baseUrl: string, billingMessage: string) {
  const terms = new URL('/termos', baseUrl).href;
  const privacy = new URL('/privacidade', baseUrl).href;
  const refunds = new URL('/reembolso', baseUrl).href;
  return `${billingMessage} Direito de arrependimento de 7 dias, conforme a lei brasileira: [cancelamento e reembolso](${refunds}). [Termos de Uso](${terms}) · [Privacidade](${privacy}). Contato: ${SUPPORT_EMAIL}.`;
}
