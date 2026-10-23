// captura de tela, limite de envios e leitura pelo painel administrativo. Usa um schema descartável.
// Rodar: npm run test:feedback-db
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { strongPassword } from "./strongPassword.mjs";
import express from "express";
import pg from "pg";
import { getPool } from "../server/database.ts";
import { migrateDatabase } from "../server/migrations.ts";
import { mailOutbox } from "../server/mailer.ts";
import { registerApiRoutes } from "../server/routes.ts";
import { imageMatchesType, validateFeedback } from "../src/feedback.ts";

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
const schema = `casamia_feedback_test_${randomUUID().replaceAll("-", "")}`;
let server;
let created = false;

const adminLogin = "gestao-teste";
const adminPassword = strongPassword();

// Um JPEG mínimo: só os primeiros bytes importam para a checagem de tipo.
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(60)]).toString("base64");
const notAnImage = Buffer.from("<html><script>alert(1)</script></html>").toString("base64");

const bug = (extra = {}) => ({
  kind: "bug",
  title: "O botão de salvar não responde",
  description: "Toquei em salvar e nada aconteceu, a tela continuou igual.",
  area: "plan",
  steps: "1. Abri o Planejamento\n2. Troquei a semana do sofá\n3. Toquei em salvar",
  expected: "Que a semana ficasse salva.",
  frequency: "sometimes",
  severity: "annoying",
  contactOk: true,
  contactEmail: "Pessoa@Example.invalid",
  tech: { path: "/app", viewport: "390x844", language: "pt-BR", userAgent: "teste", ignorado: "x" },
  ...extra,
});

// 1. Regras de validação (as mesmas do formulário).
{
  const ok = validateFeedback(bug());
  assert.ok(ok.value, JSON.stringify(ok.errors));
  assert.equal(ok.value.contactEmail, "pessoa@example.invalid", "e-mail normalizado");
  assert.equal(ok.value.tech.ignorado, undefined, "campos técnicos desconhecidos são descartados");
  assert.equal(ok.value.problem, "", "campos de sugestão não valem para problema");

  const idea = validateFeedback({
    kind: "idea",
    title: "Lista de compras por loja",
    description: "Queria ver os itens agrupados pela loja onde vou comprar.",
    problem: "Perco tempo juntando tudo no mercado.",
    importance: "helps",
    steps: "isso não vale para sugestão",
    contactOk: false,
    contactEmail: "ignorado@example.invalid",
  });
  assert.ok(idea.value, JSON.stringify(idea.errors));
  assert.equal(idea.value.steps, "");
  assert.equal(idea.value.contactEmail, "", "sem pedido de resposta, o e-mail não é guardado");
  assert.equal(idea.value.severity, null);

  const reasons = [
    ["sem tipo", { ...bug(), kind: undefined }, "kind"],
    ["título curto", bug({ title: "oi" }), "title"],
    ["descrição curta", bug({ description: "ruim" }), "description"],
    ["problema sem local", bug({ area: "" }), "area"],
    ["local desconhecido", bug({ area: "lua" }), "area"],
    ["problema sem gravidade", bug({ severity: undefined }), "severity"],
    ["gravidade desconhecida", bug({ severity: "enorme" }), "severity"],
    ["frequência desconhecida", bug({ frequency: "nunca" }), "frequency"],
    ["e-mail inválido", bug({ contactEmail: "sem-arroba" }), "contactEmail"],
    ["passo a passo enorme", bug({ steps: "a".repeat(1501) }), "steps"],
    ["imagem fora do formato", bug({ screenshot: { type: "image/gif", data: jpeg } }), "screenshot"],
    ["imagem grande demais", bug({ screenshot: { type: "image/jpeg", data: "A".repeat(700_001) } }), "screenshot"],
    ["importância desconhecida", { kind: "idea", title: "Uma ideia boa", description: "Descrição longa o bastante.", importance: "urgente", contactOk: false }, "importance"],
  ];
  for (const [label, input, field] of reasons) {
    const result = validateFeedback(input);
    assert.equal(result.value, null, label);
    assert.ok(result.errors[field], `${label}: esperava erro em ${field}, veio ${JSON.stringify(result.errors)}`);
  }
  assert.equal(imageMatchesType(Buffer.from(jpeg, "base64"), "image/jpeg"), true);
  assert.equal(imageMatchesType(Buffer.from(jpeg, "base64"), "image/png"), false);
  assert.equal(imageMatchesType(Buffer.from(notAnImage, "base64"), "image/jpeg"), false);
  console.log("PASS: validação do formulário (problema, sugestão e outros limites).");
}

