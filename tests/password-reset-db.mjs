// Teste de integração com PostgreSQL real: "Esqueci minha senha" (link por e-mail, uso único, validade, anti-enumeração,
// revogação de sessões). O e-mail vai para a caixa em memória (MAIL_DRIVER=memory): nada é enviado de verdade.
// Usa um schema descartável. Rodar: npm run test:password-reset-db
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";

process.env.MAIL_DRIVER = "memory";
process.env.APP_URL = "https://app.example.invalid";

const { getPool } = await import("../server/database.ts");
const { migrateDatabase } = await import("../server/migrations.ts");
const { registerApiRoutes } = await import("../server/routes.ts");
const { mailOutbox } = await import("../server/mailer.ts");

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
const schema = `larume_password_reset_test_${randomUUID().replaceAll("-", "")}`;
let server;
let created = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** O servidor responde antes de montar e enviar o e-mail; espera a caixa chegar ao tamanho esperado. */
async function waitForMail(count, timeout = 4000) {
  const start = Date.now();
  while (mailOutbox.length < count && Date.now() - start < timeout)
    await sleep(25);
  return mailOutbox.length;
}

try {
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
  const agent = () => {
    let cookie = "";
    return {
      async call(path, method = "GET", body) {
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
      },
    };
  };
  const query = async (sql, params = []) =>
    (await getPool().query(sql, params)).rows;

  const email = "reset@example.invalid";
  const oldPassword = randomBytes(12).toString("base64url");
  const newPassword = randomBytes(12).toString("base64url");
  const person = agent();
  const registered = await person.call("/auth/register", "POST", {
    name: "Ana <b>Reset</b>",
    email,
    password: oldPassword,
    enxovalName: "Casa de teste",
    plan: { categories: [{ name: "Cozinha", items: [{ name: "Panela", description: "Essencial" }] }] },
    profile: {
      moment: "casal", moveDate: null, moveDateAnswered: true, state: "SP", housing: "apartamento",
      people: 2, rooms: ["cozinha"], owned: "nada", style: "full", budget: "unknown", worries: [], usage: [], source: "",
    },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const forgot = (anyEmail) => agent().call("/auth/forgot-password", "POST", { email: anyEmail });
  // A sessão aberta antes da redefinição precisa ser encerrada por ela.
  const openSession = agent();
  assert.equal((await openSession.call("/auth/login", "POST", { email, password: oldPassword })).status, 200);
  assert.equal((await openSession.call("/bootstrap")).status, 200);

  // 1. Anti-enumeração: mesma resposta para e-mail sem conta, e nenhum e-mail sai.
  const unknown = await forgot("ninguem@example.invalid");
  assert.equal(unknown.status, 200);
  assert.deepEqual(unknown.data, { ok: true });
  await sleep(300);
  assert.equal(mailOutbox.length, 0, "e-mail sem conta não recebe nada");
  assert.equal((await forgot("sem-arroba")).status, 400, "formato inválido é recusado");

  // 2. E-mail com conta: mesma resposta, e o link chega pelo provedor, com o token só no fragmento.
  const known = await forgot(email);
  assert.deepEqual(known.data, { ok: true }, "a resposta não revela se a conta existe");
  assert.equal(await waitForMail(1), 1);
  const [mail] = mailOutbox;
  assert.equal(mail.to, email);
  const linkMatch = /(https:\/\/app\.example\.invalid\/redefinir-senha)#token=([A-Za-z0-9_-]{43})/.exec(mail.text);
  assert.ok(linkMatch, `link no e-mail: ${mail.text}`);
  const token = linkMatch[2];
  assert.ok(mail.html.includes(linkMatch[0]), "o HTML traz o mesmo link");
  assert.ok(!mail.html.includes("<b>Reset</b>") && mail.html.includes("&lt;b&gt;Reset&lt;/b&gt;"), "o nome é escapado no HTML");
  const [stored] = await query("SELECT token_hash, expires_at FROM password_reset_tokens");
  assert.equal(stored.token_hash, createHash("sha256").update(token).digest("hex"), "só o hash do token fica no banco");
  assert.notEqual(stored.token_hash, token);
  const minutesLeft = (new Date(stored.expires_at).getTime() - Date.now()) / 60_000;
  assert.ok(minutesLeft > 58 && minutesLeft <= 60, `validade de 1 hora (restam ${minutesLeft.toFixed(1)} min)`);
  console.log("PASS: resposta igual para qualquer e-mail; link com token só no fragmento, hash no banco e validade de 1 hora.");

  // 3. Intervalo mínimo: pedir de novo logo em seguida não gera outro e-mail nem outro link.
  await forgot(email);
  await sleep(300);
  assert.equal(mailOutbox.length, 1, "o segundo pedido dentro de 1 minuto não envia outro e-mail");
  assert.equal((await query("SELECT count(*)::int AS n FROM password_reset_tokens"))[0].n, 1);

  // 4. Verificação do link.
  const caller = agent();
  assert.deepEqual((await caller.call("/auth/reset-password/check", "POST", { token })).data, { valid: true });
  assert.deepEqual((await caller.call("/auth/reset-password/check", "POST", { token: "x".repeat(43) })).data, { valid: false });
  assert.deepEqual((await caller.call("/auth/reset-password/check", "POST", { token: "curto" })).data, { valid: false });

  // 5. Validações da nova senha (sem gastar o link).
  const reset = (body) => agent().call("/auth/reset-password", "POST", body);
  assert.equal((await reset({ token, password: "curta", confirmation: "curta" })).status, 400);
  assert.equal((await reset({ token, password: newPassword, confirmation: newPassword + "x" })).status, 400);
  assert.equal((await reset({ token: "x".repeat(43), password: newPassword, confirmation: newPassword })).status, 400);
  assert.deepEqual((await caller.call("/auth/reset-password/check", "POST", { token })).data, { valid: true }, "erros de validação não consomem o link");

  // 6. Redefinir: troca a senha, encerra as sessões e consome o link.
  const done = await reset({ token, password: newPassword, confirmation: newPassword });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal(await waitForMail(2), 2);
  assert.match(mailOutbox[1].subject, /senha .* alterada/i, "aviso de segurança depois de trocar a senha");
  assert.equal((await agent().call("/auth/login", "POST", { email, password: oldPassword })).status, 401, "a senha antiga deixa de valer");
  assert.equal((await agent().call("/auth/login", "POST", { email, password: newPassword })).status, 200, "a nova senha entra");
  assert.equal((await openSession.call("/bootstrap")).status, 401, "a sessão aberta antes foi encerrada");
  assert.equal((await reset({ token, password: newPassword, confirmation: newPassword })).status, 400, "o link não vale uma segunda vez");
  assert.deepEqual((await caller.call("/auth/reset-password/check", "POST", { token })).data, { valid: false });
  assert.equal((await query("SELECT count(*)::int AS n FROM password_reset_tokens"))[0].n, 0);
  console.log("PASS: nova senha entra, a antiga e as sessões abertas caem, o link é de uso único e há aviso por e-mail.");

  // 7. Expiração.
  await forgot(email);
  assert.equal(await waitForMail(3), 3);
  const expiredToken = /#token=([A-Za-z0-9_-]{43})/.exec(mailOutbox[2].text)[1];
  await query("UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'");
  assert.deepEqual((await caller.call("/auth/reset-password/check", "POST", { token: expiredToken })).data, { valid: false });
  assert.equal((await reset({ token: expiredToken, password: newPassword + "2", confirmation: newPassword + "2" })).status, 400, "link expirado é recusado");

  // 8. Um pedido novo invalida o link anterior.
  await query("DELETE FROM password_reset_tokens");
  await forgot(email);
  assert.equal(await waitForMail(4), 4);
  const firstToken = /#token=([A-Za-z0-9_-]{43})/.exec(mailOutbox[3].text)[1];
  await query("UPDATE password_reset_tokens SET created_at = now() - interval '2 minutes'");
  await forgot(email);
  assert.equal(await waitForMail(5), 5);
  const secondToken = /#token=([A-Za-z0-9_-]{43})/.exec(mailOutbox[4].text)[1];
  assert.notEqual(firstToken, secondToken);
  assert.deepEqual((await caller.call("/auth/reset-password/check", "POST", { token: firstToken })).data, { valid: false }, "o link antigo foi substituído");
  assert.deepEqual((await caller.call("/auth/reset-password/check", "POST", { token: secondToken })).data, { valid: true });
  console.log("PASS: link expirado é recusado e um novo pedido invalida o anterior.");

  // 9. Conta inativa não recebe link; link de conta desativada depois do envio também deixa de valer.
  await query("UPDATE users SET is_active = false WHERE email = $1", [email]);
  assert.deepEqual((await caller.call("/auth/reset-password/check", "POST", { token: secondToken })).data, { valid: false }, "conta desativada invalida o link");
  await query("DELETE FROM password_reset_tokens");
  await forgot(email);
  await sleep(300);
  assert.equal(mailOutbox.length, 5, "conta inativa não recebe e-mail");

  // 10. Limite de pedidos por origem (resposta 429 depois de 8 tentativas).
  let limited = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    const result = await forgot("ninguem@example.invalid");
    limited ||= result.status === 429;
  }
  assert.equal(limited, true, "excesso de pedidos recebe 429");
  console.log("PASS: conta inativa não recebe link e há limite de pedidos.");
} finally {
  if (server)
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
