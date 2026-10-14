// Teste de integração com PostgreSQL real: convite de pessoas para um enxoval (e-mail, aceite, permissões do convidado,
// remoção e separação entre enxoval próprio e compartilhado). O e-mail vai para a caixa em memória (MAIL_DRIVER=memory).
// Usa um schema descartável. Rodar: npm run test:invitations-db
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
const schema = `larume_invitations_test_${randomUUID().replaceAll("-", "")}`;
let server;
let created = false;

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
  const tokenFrom = (mail) =>
    /\/convite#token=([A-Za-z0-9_-]{43})/.exec(mail.text)?.[1];
  const profile = {
    moment: "casal", moveDate: null, moveDateAnswered: true, state: "SP", housing: "apartamento",
    people: 2, rooms: ["cozinha"], owned: "nada", style: "full", budget: "unknown", worries: [], usage: [], source: "",
  };
  const register = async (name, email, password, enxovalName) => {
    const person = agent();
    // O cadastro cria só a conta; o enxoval nasce depois, já autenticado.
    const account = await person.call("/auth/register", "POST", { name, email, password });
    assert.equal(account.status, 201, JSON.stringify(account.data));
    const workspace = await person.call("/enxovais", "POST", {
      name: enxovalName, profile,
      plan: { categories: [{ name: "Cozinha", items: [{ name: "Panela", description: "Essencial" }] }] },
    });
    assert.equal(workspace.status, 201, JSON.stringify(workspace.data));
    return { person, enxovalId: workspace.data.enxoval.id, id: account.data.user.id };
  };

  const password = randomBytes(12).toString("base64url");
  const ana = await register("Ana", "ana@example.invalid", password, "Casa da Ana");
  const bia = await register("Bia", "bia@example.invalid", password, "Casa da Bia");
  const guestEmail = "convidado@example.invalid";

  // 1. O convite sai por e-mail, com o token só no fragmento do link e só o hash no banco.
  const sent = await ana.person.call(`/enxovais/${ana.enxovalId}/invitations`, "POST", { email: ` ${guestEmail.toUpperCase()} ` });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  assert.equal(sent.data.email, guestEmail);
  assert.equal(mailOutbox.length, 1);
  const [mail] = mailOutbox;
  assert.equal(mail.to, guestEmail);
  assert.match(mail.subject, /Ana convidou você/);
  const token = tokenFrom(mail);
  assert.ok(token, `link no e-mail: ${mail.text}`);
  assert.ok(mail.html.includes(`https://app.example.invalid/convite#token=${token}`));
  const [stored] = await query("SELECT token_hash FROM enxoval_invitations");
  assert.equal(stored.token_hash, createHash("sha256").update(token).digest("hex"));
  assert.equal((await query("SELECT count(*)::int AS n FROM enxoval_members WHERE enxoval_id = $1", [ana.enxovalId]))[0].n, 1, "convidar não adiciona ninguém antes do aceite");
  console.log("PASS: convite enviado por e-mail (Resend em produção), com token só no fragmento e hash no banco.");

  // 2. Só o dono convida; validações do convite.
  const outsider = agent();
  assert.equal((await outsider.call(`/enxovais/${ana.enxovalId}/invitations`, "POST", { email: "x@example.invalid" })).status, 401);
  assert.equal((await bia.person.call(`/enxovais/${ana.enxovalId}/invitations`, "POST", { email: "x@example.invalid" })).status, 404, "quem não participa não vê o enxoval");
  const preview = await agent().call("/invitations/check", "POST", { token });
  assert.deepEqual(preview.data, { valid: true, email: guestEmail, enxovalName: "Casa da Ana", inviterName: "Ana", accountExists: false });
  assert.deepEqual((await agent().call("/invitations/check", "POST", { token: "x".repeat(43) })).data, { valid: false });
  assert.equal((await ana.person.call(`/enxovais/${ana.enxovalId}/invitations`, "POST", { email: "sem-arroba" })).status, 400);
  assert.equal((await ana.person.call(`/enxovais/${ana.enxovalId}/invitations`, "POST", { email: "ana@example.invalid" })).status, 409, "o dono não se convida");
  assert.equal((await ana.person.call(`/enxovais/${ana.enxovalId}/invitations`, "POST", { email: guestEmail })).status, 429, "reenvio imediato é barrado");

  // 3. Aceite sem conta cria uma conta de convidado, entra no enxoval e consome o link.
  const guest = agent();
  const weak = await guest.call("/invitations/accept", "POST", { token, name: "Gui", password: "curta", confirmation: "curta" });
  assert.equal(weak.status, 400);
  const mismatch = await guest.call("/invitations/accept", "POST", { token, name: "Gui", password, confirmation: password + "x" });
  assert.equal(mismatch.status, 400);
  const accepted = await guest.call("/invitations/accept", "POST", { token, name: "Gui", password, confirmation: password });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  assert.equal(accepted.data.user.isGuest, true);
  assert.equal(accepted.data.activeEnxoval.id, ana.enxovalId);
  assert.equal(accepted.data.activeEnxoval.role, "editor");
  assert.equal(accepted.data.activeEnxoval.ownerName, "Ana");
  assert.deepEqual(accepted.data.members.map((m) => [m.name, m.role]), [["Ana", "owner"], ["Gui", "editor"]]);
  assert.equal(accepted.data.items.length, 1);
  const guestId = accepted.data.user.id;
  assert.equal((await query("SELECT invited_by FROM enxoval_members WHERE user_id = $1", [guestId]))[0].invited_by, ana.id);
  assert.equal((await query("SELECT is_guest FROM users WHERE id = $1", [guestId]))[0].is_guest, true);
  assert.equal((await agent().call("/invitations/accept", "POST", { token, name: "Outro", password, confirmation: password })).status, 400, "o link é de uso único");
  assert.deepEqual((await agent().call("/invitations/check", "POST", { token })).data, { valid: false });
  console.log("PASS: aceite cria a conta de convidado, entra como editor e consome o link.");

  // 4. Os dados são os mesmos do dono, nos dois sentidos.
  const chaleira = await guest.call("/items", "POST", { enxovalId: ana.enxovalId, categoryName: "Cozinha", name: "Chaleira" });
  assert.equal(chaleira.status, 201, JSON.stringify(chaleira.data));
  const anaView = await ana.person.call(`/enxovais/${ana.enxovalId}`);
  assert.deepEqual(anaView.data.items.map((i) => i.name).sort(), ["Chaleira", "Panela"], "o dono vê o que o convidado criou");
  const panela = anaView.data.items.find((i) => i.name === "Panela");
  assert.equal((await ana.person.call(`/items/${panela.id}`, "PATCH", { status: "bought" })).status, 200);
  const guestView = await guest.call(`/enxovais/${ana.enxovalId}`);
  assert.equal(guestView.data.items.find((i) => i.name === "Panela").status, "bought", "o convidado vê a alteração do dono");
  console.log("PASS: dono e convidado enxergam e editam os mesmos itens.");

  // 5. Permissões do convidado.
  assert.equal((await guest.call("/enxovais", "POST", { name: "Meu enxoval" })).status, 403, "convidado não cria enxoval");
  assert.equal((await guest.call(`/enxovais/${ana.enxovalId}/invitations`, "POST", { email: "outro@example.invalid" })).status, 403, "convidado não convida");
  assert.equal((await guest.call(`/enxovais/${ana.enxovalId}/invitations`)).status, 403);
  assert.equal((await guest.call(`/enxovais/${ana.enxovalId}`, "DELETE")).status, 403, "convidado não exclui o enxoval");
  assert.equal((await guest.call(`/enxovais/${ana.enxovalId}`, "PATCH", { name: "Renomeado" })).status, 403, "convidado não renomeia");
  assert.equal((await guest.call(`/enxovais/${ana.enxovalId}/members/${ana.id}`, "DELETE")).status, 403, "convidado não remove ninguém");
  assert.equal((await query("SELECT count(*)::int AS n FROM enxovais WHERE id = $1", [ana.enxovalId]))[0].n, 1);
  console.log("PASS: convidado não cria enxoval, não convida, não remove e não exclui nem renomeia.");

  // 6. Dono de outro enxoval aceita convite: continua dono do dele e tem os dois separados.
  const second = await ana.person.call(`/enxovais/${ana.enxovalId}/invitations`, "POST", { email: "bia@example.invalid" });
  assert.equal(second.status, 201, JSON.stringify(second.data));
  const biaToken = tokenFrom(mailOutbox[1]);
  assert.deepEqual((await agent().call("/invitations/check", "POST", { token: biaToken })).data.accountExists, true);
  assert.equal((await agent().call("/invitations/accept", "POST", { token: biaToken })).status, 401, "conta existente precisa estar logada");
  const intruder = agent();
  assert.equal((await intruder.call("/auth/login", "POST", { email: "ana@example.invalid", password })).status, 200);
  assert.equal((await intruder.call("/invitations/accept", "POST", { token: biaToken })).status, 403, "o convite só vale para o e-mail convidado");
  const biaAccepted = await bia.person.call("/invitations/accept", "POST", { token: biaToken });
  assert.equal(biaAccepted.status, 200, JSON.stringify(biaAccepted.data));
  assert.equal(biaAccepted.data.user.isGuest, false, "quem já tinha conta própria continua com ela");
  const biaList = (await bia.person.call("/bootstrap")).data.enxovais;
  assert.deepEqual(biaList.map((e) => [e.name, e.role, e.ownerName]), [["Casa da Bia", "owner", "Bia"], ["Casa da Ana", "editor", "Ana"]], "o próprio vem primeiro, o compartilhado depois");
  const biaOwn = await bia.person.call(`/enxovais/${bia.enxovalId}`);
  assert.equal(biaOwn.data.enxoval.role, "owner");
  assert.equal(biaOwn.data.members.length, 1, "o enxoval da Bia não ganhou ninguém");
  assert.equal((await bia.person.call(`/enxovais/${ana.enxovalId}`, "DELETE")).status, 403);
  assert.equal((await bia.person.call("/enxovais", "POST", { name: "Outro da Bia" })).status, 201, "dono continua criando enxovais próprios");
  assert.equal((await bia.person.call(`/bootstrap?enxovalId=${ana.enxovalId}`)).data.activeEnxoval.id, ana.enxovalId, "troca para o compartilhado");
  assert.equal((await bia.person.call("/bootstrap?enxovalId=00000000-0000-4000-8000-000000000000")).data.activeEnxoval.id, bia.enxovalId, "enxoval inacessível cai no primeiro da lista");
  console.log("PASS: dono convidado de outro enxoval mantém os dois separados e troca entre eles.");

  // 7. Remover: o convidado puro perde tudo; quem tem enxoval próprio mantém o dele.
  const pendingBefore = await ana.person.call(`/enxovais/${ana.enxovalId}/invitations`);
  assert.equal(pendingBefore.data.length, 0);
  assert.equal((await ana.person.call(`/enxovais/${ana.enxovalId}/members/${ana.id}`, "DELETE")).status, 400, "o dono não se remove");
  assert.equal((await ana.person.call(`/enxovais/${ana.enxovalId}/members/${randomUUID()}`, "DELETE")).status, 404);
  assert.equal((await ana.person.call(`/enxovais/${ana.enxovalId}/members/${guestId}`, "DELETE")).status, 204);
  assert.equal((await guest.call("/bootstrap")).status, 401, "as sessões do convidado removido caem na hora");
  const relogin = agent();
  const guestLogin = await relogin.call("/auth/login", "POST", { email: guestEmail, password });
  assert.equal(guestLogin.status, 200);
  assert.deepEqual(guestLogin.data.enxovais, [], "sem nenhum enxoval");
  assert.equal(guestLogin.data.activeEnxoval, null);
  assert.equal((await relogin.call(`/enxovais/${ana.enxovalId}`)).status, 404, "sem acesso aos dados");
  assert.equal((await relogin.call(`/items?enxovalId=${ana.enxovalId}`)).status, 404);
  assert.equal((await relogin.call("/items", "POST", { enxovalId: ana.enxovalId, categoryName: "Cozinha", name: "Intruso" })).status, 404);
  assert.equal((await relogin.call("/enxovais", "POST", { name: "Fugi" })).status, 403, "continua sem criar enxoval");

  assert.equal((await ana.person.call(`/enxovais/${ana.enxovalId}/members/${bia.id}`, "DELETE")).status, 204);
  const biaAfter = await bia.person.call("/bootstrap");
  assert.equal(biaAfter.status, 200, "a Bia segue logada: tem enxoval próprio");
  assert.deepEqual(biaAfter.data.enxovais.map((e) => e.name), ["Casa da Bia", "Outro da Bia"]);
  assert.equal((await bia.person.call(`/enxovais/${ana.enxovalId}`)).status, 404, "perdeu o acesso ao da Ana");
  assert.equal((await bia.person.call(`/enxovais/${bia.enxovalId}`)).status, 200, "o dela segue normal");
  assert.equal((await ana.person.call(`/enxovais/${ana.enxovalId}`)).data.items.some((i) => i.name === "Chaleira"), true, "o que o convidado criou fica no enxoval");
  console.log("PASS: remover tira o acesso; convidado puro perde tudo e quem tem enxoval próprio mantém o dele.");

  // 8. Convite pendente: lista, revoga, reenvio troca o link, expiração e reconvite de quem foi removido.
  const again = await ana.person.call(`/enxovais/${ana.enxovalId}/invitations`, "POST", { email: guestEmail });
  assert.equal(again.status, 201, JSON.stringify(again.data));
  const reinviteToken = tokenFrom(mailOutbox[2]);
  assert.equal((await ana.person.call(`/enxovais/${ana.enxovalId}/invitations`)).data.length, 1);
  assert.equal((await relogin.call("/invitations/accept", "POST", { token: reinviteToken })).status, 200, "conta de convidado existente aceita logada");
  assert.equal((await relogin.call("/bootstrap")).data.activeEnxoval.id, ana.enxovalId, "voltou a ter acesso");

  const toRevoke = await ana.person.call(`/enxovais/${ana.enxovalId}/invitations`, "POST", { email: "revogado@example.invalid" });
  const revokedToken = tokenFrom(mailOutbox[3]);
  assert.equal((await ana.person.call(`/enxovais/${ana.enxovalId}/invitations/${toRevoke.data.id}`, "DELETE")).status, 204);
  assert.equal((await ana.person.call(`/enxovais/${ana.enxovalId}/invitations/${toRevoke.data.id}`, "DELETE")).status, 404);
  assert.deepEqual((await agent().call("/invitations/check", "POST", { token: revokedToken })).data, { valid: false }, "convite cancelado não vale");

  await query("UPDATE enxoval_invitations SET created_at = now() - interval '2 minutes'");
  const resent = await ana.person.call(`/enxovais/${ana.enxovalId}/invitations`, "POST", { email: "novo@example.invalid" });
  assert.equal(resent.status, 201);
  const firstLink = tokenFrom(mailOutbox[4]);
  await query("UPDATE enxoval_invitations SET created_at = now() - interval '2 minutes'");
  assert.equal((await ana.person.call(`/enxovais/${ana.enxovalId}/invitations`, "POST", { email: "novo@example.invalid" })).status, 201);
  const secondLink = tokenFrom(mailOutbox[5]);
  assert.notEqual(firstLink, secondLink);
  assert.deepEqual((await agent().call("/invitations/check", "POST", { token: firstLink })).data, { valid: false }, "o reenvio troca o link anterior");
  assert.equal((await agent().call("/invitations/check", "POST", { token: secondLink })).data.valid, true);
  await query("UPDATE enxoval_invitations SET expires_at = now() - interval '1 minute'");
  assert.deepEqual((await agent().call("/invitations/check", "POST", { token: secondLink })).data, { valid: false }, "convite expira");
  assert.equal((await ana.person.call(`/enxovais/${ana.enxovalId}/invitations`)).data.length, 0, "expirados saem da lista");
  console.log("PASS: lista, cancelamento, reenvio e expiração dos convites; quem foi removido pode ser convidado de novo.");

  // 9. Falha do provedor de e-mail não deixa convite pendente; excluir o enxoval apaga os convites.
  const originalFetch = globalThis.fetch;
  process.env.MAIL_DRIVER = "resend";
  process.env.RESEND_API_KEY = "re_teste";
  process.env.MAIL_FROM = "Casa Mia <nao-responda@example.invalid>";
  const sentToResend = [];
  globalThis.fetch = async (url, init) => {
    if (String(url) === "https://api.resend.com/emails") {
      sentToResend.push(JSON.parse(init.body));
      return new Response("falhou", { status: 500 });
    }
    return originalFetch(url, init);
  };
  try {
    const failed = await ana.person.call(`/enxovais/${ana.enxovalId}/invitations`, "POST", { email: "falha@example.invalid" });
    assert.equal(failed.status, 502);
    assert.equal(sentToResend.length, 1, "o envio passa pela API do Resend");
    assert.deepEqual(sentToResend[0].to, ["falha@example.invalid"]);
    assert.equal(sentToResend[0].from, "Casa Mia <nao-responda@example.invalid>");
    assert.equal((await query("SELECT count(*)::int AS n FROM enxoval_invitations WHERE email = 'falha@example.invalid'"))[0].n, 0, "convite sem e-mail entregue não fica pendente");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.MAIL_DRIVER = "memory";
    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_FROM;
  }
  assert.equal((await ana.person.call(`/enxovais/${ana.enxovalId}/invitations`, "POST", { email: "pendente@example.invalid" })).status, 201);
  assert.equal((await ana.person.call(`/enxovais/${ana.enxovalId}`, "DELETE")).status, 204);
  assert.equal((await query("SELECT count(*)::int AS n FROM enxoval_invitations"))[0].n, 0, "excluir o enxoval apaga os convites");
  assert.equal((await relogin.call("/bootstrap")).data.enxovais.length, 0, "o convidado fica sem enxoval quando o dono exclui");
  console.log("PASS: falha do e-mail não deixa convite pendente e excluir o enxoval limpa tudo.");
} finally {
  if (server)
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
