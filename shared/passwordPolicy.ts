// Regra de senha nova (cadastro, redefinição, troca obrigatória e convite): uma só, usada no navegador
// para guiar quem digita e no servidor para recusar. Senhas já salvas não passam por ela: o login
// continua aceitando a senha que a pessoa cadastrou antes desta regra existir.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
/** A partir de quantos dígitos seguidos, subindo ou descendo de um em um (123, 987), a senha é recusada. */
const DIGIT_SEQUENCE_LIMIT = 3;

export type PasswordRuleId = 'length' | 'letter' | 'number' | 'special' | 'sequence';

export const PASSWORD_RULES: ReadonlyArray<{ id: PasswordRuleId; label: string }> = [
  { id: 'length', label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres` },
  { id: 'letter', label: 'Uma letra' },
  { id: 'number', label: 'Um número' },
  { id: 'special', label: 'Um caractere especial (! @ # $ % & *)' },
  { id: 'sequence', label: 'Sem números em sequência (123, 987)' },
];

function isDigit(char: string) {
  return char >= '0' && char <= '9';
}

export function hasDigitSequence(password: string) {
  let ascending = 1;
  let descending = 1;
  for (let i = 1; i < password.length; i++) {
    const previous = password[i - 1];
    const current = password[i];
    const digits = isDigit(previous) && isDigit(current);
    const step = digits ? Number(current) - Number(previous) : 0;
    ascending = step === 1 ? ascending + 1 : 1;
    descending = step === -1 ? descending + 1 : 1;
    if (ascending >= DIGIT_SEQUENCE_LIMIT || descending >= DIGIT_SEQUENCE_LIMIT) return true;
  }
  return false;
}

export function unmetPasswordRules(password: string): PasswordRuleId[] {
  const unmet: PasswordRuleId[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) unmet.push('length');
  if (!/\p{L}/u.test(password)) unmet.push('letter');
  if (!/[0-9]/.test(password)) unmet.push('number');
  if (!/[^\p{L}\p{N}\s]/u.test(password)) unmet.push('special');
  if (hasDigitSequence(password)) unmet.push('sequence');
  return unmet;
}

/** Mensagem para quem tentou salvar uma senha fora da regra, ou null quando ela é aceita. */
export function passwordPolicyError(password: string): string | null {
  if (password.length > PASSWORD_MAX_LENGTH) return `A senha pode ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
  const unmet = unmetPasswordRules(password);
  if (!unmet.length) return null;
  const sequence = unmet.includes('sequence');
  if (sequence && unmet.length === 1) return 'Evite números em sequência na senha, como 123 ou 987.';
  return `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres, com letras, números e um caractere especial${sequence ? ', sem números em sequência (como 123 ou 987)' : ''}.`;
}
