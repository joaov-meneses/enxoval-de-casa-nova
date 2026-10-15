/**
 * Jev (TypeSafe AI): decisões rápidas e tipadas sobre o enxoval.
 *
 * O código manda no fluxo; o Jev só responde perguntas fechadas (escolha, nota, sim/não) com probabilidade e
 * confiança. Toda função aqui devolve `null` quando o Jev não está disponível (sem chave, limite do dia,
 * erro de rede) ou quando a confiança é baixa: quem chama cai no comportamento sem IA que o app já tinha.
 *
 * Nada pessoal é enviado: só nomes de itens e de ambientes, moradia, número de moradores, estado e prazo.
 */
import { createHash } from 'node:crypto';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { CATALOG, matchesWhere } from '../../src/onboarding/catalog.ts';
import { NORDESTE, traitsOfCity } from '../../src/onboarding/regions.ts';
import { stateInfo } from '../../src/onboarding/plan.ts';
import type { RoomKey } from '../../src/onboarding/types.ts';
import { URGENCY_RUBRIC_VERSION, URGENCY_SCALE } from '../../src/planning/purchaseUrgency.ts';

/** Confiança mínima (0 a 1) para o app agir sem perguntar. Comece conservador e ajuste com dados reais. */
export const JEV_THRESHOLDS = {
  /** Ambiente sugerido para um item novo. */
  environment: 0.6,
  /** Probabilidade de "compra redundante" (sim/não) que, junto de um equivalente claro, faz o app avisar. */
  redundancy: 0.5,
  /** Probabilidade de o equivalente apontado ser mesmo o que cumpre a função (1 menos a de "nenhum"). */
  overlap: 0.9,
  /** Redundância tão forte que o aviso sai mesmo sem equivalente claro. */
  redundancyAlone: 0.8,
  /** Confiança a partir da qual há um favorito claro para o próximo item; abaixo, o app mostra as melhores opções. */
  recommendation: 0.5,
  /** Abaixo disto a nota de urgência é só uma estimativa: o app guarda e mostra, mas avisa que é incerta. */
  urgency: 0.5
} as const;

const NONE = '__nenhum__';
const MAX_EXISTING_ITEMS = 150;
const MAX_OVERLAP_OPTIONS = 80;
const MAX_CANDIDATES = 100;
const URGENCY_CHUNK = 12;
/** Itens avaliados por consulta ao app (cada parte de `URGENCY_CHUNK` é uma chamada ao Jev). */
export const MAX_URGENCY_ITEMS = 60;

/* ------------------------------------------------------------------ transporte */

interface JevAnswer {
  type: string;
  choice?: string;
  noul?: number;
  score?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
}

/** O pedaço do SDK que usamos; nos testes entra um falso no lugar. */
export interface JevTransport {
  systemOne(request: { state: unknown; questions: Record<string, unknown> }): Promise<{ answers: Record<string, JevAnswer> }>;
}

let transport: JevTransport | null | undefined;

function readPositiveInt(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function getTransport(): JevTransport | null {
  if (transport !== undefined) return transport;
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) return (transport = null);
  const client = new TypeSafeClient({
    apiKey,
    defaultModel: process.env.TYPESAFE_DEFAULT_MODEL?.trim() || 'jev-latest',
    // A resposta aparece enquanto a pessoa preenche um formulário: melhor desistir cedo do que travar a tela.
    timeout: readPositiveInt('JEV_TIMEOUT_MS', 8000),
    retry: { maxRetries: 1 }
  });
  return (transport = {
    systemOne: request => client.systemOne(request as never) as unknown as Promise<{ answers: Record<string, JevAnswer> }>
  });
}

export function isJevConfigured() {
  return getTransport() !== null;
}

/** Só para testes: troca (ou, com `undefined`, recria a partir do ambiente) o cliente e zera cache e orçamento. */
export function setJevTransportForTests(next: JevTransport | null | undefined) {
  transport = next;
  cache.clear();
  budget.day = '';
  budget.used = 0;
}

/* ------------------------------------------------------------ cache e orçamento */

const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX_ENTRIES = 500;
const cache = new Map<string, { expires: number; answers: Record<string, JevAnswer> }>();
const budget = { day: '', used: 0 };

/** Teto de chamadas por dia e por processo: um erro no cliente não vira uma conta inesperada. */
function takeBudget() {
  const today = new Date().toISOString().slice(0, 10);
  if (budget.day !== today) {
    budget.day = today;
    budget.used = 0;
  }
  if (budget.used >= readPositiveInt('JEV_DAILY_LIMIT', 3000)) return false;
  budget.used += 1;
  return true;
}

