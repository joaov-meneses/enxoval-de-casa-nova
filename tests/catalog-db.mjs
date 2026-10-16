// Teste de integração do catálogo mestre (Fase 6) com PostgreSQL real e o SDK real do Jev falando com um servidor
// HTTP falso. Usa um schema descartável. Rodar: npm run test:catalog-db
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import zlib from "node:zlib";
import express from "express";
import pg from "pg";
import { getPool } from "../server/database.ts";
import { migrateDatabase } from "../server/migrations.ts";
import { registerApiRoutes } from "../server/routes.ts";
import { setJevTransportForTests } from "../server/services/jev.ts";
import { flushCatalogMetrics, invalidateCatalogIndex, waitForCatalogQueue } from "../server/catalog/store.ts";
import { runCatalogRefresh } from "../server/workers/catalogWorker.ts";
import { CATALOG_SEED_VERSION } from "../server/catalog/seed.ts";

if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL para o teste PostgreSQL.");
const originalUrl = new URL(process.env.DATABASE_URL);
const sslMode = originalUrl.searchParams.get("sslmode");
const ssl =
  process.env.DATABASE_SSL === "true" ||
  (process.env.DATABASE_SSL !== "false" && ["require", "verify-full"].includes(sslMode));
const control = new pg.Pool({ connectionString: originalUrl.toString(), ssl: ssl ? { rejectUnauthorized: false } : undefined });
const schema = `casamia_catalog_test_${randomUUID().replaceAll("-", "")}`;
let server;
let fakeJev;
let created = false;

/** O que o Jev falso responde em cada pergunta; os testes mudam no meio do caminho. */
const answersPlan = { sameItem: "__nenhum__", home: 0.95, room: "sala" };
const received = [];
function startFakeJev() {
  const instance = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      let raw = Buffer.concat(chunks);
      if (req.headers["content-encoding"] === "zstd") raw = zlib.zstdDecompressSync(raw);
      else if (req.headers["content-encoding"] === "gzip") raw = zlib.gunzipSync(raw);
      const body = JSON.parse(raw.toString("utf8"));
      received.push(body);
      const answers = {};
      const choice = (id, options, pick) => {
        answers[id] = {
          type: "choice",
          choice: pick,
          probabilities: Object.fromEntries(options.map((name) => [name, name === pick ? 0.9 : 0.1 / Math.max(1, options.length - 1)])),
          confidence: 0.9,
        };
      };
      for (const [id, question] of Object.entries(body.questions)) {
        const options = Array.isArray(question.criteria) ? [] : Object.keys(question.criteria);
        if (question.type === "noul") answers[id] = { type: "noul", noul: id === "item_de_casa" ? answersPlan.home : id === "essencial" ? 0.2 : 0.5 };
        else if (question.type === "score") answers[id] = { type: "score", score: 5.4, confidence: 0.7 };
        else if (id === "mesmo_item") choice(id, options, answersPlan.sameItem);
        else if (id === "comodo") choice(id, options, answersPlan.room);
        else if (id === "quando") choice(id, options, "later");
        else if (id === "prazo") choice(id, options, "1");
        else if (id === "preco") choice(id, options, "3");
        else choice(id, options, "__nenhum__");
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 10, output_tokens: 5 } }));
    });
  });
  return new Promise((resolve) => instance.listen(0, "127.0.0.1", () => resolve(instance)));
}

const profile = {
  moment: "casal", moveDate: "2026-12-05", moveDateAnswered: true, state: "SP", city: null, housing: "apartamento",
  people: 2, rooms: ["cozinha", "sala"], owned: "nada", style: "full", budget: "10-25", worries: [], usage: [], source: "",
};
const plan = {
  categories: [
    { name: "Cozinha", items: [{ name: "Geladeira", description: "" }, { name: "Air fryer", description: "" }] },
    { name: "Sala de Estar", items: [{ name: "Sofá", description: "" }] },
  ],
};

