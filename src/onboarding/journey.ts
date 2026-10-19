import { defaultPeople, phaseOf, weeksUntil } from "./plan";
import type { Answers } from "./types";

/** Contexto compartilhado pelas perguntas, sem duplicar respostas no estado. */
export function journeyFor(answers: Answers, now = new Date()) {
  const shared = answers.moment === "casal" || answers.moment === "amigos";
  const home = shared ? "a casa de vocês" : "a sua casa";
  const profile = {
    casal: {
      date: "Quando vocês vão se mudar?",
      intro: "Vamos preparar o começo da vida a dois.",
      housing: "Como é a casa de vocês?",
      people: "Serão só vocês dois?",
      peopleHint: "Já considerei você e seu par. Inclua quem mais vai morar junto.",
      owned: "O que vocês já têm para a casa?",
      budget: "Quanto vocês pretendem investir?",
      usage: "Como querem organizar a vida a dois?",
      share: "Dividir o planejamento com meu par",
    },
    solo: {
      date: "Quando você vai se mudar?",
      intro: "Vamos preparar seu cantinho do seu jeito.",
      housing: "Como é o seu novo cantinho?",
      people: "Vai ser só você no seu cantinho?",
      peopleHint: "Comecei com uma pessoa. Se alguém for morar junto, ajuste aqui.",
      owned: "O que você já tem para seu cantinho?",
      budget: "Quanto você pretende investir?",
      usage: "Como quer organizar seu cantinho?",
      share: "Compartilhar a lista com quem vai me ajudar",
    },
    amigos: {
      date: "Quando vocês vão se mudar?",
      intro: "Vamos organizar a casa que vocês vão dividir.",
      housing: "Como é a casa que vão dividir?",
      people: "Quantas pessoas vão dividir a casa?",
      peopleHint: "Conte todo mundo, incluindo você. As quantidades seguem esse total.",
      owned: "O que cada um já tem para levar?",
      budget: "Quanto vocês vão investir juntos?",
      usage: "Como querem organizar a casa juntos?",
      share: "Dividir a lista com quem vai morar comigo",
    },
    troca: {
      date: "Quando será sua mudança?",
      intro: "Vamos planejar a mudança aproveitando o que você já tem.",
      housing: "Como é a casa para onde você vai?",
      people: "Quantas pessoas vão para a casa nova?",
      peopleHint: "Conte quem vai se mudar com você para ajustar as quantidades.",
      owned: "O que você vai levar da casa atual?",
      budget: "Quanto pretende investir no que falta?",
      usage: "Como quer organizar essa mudança?",
      share: "Organizar a mudança com quem mora comigo",
    },
  }[answers.moment ?? "solo"];
  const phase = answers.moveDate ? phaseOf(weeksUntil(answers.moveDate, now)) : null;
  const timing = phase === "now" || phase === "final"
    ? "Com a mudança perto, comece pelo essencial para dormir, tomar banho e cozinhar."
    : phase === "buy"
      ? "Use esse prazo para comparar preços e organizar as compras maiores."
      : phase === "plan"
        ? "Há tempo para pesquisar e distribuir as compras até a mudança."
        : "Sem data definida, organize primeiro o essencial e ajuste o ritmo depois.";
  return { ...profile, shared, home, phase, timing };
}

/** Ao rever uma resposta, refaz apenas as sugestões que dependem dela. */
export function updateJourney(answers: Answers, patch: Partial<Answers>): Answers {
  const next = { ...answers, ...patch };
  if (patch.moment !== undefined && patch.moment !== answers.moment) {
    next.people = defaultPeople(patch.moment);
    next.rooms = null;
  }
  if (patch.housing !== undefined && patch.housing !== answers.housing) next.rooms = null;
  if (patch.people !== undefined && patch.people !== answers.people) next.rooms = null;
  return next;
}
