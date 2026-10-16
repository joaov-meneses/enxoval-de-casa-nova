// Testes sem banco do catálogo mestre: normalização, similaridade, semente e uso no planejamento.
// Rodar: npm run test:catalog
import assert from "node:assert/strict";
import test from "node:test";
import { compactKey, foldText, itemKey, normalizeText, singular, slugify, trigrams, trigramSimilarity } from "../src/catalog/normalize.ts";
import { categoryForRoom } from "../src/catalog/rooms.ts";
import { planPurchases } from "../src/planning/purchasePlan.ts";
import { CATALOG_SEED_VERSION, KNOWN_FUNCTION_GROUPS, seedItems } from "../server/catalog/seed.ts";
import { ALL_PROFILE_BUCKETS, bucketState, profileBucket } from "../server/services/jev.ts";

const similarity = (a, b) => trigramSimilarity(trigrams(itemKey(a)), trigrams(itemKey(b)));

test("foldText e normalizeText", () => {
  assert.equal(foldText("  Geladeira   Frost  Free "), "geladeira frost free");
  assert.equal(foldText("Fogão"), "fogao");
  assert.equal(normalizeText("Situação (atual)!"), "situacao atual");
});

test("singular cobre as terminações regulares", () => {
  for (const [plural, one] of [
    ["travesseiros", "travesseiro"],
    ["colchoes", "colchao"],
    ["lencois", "lencol"],
    ["papeis", "papel"],
    ["varais", "varal"],
    ["talheres", "talher"],
    ["luzes", "luz"],
    ["jardins", "jardim"],
    ["cabides", "cabide"],
    ["tenis", "tenis"],
  ]) assert.equal(singular(plural), one, plural);
});

test("itemKey é a identidade do item", () => {
  assert.equal(itemKey("Travesseiros"), itemKey("travesseiro de casal"));
  assert.equal(itemKey("Air Fryer Mondial 4L Preta 127V"), "air fryer");
  assert.equal(itemKey("Airfryer 5 litros"), "airfryer");
  assert.equal(itemKey("Geladeira 2 portas"), "geladeira");
  assert.equal(itemKey("Talheres (garfo, faca e colher)"), "talher");
  // "porta" só sai quando é unidade depois de um número.
  assert.equal(itemKey("Porta-toalhas"), "porta toalha");
  // Conservadora: o que tem outro uso continua diferente.
  assert.notEqual(itemKey("Panela"), itemKey("Panela de pressão"));
  assert.notEqual(itemKey("Jogo de cama"), itemKey("Cama"));
  assert.equal(itemKey("de para com"), "");
  assert.equal(compactKey(itemKey("air fryer")), compactKey(itemKey("airfryer")));
  assert.equal(slugify("Jogo de Cama"), "jogo-cama");
});

test("similaridade de trigramas separa variação de outro item", () => {
  assert.ok(similarity("Toalhas de banho", "Toalha banho") === 1);
  assert.ok(similarity("Liquidificadr", "Liquidificador") >= 0.6, "erro de digitação fica perto");
  const doubt = similarity("Panela", "Panela de pressão");
  assert.ok(doubt >= 0.4 && doubt < 0.8, `panela × panela de pressão cai na faixa de dúvida (${doubt})`);
  assert.ok(similarity("Geladeira", "Sofá") < 0.1);
});

test("semente: sem chaves repetidas, com apelidos e grupos de função", () => {
  assert.ok(CATALOG_SEED_VERSION >= 1);
  const items = seedItems();
  assert.ok(items.length >= 450, `semente com ${items.length} itens`);
  const keys = items.map((item) => itemKey(item.name));
  assert.equal(new Set(keys).size, keys.length, "cada item tem uma chave só");
  assert.ok(keys.every(Boolean));
  const byName = Object.fromEntries(items.map((item) => [item.name, item]));
  assert.equal(byName["Air fryer"].functionGroup, "fritura-sem-oleo");
  assert.equal(byName["Fritadeira elétrica"].functionGroup, "fritura-sem-oleo");
  assert.ok(byName["Air fryer"].aliases.includes("airfryer"));
  // Nomes do funil com a mesma chave viram apelido do primeiro.
  assert.ok(byName["Travesseiros"].aliases.includes("Travesseiro"));
  assert.equal(byName["Cama (estrutura ou box)"].leadTimeWeeks, 3);
  assert.equal(byName["Cama (estrutura ou box)"].timing, "first_night");
  assert.equal(byName["Geladeira"].priority, "essential");
  for (const group of KNOWN_FUNCTION_GROUPS) {
    assert.ok(items.filter((item) => item.functionGroup === group).length >= 2, `grupo ${group} tem ao menos dois itens`);
  }
});

test("faixa de perfil: moradia × clima × situação", () => {
  assert.equal(ALL_PROFILE_BUCKETS.length, 27);
  assert.equal(profileBucket({ housing: "casa", moment: "amigos", uf: "RS" }), "casa|cold|outros");
  assert.equal(profileBucket({ housing: "loft", moment: "casal", uf: "BA" }), "apartamento|hot|casal");
  assert.deepEqual(bucketState("studio|mild|solo"), { moradia: "studio", clima: "ameno", situacao: "pessoa morando sozinha" });
});

test("ambiente do enxoval para um cômodo do catálogo", () => {
  const categories = [{ name: "Cozinha" }, { name: "Eletro Cozinha" }, { name: "Quarto" }, { name: "Sala de Estar" }];
  assert.equal(categoryForRoom(categories, "eletro")?.name, "Eletro Cozinha");
  assert.equal(categoryForRoom(categories, "cozinha")?.name, "Cozinha");
  assert.equal(categoryForRoom([{ name: "Cozinha" }], "eletro")?.name, "Cozinha");
  assert.equal(categoryForRoom(categories, "sala")?.name, "Sala de Estar");
  assert.equal(categoryForRoom(categories, "banheiro"), undefined);
  assert.equal(categoryForRoom(categories, null), undefined);
});

test("planejamento usa o catálogo mestre e antecipa a compra pelo prazo de entrega", () => {
  const base = { status: "needed", priceCents: null, discountCents: 0, category: "Quarto" };
  const plan = planPurchases(
    [
      // Sem catálogo: primeira noite, uma semana antes.
      { ...base, id: "a", name: "Coisa nova", timing: "first_night" },
      // Mesmo item com 3 semanas de entrega: compra 4 semanas antes da mudança.
      { ...base, id: "b", name: "Coisa nova 2", catalog: { priceCategory: 4, priority: "essential", timing: "first_night", leadTimeWeeks: 3 } },
      // Sem dados no item, as estimativas do catálogo valem.
      { ...base, id: "c", name: "Outra coisa", catalog: { priceCategory: 1, priority: "essential", timing: null, leadTimeWeeks: 0 } },
    ],
    "equilibrado",
  );
  assert.equal(plan.get("a").week, -1);
  assert.equal(plan.get("b").week, -4);
  assert.match(plan.get("b").reason, /3 semanas/);
  assert.equal(plan.get("c").week, -2, "essencial de valor baixo: perto da mudança");
});
