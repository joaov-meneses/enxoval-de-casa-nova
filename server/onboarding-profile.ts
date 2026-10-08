/**
 * Respostas do funil de onboarding (/comecar), guardadas em `enxovais.onboarding_profile`.
 * Os valores permitidos espelham `src/onboarding/types.ts`. O cadastro só existe pelo funil,
 * então as respostas são validadas por completo: qualquer valor fora da lista permitida, ou
 * uma resposta obrigatória ausente, recusa o cadastro com erro 400 (nada é descartado em silêncio).
 * Campos que não fazem parte do perfil (como o nome, que fica em `users.name`) são ignorados.
 */
import { HttpError } from './security.ts';

export const ONBOARDING_PROFILE_VERSION = 1;

const MOMENTS = ['casal', 'solo', 'amigos', 'troca'] as const;
const HOUSINGS = ['apartamento', 'casa', 'studio'] as const;
const OWNED = ['nada', 'algumas', 'boa'] as const;
const STYLES = ['full', 'min'] as const;
const BUDGETS = ['lt10', '10-25', '25-50', 'gt50', 'unknown'] as const;
const WORRIES = ['start', 'waste', 'forget', 'budget', 'time'] as const;
const USAGES = ['buy', 'spend', 'links', 'share'] as const;
const ROOMS = [
  'cozinha', 'eletro', 'sala', 'quarto', 'quartoExtra', 'banheiro', 'servico', 'externa', 'escritorio'
] as const;
const STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
] as const;

export interface OnboardingProfile {
  v: typeof ONBOARDING_PROFILE_VERSION;
  moment: string;
  /** AAAA-MM-DD, ou null quando a pessoa respondeu "ainda não sei". */
  moveDate: string | null;
  moveDateAnswered: true;
  state: string;
  housing: string;
  people: number;
  rooms: string[];
  owned: string;
  style: string;
  budget: string;
  worries: string[];
  usage: string[];
  source: string;
}

const invalid = (label: string) => new HttpError(400, `Resposta inválida no funil: ${label}.`);

function requireOne<T extends string>(allowed: readonly T[], value: unknown, label: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) throw invalid(label);
  return value as T;
}

function readMany<T extends string>(allowed: readonly T[], value: unknown, label: string, min = 0): T[] {
  if (value === undefined || value === null) {
    if (min > 0) throw invalid(label);
    return [];
  }
  if (
    !Array.isArray(value) || value.length > 20
    || value.some(entry => typeof entry !== 'string' || !(allowed as readonly string[]).includes(entry))
  ) {
    throw invalid(label);
  }
  const unique = [...new Set(value as T[])];
  if (unique.length < min) throw invalid(label);
  return unique;
}

/** AAAA-MM-DD válido, ou null quando a pessoa respondeu "ainda não sei". */
function readDate(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid('data da mudança');
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw invalid('data da mudança');
  return value;
}

/** Valida e devolve o perfil. Lança HttpError 400 se faltar algo ou se algo estiver fora do permitido. */
export function parseOnboardingProfile(value: unknown): OnboardingProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Respostas do funil ausentes: o cadastro é feito pelo funil de onboarding.');
  }
  const raw = value as Record<string, unknown>;

  if (raw.moveDateAnswered !== true) throw invalid('data da mudança');
  if (typeof raw.people !== 'number' || !Number.isInteger(raw.people) || raw.people < 1 || raw.people > 20) {
    throw invalid('número de moradores');
  }
  if (raw.source !== undefined && raw.source !== null && typeof raw.source !== 'string') throw invalid('origem');

  return {
    v: ONBOARDING_PROFILE_VERSION,
    moment: requireOne(MOMENTS, raw.moment, 'momento'),
    moveDate: readDate(raw.moveDate),
    moveDateAnswered: true,
    state: requireOne(STATES, raw.state, 'estado'),
    housing: requireOne(HOUSINGS, raw.housing, 'moradia'),
    people: raw.people,
    rooms: readMany(ROOMS, raw.rooms, 'espaços', 1),
    owned: requireOne(OWNED, raw.owned, 'o que você já tem'),
    style: requireOne(STYLES, raw.style, 'estilo'),
    budget: requireOne(BUDGETS, raw.budget, 'orçamento'),
    worries: readMany(WORRIES, raw.worries, 'preocupações'),
    usage: readMany(USAGES, raw.usage, 'uso'),
    source: typeof raw.source === 'string' ? raw.source.trim().slice(0, 60) : ''
  };
}
