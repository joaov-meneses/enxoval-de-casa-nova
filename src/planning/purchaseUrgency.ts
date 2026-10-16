/**
 * Régua de prioridade de compra que o Nino (Jev) usa para ordenar o que comprar primeiro.
 *
 * Mede em que momento o item precisa estar em casa em relação à mudança: quanto maior o nível, mais cedo a
 * compra. O texto de cada nível (`criterion`) vai ao Jev como critério da pergunta; o `label` é o que a pessoa lê.
 * O servidor e a tela usam esta mesma lista, então rótulo e critério nunca se desencontram.
 */
export interface UrgencyLevel {
  /** Rótulo curto na tela. */
  label: string;
  /** Descrição do nível para o Jev: diz o que o item faz na rotina, e não só "mais" ou "menos" urgente. */
  criterion: string;
}

/** Do menos ao mais urgente. A nota gravada no item é a posição aqui mais 1 (de 1 até `URGENCY_LEVELS`). */
export const URGENCY_SCALE: readonly UrgencyLevel[] = [
  {
    label: "Pode esperar mais de 6 meses",
    criterion:
      "Luxo, capricho ou uso muito eventual. Nada na rotina depende dele: pode ser comprado só depois dos 6 primeiros meses morando, ou nunca.",
  },
  {
    label: "Do 4º ao 6º mês",
    criterion:
      "Conforto ou decoração que deixa a casa mais bonita ou agradável. Ninguém sente falta dele enquanto a casa ainda está se organizando.",
  },
  {
    label: "No 2º ou 3º mês",
    criterion:
      "Útil e vai ser usado, mas a rotina funciona sem ele por algumas semanas. Dá para esperar a casa assentar e o orçamento respirar.",
  },
  {
    label: "No primeiro mês",
    criterion:
      "Melhora a rotina e fará falta nas primeiras semanas, mas dá para improvisar nos primeiros dias.",
  },
  {
    label: "Na primeira semana",
    criterion:
      "Fará falta já nos primeiros dias morando, embora a pessoa consiga se virar sem ele por uma ou duas noites.",
  },
  {
    label: "Até a mudança",
    criterion:
      "Necessário para a casa funcionar no básico (cozinhar, guardar comida, lavar, organizar). Deve estar em casa na semana da mudança.",
  },
  {
    label: "Na primeira noite",
    criterion:
      "Sem ele a pessoa não consegue dormir, tomar banho ou comer já na noite da mudança (roupa de cama, travesseiro, toalha, cortina do quarto, panela básica). A entrega costuma ser rápida.",
  },
  {
    label: "Comprar já: leva tempo",
    criterion:
      "Essencial e também grande, caro ou com entrega e montagem demoradas (geladeira, fogão, cama, colchão, guarda-roupa, máquina de lavar). Precisa ser comprado semanas antes para chegar a tempo.",
  },
];

export const URGENCY_LEVELS = URGENCY_SCALE.length;

/**
 * Versão da régua. Entra na chave das notas guardadas: ao mudar os níveis ou a pergunta, some a validade das notas
 * antigas e cada item é reavaliado na próxima consulta, em vez de misturar duas réguas na mesma lista.
 */
export const URGENCY_RUBRIC_VERSION = 3;

/** Rótulo do nível mais próximo de uma nota (1 a `URGENCY_LEVELS`, com casas decimais). */
export function urgencyLabel(urgency: number) {
  const index = Math.min(URGENCY_LEVELS, Math.max(1, Math.round(urgency))) - 1;
  return URGENCY_SCALE[index].label;
}
