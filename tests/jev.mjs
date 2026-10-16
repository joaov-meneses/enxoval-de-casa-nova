// Testes da integração com o Jev usando um cliente falso (sem rede e sem chave). Rodar: npm run test:jev
import assert from "node:assert/strict";
import test from "node:test";
import {
  JEV_THRESHOLDS,
  assessItem,
  candidatesFor,
  isJevConfigured,
  prioritizeItems,
  recommendNext,
  setJevTransportForTests,
  urgencyKey,
} from "../server/services/jev.ts";
import { URGENCY_LEVELS, URGENCY_RUBRIC_VERSION, URGENCY_SCALE, urgencyLabel } from "../src/planning/purchaseUrgency.ts";

const profile = {
  housing: "apartamento",
  moment: "casal",
  people: 2,
  uf: "SP",
  city: null,
  spendingTier: "equilibrado",
  weeksToMove: 6,
};

/** Cliente falso: registra as chamadas e responde com a função informada. */
function fake(respond) {
  const calls = [];
  return {
    calls,
    async systemOne(request) {
      calls.push(request);
      return respond(request, calls.length);
    },
  };
}

const environments = ["Cozinha", "Quarto", "Banheiro"];
const existing = [
  { name: "Airfryer", environment: "Cozinha" },
  { name: "Cama de casal", environment: "Quarto" },
];

test("sem chave do Jev nada é chamado e tudo volta vazio", async () => {
  setJevTransportForTests(null);
  assert.equal(isJevConfigured(), false);
  assert.equal(await assessItem({ name: "Torradeira", environments, classify: true, existing, profile }), null);
  assert.equal(await recommendNext({ environment: "Cozinha", existing: [], candidates: [{ name: "Panela", essential: true, firstNight: false }], profile }), null);
  assert.equal(await prioritizeItems({ items: [{ id: "1", name: "Sofá", environment: "Sala" }], profile }), null);
});

test("assessItem: uma chamada traz ambiente e redundância quando a confiança passa do limiar", async () => {
  const jev = fake(() => ({
    answers: {
      ambiente: { type: "choice", choice: "Cozinha", confidence: 0.9, probabilities: {} },
      redundante: { type: "noul", noul: 0.63 },
      sobreposicao: { type: "choice", choice: "Airfryer", confidence: 0.99, probabilities: { Airfryer: 0.99, __nenhum__: 0.01 } },
    },
  }));
  setJevTransportForTests(jev);

  const result = await assessItem({ name: "Fritadeira elétrica", environments, classify: true, existing, profile });
  assert.equal(jev.calls.length, 1);
  assert.deepEqual(result.environment, { name: "Cozinha", confidence: 0.9 });
  assert.deepEqual(result.redundancy, { probability: 0.63, overlapsWith: "Airfryer" });

  const questions = jev.calls[0].questions;
  assert.deepEqual(Object.keys(questions.ambiente.criteria), environments);
  assert.ok("__nenhum__" in questions.sobreposicao.criteria);
  assert.equal(jev.calls[0].state.novo_item, "Fritadeira elétrica");
  assert.deepEqual(jev.calls[0].state.itens_por_ambiente, { Cozinha: ["Airfryer"], Quarto: ["Cama de casal"] });
});

test("assessItem: baixa confiança, ambiente inexistente e redundância fraca são descartados", async () => {
  setJevTransportForTests(
    fake(() => ({
      answers: {
        ambiente: { type: "choice", choice: "Cozinha", confidence: JEV_THRESHOLDS.environment - 0.1, probabilities: {} },
        redundante: { type: "noul", noul: JEV_THRESHOLDS.redundancy - 0.1 },
        sobreposicao: { type: "choice", choice: "Airfryer", confidence: 0.9, probabilities: { Airfryer: 0.95, __nenhum__: 0.05 } },
      },
    })),
  );
  const weak = await assessItem({ name: "Torradeira", environments, classify: true, existing, profile });
  assert.deepEqual(weak, { environment: null, redundancy: null });

  setJevTransportForTests(
    fake(() => ({ answers: { ambiente: { type: "choice", choice: "Garagem", confidence: 0.99, probabilities: {} } } })),
  );
  const unknown = await assessItem({ name: "Torradeira", environments, classify: true, existing: [], profile });
  assert.equal(unknown.environment, null);
});