async function ask(state: unknown, questions: Record<string, unknown>): Promise<Record<string, JevAnswer> | null> {
  const client = getTransport();
  if (!client) return null;

  const key = createHash('sha1').update(JSON.stringify({ state, questions })).digest('hex');
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.answers;

  if (!takeBudget()) {
    console.warn('[jev] Limite diário de chamadas atingido; seguindo sem IA.');
    return null;
  }

  try {
    const { answers } = await client.systemOne({ state, questions });
    if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    cache.set(key, { expires: now + CACHE_TTL_MS, answers });
    return answers;
  } catch (err) {
    // Falha do Jev nunca derruba o app: quem chamou usa a regra de sempre.
    console.warn('[jev] Chamada falhou:', err instanceof Error ? err.message : err);
    return null;
  }
}

const unique = <T>(values: T[]) => [...new Set(values)];
const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/* --------------------------------------------------------------------- perfil */

export interface JevProfile {
  /** apartamento, casa ou studio. */
  housing: string;
  /** casal, solo, amigos ou troca. */
  moment: string;
  people: number;
  uf: string | null;
  city: string | null;
  spendingTier: string;
  /** Semanas até a mudança, ou null quando a pessoa ainda não sabe a data. */
  weeksToMove: number | null;
}

const CLIMATE_LABEL = { hot: 'quente', mild: 'ameno', cold: 'frio' } as const;

function profileState(profile: JevProfile) {
  return {
    moradia: profile.housing,
    moradores: profile.people,
    situacao: profile.moment,
    clima: CLIMATE_LABEL[stateInfo(profile.uf).climate],
    ...(profile.weeksToMove === null ? {} : { semanas_ate_a_mudanca: profile.weeksToMove }),
    perfil_de_gasto: profile.spendingTier
  };
}

/* ------------------------------------------------- 1. ambiente e redundância */

export interface ExistingItem {
  name: string;
  environment: string;
}

export interface ItemAssessment {
  /** Ambiente que o Jev escolheu, quando a confiança passa do limiar. */
  environment: { name: string; confidence: number } | null;
  /** Compra provavelmente redundante, quando a probabilidade passa do limiar. */
  redundancy: { probability: number; overlapsWith: string | null } | null;
}

/**
 * Uma chamada, até duas perguntas (padrão "speculative fan-out"): em qual ambiente o item entra e se ele repete
 * a função de algo que a pessoa já tem.
 */
export async function assessItem(input: {
  name: string;
  environments: string[];
  /** Só pergunta o ambiente quando a pessoa ainda não escolheu um. */
  classify: boolean;
  existing: ExistingItem[];
  profile: JevProfile;
}): Promise<ItemAssessment | null> {
  const environments = unique(input.environments);
  const existing = input.existing.slice(0, MAX_EXISTING_ITEMS);
  const questions: Record<string, unknown> = {};

  if (input.classify && environments.length >= 2) {
    questions.ambiente = {
      type: 'choice',
      instructions: 'Em qual ambiente da casa `novo_item` será mais usado?',
      criteria: Object.fromEntries(environments.map(name => [name, null]))
    };
  }

  // Nome idêntico a um item da lista é duplicata, e isso o app resolve sem IA.
  const comparable = existing.filter(item => normalize(item.name) !== normalize(input.name));
  const overlapNames = unique(comparable.map(item => item.name)).slice(0, MAX_OVERLAP_OPTIONS);
  if (overlapNames.length > 0) {
    questions.redundante = {
      type: 'noul',
      instructions: 'Comprar `novo_item` seria um gasto desnecessário, porque algum item de `itens_por_ambiente` já cumpre a mesma função? Itens de uso diferente, mesmo parecidos (ex.: panela e frigideira), não são redundantes.',
      criteria: {
        true: 'O novo item repete a função de um item que a pessoa já tem',
        false: 'O novo item serve a um uso que a lista ainda não cobre'
      }
    };
    questions.sobreposicao = {
      type: 'choice',
      instructions: 'Qual item de `itens_por_ambiente` cumpre a mesma função de `novo_item`? Escolha a opção de nenhum quando não houver equivalente.',
      criteria: {
        ...Object.fromEntries(overlapNames.map(name => [name, null])),
        [NONE]: 'Nenhum item da lista cumpre a mesma função'
      }
    };
  }

  if (Object.keys(questions).length === 0) return null;

  const itemsByEnvironment: Record<string, string[]> = {};
  for (const item of existing) (itemsByEnvironment[item.environment] ??= []).push(item.name);

  const answers = await ask(
    {
      novo_item: input.name,
      ambientes_da_casa: environments,
      itens_por_ambiente: itemsByEnvironment,
      ...profileState(input.profile)
    },
    questions
  );
  if (!answers) return null;

  const chosen = answers.ambiente;
  const environment =
    chosen?.choice && environments.includes(chosen.choice) && (chosen.confidence ?? 0) >= JEV_THRESHOLDS.environment
      ? { name: chosen.choice, confidence: chosen.confidence ?? 0 }
      : null;

  // O sim/não sozinho é conservador (uma "fritadeira elétrica" dá ~0,6 mesmo com uma airfryer na lista) e a pergunta de
  // equivalência é firme. Juntas separam o que repete do que só se parece (um forno elétrico dá ~0,4 e ~0,8).
  const probability = answers.redundante?.noul;
  const overlap = answers.sobreposicao;
  const overlapName = overlap?.choice && overlap.choice !== NONE && overlapNames.includes(overlap.choice) ? overlap.choice : null;
  const overlapCertainty = overlapName ? 1 - (overlap?.probabilities?.[NONE] ?? 1) : 0;
  const clearOverlap = overlapName !== null && overlapCertainty >= JEV_THRESHOLDS.overlap;
  const redundancy =
    typeof probability === 'number' &&
    ((clearOverlap && probability >= JEV_THRESHOLDS.redundancy) || probability >= JEV_THRESHOLDS.redundancyAlone)
      ? { probability, overlapsWith: clearOverlap ? overlapName : null }
      : null;

  return { environment, redundancy };
}

