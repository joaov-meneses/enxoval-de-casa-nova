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
import { getLogger } from '../logger.ts';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { foldText } from '../../src/catalog/normalize.ts';
import { sharedGet, sharedIncrement, sharedSet } from '../cache/shared.ts';
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
let callListener: (() => void) | null = null;

/** Avisa a cada chamada que de fato sai para o Jev (acertos do cache não contam). Usado nas métricas do catálogo. */
export function setJevCallListener(listener: (() => void) | null) {
  callListener = listener;
}

/**
 * Teto de chamadas por dia: um erro no cliente não vira uma conta inesperada. Com Redis, o teto é somado entre todas
 * as instâncias; sem ele (ou com ele fora do ar), vale por processo.
 */
async function takeBudget() {
  const today = new Date().toISOString().slice(0, 10);
  const limit = readPositiveInt('JEV_DAILY_LIMIT', 3000);
  const shared = await sharedIncrement(`jev:budget:${today}`, 2 * 24 * 60 * 60);
  if (shared !== null) return shared <= limit;
  if (budget.day !== today) {
    budget.day = today;
    budget.used = 0;
  }
  if (budget.used >= limit) return false;
  budget.used += 1;
  return true;
}

/** Quanto tempo uma resposta do Jev fica no cache compartilhado (Redis), em segundos. Padrão: 1 dia. */
function sharedCacheTtl() {
  return readPositiveInt('JEV_SHARED_CACHE_TTL_S', 24 * 60 * 60);
}

function remember(key: string, answers: Record<string, JevAnswer>, now: number) {
  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, { expires: now + CACHE_TTL_MS, answers });
}

async function ask(state: unknown, questions: Record<string, unknown>): Promise<Record<string, JevAnswer> | null> {
  const client = getTransport();
  if (!client) { getLogger().info({ event: 'jev.skipped', state, questions }, 'Jev is not configured.'); return null; }

  // L1 (memória do processo), depois L3 (Redis, compartilhado entre instâncias), e só então o Jev.
  const key = createHash('sha1').update(JSON.stringify({ state, questions })).digest('hex');
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) { getLogger().info({ event: 'jev.cache.hit', cache: 'memory', state, questions, answers: hit.answers }, 'Jev cache hit.'); return hit.answers; }
  const shared = await sharedGet(`jev:answer:${key}`);
  if (shared) {
    try {
      const answers = JSON.parse(shared) as Record<string, JevAnswer>;
      getLogger().info({ event: 'jev.cache.hit', cache: 'redis', state, questions, answers }, 'Jev shared cache hit.');
      remember(key, answers, now);
      return answers;
    } catch (err) {
      getLogger().warn({ event: 'jev.cache.invalid', key, value: shared, err }, 'Invalid cached Jev response.');
      // Valor corrompido: pergunta de novo e sobrescreve.
    }
  }

  if (!(await takeBudget())) {
    getLogger().warn({ event: 'jev.budget_exhausted', state, questions }, 'Limite diário de chamadas atingido; seguindo sem IA.');
    return null;
  }

  try {
    getLogger().info({ event: 'jev.request.started', state, questions }, 'Jev request started.');
    callListener?.();
    const { answers } = await client.systemOne({ state, questions });
    getLogger().info({ event: 'jev.request.completed', state, questions, answers }, 'Jev request completed.');
    remember(key, answers, now);
    void sharedSet(`jev:answer:${key}`, JSON.stringify(answers), sharedCacheTtl());
    return answers;
  } catch (err) {
    // Falha do Jev nunca derruba o app: quem chamou usa a regra de sempre.
    getLogger().warn({ event: 'jev.request.failed', state, questions, err }, 'Chamada ao Jev falhou; seguindo sem IA.');
    return null;
  }
}

const unique = <T>(values: T[]) => [...new Set(values)];
const normalize = foldText;

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
  worries?: string[];
  usage?: string[];
  owned?: string;
  style?: string;
}

