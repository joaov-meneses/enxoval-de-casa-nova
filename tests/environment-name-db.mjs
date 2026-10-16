// Teste de integração com PostgreSQL real: nome do ambiente (até 100 caracteres contando os espaços, sempre em
// uma linha). Usa um schema descartável. Rodar: npm run test:environment-name-db
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import { getPool } from "../server/database.ts";
import { migrateDatabase } from "../server/migrations.ts";
import { registerApiRoutes } from "../server/routes.ts";
import {
  MAX_ENVIRONMENT_NAME_LENGTH,
  normalizeEnvironmentName,
  sanitizeEnvironmentNameInput,
} from "../src/data.ts";

assert.equal(MAX_ENVIRONMENT_NAME_LENGTH, 100);
assert.equal(normalizeEnvironmentName("  Sala\n  de   estar\t"), "Sala de estar");
assert.equal(normalizeEnvironmentName("\n\t "), "");
assert.equal(sanitizeEnvironmentNameInput("Sala\nde estar "), "Sala de estar ", "ao digitar, o espaço final fica");
assert.equal(sanitizeEnvironmentNameInput("a".repeat(150)).length, 100);

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
const schema = `casamia_env_name_test_${randomUUID().replaceAll("-", "")}`;
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
    return { status: response.status, data: response.status === 204 ? undefined : await response.json() };
  };

  const registered = await call("/auth/register", "POST", {
    email: "ambiente@example.invalid",
    password: randomBytes(16).toString("base64url"),
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  // Conta paga: este teste cobre nomes de ambiente, não as travas do plano gratuito (tests/freemium-db.mjs).
  await getPool().query("UPDATE users SET plan = 'monthly' WHERE id = $1", [registered.data.user.id]);
  const workspace = await call("/enxovais", "POST", { name: "Casa", useDefaultTemplate: false });
  assert.equal(workspace.status, 201, JSON.stringify(workspace.data));
  const enxovalId = workspace.data.enxoval.id;
  const createEnvironment = (name) => call("/categories", "POST", { enxovalId, name });

  // Exatamente 100 caracteres (com espaços) passa; 101 não.
  const hundred = `${"Sala de estar ".repeat(8)}`.trim().padEnd(100, "x").slice(0, 100);
  assert.equal(hundred.length, 100);
  const ok = await createEnvironment(hundred);
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.equal(ok.data.name, hundred, "o nome volta inteiro, sem cortes");
  const tooLong = await createEnvironment(`${hundred}y`);
  assert.equal(tooLong.status, 400);
  assert.match(tooLong.data.error, /100 caracteres/);
  console.log("PASS: 100 caracteres cabem inteiros e 101 são recusados.");

  // Uma linha só: Enter, tabulação e espaços repetidos viram um espaço, antes de contar.
  const multiline = await createEnvironment("  Sala\n de   estar\t extra ");
  assert.equal(multiline.status, 201, JSON.stringify(multiline.data));
  assert.equal(multiline.data.name, "Sala de estar extra");
  const spaced = await createEnvironment(`${"a   ".repeat(30)}b`);
  assert.equal(spaced.status, 201, "os espaços repetidos não contam duas vezes depois de normalizados");
  for (const blank of ["", "   ", "\n\n", "\t"]) {
    assert.equal((await createEnvironment(blank)).status, 400, JSON.stringify(blank));
  }
  assert.equal((await createEnvironment(123)).status, 400);
  console.log("PASS: quebras de linha e espaços repetidos viram um espaço; vazio é recusado.");

  // Renomear segue a mesma regra.
  const renamed = await call(`/categories/${ok.data.id}`, "PATCH", { enxovalId, name: "Quarto\nde\nhóspedes" });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
  assert.equal(renamed.data.name, "Quarto de hóspedes");
  assert.equal((await call(`/categories/${ok.data.id}`, "PATCH", { enxovalId, name: "z".repeat(101) })).status, 400);

  // Criar um item em um ambiente novo também normaliza o nome do ambiente.
  const item = await call("/items", "POST", { enxovalId, name: "Mesa", categoryName: "  Home\n Office  " });
  assert.equal(item.status, 201, JSON.stringify(item.data));
  assert.equal(item.data.category.name, "Home Office");
  const rows = (await getPool().query("SELECT name FROM categories WHERE enxoval_id = $1", [enxovalId])).rows;
  assert.ok(rows.every((row) => !/[\n\r\t]|\s{2}/.test(row.name)), "nada com quebra de linha ou espaço duplo no banco");
  console.log("PASS: renomear e criar item seguem a mesma regra.");
} finally {
  if (server)
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
