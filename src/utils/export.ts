import type { EnxovalItem } from "../types";
import { normalizeQuantity } from "../itemQuantity";
import { discountApplies, statusLabel } from "../itemStatus";

/** Colunas da planilha, na ordem. A importação reconhece estes mesmos títulos. */
export const ITEM_COLUMN_HEADERS = [
  "Item",
  "Ambiente",
  "Situação",
  "Quantidade",
  "Preço (R$)",
  "Desconto/cashback (R$)",
  "Link",
  "Observações",
] as const;

export type ExportFormat = "csv" | "xlsx";

export const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function createCsv(items: EnxovalItem[]) {
  const cell = (value: string) =>
    `"${(/^[\s]*[=+@-]/.test(value) ? "'" : "") + value.replace(/"/g, '""')}"`;
  return (
    "\uFEFF" +
    [
      [...ITEM_COLUMN_HEADERS],
      ...items.map((i) => [
        i.name,
        i.category,
        statusLabel(i.status),
        String(normalizeQuantity(i.quantity)),
        i.priceCents === null
          ? ""
          : (i.priceCents / 100).toFixed(2).replace(".", ","),
        discountApplies(i.status) && i.discountCents > 0
          ? (i.discountCents / 100).toFixed(2).replace(".", ",")
          : "",
        i.link,
        i.description,
      ]),
    ]
      .map((row) => row.map(cell).join(";"))
      .join("\r\n")
  );
}
const MONEY_FORMAT = "#,##0.00";

/** Linhas da planilha .xlsx: preço, desconto e quantidade viram números de verdade (somáveis no Excel). */
export function createSheetData(items: EnxovalItem[]) {
  const money = (cents: number) => ({
    value: cents / 100,
    type: Number,
    format: MONEY_FORMAT,
  });
  const text = (value: string) => (value ? { value, type: String } : null);
  return [
    ITEM_COLUMN_HEADERS.map((value) => ({
      value,
      fontWeight: "bold" as const,
      backgroundColor: "#eef1e6",
    })),
    ...items.map((i) => [
      text(i.name),
      text(i.category),
      text(statusLabel(i.status)),
      { value: normalizeQuantity(i.quantity), type: Number },
      i.priceCents === null ? null : money(i.priceCents),
      discountApplies(i.status) && i.discountCents > 0
        ? money(i.discountCents)
        : null,
      text(i.link),
      text(i.description),
    ]),
  ];
}

export const XLSX_COLUMNS = [
  { width: 38 },
  { width: 18 },
  { width: 16 },
  { width: 12 },
  { width: 14 },
  { width: 22 },
  { width: 36 },
  { width: 40 },
];

export async function createXlsxBlob(items: EnxovalItem[]): Promise<Blob> {
  // Carregado só ao exportar: a biblioteca de planilhas não pesa no primeiro acesso.
  const { default: writeXlsxFile } = await import("write-excel-file/universal");
  return writeXlsxFile(createSheetData(items) as never, {
    sheet: "Itens",
    columns: XLSX_COLUMNS,
    stickyRowsCount: 1,
  }).toBlob();
}

function fileBaseName(name: string) {
  return `larume-${
    name
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-") || "enxoval"
  }`;
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportItems(
  items: EnxovalItem[],
  name: string,
  format: ExportFormat = "csv",
) {
  const base = fileBaseName(name);
  if (format === "xlsx") {
    download(await createXlsxBlob(items), `${base}.xlsx`);
    return;
  }
  download(
    new Blob([createCsv(items)], { type: "text/csv;charset=utf-8;" }),
    `${base}.csv`,
  );
}