const CLIMATE_LABEL = { hot: 'quente', mild: 'ameno', cold: 'frio' } as const;

function profileState(profile: JevProfile, includePreferences = true) {
  return {
    moradia: profile.housing,
    moradores: profile.people,
    situacao: profile.moment,
    clima: CLIMATE_LABEL[stateInfo(profile.uf).climate],
    ...(profile.weeksToMove === null ? {} : { semanas_ate_a_mudanca: profile.weeksToMove }),
    perfil_de_gasto: profile.spendingTier,
    ...(includePreferences && profile.worries?.length ? { preocupacoes: profile.worries } : {}),
    ...(includePreferences && profile.usage?.length ? { objetivos_no_app: profile.usage } : {}),
    ...(includePreferences && profile.owned ? { itens_que_ja_tem: profile.owned } : {}),
    ...(includePreferences && profile.style ? { preferencia_de_lista: profile.style } : {})
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
  '(4) a moradia, quem mora e o clima. ' +
  'Julgue pelo tipo de item e pelo papel dele na rotina, não pelo preço.';

/**
 * Notas de urgência. Com `profile`, a casa da pessoa entra no estado (menos o prazo até a mudança); com
 * `state`, quem chama manda um estado já reduzido, como o de uma faixa de perfil (`bucketState`), para a nota valer
 * para todos os enxovais daquela faixa.
 */
export async function prioritizeItems(input: { items: UrgencyInput[]; profile?: JevProfile; state?: Record<string, unknown> }): Promise<ItemUrgency[] | null> {
  // Sem o prazo até a mudança: a nota guardada não envelhece conforme a data chega. O prazo entra no planejamento,
  // junto com o tempo de entrega do catálogo.
  const state = input.state ?? (input.profile ? profileState({ ...input.profile, weeksToMove: null }, false) : null);
  if (!state) return null;
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
      const answers = await ask(state, questions);
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

/* ------------------------------------------------- 4. catálogo compartilhado */

/** Situação na faixa de perfil: casal, quem mora só e os demais arranjos (amigos, troca de casa). */
export type BucketSituation = 'casal' | 'solo' | 'outros';
export const BUCKET_HOUSINGS = ['apartamento', 'casa', 'studio'] as const;
export const BUCKET_CLIMATES = ['hot', 'mild', 'cold'] as const;
export const BUCKET_SITUATIONS: readonly BucketSituation[] = ['casal', 'solo', 'outros'];

/**
 * Faixa de perfil de uma casa: moradia × clima × situação ("apartamento|hot|casal"). A urgência de um item depende
 * disso, e não da pessoa: a nota vale para todos os enxovais da mesma faixa. O prazo até a mudança fica de fora e
 * é combinado em código com o prazo de entrega do catálogo.
 */
export function profileBucket(profile: Pick<JevProfile, 'housing' | 'moment' | 'uf'>) {
  const housing = (BUCKET_HOUSINGS as readonly string[]).includes(profile.housing) ? profile.housing : 'apartamento';
  const situation: BucketSituation = profile.moment === 'casal' ? 'casal' : profile.moment === 'solo' ? 'solo' : 'outros';
  return `${housing}|${stateInfo(profile.uf).climate}|${situation}`;
}

const SITUATION_LABEL: Record<BucketSituation, string> = {
  casal: 'casal',
  solo: 'pessoa morando sozinha',
  outros: 'pessoas dividindo a casa'
};

/** O estado que o Jev recebe para uma faixa de perfil. */
export function bucketState(bucket: string) {
  const [housing, climate, situation] = bucket.split('|');
  return {
    moradia: housing,
    clima: CLIMATE_LABEL[climate as keyof typeof CLIMATE_LABEL] ?? 'ameno',
    situacao: SITUATION_LABEL[situation as BucketSituation] ?? SITUATION_LABEL.outros
  };
}

export const ALL_PROFILE_BUCKETS = BUCKET_HOUSINGS.flatMap(housing =>
  BUCKET_CLIMATES.flatMap(climate => BUCKET_SITUATIONS.map(situation => `${housing}|${climate}|${situation}`)));

/** Confiança mínima para tratar um nome digitado como outro jeito de escrever um item do catálogo. */
export const SAME_ITEM_THRESHOLD = 0.7;

/**
 * Deduplicação na faixa de dúvida: entre os itens do catálogo mais parecidos, algum é o mesmo produto? Devolve o nome
 * escolhido ou null (nenhum deles, Jev indisponível ou confiança baixa).
 */
export async function chooseSameItem(name: string, candidates: string[]): Promise<{ name: string; confidence: number } | null> {
  const options = unique(candidates).slice(0, 5);
  if (options.length === 0) return null;
  const answers = await ask(
    { nome_digitado: name },
    {
      mesmo_item: {
        type: 'choice',
        instructions: 'Qual destes itens do catálogo é o mesmo produto que `nome_digitado`, só escrito de outro jeito (sinônimo, abreviação, plural, tamanho ou marca)? Itens parecidos mas de uso diferente (ex.: panela e panela de pressão) não são o mesmo: nesse caso escolha a opção de nenhum.',
        criteria: { ...Object.fromEntries(options.map(option => [option, null])), [NONE]: 'Nenhum deles é o mesmo produto' }
      }
    }
  );
  const answer = answers?.mesmo_item;
  if (!answer?.choice || answer.choice === NONE || !options.includes(answer.choice)) return null;
  const confidence = answer.confidence ?? 0;
  return confidence >= SAME_ITEM_THRESHOLD ? { name: answer.choice, confidence } : null;
}

export const CATALOG_ROOM_LABELS: Record<RoomKey, string> = {
  cozinha: 'Cozinha: louça, panelas, utensílios e organização',
  eletro: 'Eletrodomésticos e eletroportáteis da cozinha',
  sala: 'Sala de estar e de jantar',
  quarto: 'Quarto principal, roupa de cama e guarda-roupa',
  quartoExtra: 'Quarto de hóspedes ou extra',
  banheiro: 'Banheiro',
  servico: 'Área de serviço, lavanderia, limpeza e ferramentas',
  externa: 'Varanda, quintal e área externa',
  escritorio: 'Home office'
};

const PRICE_TIERS = {
  '1': 'Até cerca de R$ 80',
  '2': 'Entre R$ 80 e R$ 250',
  '3': 'Entre R$ 250 e R$ 1.200',
  '4': 'Acima de R$ 1.200'
} as const;

const LEAD_TIMES = {
  '0': 'Leva para casa na hora ou chega em poucos dias, sem montagem',
  '1': 'Cerca de uma semana entre a compra e o uso',
  '2': 'Duas a três semanas (entrega agendada ou instalação)',
  '4': 'Um mês ou mais (sob medida, montagem ou instalação demorada)'
} as const;

const TIMINGS = {
  first_night: 'Precisa estar em casa na primeira noite',
  first_week: 'Faz falta já na primeira semana',
  later: 'Pode esperar a casa estar funcionando'
} as const;

export interface CatalogInference {
  /** Falso quando o Jev tem certeza de que o nome não é um item de casa (vira cache negativo). */
  isHomeItem: boolean;
  room: RoomKey | null;
  priority: 'essential' | 'optional';
  timing: 'first_night' | 'first_week' | null;
  leadTimeWeeks: number;
  priceCategory: 1 | 2 | 3 | 4;
  functionGroup: string | null;
}

/** Abaixo disto o "é um item de casa?" não basta para criar o item no catálogo. */
const HOME_ITEM_THRESHOLD = 0.5;
/** Abaixo disto o nome vai para o cache negativo. */
const NOT_HOME_ITEM_THRESHOLD = 0.2;

/**
 * Uma única chamada para um item que o catálogo não conhece: é um item de casa, em que cômodo, se é essencial, quando
 * precisa estar em casa, quanto demora para chegar, faixa de preço e se repete a função de um grupo conhecido.
 * Devolve null quando o Jev não respondeu ou ficou em dúvida sobre ser um item de casa.
 */
export async function inferCatalogItem(name: string, functionGroups: Record<string, string>): Promise<CatalogInference | null> {
  const groups = Object.entries(functionGroups).slice(0, MAX_OVERLAP_OPTIONS);
  const questions: Record<string, unknown> = {
    item_de_casa: {
      type: 'noul',
      instructions: '`nome` é um móvel, eletrodoméstico, utensílio, peça de enxoval ou item que alguém compra para montar ou manter uma casa?',
      criteria: { true: 'É um item de casa', false: 'Não é um item de casa (comida, serviço, texto sem sentido...)' }
    },
    comodo: {
      type: 'choice',
      instructions: 'Em qual ambiente da casa `nome` é mais usado ou guardado?',
      criteria: CATALOG_ROOM_LABELS
    },
    essencial: {
      type: 'noul',
      instructions: 'Quase toda casa precisa de `nome` para funcionar no dia a dia (dormir, comer, tomar banho, limpar, guardar)?',
      criteria: { true: 'Essencial', false: 'Conforto, decoração ou uso eventual' }
    },
    quando: {
      type: 'choice',
      instructions: 'Em que momento `nome` precisa estar na casa nova?',
      criteria: TIMINGS
    },
    prazo: {
      type: 'choice',
      instructions: 'Quanto tempo costuma passar entre comprar `nome` e ele estar pronto para uso (entrega, montagem, instalação)?',
      criteria: LEAD_TIMES
    },
    preco: {
      type: 'choice',
      instructions: 'Em qual faixa costuma ficar o preço de `nome` no Brasil, numa versão comum?',
      criteria: PRICE_TIERS
    }
  };
  if (groups.length > 0) {
    questions.grupo = {
      type: 'choice',
      instructions: 'Comprar `nome` repete o trabalho de algum destes grupos (um substitui o outro)? Itens de uso diferente, mesmo parecidos, não entram no grupo.',
      criteria: { ...Object.fromEntries(groups), [NONE]: 'Não substitui nenhum deles' }
    };
  }

  const answers = await ask({ nome: name }, questions);
  if (!answers) return null;
  const home = answers.item_de_casa?.noul;
  if (typeof home !== 'number') return null;
  if (home < NOT_HOME_ITEM_THRESHOLD) {
    return { isHomeItem: false, room: null, priority: 'optional', timing: null, leadTimeWeeks: 0, priceCategory: 2, functionGroup: null };
  }
  if (home < HOME_ITEM_THRESHOLD) return null;

  const roomChoice = answers.comodo?.choice;
  const room = roomChoice && roomChoice in CATALOG_ROOM_LABELS && (answers.comodo?.confidence ?? 0) >= JEV_THRESHOLDS.environment
    ? roomChoice as RoomKey
    : null;
  const when = answers.quando?.choice;
  const lead = Number(answers.prazo?.choice);
  const tier = Number(answers.preco?.choice);
  const group = answers.grupo?.choice;
  return {
    isHomeItem: true,
    room,
    priority: (answers.essencial?.noul ?? 0) >= 0.5 ? 'essential' : 'optional',
    timing: when === 'first_night' || when === 'first_week' ? when : null,
    leadTimeWeeks: Number.isInteger(lead) && lead >= 0 ? lead : 0,
    priceCategory: tier === 1 || tier === 2 || tier === 3 || tier === 4 ? tier : 2,
    functionGroup: group && group !== NONE && functionGroups[group] && (answers.grupo?.confidence ?? 0) >= JEV_THRESHOLDS.environment ? group : null
  };
}
