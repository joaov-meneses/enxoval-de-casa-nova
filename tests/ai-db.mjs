// Teste de integração das rotas do Nino (/api/ai/*) com PostgreSQL real e o SDK real do Jev falando com um servidor
// HTTP falso (nada sai para a internet nem gasta a chave). Usa um schema descartável. Rodar: npm run test:ai-db
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

if (!process.env.DATABASE_URL)
  throw new Error("Configure DATABASE_URL para o teste PostgreSQL.");
const originalUrl = new URL(process.env.DATABASE_URL);
const sslMode = originalUrl.searchParams.get("sslmode");
const ssl =
  process.env.DATABASE_SSL === "true" ||
  (process.env.DATABASE_SSL !== "false" &&
    ["require", "verify-full"].includes(sslMode));
const control = new pg.Pool({
  connectionString: originalUrl.toString(),
  ssl: ssl ? { rejectUnauthorized: false } : undefined,
});
const schema = `casamia_ai_test_${randomUUID().replaceAll("-", "")}`;
let server;
let fakeJev;
let created = false;

const OWNER_EMAIL = "nino-dona@example.invalid";
const OWNER_NAME = "Marina Teste";

/** Servidor que imita POST /v1/systemone e guarda o que recebeu. */
const received = [];
function startFakeJev() {
  const instance = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      let raw = Buffer.concat(chunks);
      // O SDK comprime com zstd pedidos de 1 KiB ou mais.
      if (req.headers["content-encoding"] === "zstd") raw = zlib.zstdDecompressSync(raw);
      else if (req.headers["content-encoding"] === "gzip") raw = zlib.gunzipSync(raw);
      const body = JSON.parse(raw.toString("utf8"));
      received.push({ url: req.url, auth: req.headers.authorization, body });

      const answers = {};
      for (const [id, question] of Object.entries(body.questions)) {
        if (question.type === "noul") answers[id] = { type: "noul", noul: 0.95 };
        else if (question.type === "score") {
          const levels = question.criteria.length;
          answers[id] = {
            type: "score",
            score: 3.2,
            legend: Object.fromEntries(question.criteria.map((text, index) => [String(index), text])),
            probabilities: Object.fromEntries(question.criteria.map((_, index) => [String(index), index === 3 ? 0.8 : 0.2 / (levels - 1)])),
            confidence: 0.8,
          };
        } else {
          const options = Object.keys(question.criteria);
          const pick = id === "sobreposicao" ? "Airfryer" : id === "ambiente" ? "Cozinha" : options.find((name) => name !== "__nenhum__");
          answers[id] = {
            type: "choice",
            choice: pick,
            probabilities: Object.fromEntries(options.map((name) => [name, name === pick ? 0.9 : 0.1 / (options.length - 1)])),
            confidence: 0.9,
          };
        }
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 10, output_tokens: 5 } }));
    });
  });
  return new Promise((resolve) => instance.listen(0, "127.0.0.1", () => resolve(instance)));
}

const profile = {
  moment: "casal",
  moveDate: "2026-12-05",
  moveDateAnswered: true,
  state: "BA",
  city: "salvador",
  housing: "apartamento",
  people: 2,
  rooms: ["cozinha", "quarto"],
  owned: "nada",
  style: "full",
  budget: "10-25",
  worries: [],
  usage: [],
  source: "",
};

const plan = {
  categories: [
    {
      name: "Cozinha",
      items: [
        { name: "Airfryer", description: "", priceCategory: 3, priority: "optional", timing: null },
        { name: "Jogo de panelas", description: "", priceCategory: 3, priority: "essential", timing: null },
      ],
    },
    {
      name: "Quarto",
      items: [{ name: "Cama de casal", description: "", priceCategory: 4, priority: "essential", timing: "first_night" }],
    },
  ],
};

