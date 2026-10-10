import { MAX_ENVIRONMENT_NAME_LENGTH, MAX_ITEM_NAME_LENGTH } from "../data";
import { DEFAULT_ITEM_QUANTITY, isValidQuantity } from "../itemQuantity";
import {
  DEFAULT_ITEM_STATUS,
  discountApplies,
  ITEM_STATUSES,
  ITEM_STATUS_META,
  type ItemStatus,
} from "../itemStatus";

export const IMPORT_LIMITS = {
  maxFileBytes: 2 * 1024 * 1024,
  maxRows: 500,
  maxNameLength: MAX_ITEM_NAME_LENGTH,
  maxDescriptionLength: 1000,
  /** Preço máximo em centavos: o banco guarda inteiros de 32 bits. */
  maxPriceCents: 2_000_000_000,
};

export interface ImportRow {
  /** Linha na planilha (1 = cabeçalho), para apontar problemas ao usuário. */
  line: number;
  name: string;
  categoryName: string;
  status: ItemStatus;
  quantity: number;
  priceCents: number | null;
  discountCents: number;
  link: string;
  description: string;
}

export interface ImportIssue {
  line: number;
  /** "error": a linha não será importada · "warning": será importada com um ajuste. */
  level: "error" | "warning";
  message: string;
}

export interface ImportParseResult {
  rows: ImportRow[];
  issues: ImportIssue[];
  /** Colunas do arquivo que não foram reconhecidas (e por isso ignoradas). */
  ignoredColumns: string[];
  /** Linhas de dados lidas (sem o cabeçalho e sem linhas vazias). */
  dataLines: number;
}

/** Erro com texto pronto para mostrar ao usuário. */
export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportFileError";
  }
}

type Field =
  | "name"
  | "category"
  | "status"
  | "quantity"
  | "price"
  | "discount"
  | "link"
  | "description";

/** Sem estas duas colunas (e valores nelas) o arquivo não pode ser importado. */
const REQUIRED_FIELDS = ["name", "category"] as const;
const REQUIRED_LABELS = { name: "Item", category: "Ambiente" } as const;

/** Título da coluna (já normalizado) → campo. Cobre os títulos da exportação e variações comuns. */
const HEADER_ALIASES: Record<string, Field> = {
  item: "name",
  itens: "name",
  nome: "name",
  produto: "name",
  "nome do item": "name",
  "nome do produto": "name",
  ambiente: "category",
  ambientes: "category",
  categoria: "category",
  comodo: "category",
  local: "category",
  situacao: "status",
  status: "status",
  estado: "status",
  quantidade: "quantity",
  qtd: "quantity",
  qtde: "quantity",
  unidades: "quantity",
  preco: "price",
  valor: "price",
  "preco unitario": "price",
  "valor estimado": "price",
  desconto: "discount",
  cashback: "discount",
  "desconto cashback": "discount",
  "desconto e cashback": "discount",
  link: "link",
  url: "link",
  site: "link",
  loja: "link",
  observacoes: "description",
  observacao: "description",
  obs: "description",
  descricao: "description",
  notas: "description",
  anotacoes: "description",
};

/** Minúsculas, sem acentos nem pontuação: "Situação" e "situacao" viram a mesma coisa. */
export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeHeader(value: string) {
  return normalizeText(value.replace(/\(.*?\)/g, " "));
}

const STATUS_ALIASES: Record<string, ItemStatus> = (() => {
  const map: Record<string, ItemStatus> = {
    comprado: "bought",
    comprada: "bought",
    sim: "bought",
    s: "bought",
    x: "bought",
    ok: "bought",
    feito: "bought",
    concluido: "bought",
    pendente: "needed",
    comprar: "needed",
    "a comprar": "needed",
    falta: "needed",
    nao: "needed",
    n: "needed",
    pesquisa: "researching",
    presente: "received",
    ganho: "received",
    ganhou: "received",
    tenho: "owned",
    "ja possuo": "owned",
    dispensado: "not_needed",
    desistido: "discarded",
  };
  for (const status of ITEM_STATUSES) {
    map[normalizeText(status)] = status;
    map[normalizeText(ITEM_STATUS_META[status].label)] = status;
  }
  return map;
})();

// ───────────────────────────── leitura de arquivos ─────────────────────────────

