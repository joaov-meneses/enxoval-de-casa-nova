// Testes unitários da normalização, da similaridade e do aparo de preços do catálogo compartilhado.
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeName, similarity } from "../src/catalog/normalize.ts";
import { trimOutliers } from "../server/catalog.ts";

test("normalizeName ignora acento, caixa, plural, palavras vazias e qualificadores", () => {
  assert.equal(normalizeName("Jogo de Panelas"), normalizeName("jogo  de panela"));
  assert.equal(normalizeName("Jogo de cama de casal"), normalizeName("Jogo de cama de solteiro"));
  assert.equal(normalizeName("Airfryer 5L"), "airfryer");
  assert.equal(normalizeName("Liquidificador 110V"), "liquidificador");
  assert.equal(normalizeName("Colchão"), normalizeName("colchoes"));
  assert.equal(normalizeName("Cama (estrutura ou box)"), "cama");
  assert.equal(normalizeName("Talheres (garfo, faca e colher)"), "talher");
  assert.equal(normalizeName("de da do"), "", "só palavras vazias não vira chave");
});

test("itens de uso diferente continuam diferentes", () => {
  assert.notEqual(normalizeName("Panela"), normalizeName("Panela de pressão"));
  assert.notEqual(normalizeName("Forno elétrico"), normalizeName("Micro-ondas"));
});

test("similaridade: nome igual vale 1, parecido passa de 0,8 e a panela de pressão fica na faixa de dúvida", () => {
  assert.equal(similarity("geladeira", "geladeira"), 1);
  assert.ok(similarity(normalizeName("Cortina blackout"), normalizeName("Cortina blackoutt")) >= 0.8, "erro de digitação em palavra longa");
  assert.ok(similarity("torradeira", "torradera") >= 0.5, "erro de digitação continua próximo");
  const doubt = similarity(normalizeName("Panela"), normalizeName("Panela de pressão"));
  assert.ok(doubt >= 0.4 && doubt < 0.8, `panela x panela de pressão = ${doubt}`);
  assert.ok(similarity("geladeira", "sofa") < 0.4);
  assert.equal(similarity("", ""), 0);
});

test("trimOutliers apara valores fora da faixa interquartil", () => {
  assert.deepEqual(trimOutliers([100, 110, 120, 130, 140, 150, 9_999_999]), [100, 110, 120, 130, 140, 150]);
  assert.deepEqual(trimOutliers([5, 6, 7]), [5, 6, 7], "poucos valores ficam como estão");
});