test("assessItem: itens parecidos mas de uso diferente não são redundantes", async () => {
  setJevTransportForTests(
    fake(() => ({
      answers: {
        redundante: { type: "noul", noul: 0.36 },
        sobreposicao: { type: "choice", choice: "Airfryer", confidence: 0.71, probabilities: { Airfryer: 0.78, __nenhum__: 0.22 } },
      },
    })),
  );
  assert.equal((await assessItem({ name: "Forno elétrico", environments, classify: false, existing, profile })).redundancy, null);

  // O sim/não bem alto vale sozinho, mesmo sem equivalente identificado.
  setJevTransportForTests(
    fake(() => ({
      answers: {
        redundante: { type: "noul", noul: 0.9 },
        sobreposicao: { type: "choice", choice: "Airfryer", confidence: 0.4, probabilities: { Airfryer: 0.55, __nenhum__: 0.45 } },
      },
    })),
  );
  assert.deepEqual((await assessItem({ name: "Segunda airfryer", environments, classify: false, existing, profile })).redundancy, { probability: 0.9, overlapsWith: null });
});

test("assessItem: sem classificar e sem itens na lista não há o que perguntar", async () => {
  const jev = fake(() => ({ answers: {} }));
  setJevTransportForTests(jev);
  assert.equal(await assessItem({ name: "Torradeira", environments, classify: false, existing: [], profile }), null);
  assert.equal(jev.calls.length, 0);
  // Nome idêntico a um item da lista é duplicata comum, não redundância semântica.
  assert.equal(await assessItem({ name: "airfryer", environments, classify: false, existing: [{ name: "Airfryer", environment: "Cozinha" }], profile }), null);
  assert.equal(jev.calls.length, 0);
});

test("assessItem: redundância alta sem equivalente identificado ainda avisa", async () => {
  setJevTransportForTests(
    fake(() => ({
      answers: {
        redundante: { type: "noul", noul: 0.95 },
        sobreposicao: { type: "choice", choice: "__nenhum__", confidence: 0.7, probabilities: {} },
      },
    })),
  );
  const result = await assessItem({ name: "Forno elétrico", environments, classify: false, existing, profile });
  assert.deepEqual(result.redundancy, { probability: 0.95, overlapsWith: null });
});

test("falha do Jev vira null, sem lançar erro", async () => {
  setJevTransportForTests({
    async systemOne() {
      throw new Error("503");
    },
  });
  assert.equal(await assessItem({ name: "Torradeira", environments, classify: true, existing, profile }), null);
});

test("respostas iguais vêm do cache e não gastam outra chamada", async () => {
  const jev = fake(() => ({ answers: { redundante: { type: "noul", noul: 0.9 }, sobreposicao: { type: "choice", choice: "Airfryer", confidence: 0.9, probabilities: {} } } }));
  setJevTransportForTests(jev);
  const input = { name: "Forno elétrico", environments, classify: false, existing, profile };
  await assessItem(input);
  await assessItem(input);
  assert.equal(jev.calls.length, 1);
});

test("o teto diário de chamadas segura o Jev sem derrubar o app", async () => {
  const previous = process.env.JEV_DAILY_LIMIT;
  process.env.JEV_DAILY_LIMIT = "1";
  try {
    const jev = fake(() => ({ answers: { redundante: { type: "noul", noul: 0.9 }, sobreposicao: { type: "choice", choice: "Airfryer", confidence: 0.9, probabilities: {} } } }));
    setJevTransportForTests(jev);
    assert.ok(await assessItem({ name: "Forno elétrico", environments, classify: false, existing, profile }));
    assert.equal(await assessItem({ name: "Mixer", environments, classify: false, existing, profile }), null);
    assert.equal(jev.calls.length, 1);
  } finally {
    if (previous === undefined) delete process.env.JEV_DAILY_LIMIT;
    else process.env.JEV_DAILY_LIMIT = previous;
  }
});