/** Lê um CSV (separador `;`, `,` ou tab; aspas; BOM). Devolve todas as linhas, inclusive as vazias. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.split(/\r\n|\n|\r/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function detectDelimiter(headerLine: string) {
  let best = ";";
  let bestCount = -1;
  for (const candidate of [";", ",", "\t"]) {
    let count = 0;
    let quoted = false;
    for (const char of headerLine) {
      if (char === '"') quoted = !quoted;
      else if (!quoted && char === candidate) count++;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function decodeCsv(buffer: ArrayBuffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    // CSV salvo pelo Excel antigo costuma vir em Windows-1252, não em UTF-8.
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/** Lê o arquivo escolhido (.csv ou .xlsx) como uma grade de células. */
export async function readSpreadsheetFile(file: File): Promise<unknown[][]> {
  if (file.size > IMPORT_LIMITS.maxFileBytes)
    throw new ImportFileError(
      `O arquivo tem mais de ${IMPORT_LIMITS.maxFileBytes / 1024 / 1024} MB. Divida a lista em partes menores.`,
    );
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  try {
    if (extension === "xlsx") {
      // Carregado só ao importar: a biblioteca de planilhas não pesa no primeiro acesso.
      const { readSheet } = await import("read-excel-file/universal");
      return (await readSheet(file)) as unknown[][];
    }
    if (extension === "csv" || extension === "txt" || extension === "tsv")
      return parseCsv(decodeCsv(await file.arrayBuffer()));
  } catch {
    throw new ImportFileError(
      "Não consegui ler o arquivo. Confira se ele não está protegido por senha nem corrompido.",
    );
  }
  throw new ImportFileError(
    extension === "xls"
      ? "Arquivos .xls (Excel antigo) não são aceitos. No Excel, use Salvar como e escolha .xlsx ou .csv."
      : "Formato não aceito. Envie um arquivo .csv ou .xlsx.",
  );
}

// ───────────────────────────── conversão das células ─────────────────────────────

function cellText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "";
  return "";
}

/** O CSV exportado protege textos que começam com = + - @ com um apóstrofo: aqui ele é removido. */
function unguard(value: string) {
  return /^'[=+@-]/.test(value) ? value.slice(1) : value;
}

/** "1.234,56", "R$ 49,90", "49.90" ou o número do Excel → centavos. */
export function parseMoneyToCents(
  value: unknown,
): { ok: true; cents: number | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, cents: null };
  let amount: number;
  if (typeof value === "number") amount = value;
  else if (typeof value === "string") {
    const text = value.replace(/R\$|\s| /gi, "");
    if (text === "") return { ok: true, cents: null };
    if (/[^\d.,]/.test(text)) return { ok: false };
    const lastComma = text.lastIndexOf(",");
    const lastDot = text.lastIndexOf(".");
    let normalized: string;
    if (lastComma >= 0 && lastDot >= 0)
      normalized =
        lastComma > lastDot
          ? text.replace(/\./g, "").replace(",", ".")
          : text.replace(/,/g, "");
    else if (lastComma >= 0) normalized = text.replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(text))
      normalized = text.replace(/\./g, "");
    else normalized = text;
    if (!/^\d+(\.\d+)?$/.test(normalized)) return { ok: false };
    amount = Number(normalized);
  } else return { ok: false };
  if (!Number.isFinite(amount) || amount < 0) return { ok: false };
  const cents = Math.round(amount * 100);
  return cents > IMPORT_LIMITS.maxPriceCents
    ? { ok: false }
    : { ok: true, cents };
}

function parseQuantity(value: unknown): number | null | "invalid" {
  const text = cellText(value);
  if (text === "") return null;
  const number = Number(text.replace(",", "."));
  return isValidQuantity(number) ? number : "invalid";
}

function normalizeLink(value: string) {
  if (!value) return { link: "" };
  if (/^https?:\/\/\S+$/i.test(value)) return { link: value };
  // "loja.com.br/produto" sem o https://
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value))
    return { link: `https://${value}` };
  return { link: "", invalid: true };
}

// ───────────────────────────── interpretação das linhas ─────────────────────────────