try {
  await control.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  originalUrl.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = originalUrl.toString();
  process.env.COOKIE_SECURE = "false";
  process.env.ADMIN_LOGIN = adminLogin;
  process.env.ADMIN_PASSWORD = adminPassword;
  process.env.MAIL_DRIVER = "memory";
  process.env.FEEDBACK_TO_EMAIL = "gestao@example.invalid";
  process.env.APP_URL = "https://app.example.invalid";
  await migrateDatabase();

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  registerApiRoutes(app);
  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const jar = new Map();
  const call = async (path, method = "GET", body, { raw = false } = {}) => {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: [...jar.values()].join("; "),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0];
      const [name, value] = pair.split("=");
      if (value) jar.set(name, pair);
      else jar.delete(name);
    }
    if (raw) return response;
    return {
      status: response.status,
      data: response.status === 204 ? undefined : await response.json(),
    };
  };
  const query = async (sql, params = []) => (await getPool().query(sql, params)).rows;

  // 2. É preciso estar logado para enviar.
  assert.equal((await call("/feedback", "POST", bug())).status, 401);

  const registered = await call("/auth/register", "POST", {
    email: "ajuda@example.invalid",
    password: strongPassword(),
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  assert.equal((await query("SELECT count(*)::int AS n FROM feedback"))[0].n, 0);

  // 3. Problema completo, com captura de tela e aviso por e-mail para a gestão.
  const sent = await call("/feedback", "POST", bug({ screenshot: { type: "image/jpeg", data: jpeg } }));
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  const [row] = await query("SELECT * FROM feedback WHERE id = $1", [sent.data.id]);
  assert.equal(row.kind, "bug");
  assert.equal(row.severity, "annoying");
  assert.equal(row.status, "new");
  assert.equal(row.user_email, "ajuda@example.invalid");
  assert.equal(row.contact_email, "ajuda@example.invalid", "e-mail alternativo enviado pelo navegador é ignorado");
  assert.equal(row.contact_ok, true);
  assert.equal(row.tech.viewport, "390x844");
  assert.equal(row.tech.ignorado, undefined);
  assert.equal(Buffer.from(row.screenshot).toString("base64"), jpeg, "a imagem é guardada como veio");
  await new Promise((resolve) => setTimeout(resolve, 100));
  const mail = mailOutbox.find((entry) => entry.to === "gestao@example.invalid");
  assert.ok(mail, "a gestão é avisada por e-mail");
  assert.match(mail.subject, /Problema: O botão de salvar não responde/);
  assert.match(mail.text, /ajuda@example\.invalid/);
  assert.ok(!mail.text.includes("pessoa@example.invalid"));
  assert.match(mail.text, /Passo a passo/);
  assert.match(mail.text, /https:\/\/app\.example\.invalid\/admin/);
  console.log("PASS: problema completo é gravado, com captura de tela, e a gestão é avisada.");

  // 4. Sugestão e outro assunto, sem campos de problema.
  const idea = await call("/feedback", "POST", {
    kind: "idea",
    title: "Agrupar a lista por loja",
    description: "Queria ver os itens agrupados pela loja onde vou comprar cada um.",
    problem: "Perco tempo juntando tudo.",
    importance: "essential",
    contactOk: false,
  });
  assert.equal(idea.status, 201, JSON.stringify(idea.data));
  const other = await call("/feedback", "POST", {
    kind: "other",
    title: "Obrigada pelo app",
    description: "Só queria dizer que a lista me ajudou muito na mudança.",
    contactOk: false,
  });
  assert.equal(other.status, 201, JSON.stringify(other.data));
  const ideaRow = (await query("SELECT * FROM feedback WHERE id = $1", [idea.data.id]))[0];
  assert.deepEqual([ideaRow.importance, ideaRow.severity, ideaRow.contact_ok, ideaRow.screenshot], ["essential", null, true, null]);
  console.log("PASS: sugestão e outro assunto.");

  // 5. Mensagens inválidas são recusadas com uma explicação, sem gravar nada.
  const before = (await query("SELECT count(*)::int AS n FROM feedback"))[0].n;
  for (const [label, input] of [
    ["sem gravidade", bug({ severity: undefined })],
    ["sem resumo", bug({ title: "" })],
    ["imagem que não é imagem", bug({ screenshot: { type: "image/jpeg", data: notAnImage } })],
    ["tipo de imagem trocado", bug({ screenshot: { type: "image/png", data: jpeg } })],
  ]) {
    const response = await call("/feedback", "POST", input);
    assert.equal(response.status, 400, label);
    assert.ok(response.data.error.length > 5, `${label}: mensagem em português`);
  }
  assert.equal((await query("SELECT count(*)::int AS n FROM feedback"))[0].n, before);
  console.log("PASS: mensagens inválidas são recusadas sem rastro.");

  // 6. Painel administrativo: só com acesso, lista, atualiza o andamento e entrega a imagem sem executá-la.
  assert.equal((await call("/admin/feedback")).status, 401, "sem acesso administrativo");
  const adminSession = await call("/admin/login", "POST", { login: adminLogin, password: adminPassword });
  assert.equal(adminSession.status, 200, JSON.stringify(adminSession.data));

  const list = await call("/admin/feedback");
  assert.equal(list.status, 200);
  assert.equal(list.data.feedback.length, 3);
  const bugEntry = list.data.feedback.find((entry) => entry.id === sent.data.id);
  assert.deepEqual(
    [bugEntry.kind, bugEntry.status, bugEntry.hasScreenshot, bugEntry.userEmail, bugEntry.contactEmail],
    ["bug", "new", true, "ajuda@example.invalid", "ajuda@example.invalid"],
  );
  assert.ok(!JSON.stringify(list.data).includes(jpeg), "a lista não carrega a imagem");
  assert.equal(list.data.feedback.find((entry) => entry.id === idea.data.id).hasScreenshot, false);

  const seen = await call(`/admin/feedback/${sent.data.id}`, "PATCH", { status: "planned" });
  assert.equal(seen.data.status, "planned");
  assert.equal((await call(`/admin/feedback/${sent.data.id}`, "PATCH", { status: "feito" })).status, 400);
  assert.equal((await call(`/admin/feedback/nao-e-um-id`, "PATCH", { status: "seen" })).status, 404);
  assert.equal((await call(`/admin/feedback/${randomUUID()}`, "PATCH", { status: "seen" })).status, 404);

  const image = await call(`/admin/feedback/${sent.data.id}/screenshot`, "GET", undefined, { raw: true });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/jpeg");
  assert.equal(image.headers.get("x-content-type-options"), "nosniff");
  assert.match(image.headers.get("content-security-policy"), /sandbox/);
  assert.equal(Buffer.from(await image.arrayBuffer()).toString("base64"), jpeg);
  assert.equal((await call(`/admin/feedback/${idea.data.id}/screenshot`)).status, 404, "sem imagem");
  console.log("PASS: painel lista, atualiza o andamento e entrega a imagem com cabeçalhos seguros.");

  // 7. Limite de envios por endereço (8 a cada 10 minutos; já foram 1 sem login, 3 válidos e 4 recusados).
  const limited = await call("/feedback", "POST", bug());
  assert.equal(limited.status, 429, JSON.stringify(limited.data));
  assert.match(limited.data.error, /Aguarde/);
  console.log("PASS: limite de envios seguidos.");

  // 8. Apagar a conta não apaga a mensagem: o nome e o e-mail ficam gravados na própria mensagem.
  await query("DELETE FROM users WHERE email = $1", ["ajuda@example.invalid"]);
  const afterDelete = await query("SELECT user_id, user_email FROM feedback WHERE id = $1", [sent.data.id]);
  assert.deepEqual([afterDelete[0].user_id, afterDelete[0].user_email], [null, "ajuda@example.invalid"]);
  await assert.rejects(query("UPDATE feedback SET kind = 'x' WHERE id = $1", [sent.data.id]));
  await assert.rejects(query("UPDATE feedback SET status = 'x' WHERE id = $1", [sent.data.id]));
  console.log("PASS: a mensagem sobrevive à conta e o banco recusa valores inválidos.");
} finally {
  if (server)
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