test("candidatesFor aplica as regras do funil e tira o que a pessoa já tem", () => {
  const names = (list) => list.map((candidate) => candidate.name);

  const apt = candidatesFor("cozinha", ["Jogo de panelas"], profile);
  assert.ok(apt.length > 0);
  assert.ok(!names(apt).includes("Jogo de panelas"));

  // "{cama}" vira "de casal" para quem mora em casal e "de solteiro" nos demais casos.
  assert.ok(names(candidatesFor("quarto", [], profile)).includes("Jogo de cama de casal"));
  assert.ok(names(candidatesFor("quarto", [], { ...profile, moment: "solo", people: 1 })).includes("Jogo de cama de solteiro"));

  // Itens "só casa" não vão para apartamento, e vice-versa.
  const keyed = (housing) => candidatesFor("externa", [], { ...profile, housing });
  const casa = new Set(names(keyed("casa")));
  assert.ok(casa.has("Mangueira"));
  const apto = new Set(names(keyed("apartamento")));
  assert.ok(!apto.has("Mangueira") && apto.has("Borrifador e regador"));
  assert.notDeepEqual([...casa].sort(), [...apto].sort());
});

test("recommendNext: só essenciais entram enquanto faltar algum, e sem favorito claro devolve as melhores opções", async () => {
  const candidates = [
    { name: "Jogo de panelas", essential: true, firstNight: false },
    { name: "Pratos rasos", essential: true, firstNight: true },
    { name: "Talheres", essential: true, firstNight: true },
    { name: "Tábua de corte", essential: true, firstNight: false },
    { name: "Ralador", essential: false, firstNight: false },
  ];
  const input = { environment: "Cozinha", existing: ["Airfryer"], candidates, profile };

  // Favorito claro.
  const jev = fake(() => ({ answers: { proximo: { type: "choice", choice: "Pratos rasos", confidence: 0.88, probabilities: { "Pratos rasos": 0.9, Talheres: 0.05 } } } }));
  setJevTransportForTests(jev);
  const clear = await recommendNext(input);
  assert.equal(clear.name, "Pratos rasos");
  assert.equal(clear.clear, true);
  assert.deepEqual(clear.options.map((option) => option.name), ["Pratos rasos"]);
  const offered = Object.keys(jev.calls[0].questions.proximo.criteria);
  assert.ok(!offered.includes("Ralador"), "opcionais ficam de fora enquanto faltar essencial");
  assert.ok(offered.includes("__nenhum__"));
  // Quem é usado na primeira noite vai primeiro nas opções.
  assert.deepEqual(offered.slice(0, 2), ["Pratos rasos", "Talheres"]);

  // Sem favorito (dados reais: 0,36 / 0,27 / 0,13): mostra as três melhores, da mais para a menos provável.
  setJevTransportForTests(
    fake(() => ({
      answers: {
        proximo: { type: "choice", choice: "Pratos rasos", confidence: 0.33, probabilities: { "Pratos rasos": 0.36, Talheres: 0.27, "Tábua de corte": 0.13, "Jogo de panelas": 0.06 } },
      },
    })),
  );
  const vague = await recommendNext(input);
  assert.equal(vague.clear, false);
  assert.deepEqual(vague.options.map((option) => option.name), ["Pratos rasos", "Talheres", "Tábua de corte"]);

  // Sem nenhum essencial faltando, os opcionais voltam à disputa.
  const optionalOnly = fake(() => ({ answers: { proximo: { type: "choice", choice: "Ralador", confidence: 0.7, probabilities: { Ralador: 0.8 } } } }));
  setJevTransportForTests(optionalOnly);
  assert.equal((await recommendNext({ ...input, candidates: [{ name: "Ralador", essential: false, firstNight: false }] })).name, "Ralador");

  // O Jev diz que está completo, ou responde algo fora das opções: nada a sugerir.
  setJevTransportForTests(fake(() => ({ answers: { proximo: { type: "choice", choice: "__nenhum__", confidence: 0.99, probabilities: {} } } })));
  assert.equal(await recommendNext(input), null);
  setJevTransportForTests(fake(() => ({ answers: { proximo: { type: "choice", choice: "Item inventado", confidence: 0.99, probabilities: {} } } })));
  assert.equal(await recommendNext(input), null);
});

test("urgencyKey: renomear ou mudar de ambiente invalida a nota; caixa, acento e espaços não", () => {
  assert.equal(urgencyKey("Geladeira", "Cozinha"), urgencyKey("  geladeira ", "COZINHA"));
  assert.equal(urgencyKey("Máquina de lavar", "Área de Serviço"), urgencyKey("maquina de lavar", "area de servico"));
  assert.notEqual(urgencyKey("Geladeira", "Cozinha"), urgencyKey("Geladeira duplex", "Cozinha"));
  assert.notEqual(urgencyKey("Geladeira", "Cozinha"), urgencyKey("Geladeira", "Sala"));
});