try {
  fakeJev = await startFakeJev();
  process.env.TYPESAFE_API_KEY = "chave-de-teste";
  process.env.TYPESAFE_BASE_URL = `http://127.0.0.1:${fakeJev.address().port}`;
  setJevTransportForTests(undefined);

  await control.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  originalUrl.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = originalUrl.toString();
  process.env.COOKIE_SECURE = "false";
  await migrateDatabase();

  const app = express();
  app.use(express.json());
  registerApiRoutes(app);
  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const call = async (path, method = "GET", body) => {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers
      .getSetCookie()
      .find((value) => value.startsWith("enxoval_session="));
    if (setCookie) cookie = setCookie.split(";")[0];
    return {
      status: response.status,
      data: response.status === 204 ? undefined : await response.json(),
    };
  };

  // 0. Sem login, nada funciona.
  assert.equal((await call("/ai/status")).status, 401);
  assert.equal((await call("/ai/assess-item", "POST", { enxovalId: "x", name: "Torradeira" })).status, 401);

  const registered = await call("/auth/register", "POST", { email: OWNER_EMAIL, password: randomBytes(16).toString("base64url") });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const funnel = await call("/enxovais", "POST", { name: "Casa da Marina", plan, profile, userName: OWNER_NAME });
  assert.equal(funnel.status, 201, JSON.stringify(funnel.data));
  const enxovalId = funnel.data.enxoval.id;
  const kitchen = funnel.data.categories.find((category) => category.name === "Cozinha");
  assert.ok(kitchen);

  // 1. Status com chave configurada.
  assert.deepEqual((await call("/ai/status")).data, { enabled: true });
  console.log("PASS: status mostra o Jev ligado para quem está logado.");

  // 2. Item novo: ambiente e redundância numa única chamada ao Jev.
  received.length = 0;
  const assessed = await call("/ai/assess-item", "POST", { enxovalId, name: "Fritadeira elétrica", classify: true });
  assert.equal(assessed.status, 200, JSON.stringify(assessed.data));
  assert.equal(assessed.data.available, true);
  assert.equal(assessed.data.environment.id, kitchen.id);
  assert.equal(assessed.data.environment.name, "Cozinha");
  assert.deepEqual(assessed.data.redundancy, { probability: 0.95, overlapsWith: "Airfryer" });
  assert.equal(received.length, 1, "uma chamada só para as duas perguntas");
  assert.equal(received[0].url, "/v1/systemone");
  assert.equal(received[0].auth, "Bearer chave-de-teste");
  const sent = received[0].body;
  assert.equal(sent.state.novo_item, "Fritadeira elétrica");
  assert.equal(sent.state.moradia, "apartamento");
  assert.equal(sent.state.moradores, 2);
  assert.deepEqual(sent.state.itens_por_ambiente.Cozinha.sort(), ["Airfryer", "Jogo de panelas"]);
  assert.deepEqual(Object.keys(sent.questions).sort(), ["ambiente", "redundante", "sobreposicao"]);
  // Nada pessoal sai do servidor.
  const wire = JSON.stringify(sent);
  assert.ok(!wire.includes(OWNER_EMAIL) && !wire.includes(OWNER_NAME) && !wire.includes("Marina"), "nome e e-mail ficam em casa");
  console.log("PASS: assess-item sugere o ambiente e avisa da redundância, sem enviar dados pessoais.");

  // 3. Ambiente já escolhido pela pessoa: o Jev nem é perguntado sobre o ambiente.
  received.length = 0;
  const chosen = await call("/ai/assess-item", "POST", { enxovalId, name: "Forno elétrico", classify: false });
  assert.equal(chosen.data.environment, null);
  assert.ok(chosen.data.redundancy);
  assert.ok(!("ambiente" in received[0].body.questions));
  // Nome curto demais não gasta chamada.
  received.length = 0;
  const short = await call("/ai/assess-item", "POST", { enxovalId, name: "ab", classify: true });
  assert.deepEqual(short.data, { available: true, environment: null, redundancy: null });
  assert.equal(received.length, 0);
  console.log("PASS: só pergunta o ambiente quando a pessoa ainda não escolheu; nomes curtos não consultam.");

  // 4. Próximo item de um ambiente: vem do catálogo, nunca repete o que já existe e respeita a casa.
  received.length = 0;
  const next = await call("/ai/recommend", "POST", { enxovalId, categoryId: kitchen.id });
  assert.equal(next.status, 200, JSON.stringify(next.data));
  assert.ok(next.data.recommendation, JSON.stringify(next.data));
  assert.equal(next.data.recommendation.categoryId, kitchen.id);
  assert.equal(next.data.recommendation.clear, true);
  assert.equal(next.data.recommendation.options[0].name, next.data.recommendation.name);
  const offered = Object.keys(received[0].body.questions.proximo.criteria);
  assert.ok(offered.includes(next.data.recommendation.name));
  assert.ok(!offered.includes("Jogo de panelas") && !offered.includes("Airfryer"), "itens que a pessoa já tem não são oferecidos");
  assert.ok(offered.includes("__nenhum__"));
  console.log("PASS: recommend escolhe entre itens do catálogo que ainda faltam.");

  // Ambiente que o catálogo não conhece não consulta o Jev.
  const garage = await call("/categories", "POST", { enxovalId, name: "Garagem" });
  assert.equal(garage.status, 201, JSON.stringify(garage.data));
  received.length = 0;
  const unknown = await call("/ai/recommend", "POST", { enxovalId, categoryId: garage.data.id });
  assert.deepEqual([unknown.data.recommendation, unknown.data.reason], [null, "unknown_room"]);
  assert.equal(received.length, 0);
  assert.equal((await call("/ai/recommend", "POST", { enxovalId, categoryId: randomUUID() })).status, 404);
  console.log("PASS: ambiente desconhecido não gasta chamada; ambiente de outro enxoval dá 404.");

  // 5. Urgência por ambiente: cada nota é inferida uma vez e fica gravada no item.
  const urgencyIn = async (categoryId) => call("/ai/prioritize", "POST", { enxovalId, categoryId });
  const asked = () => received.flatMap((entry) => Object.values(entry.body.questions).map((question) => question.instructions.item.nome));
  const byName = (list) => Object.fromEntries(list.map((entry) => [entry.name, entry]));

  received.length = 0;
  const first = await urgencyIn(kitchen.id);
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.scores.length, 2);
  assert.ok(first.data.scores.every((entry) => entry.urgency === 4.2 && entry.confidence === 0.8));
  assert.deepEqual([first.data.inferred, first.data.cached, first.data.unscored], [2, 0, 0]);
  assert.deepEqual(asked().sort(), ["Airfryer", "Jogo de panelas"], "só os itens do ambiente pedido");
  assert.ok(!JSON.stringify(received.map((entry) => entry.body)).includes(funnel.data.items[0].id), "ids internos não vão para o Jev");
  console.log("PASS: prioritize avalia só os itens pendentes do ambiente pedido.");

  // Segunda consulta ao mesmo ambiente: tudo vem do banco, sem tocar no Jev.
  received.length = 0;
  const again = await urgencyIn(kitchen.id);
  assert.deepEqual([again.data.inferred, again.data.cached, again.data.unscored], [0, 2, 0]);
  assert.equal(received.length, 0, "nota já guardada não gasta outra consulta");
  const stored = byName((await call(`/items?enxovalId=${enxovalId}`)).data);
  assert.equal(stored["Airfryer"].aiUrgency, 4.2);
  assert.equal(stored["Airfryer"].aiUrgencyConfidence, 0.8);
  assert.equal(stored["Cama de casal"].aiUrgency, null, "outros ambientes seguem sem nota");
  console.log("PASS: a nota fica gravada no item e não é inferida de novo.");

  // Item novo: só ele é avaliado.
  const added = await call("/items", "POST", { enxovalId, categoryId: kitchen.id, name: "Tábua de corte" });
  assert.equal(added.status, 201, JSON.stringify(added.data));
  received.length = 0;
  const withNew = await urgencyIn(kitchen.id);
  assert.deepEqual(asked(), ["Tábua de corte"]);
  assert.deepEqual([withNew.data.inferred, withNew.data.cached], [1, 2]);

  // Renomear invalida a nota; só o item renomeado é reavaliado. Mudar caixa e acento não conta.
  const airfryerId = stored["Airfryer"].id;
  assert.equal((await call(`/items/${airfryerId}`, "PATCH", { name: "AIRFRYER" })).data.aiUrgency, 4.2, "mudança só de caixa mantém a nota");
  received.length = 0;
  assert.equal((await urgencyIn(kitchen.id)).data.inferred, 0);
  assert.equal(received.length, 0);
  const renamed = await call(`/items/${airfryerId}`, "PATCH", { name: "Airfryer 5 litros" });
  assert.equal(renamed.data.aiUrgency, null, "renomear descarta a nota");
  received.length = 0;
  await urgencyIn(kitchen.id);
  assert.deepEqual(asked(), ["Airfryer 5 litros"]);

  // Notas gravadas com uma versão antiga da régua não valem: o item é reavaliado em vez de misturar duas réguas.
  const tabua = withNew.data.scores.find((entry) => entry.id === added.data.item.id);
  assert.ok(tabua);
  await getPool().query("UPDATE items SET ai_urgency_key = $2 WHERE id = $1", [added.data.item.id, "v1|tabua de corte|cozinha"]);
  const reassessed = await urgencyIn(kitchen.id);
  // (A pergunta é idêntica à anterior, então o cache de 10 minutos do serviço pode responder sem chamar o Jev.)
  assert.equal(reassessed.data.inferred, 1, "nota de régua antiga é inferida de novo");
  assert.equal(
    (await getPool().query("SELECT ai_urgency_key FROM items WHERE id = $1", [added.data.item.id])).rows[0].ai_urgency_key,
    "v2|tabua de corte|cozinha",
    "e regravada com a chave da régua atual",
  );

  // Mover de ambiente também invalida.
  const moved = await call(`/items/${airfryerId}`, "PATCH", { categoryId: garage.data.id });
  assert.equal(moved.status, 200, JSON.stringify(moved.data));
  assert.equal(moved.data.aiUrgency, null, "mudar de ambiente descarta a nota");
  console.log("PASS: só itens novos, renomeados ou movidos de ambiente voltam a consultar o Jev.");

  // Itens comprados saem da lista, e ambiente de outro enxoval dá 404.
  const bought = stored["Jogo de panelas"];
  assert.equal((await call(`/items/${bought.id}`, "PATCH", { status: "bought" })).status, 200);
  received.length = 0;
  const open = await urgencyIn(kitchen.id);
  assert.ok(!open.data.scores.some((entry) => entry.id === bought.id));
  assert.equal(received.length, 0);
  assert.equal((await urgencyIn(randomUUID())).status, 404);
  console.log("PASS: itens já comprados não entram na lista de prioridades.");

  // 6. Outra pessoa não consulta o enxoval alheio.
  const ownerCookie = cookie;
  cookie = "";
  const stranger = await call("/auth/register", "POST", { email: "intrusa@example.invalid", password: randomBytes(16).toString("base64url") });
  assert.equal(stranger.status, 201, JSON.stringify(stranger.data));
  received.length = 0;
  for (const [path, body] of [
    ["/ai/assess-item", { enxovalId, name: "Torradeira", classify: true }],
    ["/ai/recommend", { enxovalId, categoryId: kitchen.id }],
    ["/ai/prioritize", { enxovalId, categoryId: kitchen.id }],
  ]) {
    assert.equal((await call(path, "POST", body)).status, 404, `${path} de enxoval alheio`);
  }
  assert.equal(received.length, 0);
  cookie = ownerCookie;
  console.log("PASS: só quem participa do enxoval consulta o Nino sobre ele.");

  // 7. Jev fora do ar: a rota responde vazio, sem erro.
  await new Promise((resolve) => fakeJev.close(resolve));
  fakeJev = undefined;
  setJevTransportForTests(undefined);
  process.env.TYPESAFE_BASE_URL = "http://127.0.0.1:9";
  const down = await call("/ai/assess-item", "POST", { enxovalId, name: "Torradeira nova", classify: true });
  assert.equal(down.status, 200, JSON.stringify(down.data));
  assert.deepEqual(down.data, { available: true, environment: null, redundancy: null });
  console.log("PASS: se o Jev não responde, a rota devolve vazio e o app segue.");

  // 8. Sem chave: a ajuda some, nada é chamado.
  setJevTransportForTests(null);
  assert.deepEqual((await call("/ai/status")).data, { enabled: false });
  assert.deepEqual((await call("/ai/assess-item", "POST", { enxovalId, name: "Torradeira", classify: true })).data, { available: false, environment: null, redundancy: null });
  assert.deepEqual((await call("/ai/recommend", "POST", { enxovalId, categoryId: kitchen.id })).data, { available: false, recommendation: null, reason: "unavailable" });
  assert.deepEqual((await call("/ai/prioritize", "POST", { enxovalId, categoryId: kitchen.id })).data, { available: false, categoryId: kitchen.id, scores: [], inferred: 0, cached: 0, unscored: 0 });
  console.log("PASS: sem chave do Jev o app funciona como antes.");
} finally {
  if (fakeJev) await new Promise((resolve) => fakeJev.close(resolve));
  if (server)
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
