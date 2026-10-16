// Manutenção do catálogo compartilhado (Fase 6). Roda sozinha uma vez por dia dentro do servidor (ver
// `startCatalogMaintenanceScheduler`) ou sob demanda: npm run catalog:maintain [-- --urgency]
//  - liga ao catálogo os itens sem vínculo (nomes usados por 3+ enxovais viram itens pendentes de revisão);
//  - recalcula as faixas de preço (só com 5+ enxovais distintos, sem outliers);
//  - opcional (`urgency`): pré-calcula com o Jev a urgência dos itens aprovados que ainda não têm nota em nenhuma
//    faixa de perfil. Custo único e controlado; respeita JEV_DAILY_LIMIT.
import { linkUnlinkedItems, profileBucket, refreshPriceStats, saveBucketUrgency } from '../catalog.ts';
import { getPool } from '../database.ts';
import { MAX_URGENCY_ITEMS, prioritizeItems, type JevProfile } from '../services/jev.ts';

const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60_000;
/** Trava no banco: com mais de uma instância no ar, só uma faz a rodada. */
const ADVISORY_LOCK_KEY = 7_204_001;

const HOUSINGS = ['apartamento', 'casa', 'studio'];
const MOMENTS = ['casal', 'solo', 'amigos'];
// Um estado para cada clima: ameno, quente e frio.
const UFS = ['SP', 'BA', 'RS'];
const ROOM_LABELS: Record<string, string> = {
  cozinha: 'Cozinha', eletro: 'Cozinha', sala: 'Sala', quarto: 'Quarto', quartoExtra: 'Quarto extra',
  banheiro: 'Banheiro', servico: 'Área de serviço', externa: 'Varanda', escritorio: 'Escritório'
};

export interface MaintenanceSummary {
  skipped: boolean;
  linked: number;
  created: number;
  pricesPublished: number;
  urgenciesSaved: number;
}

async function precomputeUrgency() {
  const pool = getPool();
  const items = await pool.query<{ id: string; canonical_name: string; room: string | null }>(
    `SELECT ci.id, ci.canonical_name, ci.room FROM catalog_items ci
     WHERE ci.status = 'approved' AND NOT EXISTS (SELECT 1 FROM catalog_item_urgency u WHERE u.item_id = ci.id)`
  );
  let saved = 0;
  for (const housing of HOUSINGS) {
    for (const moment of MOMENTS) {
      for (const uf of UFS) {
        const profile: JevProfile = { housing, moment, people: moment === 'casal' ? 2 : 1, uf, city: null, spendingTier: 'equilibrado', weeksToMove: null };
        const bucket = profileBucket(profile);
        for (let start = 0; start < items.rows.length; start += MAX_URGENCY_ITEMS) {
          const results = await prioritizeItems({
            items: items.rows.slice(start, start + MAX_URGENCY_ITEMS)
              .map(row => ({ id: row.id, name: row.canonical_name, environment: ROOM_LABELS[row.room ?? ''] ?? 'Casa' })),
            profile
          });
          for (const result of results ?? []) {
            await saveBucketUrgency(pool, result.id, bucket, result.urgency, result.confidence);
            saved += 1;
          }
        }
      }
    }
  }
  return saved;
}

export async function runCatalogMaintenance(options: { urgency?: boolean; log?: (message: string) => void } = {}): Promise<MaintenanceSummary> {
  const log = options.log ?? (() => {});
  const summary: MaintenanceSummary = { skipped: false, linked: 0, created: 0, pricesPublished: 0, urgenciesSaved: 0 };
  const lockClient = await getPool().connect();
  try {
    const lock = await lockClient.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [ADVISORY_LOCK_KEY]);
    if (!lock.rows[0]?.locked) return { ...summary, skipped: true };
    try {
      const linked = await linkUnlinkedItems(getPool());
      summary.linked = linked.linked;
      summary.created = linked.created;
      log(`vínculos: ${linked.linked} itens ligados, ${linked.created} itens novos pendentes de revisão.`);
      summary.pricesPublished = (await refreshPriceStats(getPool())).published;
      log(`faixas de preço publicadas: ${summary.pricesPublished}.`);
      if (options.urgency) {
        summary.urgenciesSaved = await precomputeUrgency();
        log(`notas de urgência gravadas: ${summary.urgenciesSaved}.`);
      }
    } finally {
      await lockClient.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    }
  } finally {
    lockClient.release();
  }
  return summary;
}

/**
 * Agenda a manutenção dentro do servidor: a primeira rodada sai 5 minutos depois da subida e as seguintes a cada 24
 * horas. `CATALOG_PRECOMPUTE_URGENCY=on` inclui o pré-cálculo com o Jev (só gasta com itens ainda sem nota).
 */
export function startCatalogMaintenanceScheduler() {
  const urgency = process.env.CATALOG_PRECOMPUTE_URGENCY === 'on';
  const run = () => {
    runCatalogMaintenance({ urgency, log: message => console.log(`[catálogo] ${message}`) })
      .catch(error => console.error('[catálogo] rodada interrompida:', error));
  };
  const first = setTimeout(run, 5 * 60_000);
  const repeat = setInterval(run, MAINTENANCE_INTERVAL_MS);
  first.unref();
  repeat.unref();
  return () => {
    clearTimeout(first);
    clearInterval(repeat);
  };
}
