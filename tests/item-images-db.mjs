// Integração com PostgreSQL em schema descartável: remoção das imagens dos itens.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import { getPool } from "../server/database.ts";
import { migrateDatabase } from "../server/migrations.ts";
import { registerApiRoutes } from "../server/routes.ts";

if (!process.env.DATABASE_URL)
  throw new Error("Configure DATABASE_URL para o teste PostgreSQL.");
const originalUrl = new URL(process.env.DATABASE_URL);
const sslMode = originalUrl.searchParams.get("sslmode");
const ssl =
  process.env.DATABASE_SSL === "true" ||
  (process.env.DATABASE_SSL !== "false" && ["require", "verify-full"].includes(sslMode));
const control = new pg.Pool({
  connectionString: originalUrl.toString(),
  ssl: ssl ? { rejectUnauthorized: false } : undefined,
});
const schema = `casamia_item_images_test_${randomUUID().replaceAll("-", "")}`;
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
  app.use(express.json({ limit: "1mb" }));
  registerApiRoutes(app);
  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const query = async (sql, params = []) => (await getPool().query(sql, params)).rows;

  const person = () => {
    let cookie = "";
    const send = async (path, { method = "GET", body, type = "application/json" } = {}) => {
      const response = await fetch(`${base}/api${path}`, {
        method,
        headers: { "Content-Type": type, Cookie: cookie },
        body: body === undefined ? undefined : type === "application/json" ? JSON.stringify(body) : body,
      });
      const setCookie = response.headers.getSetCookie().find((value) => value.startsWith("enxoval_session="));
      if (setCookie) cookie = setCookie.split(";")[0];
      return response;
    };
    const json = async (path, method = "GET", body) => {
      const response = await send(path, { method, body });
      return { status: response.status, data: response.status === 204 ? undefined : await response.json() };
    };
    return { send, json };
  };
  const register = async (who, email) => {
    who.password = randomBytes(16).toString("base64url");
    const result = await who.json("/auth/register", "POST", { email, password: who.password });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result.data.user;
  };
  const owner = person();
  const ownerUser = await register(owner, "dona@example.invalid");
  await query("UPDATE users SET plan = 'pass' WHERE id = $1", [ownerUser.id]);
  const created1 = await owner.json("/enxovais", "POST", { name: "Casa", useDefaultTemplate: false });
  assert.equal(created1.status, 201, JSON.stringify(created1.data));
  const enxovalId = created1.data.enxoval.id;

  // ---- Item novo vai para o topo --------------------------------------------------------------------------
  const add = async (name, extra = {}) => {
    const result = await owner.json("/items", "POST", { enxovalId, name, categoryName: "Sala", ...extra });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result.data.item;
  };
  const listNames = async () => (await owner.json(`/bootstrap?enxovalId=${enxovalId}`)).data.items.map((item) => item.name);
  await add("Primeiro");
  await add("Segundo");
  await add("Terceiro");
  assert.deepEqual(await listNames(), ["Terceiro", "Segundo", "Primeiro"], "o item mais novo fica no topo do ambiente");
  await add("Da planilha", { placement: "end" });
  assert.equal((await listNames()).at(-1), "Da planilha", "a importação de planilha adiciona no fim e mantém a ordem das linhas");
  await add("Mais novo");
  assert.equal((await listNames())[0], "Mais novo", "depois da importação o novo continua indo para o topo");

  // Clientes antigos não conseguem reintroduzir imagens no cadastro ou na edição.
  const item = await add("Sem imagem", { imageUrl: "https://example.invalid/image.jpg" });
  assert.ok(!Object.hasOwn(item, "imageUrl"));
  const edited = await owner.json(`/items/${item.id}`, "PATCH", { name: "Item editado", imageUrl: "/api/item-images/old" });
  assert.equal(edited.status, 200);
  assert.ok(!Object.hasOwn(edited.data, "imageUrl"));
  const bootstrap = await owner.json(`/bootstrap?enxovalId=${enxovalId}`);
  assert.ok(bootstrap.data.items.every((entry) => !Object.hasOwn(entry, "imageUrl")));

  for (const [path, method, body] of [
    [`/item-images?enxovalId=${enxovalId}`, "POST", {}],
    ["/item-images/from-url", "POST", { enxovalId, url: "https://example.invalid/image.jpg" }],
    [`/item-images/${randomUUID()}`, "GET", undefined],
  ]) {
    assert.equal((await owner.send(path, { method, body })).status, 404);
  }

  const assertNoImageStorage = async () => {
    assert.equal((await query("SELECT to_regclass('item_images') AS name"))[0].name, null);
    assert.deepEqual(await query(`SELECT table_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name IN ('items', 'tracked_products') AND column_name = 'image_url'`), []);
  };
  await assertNoImageStorage();

  // Simula o esquema antigo com dados para verificar a limpeza e a repetição segura da migração.
  await query("ALTER TABLE items ADD COLUMN image_url text");
  await query("ALTER TABLE tracked_products ADD COLUMN image_url text");
  await query("UPDATE items SET image_url = 'https://example.invalid/old.jpg'");
  await query("CREATE TABLE item_images (id uuid PRIMARY KEY, data bytea NOT NULL)");
  await query("INSERT INTO item_images VALUES ($1, $2)", [randomUUID(), Buffer.from("old image")]);
  await migrateDatabase();
  await assertNoImageStorage();
  await migrateDatabase();
  await assertNoImageStorage();
  assert.equal((await query("SELECT name FROM items WHERE id = $1", [item.id]))[0].name, "Item editado");
  const login = await person().json("/auth/login", "POST", { email: "dona@example.invalid", password: owner.password });
  assert.equal(login.status, 200, "login carrega o enxoval após remover as imagens");
  assert.ok(login.data.items.some((entry) => entry.id === item.id));
  assert.ok(login.data.items.every((entry) => !Object.hasOwn(entry, "imageUrl")));
  assert.equal((await owner.send(`/items/${item.id}`, { method: "DELETE" })).status, 204);

  console.log("PASS: imagens removidas do contrato, rotas e banco; migração limpa dados antigos, preserva itens e pode ser repetida.");
} finally {
  if (server)
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