test("a régua de urgência tem níveis distintos, em ordem, e o rótulo segue a nota", () => {
  assert.equal(URGENCY_LEVELS, 8);
  assert.equal(new Set(URGENCY_SCALE.map((level) => level.label)).size, URGENCY_LEVELS);
  assert.equal(new Set(URGENCY_SCALE.map((level) => level.criterion)).size, URGENCY_LEVELS);
  assert.equal(urgencyLabel(1), URGENCY_SCALE[0].label);
  assert.equal(urgencyLabel(8), "Comprar já: leva tempo");
  assert.equal(urgencyLabel(5.4), URGENCY_SCALE[4].label, "arredonda para o nível mais próximo");
  assert.equal(urgencyLabel(0), URGENCY_SCALE[0].label, "fora da régua fica no extremo");
  assert.equal(urgencyLabel(42), URGENCY_SCALE[URGENCY_LEVELS - 1].label);
  // A versão da régua entra na chave: ao mudar a régua, as notas antigas deixam de valer.
  assert.ok(urgencyKey("Geladeira", "Cozinha").startsWith(`v${URGENCY_RUBRIC_VERSION}|`));
});

test("prioritizeItems: a nota do Jev vira urgência (nota + 1), ordenada, em partes de 12 itens", async () => {
  const items = Array.from({ length: 30 }, (_, index) => ({ id: `item-${index}`, name: `Item ${index}`, environment: "Sala" }));
  const jev = fake((request) => ({
    answers: Object.fromEntries(
      Object.keys(request.questions).map((key) => {
        const index = Number(key.slice(1));
        // O primeiro de cada parte é urgente; o último tem confiança baixa e deve ser descartado.
        const score = index === 0 ? 4 : 1;
        const confidence = index === Object.keys(request.questions).length - 1 ? 0.1 : 0.9;
        return [key, { type: "score", score, confidence, probabilities: {}, legend: {} }];
      }),
    ),
  }));
  setJevTransportForTests(jev);

  const result = await prioritizeItems({ items, profile });
  assert.equal(jev.calls.length, 3); // 12 + 12 + 6
  // Nota de baixa confiança também volta: o app a guarda (senão o item seria reavaliado a cada consulta) e avisa que é incerta.
  assert.equal(result.length, 30);
  assert.equal(result.filter((entry) => entry.confidence < JEV_THRESHOLDS.urgency).length, 3);
  assert.equal(result[0].urgency, 5);
  assert.ok(result.every((entry, index) => index === 0 || result[index - 1].urgency >= entry.urgency));
  // A pergunta carrega só nome e ambiente: nem o id interno nem o preço (que distorceria a urgência).
  assert.deepEqual(jev.calls[0].questions.i1.instructions.item, { nome: "Item 1", ambiente: "Sala" });
  // A régua tem os 8 níveis do app, cada um descrito, e a pergunta fala em "momento", não em "importância".
  assert.equal(jev.calls[0].questions.i1.criteria.length, URGENCY_LEVELS);
  assert.deepEqual(jev.calls[0].questions.i1.criteria, URGENCY_SCALE.map((level) => level.criterion));
  assert.match(jev.calls[0].questions.i1.instructions.pergunta, /momento/);
  assert.deepEqual(Object.keys(jev.calls[0].state).sort(), ["clima", "moradia", "moradores", "perfil_de_gasto", "situacao"]);
  // O prazo até a mudança fica de fora: a nota vale para a faixa de perfil e é compartilhada entre enxovais.
  assert.equal(jev.calls[0].state.clima, "ameno");
  assert.ok(!JSON.stringify(jev.calls).includes("item-1"));
});

test("prioritizeItems: se algumas partes falham, mostra as que vieram", async () => {
  const items = Array.from({ length: 24 }, (_, index) => ({ id: `a${index}`, name: `Item ${index}`, environment: "Sala" }));
  setJevTransportForTests(
    fake((request, call) => {
      if (call === 1) throw new Error("timeout");
      return { answers: Object.fromEntries(Object.keys(request.questions).map((key) => [key, { type: "score", score: 2, confidence: 0.8, probabilities: {}, legend: {} }])) };
    }),
  );
  const result = await prioritizeItems({ items, profile });
  assert.equal(result.length, 12);
});
