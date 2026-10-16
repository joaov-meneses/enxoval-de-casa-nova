// Teste de integração do catálogo compartilhado (Fase 6) com PostgreSQL real e um schema descartável: semeadura,
// cascata de resolução, apelidos aprendidos, busca, urgência por faixa, faixas de preço (k >= 5) e mesclagem.
// Nada chama o Jev. Rodar: npm run test:catalog-db
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import {
  approveItem, catalogMetrics, createPendingItem, invalidateCatalogIndex, linkUnlinkedItems, listPendingItems,
  loadBucketUrgencies, mergeItems, profileBucket, recordMetric, refreshPriceStats, resolveItem, saveBucketUrgency,
  searchCatalog, seedCatalog,
} from "../server/catalog.ts";
import { getPool } from "../server/database.ts";
import { migrateDatabase } from "../server/migrations.ts";
import { registerApiRoutes } from "../server/routes.ts";
import { runCatalogMaintenance } from "../server/workers/catalogMaintenanceWorker.ts";
import { URGENCY_RUBRIC_VERSION } from "../src/planning/purchaseUrgency.ts";

if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL para o teste PostgreSQL.");
const originalUrl = new URL(process.env.DATABASE_URL);
const sslMode = originalUrl.searchParams.get("sslmode");
const ssl = process.env.DATABASE_SSL === "true" || (process.env.DATABASE_SSL !== "false" && ["require", "verify-full"].includes(sslMode));
const control = new pg.Pool({ connectionString: originalUrl.toString(), ssl: ssl ? { rejectUnauthorized: false } : undefined });
const schema = `casamia_catalog_test_${randomUUID().replaceAll("-", "")}`;
let server;
let created = false;

const profile = {
  moment: "casal", moveDate: "2026-12-05", moveDateAnswered: true, state: "BA", city: "salvador", housing: "apartamento",
  people: 2, rooms: ["cozinha"], owned: "nada", style: "full", budget: "10-25", worries: [], usage: [], source: "",
};
const plan = { categories: [{ name: "Cozinha", items: [{ name: "Airfryer", description: "", priceCategory: 3, priority: "optional", timing: null }] }] };

