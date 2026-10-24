import { Checkbox } from "./ui/checkbox";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { Input } from "@/src/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/src/components/ui/table";
import { Disclosure, DisclosureTrigger } from "@/src/components/ui/disclosure";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Sparkles,
  Upload,
} from "@/src/components/icons";
import { ApiError, createItem, matchCatalogNames } from "../api";
import { capture } from '../analytics';
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
import {
  applyCatalogSuggestions,
  catalogSuggestions,
  defaultAcceptedSuggestions,
  remainingIssues,
  type CatalogSuggestion,
} from "../utils/importCatalog";
import { Dialog } from "./Dialog";

const MODEL_CSV = "/modelos/casamia-modelo-importacao.csv";
const MODEL_XLSX = "/modelos/casamia-modelo-importacao.xlsx";
const PREVIEW_ROWS = 6;
const LISTED_ISSUES = 15;

/** loading: consultando o catálogo · ready: sugestões prontas (ou nenhuma) · failed: segue sem o catálogo. */
type CatalogState = "loading" | "ready" | "failed";

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

export function ImportItemsButton({
  open: openProp,
  onOpenChange,
  hideTrigger = false,
  ...props
}: ImportItemsButtonProps & {
  /** Controlado por fora (celular): a janela abre a partir de "Planilhas", sem o botão próprio. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  return (
    <>
      {!hideTrigger && (
        <Button variant="brand" size="brand"
          type="button"
          className="button button-outline button-small export-menu-trigger"
          aria-label="Importar"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <Upload size={17} aria-hidden="true" />
          <span>Importar</span>
        </Button>
      )}
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
  // Catálogo mestre: corrige a grafia dos itens e sugere o ambiente de cada um (inclusive quando a planilha não diz).
  const [catalogState, setCatalogState] = useState<CatalogState>("ready");
  const [suggestions, setSuggestions] = useState<CatalogSuggestion[]>([]);
  const [accepted, setAccepted] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    setSuggestions([]);
    setAccepted(new Set());
    if (!parsed || parsed.rows.length === 0) {
      setCatalogState("ready");
      return;
    }
    setCatalogState("loading");
    const controller = new AbortController();
    matchCatalogNames(parsed.rows.map((row) => row.name), controller.signal)
      .then(({ results }) => {
        const found = catalogSuggestions(parsed.rows, results, categories.map((category) => category.name));
        setSuggestions(found);
        setAccepted(defaultAcceptedSuggestions(found));
        setCatalogState("ready");
      })
      .catch(() => {
        // Sem o catálogo a importação continua como antes: só o que está no arquivo.
        if (!controller.signal.aborted) setCatalogState("failed");
      });
    return () => controller.abort();
    // Uma consulta por arquivo: os ambientes não mudam com o diálogo aberto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed]);

  const rows = useMemo(
    () => (parsed ? applyCatalogSuggestions(parsed.rows, suggestions, accepted) : []),
    [parsed, suggestions, accepted],
  );

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
    // Linhas ainda sem ambiente são erro e não entram no plano.
    const planned = rows.filter((row) => row.categoryName).map((row) => {
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
        planned
          .filter(({ row }) => !known.has(normalizeText(row.categoryName)))
          .map(({ row }) => row.categoryName),
      ),
    ];
    return {
      rows: planned,
      newCategories,
      duplicates: planned.filter((entry) => entry.duplicate).length,
    };
  }, [parsed, rows, categories, items]);

  const toImport = useMemo(
    () =>
      plan
        ? plan.rows
            .filter((entry) => !(skipDuplicates && entry.duplicate))
            .map((entry) => entry.row)
        : [],
    [plan, skipDuplicates],
  );

  const issues = parsed ? remainingIssues(parsed.issues, rows) : [];
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const catalogLoading = catalogState === "loading";
  const toggleSuggestion = (key: string, checked: boolean) =>
    setAccepted((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });

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
    if (catalogLoading || errors.length > 0 || toImport.length === 0) return;
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
          // A planilha mantém a ordem das linhas: sem isso cada item novo passaria na frente do anterior.
          placement: "end",
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
    capture('items_imported', { count: ok, failed: failed.length, stopped: stopRef.current, catalog_applied: accepted.size });
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
            <Label
              className={`import-drop${dragging ? " is-dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <Input
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
            </Label>
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
                <strong>Ambiente</strong>. O Ambiente pode ficar vazio nos itens
                que o catálogo conhece: ele sugere onde cada um fica. Opcionais:
                Situação, Quantidade, Preço, Desconto/cashback, Link e
                Observações.
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
              <Button variant="brand" size="brand"
                type="button"
                className="import-link-button"
                onClick={() => {
                  setPhase("pick");
                  setParsed(null);
                }}
              >
                Trocar arquivo
              </Button>
            </div>

            <ul className="import-summary" aria-label="Resumo da leitura">
              <li>
                <strong>{errors.length > 0 || catalogLoading ? 0 : toImport.length}</strong>
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
                obrigatórios em todas as linhas, a não ser que o catálogo sugira
                o ambiente), salve e envie o arquivo de novo.
              </div>
            )}

            {catalogLoading && (
              <p className="import-note" role="status">
                Consultando o catálogo…
              </p>
            )}
            {catalogState === "failed" && (
              <p className="import-note" role="status">
                Não consegui consultar o catálogo agora: os itens entram como
                estão no arquivo.
              </p>
            )}
            {suggestions.length > 0 && (
              <section className="import-catalog" aria-labelledby="import-catalog-title">
                <div className="import-catalog-head">
                  <Sparkles size={16} aria-hidden="true" />
                  <strong id="import-catalog-title">
                    {plural(suggestions.length, "sugestão do catálogo", "sugestões do catálogo")}
                  </strong>
                  {suggestions.length > 1 && (
                    <Button variant="brand" size="brand"
                      type="button"
                      className="import-link-button"
                      onClick={() =>
                        setAccepted(
                          accepted.size === suggestions.length
                            ? new Set()
                            : new Set(suggestions.map((suggestion) => suggestion.key)),
                        )
                      }
                    >
                      {accepted.size === suggestions.length ? "Desmarcar todas" : "Aceitar todas"}
                    </Button>
                  )}
                </div>
                <ul>
                  {suggestions.map((suggestion) => (
                    <li key={suggestion.key}>
                      <Label className="import-check">
                        <Checkbox
                          checked={accepted.has(suggestion.key)}
                          onCheckedChange={(checked) => toggleSuggestion(suggestion.key, checked === true)}
                        />
                        <span>
                          <strong>Linha {suggestion.line}:</strong>{" "}
                          <SuggestionText suggestion={suggestion} />
                        </span>
                      </Label>
                    </li>
                  ))}
                </ul>
              </section>
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
              <Label className="import-check">
                <Checkbox
                  checked={skipDuplicates}
                  onCheckedChange={checked => setSkipDuplicates(checked === true)}
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
              </Label>
            )}

            {toImport.length > 0 && (
              <div
                className="import-preview"
                role="region"
                aria-label="Prévia dos primeiros itens"
                tabIndex={0}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Item</TableHead>
                      <TableHead scope="col">Ambiente</TableHead>
                      <TableHead scope="col">Situação</TableHead>
                      <TableHead scope="col">Preço</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {toImport.slice(0, PREVIEW_ROWS).map((row) => (
                      <TableRow key={row.line}>
                        <TableCell>
                          {row.name}
                          {row.quantity > 1 && <em> ×{row.quantity}</em>}
                        </TableCell>
                        <TableCell>{row.categoryName}</TableCell>
                        <TableCell>{ITEM_STATUS_META[row.status].label}</TableCell>
                        <TableCell>{money(row.priceCents)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {toImport.length > PREVIEW_ROWS && (
                  <p>
                    … e mais {toImport.length - PREVIEW_ROWS}{" "}
                    {toImport.length - PREVIEW_ROWS === 1 ? "item" : "itens"}.
                  </p>
                )}
              </div>
            )}

            {(errors.length > 0 || warnings.length > 0) && (
              <Disclosure className="import-issues" open={errors.length > 0}>
                <DisclosureTrigger>
                  <AlertTriangle size={16} aria-hidden="true" />
                  {[
                    errors.length > 0 && plural(errors.length, "erro", "erros"),
                    warnings.length > 0 &&
                      plural(warnings.length, "aviso", "avisos"),
                  ]
                    .filter(Boolean)
                    .join(" e ")}
                </DisclosureTrigger>
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
              </Disclosure>
            )}

            <div className="import-actions">
              <Button variant="brand" size="brand"
                type="button"
                className="button button-outline"
                onClick={onClose}
              >
                Cancelar
              </Button>
              <Button variant="brand" size="brand"
                type="button"
                className="button button-dark"
                disabled={catalogLoading || errors.length > 0 || toImport.length === 0}
                onClick={() => void runImport()}
              >
                {catalogLoading
                  ? "Consultando o catálogo…"
                  : errors.length > 0
                  ? "Corrija o arquivo para importar"
                  : toImport.length === 0
                    ? "Nada para importar"
                    : `Importar ${plural(toImport.length, "item", "itens")}`}
              </Button>
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
              <Button variant="brand" size="brand"
                type="button"
                className="button button-outline"
                onClick={() => {
                  stopRef.current = true;
                }}
              >
                Parar
              </Button>
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
              <Button variant="brand" size="brand"
                type="button"
                className="button button-dark"
                onClick={onClose}
              >
                Concluir
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

function SuggestionText({ suggestion }: { suggestion: CatalogSuggestion }) {
  if (suggestion.kind === "name")
    return (
      <>
        “{suggestion.from}” vira <b>{suggestion.to}</b>
      </>
    );
  if (suggestion.kind === "fill")
    return (
      <>
        {suggestion.itemName} vai para <b>{suggestion.to}</b> (Ambiente vazio na planilha)
      </>
    );
  return (
    <>
      {suggestion.itemName} vai para <b>{suggestion.to}</b>, em vez de {suggestion.from}
    </>
  );
}
