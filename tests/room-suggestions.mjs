// Sugestões do ambiente: sem repetir item com outro nome, mover em vez de duplicar e rodar sugestões. Rodar: npm run test:room-suggestions
import assert from "node:assert/strict";
import test from "node:test";
import { isSameItem, pickPage, roomMoves, roomSuggestions } from "../src/listInsights.ts";

test("reconhece o mesmo item com outro nome", () => {
  assert.ok(isSameItem("Microondas", "Micro-ondas"));
  assert.ok(isSameItem("Micro ondas 30L", "Micro-ondas"));
  assert.ok(isSameItem("Geladeira Frost Free 375L", "Geladeira"));
  assert.ok(isSameItem("Cafeteiras", "Cafeteira"));
  assert.ok(!isSameItem("Panela", "Panela elétrica de arroz"));
});

test("não sugere o que já existe, mesmo escrito diferente ou em outro ambiente", () => {
  const items = [{ name: "Microondas" }, { name: "Cafeteira elétrica" }];
  const names = roomSuggestions("Eletro Cozinha", items).map((s) => s.name);
  assert.ok(!names.some((n) => /micro/i.test(n)));
  assert.ok(!names.includes("Cafeteira"));
});

test("sugere mover item de ambiente irmão em vez de adicionar de novo", () => {
  const categories = [
    { id: "c1", name: "Cozinha" },
    { id: "c2", name: "Eletro Cozinha" },
  ];
  const items = [{ id: "i1", name: "Cafeteira", categoryId: "c1" }];
  const moves = roomMoves(categories[1], items, categories);
  assert.deepEqual(moves.map((m) => [m.itemId, m.fromCategoryId]), [["i1", "c1"]]);
  assert.ok(!roomSuggestions("Eletro Cozinha", items).some((s) => s.name === "Cafeteira"));
  assert.deepEqual(roomMoves(categories[0], items, categories), []);
});

test("pickPage gira o conjunto sem repetir dentro da página", () => {
  const pool = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(pickPage(pool, 0), [1, 2, 3, 4]);
  assert.deepEqual(pickPage(pool, 1), [5, 6, 1, 2]);
  assert.deepEqual(pickPage([1, 2], 3), [1, 2]);
});
