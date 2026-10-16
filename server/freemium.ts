import type { PoolClient } from 'pg';
import { isAccountPlan, planLimits, type AccountPlan, type PlanLimits } from '../src/plans.ts';
import { HttpError } from './security.ts';

/**
 * Travas do plano gratuito. Quem manda é o plano do dono do enxoval: convidados herdam os
 * limites (ou a liberação) de quem os convidou. Cada função roda dentro da transação que vai
 * criar o registro e trava a linha do enxoval (ou do usuário), para duas abas não passarem
 * juntas pelo mesmo limite.
 */

/**
 * Plano em vigor da conta, em SQL. O Passe vale só até `pass_expires_at`; depois dele a conta volta ao plano da
 * assinatura (ou ao gratuito) sem nenhuma rotina de expiração: a data é conferida a cada leitura. Fundador manda sempre.
 */
export function effectivePlanSql(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `(CASE WHEN ${p}plan = 'founder' THEN 'founder' WHEN ${p}pass_expires_at > now() THEN 'pass' ELSE ${p}plan END)`;
}

function asPlan(value: unknown): AccountPlan {
  return isAccountPlan(value) ? value : 'free';
}

/** Plano do dono do enxoval, com a linha do enxoval travada até o fim da transação. */
export async function lockEnxovalLimits(client: PoolClient, enxovalId: string): Promise<PlanLimits> {
  const result = await client.query<{ plan: string }>(`
    SELECT ${effectivePlanSql('u')} AS plan
    FROM enxovais e
    INNER JOIN users u ON u.id = e.owner_id
    WHERE e.id = $1
    FOR UPDATE OF e
  `, [enxovalId]);
  if (!result.rows[0]) throw new HttpError(404, 'Enxoval não encontrado.');
  return planLimits(asPlan(result.rows[0].plan));
}

export function environmentsLimitError(limit: number) {
  return new HttpError(403,
    `Sua casa está crescendo! No plano gratuito, cada enxoval pode ter até ${limit} ambientes. Conheça os planos para abrir as portas de todos os cômodos.`,
    'LIMIT_REACHED_ENVIRONMENTS');
}

export function itemsLimitError(limit: number) {
  return new HttpError(403,
    `Este ambiente já tem ${limit} itens, o máximo do plano gratuito. Conheça os planos para cadastrar itens sem limite.`,
    'LIMIT_REACHED_ITEMS');
}

/** Recusa um ambiente novo quando o enxoval já está no limite do plano. */
export async function assertCanCreateEnvironment(client: PoolClient, enxovalId: string) {
  const { environments } = await lockEnxovalLimits(client, enxovalId);
  if (environments === null) return;
  const result = await client.query<{ total: number }>(
    'SELECT COUNT(*)::int AS total FROM categories WHERE enxoval_id = $1', [enxovalId]);
  if ((result.rows[0]?.total ?? 0) >= environments) throw environmentsLimitError(environments);
}

/** Recusa mais um item (novo ou trazido de outro ambiente) quando o ambiente já está no limite. */
export async function assertCanAddItem(client: PoolClient, enxovalId: string, categoryId: string) {
  const { itemsPerEnvironment } = await lockEnxovalLimits(client, enxovalId);
  if (itemsPerEnvironment === null) return;
  const result = await client.query<{ total: number }>(
    'SELECT COUNT(*)::int AS total FROM items WHERE enxoval_id = $1 AND category_id = $2', [enxovalId, categoryId]);
  if ((result.rows[0]?.total ?? 0) >= itemsPerEnvironment) throw itemsLimitError(itemsPerEnvironment);
}

/** Plano da própria conta, com a linha do usuário travada (criação de enxoval). */
export async function lockUserLimits(client: PoolClient, userId: string): Promise<PlanLimits> {
  const result = await client.query<{ plan: string }>(`SELECT ${effectivePlanSql()} AS plan FROM users WHERE id = $1 FOR UPDATE`, [userId]);
  if (!result.rows[0]) throw new HttpError(401, 'Faça login para continuar.');
  return planLimits(asPlan(result.rows[0].plan));
}

/** Recusa um enxoval novo quando a conta já é dona do máximo permitido. Devolve os limites para cortar o conteúdo inicial. */
export async function assertCanCreateEnxoval(client: PoolClient, userId: string) {
  const limits = await lockUserLimits(client, userId);
  if (limits.enxovais === null) return limits;
  const result = await client.query<{ total: number }>(
    'SELECT COUNT(*)::int AS total FROM enxovais WHERE owner_id = $1', [userId]);
  if ((result.rows[0]?.total ?? 0) >= limits.enxovais) {
    throw new HttpError(403,
      `No plano gratuito você pode ter ${limits.enxovais === 1 ? '1 enxoval' : `${limits.enxovais} enxovais`}. Conheça os planos para planejar mais de uma casa.`,
      'LIMIT_REACHED_ENXOVAIS');
  }
  return limits;
}

/** Corta o conteúdo inicial (funil ou modelo) ao que cabe no plano: os primeiros ambientes, com os primeiros itens. */
export function trimToLimits<T extends { items: unknown[] }>(categories: T[], limits: PlanLimits): T[] {
  const kept = limits.environments === null ? categories : categories.slice(0, limits.environments);
  return limits.itemsPerEnvironment === null
    ? kept
    : kept.map(category => ({ ...category, items: category.items.slice(0, limits.itemsPerEnvironment!) }));
}
