// Teste do cache compartilhado (Redis opcional, L3 da Fase 6). Precisa de um Redis: npm run redis:up e
// REDIS_URL="redis://localhost:6380". Usa um prefixo de chaves próprio e apaga tudo o que criou.
// Rodar: npm run test:shared-cache
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "redis";

const url = process.env.REDIS_URL?.trim();
if (!url) throw new Error('Configure REDIS_URL para o teste do cache compartilhado (ex.: "redis://localhost:6380" com npm run redis:up).');

const prefix = `casamia-test-${randomUUID()}:`;
const admin = createClient({ url });
await admin.connect();

const { closeSharedCache, publish, sharedGet, sharedIncrement, sharedSet, subscribe } = await import("../server/cache/shared.ts");
const { chooseSameItem, setJevTransportForTests } = await import("../server/services/jev.ts");

try {
  // 1. Sem REDIS_URL, tudo responde "não sei" na hora e o app segue por processo.
  delete process.env.REDIS_URL;
  const started = Date.now();
  assert.equal(await sharedGet("qualquer"), null);
  assert.equal(await sharedIncrement("qualquer", 60), null);
  assert.equal(await sharedSet("qualquer", "x", 60), false);
  assert.ok(Date.now() - started < 50, "sem Redis, nenhuma espera");
  console.log("PASS: sem REDIS_URL o cache compartilhado fica desligado, sem custo.");

  // 2. Com Redis: leitura, gravação com prazo e contador que vence sozinho.
  process.env.REDIS_URL = url;
  process.env.REDIS_KEY_PREFIX = prefix;
  assert.equal(await sharedSet("chave", "valor", 60), true);
  assert.equal(await sharedGet("chave"), "valor");
  assert.ok((await admin.ttl(`${prefix}chave`)) > 0, "a chave vence sozinha");
  assert.equal(await sharedIncrement("contador", 60), 1);
  assert.equal(await sharedIncrement("contador", 60), 2);
  assert.ok((await admin.ttl(`${prefix}contador`)) > 0);
  console.log("PASS: leitura, gravação e contador com prazo.");

  // 3. Respostas do Jev: a mesma pergunta não é paga duas vezes, nem por outra instância (aqui, a memória do processo
  // é zerada entre uma chamada e outra, como numa instância nova).
  process.env.JEV_DAILY_LIMIT = "3";
  let calls = 0;
  const fake = {
    async systemOne() {
      calls += 1;
      return { answers: { mesmo_item: { type: "choice", choice: "Garrafa térmica", confidence: 0.9 } } };
    },
  };
  setJevTransportForTests(fake);
  assert.deepEqual(await chooseSameItem("Jarra térmica", ["Garrafa térmica", "Jarra de suco"]), { name: "Garrafa térmica", confidence: 0.9 });
  setJevTransportForTests(fake); // zera o cache e o teto do processo
  assert.deepEqual(await chooseSameItem("Jarra térmica", ["Garrafa térmica", "Jarra de suco"]), { name: "Garrafa térmica", confidence: 0.9 });
  assert.equal(calls, 1, "a segunda instância leu a resposta do Redis");
  const answerKeys = await admin.keys(`${prefix}jev:answer:*`);
  assert.equal(answerKeys.length, 1);
  assert.ok((await admin.ttl(answerKeys[0])) > 0);
  console.log("PASS: a resposta do Jev fica no Redis e serve às outras instâncias.");

  // 4. Teto diário somado entre instâncias: com limite 3, a quarta pergunta nova é recusada mesmo num processo novo.
  await chooseSameItem("Garrafinha", ["Garrafa térmica"]);
  setJevTransportForTests(fake);
  await chooseSameItem("Garrafão", ["Garrafa térmica"]);
  setJevTransportForTests(fake);
  assert.equal(calls, 3);
  assert.equal(await chooseSameItem("Cantil", ["Garrafa térmica"]), null, "teto atingido entre instâncias");
  assert.equal(calls, 3, "a chamada além do teto não sai");
  console.log("PASS: o teto diário do Jev vale para todas as instâncias juntas.");

  // 5. Avisos entre instâncias (usado para descartar o índice do catálogo em memória).
  const received = new Promise((resolve) => subscribe("canal", resolve));
  await new Promise((resolve) => setTimeout(resolve, 200));
  await publish("canal", "catalogo-mudou");
  assert.equal(await Promise.race([received, new Promise((resolve) => setTimeout(() => resolve("tempo esgotado"), 2000))]), "catalogo-mudou");
  console.log("PASS: um aviso publicado chega a quem assina o canal.");

  // 6. Redis fora do ar: nada trava; depois de uma falha, as próximas chamadas nem tentam por um tempo.
  await closeSharedCache();
  process.env.REDIS_URL = "redis://127.0.0.1:1";
  const before = Date.now();
  assert.equal(await sharedGet("chave"), null);
  const firstFailure = Date.now() - before;
  assert.ok(firstFailure < 3000, `a primeira tentativa desiste rápido (${firstFailure} ms)`);
  const again = Date.now();
  assert.equal(await sharedGet("chave"), null);
  assert.ok(Date.now() - again < 50, "e as seguintes nem tentam");
  console.log("PASS: com o Redis fora do ar, o app segue sem esperar.");
} finally {
  await closeSharedCache();
  setJevTransportForTests(undefined);
  const leftovers = await admin.keys(`${prefix}*`);
  if (leftovers.length > 0) await admin.del(leftovers);
  await admin.quit();
}