/* --------------------------------------------------------- 2. próximo essencial */

export interface Candidate {
  name: string;
  essential: boolean;
  firstNight: boolean;
}

export interface NextRecommendation {
  name: string;
  essential: boolean;
  confidence: number;
  /** Há um favorito claro (confiança no limiar). Se não, o app mostra `options` para a pessoa escolher. */
  clear: boolean;
  /** As melhores opções, da mais provável para a menos; a primeira é `name`. */
  options: { name: string; essential: boolean; probability: number }[];
}

const MAX_OPTIONS = 3;
/** Opção com menos que isto de probabilidade não vale mostrar. */
const MIN_OPTION_PROBABILITY = 0.08;

/**
 * Itens do catálogo para o cômodo que combinam com a casa da pessoa e ainda não estão na lista. Aplica as mesmas
 * regras do funil (casa/apartamento/studio, casal, região), para o Jev nunca sugerir algo que não faz sentido aqui.
 */
export function candidatesFor(room: RoomKey, existingNames: string[], profile: JevProfile): Candidate[] {
  const have = new Set(existingNames.map(normalize));
  const uf = profile.uf ?? 'SP';
  const place = { uf, city: profile.city, traits: traitsOfCity(profile.city) };
  const result: Candidate[] = [];
  const seen = new Set<string>();

  for (const entry of CATALOG) {
    if (entry.room !== room) continue;
    const has = (letter: string) => entry.flags.includes(letter);
    if (
      (has('K') && profile.housing !== 'casa') ||
      (has('A') && profile.housing === 'casa') ||
      (has('X') && profile.housing === 'studio') ||
      (has('O') && profile.housing !== 'studio') ||
      (has('N') && !NORDESTE.has(uf)) ||
      (has('R') && uf !== 'RS') ||
      (has('C') && profile.moment !== 'casal') ||
      (has('S') && profile.moment === 'casal') ||
      !matchesWhere(entry.where, place)
    ) {
      continue;
    }
    const name = entry.name.replace('{cama}', profile.moment === 'casal' ? 'de casal' : 'de solteiro');
    const key = normalize(name);
    if (have.has(key) || seen.has(key)) continue;
    seen.add(key);
    result.push({ name, essential: has('E') || has('H') || has('F'), firstNight: has('I') });
  }
  return result;
}

export async function recommendNext(input: {
  environment: string;
  existing: string[];
  candidates: Candidate[];
  profile: JevProfile;
}): Promise<NextRecommendation | null> {
  // "Próximo item indispensável": enquanto faltar algum essencial, só eles entram na disputa. Misturar com opcionais
  // deixa o Jev indeciso entre dezenas de opções parecidas, e o corte em MAX_CANDIDATES nunca deve esconder o que importa.
  const essentials = input.candidates.filter(candidate => candidate.essential);
  const candidates = [...(essentials.length > 0 ? essentials : input.candidates)]
    .sort((a, b) => Number(b.firstNight) - Number(a.firstNight))
    .slice(0, MAX_CANDIDATES);
  if (candidates.length === 0) return null;

  const answers = await ask(
    {
      ambiente: input.environment,
      itens_ja_no_ambiente: input.existing.slice(0, MAX_EXISTING_ITEMS),
      ...profileState(input.profile)
    },
    {
      proximo: {
        type: 'choice',
        instructions: 'Qual é o próximo item indispensável que ainda falta comprar para o `ambiente` de quem está montando a casa agora? Considere a moradia, os moradores e o que já está em `itens_ja_no_ambiente`.',
        criteria: {
          ...Object.fromEntries(
            candidates.map(candidate => [
              candidate.name,
              `${candidate.essential ? 'Essencial' : 'Opcional'}${candidate.firstNight ? ', usado já na primeira noite' : ''}`
            ])
          ),
          [NONE]: 'Nada indispensável falta neste ambiente'
        }
      }
    }
  );

  const answer = answers?.proximo;
  if (!answer?.choice || answer.choice === NONE) return null;
  const picked = candidates.find(candidate => candidate.name === answer.choice);
  if (!picked) return null;

  // Sem favorito claro o Jev ainda ordena as opções: melhor mostrar as 3 mais prováveis do que não dizer nada.
  const confidence = answer.confidence ?? 0;
  const options = candidates
    .map(candidate => ({
      name: candidate.name,
      essential: candidate.essential,
      probability: answer.probabilities?.[candidate.name] ?? (candidate.name === picked.name ? 1 : 0)
    }))
    .filter(option => option.name === picked.name || option.probability >= MIN_OPTION_PROBABILITY)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, MAX_OPTIONS);
  return { name: picked.name, essential: picked.essential, confidence, clear: confidence >= JEV_THRESHOLDS.recommendation, options };
}

