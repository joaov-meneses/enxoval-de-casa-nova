// Teste de integração com PostgreSQL real: item novo entra no topo da lista e a imagem do item (envio de arquivo e
// importação por link) é validada, reduzida, convertida para WebP, guardada no banco e servida só a quem participa
// do enxoval. Usa um schema descartável. Rodar: npm run test:item-images-db
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import http from "node:http";
import express from "express";
import pg from "pg";
import sharp from "sharp";
import { getPool } from "../server/database.ts";
import { migrateDatabase } from "../server/migrations.ts";
import { registerApiRoutes } from "../server/routes.ts";
import { processImage } from "../server/services/itemImages.ts";

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
let local;
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
    const result = await who.json("/auth/register", "POST", { email, password: randomBytes(16).toString("base64url") });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result.data.user;
  };
  const upload = (who, enxovalId, body, type) =>
    who.send(`/item-images?enxovalId=${enxovalId}`, { method: "POST", body, type });

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

  // ---- Envio de arquivo -----------------------------------------------------------------------------------
  const big = await sharp({ create: { width: 3000, height: 2000, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 0.5 } } })
    .png()
    .toBuffer();
  const sent = await upload(owner, enxovalId, big, "image/png");
  assert.equal(sent.status, 201, await sent.clone().text());
  const sentBody = await sent.json();
  assert.match(sentBody.imageUrl, /^\/api\/item-images\/[0-9a-f-]{36}$/);
  assert.ok(sentBody.width <= 640 && sentBody.height <= 640, "a imagem é reduzida para no máximo 640 px");
  assert.equal(sentBody.width, 640);
  assert.equal(sentBody.height, 427, "mantém a proporção");

  const served = await owner.send(sentBody.imageUrl.replace("/api", ""));
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("content-type"), "image/webp");
  assert.equal(served.headers.get("x-content-type-options"), "nosniff");
  assert.match(served.headers.get("cache-control"), /immutable/);
  const servedBuffer = Buffer.from(await served.arrayBuffer());
  const servedMeta = await sharp(servedBuffer).metadata();
  assert.equal(servedMeta.format, "webp", "o arquivo guardado é WebP de verdade");
  assert.ok(servedBuffer.length < 100_000, `imagem leve (${servedBuffer.length} bytes)`);
  assert.equal((await sharp(servedBuffer).metadata()).hasAlpha, false, "transparência vira fundo branco");
  const etag = served.headers.get("etag");
  assert.equal((await fetch(`${base}${sentBody.imageUrl}`, { headers: { "If-None-Match": etag, Cookie: "" } })).status, 401);

  // Reenviar a mesma imagem reaproveita o registro.
  const again = await (await upload(owner, enxovalId, big, "image/png")).json();
  assert.equal(again.imageUrl, sentBody.imageUrl, "a mesma imagem não é guardada duas vezes");
  assert.equal((await query("SELECT count(*)::int AS n FROM item_images"))[0].n, 1);

  // Quem não participa do enxoval não envia nem vê.
  const stranger = person();
  await register(stranger, "intrusa@example.invalid");
  assert.equal((await stranger.send(sentBody.imageUrl.replace("/api", ""))).status, 404, "outro usuário não vê a imagem");
  assert.equal((await upload(stranger, enxovalId, big, "image/png")).status, 404, "outro usuário não envia imagem ao enxoval");
  assert.equal((await person().send(sentBody.imageUrl.replace("/api", ""))).status, 401, "sem login não vê a imagem");

  // Foto de celular: a rotação do EXIF é aplicada (400x200 marcada como "girada" vira 200x400).
  const rotated = await sharp({ create: { width: 400, height: 200, channels: 3, background: "#336699" } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const rotatedBody = await (await upload(owner, enxovalId, rotated, "image/jpeg")).json();
  assert.deepEqual([rotatedBody.width, rotatedBody.height], [200, 400], "a orientação da foto é respeitada");

  // ---- Recusas --------------------------------------------------------------------------------------------
  const notImage = await upload(owner, enxovalId, Buffer.from("isto não é uma imagem, só texto"), "image/png");
  assert.equal(notImage.status, 422, "conteúdo que não é imagem é recusado mesmo com tipo image/png");
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>alert(1)</script></svg>');
  assert.equal((await upload(owner, enxovalId, svg, "image/svg+xml")).status, 415, "SVG é recusado");
  const tiny = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).png().toBuffer();
  assert.equal((await upload(owner, enxovalId, tiny, "image/png")).status, 422, "imagem minúscula é recusada");
  assert.equal((await upload(owner, enxovalId, Buffer.alloc(0), "image/png")).status, 400, "arquivo vazio é recusado");
  await assert.rejects(processImage(Buffer.alloc(9 * 1024 * 1024, 1)), /8 MB|Não foi possível/, "arquivo acima do limite é recusado");
  const wrongType = await owner.send(`/item-images?enxovalId=${enxovalId}`, { method: "POST", body: {}, type: "application/json" });
  assert.equal(wrongType.status, 415, "sem corpo de imagem o envio é recusado");

  // ---- Importação por link --------------------------------------------------------------------------------
  const invalidLink = await owner.json("/item-images/from-url", "POST", { enxovalId, url: "isso-nao-e-link" });
  assert.equal(invalidLink.status, 400);
  // O servidor local do teste serve uma imagem; mesmo assim o endereço de rede interna é barrado (SSRF).
  local = await new Promise((resolve) => {
    const instance = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(big);
    });
    instance.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const internal = await owner.json("/item-images/from-url", "POST", { enxovalId, url: `http://127.0.0.1:${local.address().port}/foto.png` });
  assert.equal(internal.status, 400, JSON.stringify(internal.data));
  assert.match(internal.data.error, /não pode ser usado/);
  for (const url of ["http://localhost/x.png", "http://169.254.169.254/latest/meta-data", "http://[::1]/x.png", "http://10.0.0.5/x.png", "file:///etc/passwd", "ftp://exemplo.com/x.png"]) {
    const blocked = await owner.json("/item-images/from-url", "POST", { enxovalId, url });
    assert.equal(blocked.status, 400, `${url} deveria ser recusado: ${JSON.stringify(blocked.data)}`);
  }

  // ---- Imagem no item -------------------------------------------------------------------------------------
  const withImage = await add("Com imagem", { imageUrl: sentBody.imageUrl });
  assert.equal(withImage.imageUrl, sentBody.imageUrl, "o item guarda o endereço interno da imagem");

  // Imagem de outro enxoval não pode ser usada.
  const otherOwner = person();
  const otherUser = await register(otherOwner, "outra@example.invalid");
  await query("UPDATE users SET plan = 'pass' WHERE id = $1", [otherUser.id]);
  const other = await otherOwner.json("/enxovais", "POST", { name: "Outra casa", useDefaultTemplate: false });
  const foreignImage = await (await upload(otherOwner, other.data.enxoval.id, big.subarray(0, big.length), "image/png")).json();
  assert.notEqual(foreignImage.imageUrl, sentBody.imageUrl);
  const stolen = await add("Roubando", { imageUrl: foreignImage.imageUrl });
  assert.equal(stolen.imageUrl, null, "imagem de outro enxoval é descartada");
  const patchedStolen = await owner.json(`/items/${stolen.id}`, "PATCH", { imageUrl: foreignImage.imageUrl });
  assert.equal(patchedStolen.data.imageUrl, null);

  // Link externo que não dá para baixar: o item é salvo mesmo assim, com o endereço original.
  const external = await add("Foto da loja", { imageUrl: "https://img.loja-inexistente.invalid/foto.jpg" });
  assert.equal(external.imageUrl, "https://img.loja-inexistente.invalid/foto.jpg", "sem como baixar, mantém o endereço original");

  // Trocar e remover pela edição.
  const edited = await owner.json(`/items/${external.id}`, "PATCH", { imageUrl: sentBody.imageUrl });
  assert.equal(edited.data.imageUrl, sentBody.imageUrl);
  const removed = await owner.json(`/items/${external.id}`, "PATCH", { imageUrl: null });
  assert.equal(removed.data.imageUrl, null);

  // Limpeza: imagem que nenhum item usa mais sai do banco (as recém-enviadas têm uma hora de carência).
  await query("UPDATE item_images SET created_at = now() - interval '3 hours'");
  assert.equal((await owner.json(`/items/${withImage.id}`, "DELETE")).status, 204);
  const remaining = await query("SELECT id FROM item_images WHERE enxoval_id = $1", [enxovalId]);
  assert.ok(!remaining.some((row) => sentBody.imageUrl.endsWith(row.id)), "a imagem sem uso foi removida");
  const rotatedStillThere = remaining.some((row) => rotatedBody.imageUrl.endsWith(row.id));
  assert.equal(rotatedStillThere, false, "outra imagem antiga e sem uso também sai");

  // Apagar o enxoval leva as imagens junto.
  const beforeDelete = (await query("SELECT count(*)::int AS n FROM item_images WHERE enxoval_id = $1", [other.data.enxoval.id]))[0].n;
  assert.equal(beforeDelete, 1);
  await query("DELETE FROM enxovais WHERE id = $1", [other.data.enxoval.id]);
  assert.equal((await query("SELECT count(*)::int AS n FROM item_images WHERE enxoval_id = $1", [other.data.enxoval.id]))[0].n, 0);

  console.log("PASS: item novo vai para o topo; imagens são validadas, reduzidas para WebP, guardadas no banco, protegidas por enxoval e limpas quando sem uso.");
} finally {
  if (local) await new Promise((resolve) => local.close(resolve));
  if (server)
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
