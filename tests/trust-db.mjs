// Teste de integração com PostgreSQL real da Fase 9: aparelho, confirmação de e-mail, bloqueios do /admin e
// bloqueio temporário automático de IP. O e-mail vai para a caixa em memória (MAIL_DRIVER=memory).
// Usa um schema descartável. Rodar: npm run test:trust-db
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";

process.env.MAIL_DRIVER = "memory";
process.env.APP_URL = "https://app.example.invalid";
process.env.EMAIL_VERIFICATION_REQUIRED = "true";
process.env.COOKIE_SECURE = "false";
process.env.ADMIN_LOGIN = "gestor-teste";
process.env.ADMIN_PASSWORD = randomBytes(24).toString("base64url");

const { getPool } = await import("../server/database.ts");
const { migrateDatabase } = await import("../server/migrations.ts");
const { registerApiRoutes } = await import("../server/routes.ts");
const { mailOutbox } = await import("../server/mailer.ts");
const { AUTO_BLOCK, describeUserAgent } = await import("../server/trust.ts");
const { pruneUserIpEvents } = await import("../server/workers/userIpRetention.ts");

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
const schema = `casamia_trust_test_${randomUUID().replaceAll("-", "")}`;
let server;
let created = false;

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForMail(to, timeout = 4000) {
  const start = Date.now();
  for (;;) {
    const mail = mailOutbox.find((message) => message.to === to);
    if (mail || Date.now() - start > timeout) return mail;
    await sleep(25);
  }
}
const tokenFrom = (mail) => /#token=([\w-]+)/.exec(mail.text)?.[1];