try {
  await control.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  originalUrl.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = originalUrl.toString();
  process.env.COOKIE_SECURE = "false";
  await migrateDatabase();
  const pool = getPool();

  // 1. Semeadura: o catálogo do funil vira catálogo mestre curado, e rodar de novo não duplica.
  const total = async () => Number((await pool.query("SELECT COUNT(*) AS n FROM catalog_items WHERE source = 'curated' AND status = 'approved'")).rows[0].n);
  const seeded = await total();
  assert.ok(seeded >= 200, `catálogo semeado com ${seeded} itens`);
  await seedCatalog(pool);
  await migrateDatabase();
  assert.equal(await total(), seeded, "semear de novo não duplica");
  console.log(`PASS: catálogo curado semeado (${seeded} itens) e idempotente.`);

  // 2. Cascata: exato, apelido, similaridade alta (grava apelido), dúvida e nada parecido.
  const geladeira = await resolveItem(pool, "Geladeiras");
  assert.deepEqual([geladeira.kind, geladeira.via, geladeira.item.canonicalName], ["match", "exact", "Geladeira"]);
  const alias = await resolveItem(pool, "fritadeira elétrica");
  assert.deepEqual([alias.kind, alias.via, alias.item.canonicalName], ["match", "alias", "Air fryer"]);
  assert.equal((await resolveItem(pool, "AirFryer 5L")).item.canonicalName, "Air fryer");

  const typo = await resolveItem(pool, "Cortina blackoutt");
  assert.deepEqual([typo.kind, typo.via], ["match", "similar"]);
  const learned = await pool.query("SELECT source FROM catalog_item_aliases WHERE alias_normalized = 'cortina blackoutt'");
  assert.deepEqual(learned.rows, [{ source: "similarity" }], "o apelido novo é gravado");
  assert.equal((await resolveItem(pool, "Cortina blackoutt")).via, "alias", "e a mesma dúvida não volta");

  const doubt = await resolveItem(pool, "Panela");
  assert.equal(doubt.kind, "doubt");
  assert.ok(doubt.candidates.length >= 2 && doubt.candidates.length <= 5);
  assert.ok(doubt.candidates.some((candidate) => candidate.item.canonicalName === "Panela de pressão"));
  assert.equal((await resolveItem(pool, "Máquina de costura")).kind, "none");
  assert.equal((await resolveItem(pool, "de da do")).kind, "none");
  console.log("PASS: cascata resolve exato, apelido, similar (aprende apelido), dúvida e nada parecido.");

  // 3. Item novo entra pendente, vale para deduplicar, mas não aparece no autocomplete até ser aprovado.
  const pending = await createPendingItem(pool, "Máquina de costura", { room: "sala", source: "users" });
  assert.deepEqual([pending.status, pending.source], ["pending_review", "users"]);
  assert.equal((await resolveItem(pool, "maquinas de costura")).item.id, pending.id, "pendente já evita novo cadastro");
  assert.deepEqual(await searchCatalog(pool, "costura"), [], "pendente fica fora do autocomplete");
  assert.equal(await createPendingItem(pool, "fulano@email.com", { source: "users" }), null, "texto que parece dado pessoal não entra");
  assert.equal(await createPendingItem(pool, "x".repeat(60), { source: "users" }), null);
  const queue = await listPendingItems(pool);
  assert.deepEqual(queue.map((item) => item.canonicalName), ["Máquina de costura"]);
  assert.ok(Array.isArray(queue[0].similar), "a fila traz candidatos para mesclar");
  const near = await createPendingItem(pool, "Pipoqueira elétrica", { source: "users" });
  assert.equal((await listPendingItems(pool)).find((item) => item.id === near.id).similar[0].name, "Pipoqueira", "sugere o item aprovado parecido");
  console.log("PASS: item novo vira pendente de revisão e não vaza para a busca.");

  // 4. Busca instantânea: prefixo, apelido e prefixo de palavra.
  assert.equal((await searchCatalog(pool, "airf"))[0].name, "Air fryer");
  assert.equal((await searchCatalog(pool, "fritadeira"))[0].name, "Air fryer");
  assert.ok((await searchCatalog(pool, "forno")).map((result) => result.name).includes("Forno elétrico"));
  assert.deepEqual(await searchCatalog(pool, "a"), []);
  assert.deepEqual(await searchCatalog(pool, "zzzzqq"), []);
  assert.ok((await searchCatalog(pool, "co", 3)).length <= 3);
  console.log("PASS: busca por prefixo e apelido.");

  // 5. Urgência por faixa: guardada uma vez, vale para quem tem o mesmo perfil e some com outra versão da régua.
  const bucket = profileBucket({ housing: "apartamento", moment: "casal", uf: "BA" });
  assert.equal(bucket, "apartamento:hot:casal");
  assert.equal(profileBucket({ housing: "casa", moment: "amigos", uf: "RS" }), "casa:cold:outros");
  await saveBucketUrgency(pool, geladeira.item.id, bucket, 7.5, 0.8);
  assert.deepEqual([...(await loadBucketUrgencies(pool, [geladeira.item.id], bucket))], [[geladeira.item.id, { urgency: 7.5, confidence: 0.8 }]]);
  assert.equal((await loadBucketUrgencies(pool, [geladeira.item.id], "casa:cold:solo")).size, 0, "outra faixa não herda a nota");
  await pool.query("UPDATE catalog_item_urgency SET rubric_version = $1", [URGENCY_RUBRIC_VERSION - 1]);
  assert.equal((await loadBucketUrgencies(pool, [geladeira.item.id], bucket)).size, 0, "régua antiga não vale");
  console.log("PASS: urgência por faixa de perfil, com versão da régua.");

  // 6. Faixas de preço: só com 5+ enxovais distintos, sem outliers e só agregados.
  const app = express();
  app.use(express.json());
  registerApiRoutes(app);
  server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const prices = [30000, 32000, 35000, 38000, 40000, 5000000];
  const makeEnxoval = async (index) => {
    const headers = { "Content-Type": "application/json" };
    const registered = await fetch(`${base}/api/auth/register`, { method: "POST", headers, body: JSON.stringify({ email: `catalogo${index}@example.invalid`, password: randomBytes(16).toString("base64url") }) });
    assert.equal(registered.status, 201);
    const cookie = registered.headers.getSetCookie().find((value) => value.startsWith("enxoval_session=")).split(";")[0];
    const funnel = await fetch(`${base}/api/enxovais`, { method: "POST", headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ name: `Casa ${index}`, plan, profile, userName: `Pessoa ${index}` }) });
    assert.equal(funnel.status, 201);
    return (await funnel.json()).enxoval.id;
  };
  const enxovais = [];
  for (let index = 0; index < 4; index += 1) enxovais.push(await makeEnxoval(index));
  // Com 4 enxovais a amostra é pequena demais: nada é publicado.
  for (let i = 0; i < 4; i += 1) await pool.query("UPDATE items SET price_cents = $2 WHERE enxoval_id = $1", [enxovais[i], prices[i]]);
  await linkUnlinkedItems(pool);
  assert.equal((await refreshPriceStats(pool)).published, 0, "k < 5 não publica");
  assert.equal((await searchCatalog(pool, "airf"))[0].priceRange, null);

  for (let index = 4; index < prices.length; index += 1) enxovais.push(await makeEnxoval(index));
  for (let i = 4; i < prices.length; i += 1) await pool.query("UPDATE items SET price_cents = $2 WHERE enxoval_id = $1", [enxovais[i], prices[i]]);
  const linked = await linkUnlinkedItems(pool);
  assert.ok(linked.linked >= 2);
  assert.equal((await refreshPriceStats(pool)).published, 1);
  const range = (await searchCatalog(pool, "airf"))[0].priceRange;
  assert.equal(range.p50Cents, 35000, "o valor absurdo foi aparado da faixa");
  assert.ok(range.p10Cents >= 30000 && range.p90Cents <= 40000, JSON.stringify(range));
  const columns = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'catalog_price_stats'")).rows.map((row) => row.column_name);
  assert.ok(!columns.some((name) => /user|enxoval/.test(name)), "a faixa não guarda ligação com pessoa nem enxoval");
  console.log("PASS: faixa de preço só com 5+ enxovais, sem outliers e sem vínculo com pessoas.");

  // 7. Revisão: aprovar (renomeando) e mesclar movem apelidos e vínculos.
  const dup = await createPendingItem(pool, "Costureira elétrica", { source: "users" });
  await assert.rejects(() => approveItem(pool, dup.id, { canonicalName: "Máquina de costura" }), /Já existe/);
  const approved = await approveItem(pool, pending.id, { canonicalName: "Máquina de costura", room: "sala", priceCategory: 3 });
  assert.deepEqual([approved.status, approved.source, approved.priceCategory], ["approved", "curated", 3]);
  assert.equal((await searchCatalog(pool, "costura"))[0].name, "Máquina de costura", "depois de aprovado, aparece na busca");
  await pool.query("UPDATE items SET catalog_item_id = $1 WHERE id = (SELECT id FROM items LIMIT 1)", [dup.id]);
  await mergeItems(dup.id, approved.id);
  invalidateCatalogIndex();
  assert.equal((await resolveItem(pool, "Costureira elétrica")).item.id, approved.id, "o nome mesclado vira apelido");
  assert.equal(Number((await pool.query("SELECT COUNT(*) AS n FROM items WHERE catalog_item_id = $1", [approved.id])).rows[0].n), 1, "vínculos migraram");
  await assert.rejects(() => mergeItems(approved.id, approved.id), /diferentes/);
  console.log("PASS: aprovar e mesclar itens mantêm apelidos e vínculos.");

  // 7b. Manutenção agendada: roda a rodada e, com outra em andamento, não duplica.
  const lockClient = await pool.connect();
  try {
    const summary = await runCatalogMaintenance();
    assert.equal(summary.skipped, false);
    await lockClient.query("SELECT pg_advisory_lock(7204001)");
    assert.equal((await runCatalogMaintenance()).skipped, true, "com a trava ocupada a rodada é pulada");
    await lockClient.query("SELECT pg_advisory_unlock(7204001)");
  } finally {
    lockClient.release();
  }
  console.log("PASS: manutenção do catálogo roda uma vez por vez.");

  // 8. Métricas: taxa de acerto e consultas ao Jev.
  await recordMetric("resolve_hit", 9);
  await recordMetric("resolve_miss", 1);
  await recordMetric("jev_call", 2);
  const metrics = await catalogMetrics(pool, 30);
  assert.deepEqual([metrics.resolveHits, metrics.resolveMisses, metrics.hitRate, metrics.jevCalls], [9, 1, 0.9, 2]);
  assert.ok(metrics.itemsWithoutUrgency > 0);
  console.log("PASS: métricas de acerto do catálogo e consultas ao Jev.");
} finally {
  if (server) await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
