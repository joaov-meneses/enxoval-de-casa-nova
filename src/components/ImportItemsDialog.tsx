import { useMemo, useRef, useState, type DragEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import { ApiError, createItem } from "../api";
import { ITEM_STATUS_META } from "../itemStatus";
import type { EnxovalCategory, EnxovalItem } from "../types";
import {
  IMPORT_LIMITS,
  ImportFileError,
  normalizeText,
  parseImportRows,
  readSpreadsheetFile,
  type ImportParseResult,
  type ImportRow,
} from "../utils/importItems";
import { Dialog } from "./Dialog";

const MODEL_CSV = "/modelos/larume-modelo-importacao.csv";
const MODEL_XLSX = "/modelos/larume-modelo-importacao.xlsx";
const PREVIEW_ROWS = 6;
const LISTED_ISSUES = 15;

type Phase = "pick" | "review" | "importing" | "done";

interface Failure {
  line: number;
  message: string;
}

interface ImportItemsButtonProps {
  enxovalId: string;
  items: EnxovalItem[];
  categories: EnxovalCategory[];
  /** Chamado ao terminar com itens criados, para a tela recarregar a lista. */
  onImported: () => void | Promise<void>;
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const money = (cents: number | null) =>
  cents === null
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(cents / 100);

export function ImportItemsButton(props: ImportItemsButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="button button-outline button-small export-menu-trigger"
        aria-label="Importar"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Upload size={17} aria-hidden="true" />
        <span>Importar</span>
      </button>
      {/* Remonta ao fechar: cada importação começa do zero. */}
      {open && <ImportItemsDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function ImportItemsDialog({
  enxovalId,
  items,
  categories,
  onImported,
  onClose,
}: ImportItemsButtonProps & { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ImportParseResult | null>(null);
  const [readError, setReadError] = useState("");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [created, setCreated] = useState(0);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [stopped, setStopped] = useState(false);
  const stopRef = useRef(false);

  // Usa a grafia dos ambientes que já existem ("quarto" na planilha vira "Quarto").
  const plan = useMemo(() => {
    if (!parsed) return null;
    const spelling = new Map<string, string>();
    for (const category of categories)
      spelling.set(normalizeText(category.name), category.name);
    const existingKeys = new Set(
      items.map(
        (item) => `${normalizeText(item.name)}|${normalizeText(item.category)}`,
      ),
    );
    const known = new Set(spelling.keys());
    const rows = parsed.rows.map((row) => {
      const key = normalizeText(row.categoryName);
      if (!spelling.has(key)) spelling.set(key, row.categoryName);
      const categoryName = spelling.get(key)!;
      return {
        row: { ...row, categoryName } as ImportRow,
        duplicate: existingKeys.has(
          `${normalizeText(row.name)}|${normalizeText(categoryName)}`,
        ),
      };
    });
    const newCategories = [
      ...new Set(
        rows
          .filter(({ row }) => !known.has(normalizeText(row.categoryName)))
          .map(({ row }) => row.categoryName),
      ),
    ];
    return {
      rows,
      newCategories,
      duplicates: rows.filter((entry) => entry.duplicate).length,
    };
  }, [parsed, categories, items]);

  const toImport = useMemo(
    () =>
      plan
        ? plan.rows
            .filter((entry) => !(skipDuplicates && entry.duplicate))
            .map((entry) => entry.row)
        : [],
    [plan, skipDuplicates],
  );

  const errors = parsed?.issues.filter((i) => i.level === "error") ?? [];
  const warnings = parsed?.issues.filter((i) => i.level === "warning") ?? [];

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setReadError("");
    setParsed(null);
    setFileName(file.name);
    try {
      const result = parseImportRows(await readSpreadsheetFile(file));
      if (result.dataLines === 0)
        throw new ImportFileError(
          "O arquivo não tem nenhum item abaixo dos títulos das colunas.",
        );
      setParsed(result);
      setPhase("review");
    } catch (err) {
      setReadError(
        err instanceof ImportFileError
          ? err.message
          : "Não foi possível ler o arquivo.",
      );
      setPhase("pick");
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    void pickFile(event.dataTransfer.files[0]);
  }

  async function runImport() {
    // Qualquer erro no arquivo bloqueia tudo: a importação é "tudo ou nada" no formato.
    if (errors.length > 0 || toImport.length === 0) return;
    stopRef.current = false;
    setStopped(false);
    setPhase("importing");
    setCreated(0);
    setFailures([]);
    setProgress({ done: 0, total: toImport.length });
    let ok = 0;
    const failed: Failure[] = [];
    for (const [index, row] of toImport.entries()) {
      if (stopRef.current) {
        setStopped(true);
        break;
      }
      try {
        await createItem({
          enxovalId,
          name: row.name,
          categoryName: row.categoryName,
          status: row.status,
          quantity: row.quantity,
          priceCents: row.priceCents,
          ...(row.discountCents > 0
            ? { discountCents: row.discountCents }
            : {}),
          link: row.link,
          description: row.description,
        });
        ok++;
      } catch (err) {
        failed.push({
          line: row.line,
          message:
            err instanceof Error ? err.message : "Não foi possível salvar.",
        });
        // Sessão expirada: continuar só geraria o mesmo erro para todas as linhas.
        if (err instanceof ApiError && err.status === 401) break;
      }
      setCreated(ok);
      setFailures([...failed]);
      setProgress({ done: index + 1, total: toImport.length });
    }
    setCreated(ok);
    setFailures(failed);
    setPhase("done");
    if (ok > 0) await onImported();
  }

  const importing = phase === "importing";

  return (
    <Dialog title="Importar itens" isOpen onClose={onClose} busy={importing}>
      <div className="import-dialog">
        {phase === "pick" && (
          <>
            <p className="import-intro">
              Traga sua lista de uma planilha (.xlsx) ou de um arquivo .csv. O
              arquivo gerado pelo botão <strong>Exportar</strong> também
              funciona.
            </p>
            <label
              className={`import-drop${dragging ? " is-dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <input
                type="file"
                className="sr-only"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => {
                  void pickFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <FileSpreadsheet size={28} aria-hidden="true" />
              <strong>Escolher arquivo</strong>
              <span>ou arraste e solte aqui · .xlsx ou .csv</span>
            </label>
            {readError && (
              <div role="alert" className="form-error">
                {readError}
              </div>
            )}
            <div className="import-model">
              <strong>Não tem uma planilha pronta?</strong>
              <span>Baixe o modelo, com exemplos e instruções:</span>
              <span className="import-model-links">
                <a href={MODEL_XLSX} download>
                  Modelo Excel (.xlsx)
                </a>
                <a href={MODEL_CSV} download>
                  Modelo CSV
                </a>
              </span>
            </div>
            <ul className="import-rules">
              <li>
                Colunas obrigatórias: <strong>Item</strong> e{" "}
                <strong>Ambiente</strong>, preenchidas em todas as linhas.
                Opcionais: Situação, Quantidade, Preço, Desconto/cashback, Link
                e Observações.
              </li>
              <li>
                Se o arquivo tiver qualquer erro de formato, nada é importado.
                Ambientes que ainda não existem são criados. Até{" "}
                {IMPORT_LIMITS.maxRows} itens por arquivo.
              </li>
            </ul>
          </>
        )}

        {phase === "review" && parsed && plan && (
          <>
            <div className="import-file">
              <FileSpreadsheet size={18} aria-hidden="true" />
              <span>{fileName}</span>
              <button
                type="button"
                className="import-link-button"
                onClick={() => {
                  setPhase("pick");
                  setParsed(null);
                }}
              >
                Trocar arquivo
              </button>
            </div>

            <ul className="import-summary" aria-label="Resumo da leitura">
              <li>
                <strong>{errors.length > 0 ? 0 : toImport.length}</strong>
                <span>
                  {errors.length === 0 && toImport.length === 1
                    ? "item será importado"
                    : "itens serão importados"}
                </span>
              </li>
              <li>
                <strong>{plan.newCategories.length}</strong>
                <span>
                  {plan.newCategories.length === 1
                    ? "ambiente novo"
                    : "ambientes novos"}
                </span>
              </li>
              <li className={errors.length ? "is-problem" : undefined}>
                <strong>{errors.length}</strong>
                <span>
                  {errors.length === 1 ? "erro a corrigir" : "erros a corrigir"}
                </span>
              </li>
            </ul>

            {errors.length > 0 && (
              <div role="alert" className="form-error">
                O arquivo não está no formato correto, então nada será
                importado. Corrija os erros abaixo (Item e Ambiente são
                obrigatórios em todas as linhas), salve e envie o arquivo de
                novo.
              </div>
            )}

            {plan.newCategories.length > 0 && (
              <p className="import-note">
                Serão criados: {plan.newCategories.join(", ")}.
              </p>
            )}
            {parsed.ignoredColumns.length > 0 && (
              <p className="import-note">
                Colunas não reconhecidas e ignoradas:{" "}
                {parsed.ignoredColumns.join(", ")}.
              </p>
            )}

            {plan.duplicates > 0 && (
              <label className="import-check">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(event) => setSkipDuplicates(event.target.checked)}
                />
                <span>
                  Pular{" "}
                  {plural(
                    plan.duplicates,
                    "item que já existe",
                    "itens que já existem",
                  )}{" "}
                  (mesmo nome no mesmo ambiente)
                </span>
              </label>
            )}

            {toImport.length > 0 && (
              <div
                className="import-preview"
                role="region"
                aria-label="Prévia dos primeiros itens"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col">Ambiente</th>
                      <th scope="col">Situação</th>
                      <th scope="col">Preço</th>
                    </tr>
                  </thead>
                  <tbody>
                    {toImport.slice(0, PREVIEW_ROWS).map((row) => (
                      <tr key={row.line}>
                        <td>
                          {row.name}
                          {row.quantity > 1 && <em> ×{row.quantity}</em>}
                        </td>
                        <td>{row.categoryName}</td>
                        <td>{ITEM_STATUS_META[row.status].label}</td>
                        <td>{money(row.priceCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {toImport.length > PREVIEW_ROWS && (
                  <p>
                    … e mais {toImport.length - PREVIEW_ROWS}{" "}
                    {toImport.length - PREVIEW_ROWS === 1 ? "item" : "itens"}.
                  </p>
                )}
              </div>
            )}

            {(errors.length > 0 || warnings.length > 0) && (
              <details className="import-issues" open={errors.length > 0}>
                <summary>
                  <AlertTriangle size={16} aria-hidden="true" />
                  {[
                    errors.length > 0 && plural(errors.length, "erro", "erros"),
                    warnings.length > 0 &&
                      plural(warnings.length, "aviso", "avisos"),
                  ]
                    .filter(Boolean)
                    .join(" e ")}
                </summary>
                <ul>
                  {[...errors, ...warnings]
                    .slice(0, LISTED_ISSUES)
                    .map((issue, index) => (
                      <li key={index} className={`is-${issue.level}`}>
                        <strong>Linha {issue.line}:</strong> {issue.message}
                      </li>
                    ))}
                </ul>
                {errors.length + warnings.length > LISTED_ISSUES && (
                  <p>
                    … e mais {errors.length + warnings.length - LISTED_ISSUES}.
                  </p>
                )}
              </details>
            )}

            <div className="import-actions">
              <button
                type="button"
                className="button button-outline"
                onClick={onClose}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button button-dark"
                disabled={errors.length > 0 || toImport.length === 0}
                onClick={() => void runImport()}
              >
                {errors.length > 0
                  ? "Corrija o arquivo para importar"
                  : toImport.length === 0
                    ? "Nada para importar"
                    : `Importar ${plural(toImport.length, "item", "itens")}`}
              </button>
            </div>
          </>
        )}

        {importing && (
          <>
            <p className="import-intro" role="status">
              Importando {progress.done} de {progress.total}…
            </p>
            <progress
              className="import-progress"
              value={progress.done}
              max={Math.max(1, progress.total)}
              aria-label="Progresso da importação"
            />
            <p className="import-note">
              Mantenha esta janela aberta até terminar.
            </p>
            <div className="import-actions">
              <button
                type="button"
                className="button button-outline"
                onClick={() => {
                  stopRef.current = true;
                }}
              >
                Parar
              </button>
            </div>
          </>
        )}

        {phase === "done" && (
          <>
            <div className="import-result" role="status">
              <CheckCircle2 size={22} aria-hidden="true" />
              <div>
                <strong>
                  {created === 0
                    ? "Nenhum item foi importado."
                    : `${plural(created, "item importado", "itens importados")}.`}
                </strong>
                {stopped && <span>A importação foi interrompida.</span>}
                {failures.length > 0 && (
                  <span>
                    {plural(
                      failures.length,
                      "item não pôde",
                      "itens não puderam",
                    )}{" "}
                    ser salvo{failures.length === 1 ? "" : "s"}.
                  </span>
                )}
              </div>
            </div>
            {failures.length > 0 && (
              <ul className="import-issues-list">
                {failures.slice(0, LISTED_ISSUES).map((failure) => (
                  <li key={failure.line}>
                    <strong>Linha {failure.line}:</strong> {failure.message}
                  </li>
                ))}
                {failures.length > LISTED_ISSUES && (
                  <li>… e mais {failures.length - LISTED_ISSUES}.</li>
                )}
              </ul>
            )}
            <div className="import-actions">
              <button
                type="button"
                className="button button-dark"
                onClick={onClose}
              >
                Concluir
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