try {
  await control.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  originalUrl.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = originalUrl.toString();
  await migrateDatabase();
  await migrateDatabase();

  const app = express();
  // Cada "pessoa" do teste chega por um IP diferente, como atrás do proxy da Railway.
  app.set("trust proxy", true);
  app.use(express.json());
  registerApiRoutes(app);
  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  /** Navegador com cookies próprios, num IP escolhido. */
  function agent(ip, userAgent = CHROME_WINDOWS) {
    const jar = new Map();
    return {
      jar,
      ip,
      async call(path, method = "GET", body) {
        const response = await fetch(`${base}/api${path}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": this.ip,
            "User-Agent": userAgent,
            Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        for (const header of response.headers.getSetCookie()) {
          const [pair] = header.split(";");
          const index = pair.indexOf("=");
          const name = pair.slice(0, index);
          const value = pair.slice(index + 1);
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
        return {
          status: response.status,
          data: response.status === 204 ? undefined : await response.json(),
        };
      },
    };
  }
  const query = async (sql, params = []) =>
    (await getPool().query(sql, params)).rows;

  // --- Identificação do navegador ---
  assert.deepEqual(describeUserAgent(CHROME_WINDOWS), { browser: "Chrome", os: "Windows", device: "computador" });
  assert.deepEqual(
    describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"),
    { browser: "Safari", os: "iOS", device: "celular" },
  );
  assert.equal(describeUserAgent("curl/8.4.0").device, "robô");

  // --- Cadastro: aparelho registrado e e-mail pendente ---
  const ana = agent("198.51.100.10");
  const anaEmail = "ana@example.invalid";
  const registered = await ana.call("/auth/register", "POST", { email: anaEmail, password: "senha-segura" });
  assert.equal(registered.status, 201);
  assert.equal(registered.data.user.emailVerified, false);
  const anaDevice = ana.jar.get("casamia_device");
  assert.match(anaDevice, /^[0-9a-f-]{36}$/);
  const [anaRow] = await query("SELECT id, email_verified_at FROM users WHERE email = $1", [anaEmail]);
  assert.equal(anaRow.email_verified_at, null);
  const [device] = await query("SELECT * FROM user_devices WHERE user_id = $1", [anaRow.id]);
  assert.equal(device.device_id, anaDevice);
  assert.equal(device.ua_browser, "Chrome");
  assert.equal(device.ua_os, "Windows");
  const [ipEvent] = await query("SELECT host(ip) AS ip, device_id, user_agent FROM user_ip_events WHERE user_id = $1", [anaRow.id]);
  assert.deepEqual(ipEvent, { ip: "198.51.100.10", device_id: anaDevice, user_agent: CHROME_WINDOWS });
  const [session] = await query("SELECT device_id FROM sessions WHERE user_id = $1", [anaRow.id]);
  assert.equal(session.device_id, anaDevice);

  // Nada abre antes de confirmar; só o bootstrap (para mostrar a tela de confirmação).
  const pendingBootstrap = await ana.call("/bootstrap");
  assert.equal(pendingBootstrap.status, 200);
  assert.equal(pendingBootstrap.data.user.emailVerified, false);
  assert.deepEqual(pendingBootstrap.data.enxovais, []);
  for (const [path, method, body] of [
    ["/profile", "GET"],
    ["/onboarding/complete", "POST", { name: "Casa" }],
    ["/billing/status", "GET"],
  ]) {
    const blocked = await ana.call(path, method, body);
    assert.equal(blocked.status, 403, path);
    assert.equal(blocked.data.code, "EMAIL_NOT_VERIFIED", path);
  }

  // --- Confirmação ---
  const verificationMail = await waitForMail(anaEmail);
  assert.ok(verificationMail, "o e-mail de confirmação deveria ter sido enviado");
  assert.match(verificationMail.subject, /Confirme seu e-mail/);
  const resendTooSoon = await ana.call("/auth/verify-email/resend", "POST");
  assert.equal(resendTooSoon.status, 429);
  const token = tokenFrom(verificationMail);
  assert.ok(token);
  // O link funciona em outro navegador, sem sessão.
  const elsewhere = agent("198.51.100.11");
  assert.equal((await elsewhere.call("/auth/verify-email", "POST", { token })).status, 200);
  assert.equal((await elsewhere.call("/auth/verify-email", "POST", { token })).status, 400);
  const verifiedBootstrap = await ana.call("/bootstrap");
  assert.equal(verifiedBootstrap.data.user.emailVerified, true);
  assert.equal((await ana.call("/profile")).status, 200);
  const resendAfter = await ana.call("/auth/verify-email/resend", "POST");
  assert.deepEqual(resendAfter.data, { ok: true, alreadyVerified: true });

  // --- Bloqueio automático por falhas de login: só na entrada, por tempo limitado ---
  const attacker = agent("198.51.100.66");
  for (let attempt = 0; attempt < AUTO_BLOCK.loginFailures; attempt++) {
    const failed = await attacker.call("/auth/login", "POST", { email: anaEmail, password: "errada" });
    assert.equal(failed.status, 401);
  }
  const blockedLogin = await attacker.call("/auth/login", "POST", { email: anaEmail, password: "senha-segura" });
  assert.equal(blockedLogin.status, 429);
  assert.equal(blockedLogin.data.code, "AUTH_TEMPORARILY_BLOCKED");
  const [autoBan] = await query("SELECT target_type, target_value, scope, created_by, reason_code, expires_at > now() AS active FROM bans");
  assert.deepEqual(autoBan, {
    target_type: "ip",
    target_value: "198.51.100.66",
    scope: "block_auth",
    created_by: "sistema",
    reason_code: "login_failures",
    active: true,
  });
  // Ana, em outra rede, entra normalmente; e quem já está dentro na rede bloqueada continua usando o app.
  assert.equal((await agent("198.51.100.12").call("/auth/login", "POST", { email: anaEmail, password: "senha-segura" })).status, 200);
  ana.ip = "198.51.100.66";
  assert.equal((await ana.call("/profile")).status, 200);
  ana.ip = "198.51.100.10";

  // --- Bloqueio automático por rajada de cadastros ---
  const farm = agent("198.51.100.77");
  for (let index = 0; index < AUTO_BLOCK.signups; index++) {
    const signup = await farm.call("/auth/register", "POST", { email: `robo${index}@example.invalid`, password: "senha-segura" });
    assert.equal(signup.status, 201);
  }
  await sleep(200);
  const burst = await farm.call("/auth/register", "POST", { email: "robo-extra@example.invalid", password: "senha-segura" });
  assert.equal(burst.status, 429);
  assert.equal(burst.data.code, "AUTH_TEMPORARILY_BLOCKED");

  // --- /admin: ficha da conta e bloqueios decididos pela equipe ---
  const admin = agent("192.0.2.1");
  assert.equal((await admin.call("/admin/login", "POST", { login: process.env.ADMIN_LOGIN, password: process.env.ADMIN_PASSWORD })).status, 200);
  const users = (await admin.call("/admin/users")).data.users;
  const anaAdmin = users.find((user) => user.email === anaEmail);
  assert.ok(anaAdmin.emailVerifiedAt);
  // Ana entrou também de um segundo navegador: dois aparelhos, o mais recente primeiro.
  assert.equal(anaAdmin.devices.length, 2);
  assert.equal(anaAdmin.devices.find((entry) => entry.deviceId === anaDevice).browser, "Chrome");
  assert.equal(anaAdmin.activeBan, null);
  const robot = users.find((user) => user.email === "robo0@example.invalid");
  assert.equal(robot.emailVerifiedAt, null);
  assert.ok((await admin.call(`/admin/users/${robot.id}/verify-email`, "POST")).data.emailVerifiedAt);

  // Validação dos alvos.
  assert.equal((await admin.call("/admin/bans", "POST", { targetType: "cidr", targetValue: "10.0.0.0/8", reasonCode: "abuse", durationHours: null })).status, 400);
  assert.equal((await admin.call("/admin/bans", "POST", { targetType: "ip", targetValue: "não é ip", reasonCode: "abuse", durationHours: null })).status, 400);
  assert.equal((await admin.call("/admin/bans", "POST", { targetType: "ip", targetValue: "203.0.113.9", reasonCode: "login_failures", durationHours: null })).status, 400);
  assert.equal((await admin.call("/admin/bans", "POST", { targetType: "ip", targetValue: "203.0.113.9", reasonCode: "abuse", durationHours: 0 })).status, 400);

  // Conta bloqueada: a sessão cai na hora e o login é recusado.
  const userBan = await admin.call("/admin/bans", "POST", { targetType: "user", targetValue: anaRow.id, reasonCode: "fraud", notes: "Teste", durationHours: null });
  assert.equal(userBan.status, 201);
  assert.equal((await ana.call("/profile")).status, 401);
  const bannedLogin = await ana.call("/auth/login", "POST", { email: anaEmail, password: "senha-segura" });
  assert.equal(bannedLogin.status, 403);
  assert.equal(bannedLogin.data.code, "ACCOUNT_BLOCKED");
  assert.equal((await admin.call("/admin/users")).data.users.find((user) => user.email === anaEmail).activeBan.reasonCode, "fraud");
  assert.equal((await admin.call(`/admin/bans/${userBan.data.id}/revoke`, "POST")).status, 204);
  assert.equal((await admin.call(`/admin/bans/${userBan.data.id}/revoke`, "POST")).status, 404);
  assert.equal((await ana.call("/auth/login", "POST", { email: anaEmail, password: "senha-segura" })).status, 200);

  // IP bloqueado pela equipe: a API inteira recusa, inclusive quem já estava dentro.
  const ipBan = await admin.call("/admin/bans", "POST", { targetType: "ip", targetValue: "198.51.100.10", reasonCode: "abuse", durationHours: 24 });
  assert.equal(ipBan.status, 201);
  const ipBlocked = await ana.call("/profile");
  assert.equal(ipBlocked.status, 403);
  assert.equal(ipBlocked.data.code, "ACCOUNT_BLOCKED");
  assert.equal((await admin.call(`/admin/bans/${ipBan.data.id}/revoke`, "POST")).status, 204);
  assert.equal((await ana.call("/profile")).status, 200);

  // Faixa: o endereço é normalizado e vale para qualquer IP dentro dela.
  const rangeBan = await admin.call("/admin/bans", "POST", { targetType: "cidr", targetValue: "203.0.113.77/24", reasonCode: "scraping", durationHours: 1 });
  assert.equal(rangeBan.status, 201);
  const [range] = await query("SELECT target_value FROM bans WHERE id = $1", [rangeBan.data.id]);
  assert.equal(range.target_value, "203.0.113.0/24");
  assert.equal((await agent("203.0.113.200").call("/auth/login", "POST", { email: anaEmail, password: "senha-segura" })).status, 403);

  // Aparelho bloqueado: as sessões dele caem e ele não entra nem de outro IP.
  const deviceBan = await admin.call("/admin/bans", "POST", { targetType: "device", targetValue: anaDevice, reasonCode: "abuse", durationHours: null });
  assert.equal(deviceBan.status, 201);
  assert.equal((await query("SELECT 1 FROM sessions WHERE device_id = $1", [anaDevice])).length, 0);
  ana.ip = "198.51.100.13";
  assert.equal((await ana.call("/auth/login", "POST", { email: anaEmail, password: "senha-segura" })).status, 403);
  // Outro aparelho da mesma pessoa continua entrando.
  assert.equal((await agent("198.51.100.13").call("/auth/login", "POST", { email: anaEmail, password: "senha-segura" })).status, 200);

  const bans = (await admin.call("/admin/bans")).data.bans;
  // Em vigor: os dois automáticos, a faixa e o aparelho (conta e IP foram revogados).
  assert.equal(bans.filter((ban) => ban.active).length, 4);
  assert.equal(bans.filter((ban) => !ban.active).length, 2);
  assert.ok(bans.find((ban) => ban.targetType === "user").targetLabel.includes(anaEmail));
  // Fora do /admin ninguém vê os bloqueios.
  assert.equal((await ana.call("/admin/bans")).status, 401);

  // --- Retenção ---
  await query("INSERT INTO auth_failures (ip, occurred_at) VALUES ('192.0.2.50', now() - interval '2 days')");
  await query(`INSERT INTO bans (id, target_type, target_value, reason_code, created_by, created_at, expires_at)
    VALUES ($1, 'ip', '192.0.2.51', 'abuse', 'gestor-teste', now() - interval '8 months', now() - interval '7 months')`, [randomUUID()]);
  await pruneUserIpEvents();
  assert.equal((await query("SELECT 1 FROM auth_failures WHERE ip = '192.0.2.50'")).length, 0);
  assert.equal((await query("SELECT 1 FROM bans WHERE target_value = '192.0.2.51'")).length, 0);
  assert.equal((await query("SELECT 1 FROM bans WHERE target_value = $1", [anaDevice])).length, 1);

  console.log("trust-db: ok");
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await getPool().end().catch(() => undefined);
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