try {
  fakeJev = await startFakeJev();
  process.env.TYPESAFE_API_KEY = "chave-de-teste";
  process.env.TYPESAFE_BASE_URL = `http://127.0.0.1:${fakeJev.address().port}`;
  process.env.ADMIN_LOGIN = "gestao";
  process.env.ADMIN_PASSWORD = "senha-de-gestao-123";
  process.env.CATALOG_MIN_SAMPLES = "5";
  setJevTransportForTests(undefined);

  await control.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  originalUrl.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = originalUrl.toString();
  process.env.COOKIE_SECURE = "false";
  await migrateDatabase();
  const db = getPool();

  // 1. Semente: catálogo pronto no primeiro boot, e idempotente nos seguintes.
  const count = async () => (await db.query("SELECT COUNT(*)::int AS n FROM catalog_items")).rows[0].n;
  const seeded = await count();
  assert.ok(seeded >= 450, `semente com ${seeded} itens`);
  assert.equal((await db.query("SELECT version FROM catalog_seed_state")).rows[0].version, CATALOG_SEED_VERSION);
  await db.query("DELETE FROM catalog_items WHERE canonical_name = 'Pilão'");
  await migrateDatabase();
  assert.equal(await count(), seeded - 1, "rodar a migração de novo não duplica nem ressuscita o que a equipe apagou");
  console.log(`PASS: semente com ${seeded} itens, idempotente.`);

  const app = express();
  app.use(express.json());
  registerApiRoutes(app);
  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const jar = new Map();
  const call = async (path, method = "GET", body) => {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; ") },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const [key, value] = pair.split("=");
      jar.set(key, value);
    }
    return { status: response.status, data: response.status === 204 ? undefined : await response.json() };
  };
  const register = async (email) => {
    jar.delete("enxoval_session");
    const result = await call("/auth/register", "POST", { email, password: randomBytes(16).toString("base64url") });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    const enxoval = await call("/enxovais", "POST", { name: "Casa", plan, profile, userName: "Pessoa Teste" });
    assert.equal(enxoval.status, 201, JSON.stringify(enxoval.data));
    return enxoval.data;
  };

  // 2. Busca instantânea, sem Jev.
  assert.equal((await call("/catalog/search?q=gela")).status, 401);
  const first = await register("primeira@example.invalid");
  const enxovalId = first.enxoval.id;
  const kitchen = first.categories.find((category) => category.name === "Cozinha");
  received.length = 0;
  const search = async (q) => (await call(`/catalog/search?q=${encodeURIComponent(q)}`)).data.results;
  assert.equal((await search("gela"))[0].name, "Geladeira");
  assert.equal((await search("airfr"))[0].name, "Air fryer", "acha pelo apelido");
  assert.equal((await search("jogo de ca"))[0].name, "Jogo de cama", "prefixo do nome, mesmo com palavras vazias");
  assert.ok((await search("liquidificadr")).some((result) => result.name === "Liquidificador"), "tolera erro de digitação");
  assert.deepEqual(await search("a"), []);
  assert.equal(received.length, 0, "a busca nunca consulta o Jev");
  console.log("PASS: busca por prefixo, apelido e similaridade.");

  // 3. Itens do funil nascem ligados ao catálogo.
  const items = async () => Object.fromEntries((await call(`/items?enxovalId=${enxovalId}`)).data.map((item) => [item.name, item]));
  const initial = await items();
  assert.ok(initial["Geladeira"].catalogItemId && initial["Air fryer"].catalogItemId && initial["Sofá"].catalogItemId);
  assert.equal(initial["Sofá"].catalog.priority, "essential");

  // 4. A cascata ao cadastrar itens.
  const add = async (name) => {
    const result = await call("/items", "POST", { enxovalId, categoryId: kitchen.id, name });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result.data.item;
  };
  const catalogIdOf = async (name) => (await db.query("SELECT id FROM catalog_items WHERE canonical_name = $1", [name])).rows[0]?.id;

  // 4.1 Exato: "Geladeiras" é a Geladeira; nada é gravado como apelido e o Jev não é chamado.
  received.length = 0;
  assert.equal((await add("Geladeiras")).catalogItemId, await catalogIdOf("Geladeira"));
  // 4.2 Similar (≥ 0,8): vira apelido, e da próxima vez é exato.
  assert.equal((await add("Liquidificadorr")).catalogItemId, await catalogIdOf("Liquidificador"));
  const typo = await db.query("SELECT source FROM catalog_item_aliases WHERE alias_normalized = 'liquidificadorr'");
  assert.equal(typo.rows[0]?.source, "similar");
  await waitForCatalogQueue();
  assert.equal(received.length, 0, "exato e similar não consultam o Jev");

  // 4.3 Faixa de dúvida: o Jev escolhe entre os candidatos, e o nome vira apelido.
  answersPlan.sameItem = "Garrafa térmica";
  const jar1 = await add("Jarra térmica");
  assert.equal(jar1.catalogItemId, null, "a resposta não espera o Jev");
  await waitForCatalogQueue();
  assert.ok(Object.keys(received.at(-1).questions).includes("mesmo_item"));
  assert.ok(Object.keys(received.at(-1).questions.mesmo_item.criteria).includes("Garrafa térmica"));
  assert.equal((await items())["Jarra térmica"].catalogItemId, await catalogIdOf("Garrafa térmica"));
  assert.equal((await db.query("SELECT source FROM catalog_item_aliases WHERE alias_normalized = 'jarra termica'")).rows[0]?.source, "jev");
  received.length = 0;
  assert.equal((await add("Jarras térmicas")).catalogItemId, await catalogIdOf("Garrafa térmica"), "a mesma dúvida não volta");
  await waitForCatalogQueue();
  assert.equal(received.length, 0);
  console.log("PASS: exato e similar sem Jev; na dúvida o Jev decide uma vez e o apelido fica.");

  // 4.4 Nada parecido: o Jev infere uma vez e o item nasce aguardando revisão.
  answersPlan.sameItem = "__nenhum__";
  received.length = 0;
  await add("Mesa de sinuca");
  await waitForCatalogQueue();
  assert.equal(received.length, 1, "uma única chamada com todas as perguntas");
  assert.deepEqual(Object.keys(received[0].questions).sort(), ["comodo", "essencial", "grupo", "item_de_casa", "prazo", "preco", "quando"]);
  const sinuca = (await db.query("SELECT * FROM catalog_items WHERE normalized_name = 'mesa sinuca'")).rows[0];
  assert.ok(sinuca);
  assert.deepEqual(
    [sinuca.canonical_name, sinuca.source, sinuca.status, sinuca.room, sinuca.priority, sinuca.lead_time_weeks, sinuca.price_category],
    ["Mesa de sinuca", "jev", "pending_review", "sala", "optional", 1, 3],
  );
  assert.equal((await items())["Mesa de sinuca"].catalogItemId, sinuca.id);
  assert.ok(!(await search("sinuca")).length, "item aguardando revisão não aparece na busca");
  received.length = 0;
  await add("Mesas de sinuca");
  await waitForCatalogQueue();
  assert.equal(received.length, 0, "o segundo enxoval que cadastra o item não consulta o Jev");
  console.log("PASS: item realmente novo custa uma consulta ao Jev, uma única vez.");

  // 4.5 Não é item de casa: cache negativo, sem reconsultar.
  answersPlan.home = 0.05;
  received.length = 0;
  const streaming = await add("Assinatura de streaming");
  await waitForCatalogQueue();
  assert.equal(received.length, 1);
  assert.equal((await db.query("SELECT reason FROM catalog_negative_cache WHERE normalized_name = 'assinatura streaming'")).rows[0]?.reason, "not_home_item");
  assert.equal((await items())["Assinatura de streaming"].catalogItemId, null, "o item da pessoa continua, só sem par no catálogo");
  received.length = 0;
  await call(`/items/${streaming.id}`, "PATCH", { name: "Assinatura streaming" });
  await waitForCatalogQueue();
  assert.equal(received.length, 0, "cache negativo segura a reconsulta");
  answersPlan.home = 0.95;
  console.log("PASS: o que não é item de casa vai para o cache negativo.");

  // 5. Urgência compartilhada: a Geladeira é avaliada uma vez para a faixa, e não por pessoa.
  received.length = 0;
  const firstUrgency = await call("/ai/prioritize", "POST", { enxovalId, categoryId: kitchen.id });
  assert.equal(firstUrgency.status, 200, JSON.stringify(firstUrgency.data));
  assert.ok(firstUrgency.data.shared >= 4, JSON.stringify(firstUrgency.data));
  const scored = received.flatMap((body) => Object.values(body.questions).map((question) => question.instructions.item.nome));
  assert.ok(scored.includes("Geladeira") && !scored.includes("Geladeiras"), "itens iguais viram uma pergunta só, pelo nome do catálogo");
  const second = await register("segunda@example.invalid");
  received.length = 0;
  const secondUrgency = await call("/ai/prioritize", "POST", {
    enxovalId: second.enxoval.id,
    categoryId: second.categories.find((category) => category.name === "Cozinha").id,
  });
  assert.equal(received.length, 0, "a segunda pessoa da mesma faixa não gasta nenhuma consulta");
  assert.deepEqual([secondUrgency.data.shared, secondUrgency.data.inferred], [2, 0]);
  console.log("PASS: a nota da Geladeira vale para todos os enxovais da mesma faixa de perfil.");

  // 6. Rotina: faixas de preço reais (k ≥ 5 enxovais, sem extremos), itens das listas e vínculos antigos.
  const owner = (await db.query("SELECT id FROM users LIMIT 1")).rows[0].id;
  const geladeiraId = await catalogIdOf("Geladeira");
  const sofaId = await catalogIdOf("Sofá");
  const prices = [250_000, 260_000, 270_000, 280_000, 300_000, 310_000, 99_000_000];
  for (const [index, price] of prices.entries()) {
    const enxoval = randomUUID();
    const category = randomUUID();
    await db.query("INSERT INTO enxovais (id, name, owner_id, state) VALUES ($1, 'Teste', $2, 'MG')", [enxoval, owner]);
    await db.query("INSERT INTO categories (id, user_id, enxoval_id, name) VALUES ($1, $2, $3, 'Cozinha')", [category, owner, enxoval]);
    await db.query(
      `INSERT INTO items (id, user_id, enxoval_id, category_id, name, price_cents, catalog_item_id) VALUES
         ($1, $2, $3, $4, 'Geladeira', $5, $6),
         ($7, $2, $3, $4, 'Luminária de aquário', NULL, NULL)`,
      [randomUUID(), owner, enxoval, category, price, geladeiraId, randomUUID()],
    );
    // Só 3 enxovais com preço de sofá: amostra pequena demais para publicar.
    if (index < 3) await db.query("INSERT INTO items (id, user_id, enxoval_id, category_id, name, price_cents, catalog_item_id) VALUES ($1, $2, $3, $4, 'Sofá', 300000, $5)", [randomUUID(), owner, enxoval, category, sofaId]);
  }
  await db.query("UPDATE items SET catalog_item_id = NULL WHERE name = 'Liquidificadorr'");
  const summary = await runCatalogRefresh();
  assert.equal(summary.skipped, false);
  assert.ok(summary.linked >= 1, "itens antigos sem vínculo são ligados");
  assert.equal(summary.promoted, 1, "Luminária de aquário apareceu em 7 enxovais");
  const stats = (await db.query("SELECT region, p10, p50, p90, samples FROM catalog_price_stats WHERE item_id = $1 ORDER BY region", [geladeiraId])).rows;
  assert.deepEqual(stats.map((row) => [row.region, row.samples]), [["", 6], ["MG", 6]], "o valor absurdo sai pela regra do IQR");
  assert.ok(stats[0].p90 < 1_000_000);
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM catalog_price_stats WHERE item_id = $1", [sofaId])).rows[0].n, 0, "sem amostra mínima, sem faixa");
  const columns = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'catalog_price_stats' AND table_schema = $1", [schema])).rows.map((row) => row.column_name);
  assert.ok(!columns.some((name) => /user|enxoval/.test(name)), "só agregados, sem ligação com pessoa ou enxoval");
  const promoted = (await db.query("SELECT source, status, room FROM catalog_items WHERE normalized_name = 'luminaria aquario'")).rows[0];
  assert.deepEqual(promoted, { source: "users", status: "pending_review", room: "cozinha" });
  invalidateCatalogIndex();
  const withRange = await call(`/catalog/search?q=geladeira&uf=MG`);
  assert.equal(withRange.data.results[0].priceRange.samples, 6);
  // (A sessão agora é da segunda pessoa, que mora em SP: sem amostra lá, vale a faixa do Brasil todo.)
  const assessed = await call("/ai/assess-item", "POST", { enxovalId: second.enxoval.id, name: "Geladeira", classify: true });
  assert.equal(assessed.status, 200, JSON.stringify(assessed.data));
  assert.deepEqual([assessed.data.catalogItem.priceRange.region, assessed.data.catalogItem.priceRange.p50], ["", stats[0].p50], "o formulário recebe a faixa comum");
  console.log("PASS: faixas de preço só com amostra mínima e sem extremos; itens frequentes viram sugestão de catálogo.");

  // 7. Painel do /admin.
  assert.equal((await call("/admin/catalog/items?status=pending_review")).status, 401);
  assert.equal((await call("/admin/login", "POST", { login: "gestao", password: "senha-de-gestao-123" })).status, 200);
  await flushCatalogMetrics();
  const overview = (await call("/admin/catalog/overview")).data;
  assert.ok(overview.totals.resolve_exact > 0 && overview.jevCalls > 0, JSON.stringify(overview.totals));
  assert.ok(overview.hitRate > 0 && overview.hitRate < 1);
  assert.ok(overview.gaps.unlinked >= 1);
  const pending = (await call("/admin/catalog/items?status=pending_review")).data.items;
  assert.deepEqual(pending.map((item) => item.name).sort(), ["Luminária de aquário", "Mesa de sinuca"]);
  const sinucaRow = pending.find((item) => item.name === "Mesa de sinuca");
  assert.equal(sinucaRow.usage, 2);

  // Aprovar e renomear: o nome antigo continua valendo como apelido.
  const approved = await call(`/admin/catalog/items/${sinucaRow.id}`, "PATCH", { status: "approved", name: "Mesa de bilhar", leadTimeWeeks: 4 });
  assert.equal(approved.status, 200, JSON.stringify(approved.data));
  assert.ok(approved.data.aliases.some((alias) => alias.key === "mesa sinuca"));
  assert.equal((await search("bilhar"))[0].name, "Mesa de bilhar");
  assert.equal((await call(`/admin/catalog/items/${sinucaRow.id}`, "PATCH", { name: "Geladeira" })).status, 409);

  // Mesclar duplicados: apelidos e vínculos passam para o destino.
  const lumiId = pending.find((item) => item.name === "Luminária de aquário").id;
  const target = await catalogIdOf("Luminária ou abajur");
  const merged = await call(`/admin/catalog/items/${lumiId}/merge`, "POST", { targetId: target });
  assert.equal(merged.status, 200, JSON.stringify(merged.data));
  assert.ok(merged.data.aliases.some((alias) => alias.key === "luminaria aquario"));
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM items WHERE name = 'Luminária de aquário' AND catalog_item_id = $1", [target])).rows[0].n, 7);

  // Desfazer um apelido errado: os itens ligados por ele são desligados.
  assert.equal((await call(`/admin/catalog/aliases/${encodeURIComponent("luminaria aquario")}`, "DELETE")).status, 204);
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM items WHERE name = 'Luminária de aquário' AND catalog_item_id IS NOT NULL")).rows[0].n, 0);
  assert.equal((await call(`/admin/catalog/items/${target}/aliases`, "POST", { alias: "Luminária de aquário" })).status, 201);
  assert.equal((await call(`/admin/catalog/items/${target}/aliases`, "POST", { alias: "Geladeira" })).status, 409);

  // Recusar um item: os itens das pessoas continuam, sem vínculo.
  assert.equal((await call(`/admin/catalog/items/${sinucaRow.id}`, "DELETE")).status, 204);
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM items WHERE name = 'Mesa de sinuca' AND catalog_item_id IS NULL")).rows[0].n, 1);
  console.log("PASS: /admin revisa, renomeia, mescla, desfaz apelidos e recusa itens do catálogo.");
} finally {
  if (fakeJev) await new Promise((resolve) => fakeJev.close(resolve));
  if (server) await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