export function parseImportRows(grid: unknown[][]): ImportParseResult {
  const headerIndex = grid.findIndex((row) =>
    row.some((cell) => cellText(cell) !== ""),
  );
  if (headerIndex < 0)
    throw new ImportFileError("O arquivo está vazio. Use o modelo de exemplo.");

  const columns = new Map<Field, number>();
  const ignoredColumns: string[] = [];
  grid[headerIndex].forEach((cell, index) => {
    const title = cellText(cell);
    if (!title) return;
    const field = HEADER_ALIASES[normalizeHeader(title)];
    if (field && !columns.has(field)) columns.set(field, index);
    else ignoredColumns.push(title);
  });
  const missingColumns = REQUIRED_FIELDS.filter(
    (field) => !columns.has(field),
  ).map((field) => REQUIRED_LABELS[field]);
  if (missingColumns.length > 0)
    throw new ImportFileError(
      `Formato inválido: faltam as colunas obrigatórias ${missingColumns
        .map((label) => `"${label}"`)
        .join(
          " e ",
        )} na primeira linha. Use o modelo de exemplo ou renomeie as colunas.`,
    );

  const get = (row: unknown[], field: Field) => {
    const index = columns.get(field);
    return index === undefined ? undefined : row[index];
  };

  const rows: ImportRow[] = [];
  const issues: ImportIssue[] = [];
  let dataLines = 0;

  for (let index = headerIndex + 1; index < grid.length; index++) {
    const raw = grid[index];
    if (!raw.some((cell) => cellText(cell) !== "")) continue;
    dataLines++;
    const line = index + 1;
    const warn = (message: string) =>
      issues.push({ line, level: "warning", message });

    if (dataLines > IMPORT_LIMITS.maxRows) {
      issues.push({
        line,
        level: "error",
        message: `Passou do limite de ${IMPORT_LIMITS.maxRows} itens por arquivo. Importe o restante em outro arquivo.`,
      });
      continue;
    }

    const name = unguard(cellText(get(raw, "name")));
    const categoryName = unguard(cellText(get(raw, "category")));
    const missing = [
      !name && REQUIRED_LABELS.name,
      !categoryName && REQUIRED_LABELS.category,
    ].filter(Boolean);
    if (missing.length > 0) {
      issues.push({
        line,
        level: "error",
        message: `Campo obrigatório vazio: ${missing.join(" e ")}.`,
      });
      continue;
    }
    if (name.length > IMPORT_LIMITS.maxNameLength) {
      issues.push({
        line,
        level: "error",
        message: `O nome do item passa de ${IMPORT_LIMITS.maxNameLength} caracteres.`,
      });
      continue;
    }
    if (categoryName.length > MAX_ENVIRONMENT_NAME_LENGTH) {
      issues.push({
        line,
        level: "error",
        message: `O ambiente "${categoryName}" passa de ${MAX_ENVIRONMENT_NAME_LENGTH} caracteres.`,
      });
      continue;
    }

    let status: ItemStatus = DEFAULT_ITEM_STATUS;
    const statusText = cellText(get(raw, "status"));
    if (statusText) {
      const found = STATUS_ALIASES[normalizeText(statusText)];
      if (found) status = found;
      else
        warn(
          `Situação "${statusText}" não reconhecida: o item entrou como "${ITEM_STATUS_META[DEFAULT_ITEM_STATUS].label}".`,
        );
    }

    let quantity = DEFAULT_ITEM_QUANTITY;
    const parsedQuantity = parseQuantity(get(raw, "quantity"));
    if (parsedQuantity === "invalid")
      warn(
        `Quantidade "${cellText(get(raw, "quantity"))}" inválida (use de 1 a 999): ficou 1.`,
      );
    else if (parsedQuantity !== null) quantity = parsedQuantity;

    let priceCents: number | null = null;
    const price = parseMoneyToCents(get(raw, "price"));
    if (!price.ok)
      warn(`Preço "${cellText(get(raw, "price"))}" inválido: ficou sem preço.`);
    else priceCents = price.cents;

    let discountCents = 0;
    const discount = parseMoneyToCents(get(raw, "discount"));
    if (!discount.ok)
      warn(
        `Desconto "${cellText(get(raw, "discount"))}" inválido: foi ignorado.`,
      );
    else if (discount.cents && discount.cents > 0) {
      if (!discountApplies(status))
        warn(
          `Desconto ignorado: a situação "${ITEM_STATUS_META[status].label}" não usa desconto.`,
        );
      else if (!priceCents || discount.cents > priceCents)
        warn(
          "Desconto ignorado: ele precisa ser menor ou igual ao preço do item.",
        );
      else discountCents = discount.cents;
    }

    const linkText = cellText(get(raw, "link"));
    const { link, invalid } = normalizeLink(linkText);
    if (invalid) warn(`Link "${linkText}" inválido: foi ignorado.`);

    let description = unguard(cellText(get(raw, "description")));
    if (description.length > IMPORT_LIMITS.maxDescriptionLength) {
      description = description.slice(0, IMPORT_LIMITS.maxDescriptionLength);
      warn("Observações encurtadas.");
    }

    rows.push({
      line,
      name,
      categoryName,
      status,
      quantity,
      priceCents,
      discountCents,
      link,
      description,
    });
  }

  return { rows, issues, ignoredColumns, dataLines };
}