/* ----------------------------------------------------------- 3. urgência (1 a 5) */

/**
 * Identifica para qual nome e ambiente uma nota de urgência vale. Renomear o item ou movê-lo de ambiente muda a
 * chave, e a nota guardada deixa de valer; mudanças de caixa, acento ou espaços não contam.
 */
export function urgencyKey(name: string, environment: string) {
  return `v${URGENCY_RUBRIC_VERSION}|${normalize(name)}|${normalize(environment)}`;
}

export interface UrgencyInput {
  id: string;
  name: string;
  environment: string;
}

export interface ItemUrgency {
  id: string;
  /** De 1 (pode esperar mais de 6 meses) a `URGENCY_LEVELS` (comprar já). Pode ter casas decimais. */
  urgency: number;
  confidence: number;
}

/**
 * A pergunta é sobre o momento em que o item precisa estar em casa, e não sobre "importância": um item pode ser
 * importante e ainda assim esperar (um sofá), ou barato e inadiável (uma toalha). Os pontos a pesar vêm explícitos
 * para o Jev não decidir só pelo preço ou pelo nome. O preço não é enviado de propósito.
 */
const URGENCY_QUESTION =
  'Em que momento `item` precisa estar em casa, em relação à mudança? Pese: ' +
  '(1) se, sem ele, a pessoa não consegue dormir, tomar banho, comer ou guardar comida nos primeiros dias; ' +
  '(2) se é grande, caro ou tem entrega e montagem demoradas, o que obriga a comprar com semanas de antecedência; ' +
  '(3) se é conforto, decoração ou uso eventual, que pode esperar a casa funcionar; ' +
  '(4) a moradia, quem mora, o clima e quanto tempo falta para a mudança. ' +
  'Julgue pelo tipo de item e pelo papel dele na rotina, não pelo preço.';

export async function prioritizeItems(input: { items: UrgencyInput[]; profile: JevProfile }): Promise<ItemUrgency[] | null> {
  const items = input.items.slice(0, MAX_URGENCY_ITEMS);
  if (items.length === 0) return null;

  const chunks: UrgencyInput[][] = [];
  for (let i = 0; i < items.length; i += URGENCY_CHUNK) chunks.push(items.slice(i, i + URGENCY_CHUNK));

  const results = await Promise.all(
    chunks.map(async chunk => {
      const questions: Record<string, unknown> = {};
      for (const [index, item] of chunk.entries()) {
        questions[`i${index}`] = {
          type: 'score',
          instructions: {
            item: { nome: item.name, ambiente: item.environment },
            pergunta: URGENCY_QUESTION
          },
          criteria: URGENCY_SCALE.map(level => level.criterion)
        };
      }
      const answers = await ask(profileState(input.profile), questions);
      if (!answers) return null;
      const scored: ItemUrgency[] = [];
      for (const [index, item] of chunk.entries()) {
        const answer = answers[`i${index}`];
        // Nota de baixa confiança também vale ser guardada: sem ela o item seria reavaliado (e cobrado) a cada consulta.
        if (typeof answer?.score !== 'number') continue;
        scored.push({ id: item.id, urgency: Math.round((answer.score + 1) * 10) / 10, confidence: answer.confidence ?? 0 });
      }
      return scored;
    })
  );

  // Se todas as partes falharam, não há o que mostrar; se só algumas falharam, mostra o que veio.
  if (results.every(result => result === null)) return null;
  return results.flat().filter((entry): entry is ItemUrgency => entry !== null).sort((a, b) => b.urgency - a.urgency);
}
