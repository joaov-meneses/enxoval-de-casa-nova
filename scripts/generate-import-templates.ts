// Gera os arquivos de exemplo de importação em public/modelos/ (CSV e XLSX).
// Usa o mesmo código da exportação, então o modelo sempre acompanha o formato real.
// Uso: npx tsx scripts/generate-import-templates.ts
import { mkdir, writeFile } from "node:fs/promises";
import writeXlsxFile from "write-excel-file/universal";
import type { EnxovalItem } from "../src/types.ts";
import {
  createCsv,
  createSheetData,
  XLSX_COLUMNS,
} from "../src/utils/export.ts";

type Example = Pick<
  EnxovalItem,
  | "name"
  | "category"
  | "status"
  | "quantity"
  | "priceCents"
  | "discountCents"
  | "link"
  | "description"
>;

const rawExamples: Example[] = [
  {
    name: "Jogo de cama casal 400 fios",
    category: "Quarto",
    status: "bought",
    quantity: 2,
    priceCents: 28900,
    discountCents: 3000,
    link: "https://www.exemplo.com.br/jogo-de-cama",
    description: "Cor areia",
  },
  {
    name: "Travesseiro de plumas",
    category: "Quarto",
    status: "needed",
    quantity: 2,
    priceCents: 15990,
    discountCents: 0,
    link: "",
    description: "",
  },
  {
    name: "Cortina blackout",
    category: "Quarto",
    status: "researching",
    quantity: 1,
    priceCents: null,
    discountCents: 0,
    link: "",
    description: "Comparar tamanhos de 2,20 m",
  },
  {
    name: "Toalhas de banho",
    category: "Banheiro",
    status: "received",
    quantity: 4,
    priceCents: 12000,
    discountCents: 0,
    link: "",
    description: "Presente da tia Marta",
  },
  {
    name: "Cesto de roupa suja",
    category: "Banheiro",
    status: "owned",
    quantity: 1,
    priceCents: null,
    discountCents: 0,
    link: "",
    description: "",
  },
  {
    name: "Jogo de panelas antiaderente",
    category: "Cozinha",
    status: "needed",
    quantity: 1,
    priceCents: 349900,
    discountCents: 0,
    link: "https://www.exemplo.com.br/panelas",
    description: "Conjunto com 5 peças",
  },
  {
    name: "Jogo de pratos de cerâmica",
    category: "Cozinha",
    status: "bought",
    quantity: 1,
    priceCents: 21990,
    discountCents: 0,
    link: "",
    description: "",
  },
  {
    name: "Liquidificador",
    category: "Eletrodomésticos",
    status: "needed",
    quantity: 1,
    priceCents: 24990,
    discountCents: 0,
    link: "",
    description: "",
  },
  {
    name: "Sofá de 3 lugares",
    category: "Sala de Estar",
    status: "researching",
    quantity: 1,
    priceCents: 249900,
    discountCents: 0,
    link: "",
    description: "",
  },
  {
    name: "Mesa de jantar (não preciso mais)",
    category: "Sala de Estar",
    status: "not_needed",
    quantity: 1,
    priceCents: null,
    discountCents: 0,
    link: "",
    description: "Já ganhamos uma",
  },
];

const examples = rawExamples.map((e, index) => ({
  id: String(index),
  categoryId: e.category,
  checked: false,
  sortOrder: index,
  updatedAt: "",
  ...e,
})) as EnxovalItem[];

const instructions = [
  ["Como preencher a planilha de importação"],
  [""],
  ["Coluna", "O que colocar", "Obrigatória?"],
  ["Item", "Nome do item. Até 36 caracteres.", "Sim"],
  [
    "Ambiente",
    "Onde o item fica (Quarto, Cozinha...). Ambientes que ainda não existem são criados. Até 24 caracteres.",
    "Sim",
  ],
  [
    "Situação",
    "Preciso comprar · Pesquisando · Comprei · Ganhei · Já tenho · Não preciso · Descartei. Em branco = Preciso comprar.",
    "Não",
  ],
  ["Quantidade", "Número inteiro de 1 a 999. Em branco = 1.", "Não"],
  [
    "Preço (R$)",
    "Valor do item, como 249,90 ou 1.249,90. Em branco = sem preço.",
    "Não",
  ],
  [
    "Desconto/cashback (R$)",
    "Só vale para Preciso comprar, Pesquisando e Comprei, e precisa ser menor ou igual ao preço.",
    "Não",
  ],
  ["Link", "Endereço da loja ou do produto.", "Não"],
  ["Observações", "Qualquer anotação.", "Não"],
  [""],
  ["Dicas"],
  [
    "Item e Ambiente são obrigatórios e precisam estar preenchidos em todas as linhas. Se faltar algo, o arquivo é recusado e nada é importado.",
  ],
  ['A primeira linha da aba "Itens" deve manter os títulos das colunas.'],
  [
    "Você pode apagar as linhas de exemplo e colocar as suas. Itens que já existem no mesmo ambiente podem ser pulados na importação.",
  ],
  [
    "Pode importar o arquivo gerado pelo botão Exportar: ele usa exatamente estas colunas.",
  ],
  ["Máximo de 500 itens por arquivo."],
].map((row, index) =>
  row.map((value) => ({
    value,
    type: String,
    ...(index === 0 || index === 2 || row[0] === "Dicas"
      ? { fontWeight: "bold" as const }
      : {}),
    wrap: true,
  })),
);

await mkdir("public/modelos", { recursive: true });
await writeFile(
  "public/modelos/larume-modelo-importacao.csv",
  createCsv(examples),
  "utf8",
);

const blob = await writeXlsxFile([
  {
    data: createSheetData(examples) as never,
    sheet: "Itens",
    columns: XLSX_COLUMNS,
    stickyRowsCount: 1,
  },
  {
    data: instructions as never,
    sheet: "Como preencher",
    columns: [{ width: 26 }, { width: 90 }, { width: 14 }],
  },
]).toBlob();
await writeFile(
  "public/modelos/larume-modelo-importacao.xlsx",
  Buffer.from(await blob.arrayBuffer()),
);
console.log("Modelos gerados em public/modelos/");
