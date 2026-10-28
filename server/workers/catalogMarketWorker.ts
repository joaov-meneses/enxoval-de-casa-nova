import { randomUUID } from 'node:crypto';
import { getPool } from '../database.ts';
import { logger } from '../logger.ts';
import { registerJob, trackJob } from '../jobMonitor.ts';
import { isJevConfigured } from '../services/jev.ts';
import { isSerpApiConfigured, searchShoppingPrices, serpApiSearchesLeft, SerpApiError, type ShoppingOffer } from '../services/serpapi.ts';
import { checkedPriceNames, refreshNationalPriceStats } from '../catalog/pricing.ts';

export const MARKET_WEEKLY_LIMIT = 50;
export const MARKET_MONTHLY_LIMIT = 250;
export const MARKET_CATALOG_LIMIT = 250;
const LOCK = 726_351_909;
const WEEK_MS = 7 * 24 * 60 * 60_000;
const TIME_ZONE = 'America/Sao_Paulo';

export function pricingWindows(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  const day = `${value('year')}-${value('month')}-${value('day')}`;
  const monday = new Date(`${day}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  return { week: monday.toISOString().slice(0, 10), month: `${day.slice(0, 7)}-01` };
}

/** Converte segunda-feira às 06h locais para UTC usando o fuso IANA, sem depender do fuso do servidor. */
function mondayAtSix(day: string) {
  const localTime = Date.parse(`${day}T06:00:00Z`);
  let timestamp = localTime;
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = format.formatToParts(new Date(timestamp));
    const part = (type: string) => Number(parts.find(value => value.type === type)!.value);
    const rendered = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
    timestamp += localTime - rendered;
  }
  return new Date(timestamp);
}

export function marketSchedule(now = new Date()) {
  const { week } = pricingWindows(now);
  const due = mondayAtSix(week);
  const catchUp = now.getTime() >= due.getTime();
  const followingMonday = new Date(`${week}T00:00:00Z`);
  followingMonday.setUTCDate(followingMonday.getUTCDate() + 7);
  const next = catchUp ? mondayAtSix(followingMonday.toISOString().slice(0, 10)) : due;
  return { due, next, catchUp };
}

export interface MarketSummary { searched: number; offers: number; failed: number; skipped: boolean; reason?: string }

export async function runCatalogMarketRefresh(options: { now?: Date } = {}): Promise<MarketSummary> {
  const summary: MarketSummary = { searched: 0, offers: 0, failed: 0, skipped: false };
  const skip = (reason: string) => ({ ...summary, skipped: true, reason });
  if (process.env.CATALOG_MARKET_PRICES !== 'on') return skip('disabled');
  if (!isSerpApiConfigured()) return skip('serpapi_not_configured');
  if (!isJevConfigured()) return skip('jev_not_configured');
  const now = options.now ?? new Date();
  const { week, month } = pricingWindows(now);
  const client = await getPool().connect();
  let locked = false;
  try {
    locked = Boolean((await client.query('SELECT pg_try_advisory_lock($1) AS locked', [LOCK])).rows[0]?.locked);
    if (!locked) return skip('locked');
    const usage = (await client.query<{ weekly: number; monthly: number }>(
      `SELECT count(*) FILTER (WHERE week_start=$1)::int AS weekly,
              count(*) FILTER (WHERE month_start=$2)::int AS monthly FROM catalog_market_searches`, [week, month]
    )).rows[0];
    const localAllowance = Math.min(MARKET_WEEKLY_LIMIT - usage.weekly, MARKET_MONTHLY_LIMIT - usage.monthly);
    if (localAllowance <= 0) return skip('local_quota');
    const remaining = await serpApiSearchesLeft();
    const allowance = Math.min(localAllowance, remaining);
    if (allowance <= 0) return skip('provider_quota');

    await client.query('INSERT INTO catalog_market_rotation (id) VALUES (true) ON CONFLICT DO NOTHING');
    let rotation = (await client.query<{ item_ids: string[]; cursor: number; finished_week: string | Date | null }>(
      'SELECT item_ids,cursor,finished_week::text FROM catalog_market_rotation WHERE id=true'
    )).rows[0];
    if (rotation.cursor >= rotation.item_ids.length) {
      if (rotation.finished_week === week) return skip('rotation_complete');
      // Congela o ranking por ciclo: o lote seguinte continua no 51º, mesmo se a popularidade mudar no meio.
      const popular = await client.query<{ id: string }>(
        `SELECT ci.id FROM catalog_items ci JOIN items i ON i.catalog_item_id=ci.id
         JOIN enxovais e ON e.id=i.enxoval_id WHERE ci.status='approved'
         GROUP BY ci.id ORDER BY count(DISTINCT e.owner_id) DESC,ci.canonical_name,ci.id LIMIT $1`, [MARKET_CATALOG_LIMIT]
      );
      const ids = popular.rows.map(row => row.id);
      await client.query('UPDATE catalog_market_rotation SET item_ids=$1,cursor=0,finished_week=NULL,updated_at=now() WHERE id=true', [ids]);
      rotation = { item_ids: ids, cursor: 0, finished_week: null };
      if (!ids.length) return skip('no_catalog_usage');
    }
    while (summary.searched < allowance && rotation.cursor < rotation.item_ids.length) {
      const requestTime = options.now ?? new Date();
      const requestWindow = pricingWindows(requestTime);
      if (requestWindow.week !== week || requestWindow.month !== month) break;
      const id = rotation.item_ids[rotation.cursor];
      const item = (await client.query<{ id: string; name: string }>(
        `SELECT id,canonical_name AS name FROM catalog_items WHERE id=$1 AND status='approved'`, [id]
      )).rows[0];
      const next = rotation.cursor + 1;
      const searchId = randomUUID();
      const query = item ? `${item.name} novo` : '';
      await client.query('BEGIN');
      let reserved = false;
      try {
        if (item) {
          const reservation = await client.query(
            `INSERT INTO catalog_market_searches (id,item_id,canonical_name,query,week_start,month_start,requested_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (week_start,item_id) DO NOTHING`,
            [searchId, item.id, item.name, query, week, month, requestTime]
          );
          reserved = Boolean(reservation.rowCount);
        }
        await client.query(`UPDATE catalog_market_rotation SET cursor=$1,finished_week=$2,updated_at=now() WHERE id=true`,
          [next, next === rotation.item_ids.length ? week : null]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      rotation.cursor = next;
      if (!item || !reserved) continue;
      summary.searched++;
      try {
        const offers = await searchShoppingPrices(query);
        const checks = await checkedPriceNames(item, offers.map(offer => offer.title));
        if (offers.length && !checks.size) throw new Error('Price comparison unavailable');
        const merchants = new Map<string, ShoppingOffer[]>();
        for (const offer of offers) {
          if (!checks.get(offer.title)?.eligible) continue;
          merchants.set(offer.merchant, [...(merchants.get(offer.merchant) ?? []), offer]);
        }
        await client.query('BEGIN');
        try {
          for (const [merchant, group] of merchants) {
            // Uma loja não pesa mais por repetir anúncios. Usa uma oferta central, sem selecionar só a mais barata.
            const offer = group.sort((a, b) => a.priceCents - b.priceCents)[Math.floor(group.length / 2)];
            await client.query(
              `INSERT INTO catalog_market_offers (search_id,merchant,title,url,price_cents,confidence,captured_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [searchId, merchant, offer.title, offer.url, offer.priceCents, checks.get(offer.title)!.confidence, options.now ?? new Date()]
            );
          }
          await client.query(`UPDATE catalog_market_searches SET status=$2,completed_at=now() WHERE id=$1`,
            [searchId, merchants.size >= 2 ? 'success' : 'unmatched']);
          await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        summary.offers += merchants.size;
      } catch (error) {
        const code = error instanceof SerpApiError ? error.code : 'processing_failed';
        await client.query(`UPDATE catalog_market_searches SET status='failed',error_code=$2,completed_at=now() WHERE id=$1`, [searchId, code]);
        summary.failed++;
        logger.warn({ event: 'catalog.market.item_failed', itemId: item.id, code }, 'Pesquisa de preço não publicada.');
        // Sem tentativas automáticas da mesma pesquisa: uma resposta perdida pode já ter consumido crédito.
        break;
      }
    }
    await refreshNationalPriceStats();
    return summary;
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1)', [LOCK]);
    client.release();
  }
}

export function startCatalogMarketScheduler() {
  registerJob('catalog_market_prices', WEEK_MS);
  const run = () => trackJob('catalog_market_prices', () => runCatalogMarketRefresh())
    .then(summary => logger.info({ event: 'catalog.market.completed', ...summary }, 'Pesquisa semanal de preços concluída.'))
    .catch(error => logger.error({ event: 'catalog.market.failed', code: error instanceof SerpApiError ? error.code : 'worker_failed' }, 'Pesquisa semanal de preços falhou.'));
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  const scheduleNext = () => {
    if (stopped) return;
    const { next } = marketSchedule();
    timer = setTimeout(async () => {
      // Uma correção do relógio não deve antecipar a execução para antes das 06h.
      if (Date.now() >= next.getTime()) await run();
      scheduleNext();
    }, Math.max(1, next.getTime() - Date.now()));
    timer.unref();
  };
  scheduleNext();
  // Uma única recuperação no boot, depois do horário da semana. As reservas persistidas evitam repetir o lote.
  // Não acumula várias semanas de buscas nem verifica o banco a cada hora.
  if (marketSchedule().catchUp) void run();
  return () => { stopped = true; clearTimeout(timer); };
}
