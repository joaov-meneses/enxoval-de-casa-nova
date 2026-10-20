import { Label } from "@/src/components/ui/label";
import { Button } from "@/src/components/ui/button";
import { useId, useMemo, useState } from "react";
import { AlertCircle, ListOrdered, Plus, Sparkles } from "@/src/components/icons";
import { prioritizeEnvironment, recommendNextItem } from "../api";
import { useJevEnabled } from "../hooks/useJevEnabled";
import { isDoneStatus } from "../itemStatus";
import { URGENCY_LEVELS, urgencyLabel } from "../planning/purchaseUrgency";
import type {
  EnxovalCategory,
  EnxovalItem,
  ItemUrgencyResult,
  NextItemRecommendation,
} from "../types";
import { Nino } from "./Nino";
import { Select } from "./Select";

/** Acima disto o Nino afirma; entre o mínimo do servidor e isto, ele só sugere. */
const SURE = 0.85;
/** Quantos itens a lista "O que comprar primeiro?" mostra por ambiente. */
const TOP_URGENT = 8;
/** Abaixo disto a nota do Jev é só uma estimativa (mesmo corte do servidor). */
const UNCERTAIN = 0.5;

const NO_SUGGESTION: Record<string, string> = {
  complete: "Você já tem tudo o que o catálogo indica para este ambiente. Que capricho!",
  none: "O Nino não viu nada indispensável faltando aqui. Se quiser, tente outro ambiente.",
  unknown_room:
    "O Nino ainda não conhece este tipo de ambiente. Ele sugere itens para cozinha, quarto, banheiro, sala, área de serviço e outros cômodos da casa.",
  unavailable: "A ajuda do Nino não está disponível agora.",
};

interface Score {
  urgency: number;
  confidence: number;
}

/** A nota recebida só vale para o nome e o ambiente que o item tinha na hora: renomear ou mover descarta a nota. */
const scoreKey = (item: EnxovalItem) => `${item.id}|${item.name}|${item.categoryId}`;

/**
 * Ajuda do Nino (Jev) no planejamento: sugere o próximo item de um ambiente e mostra os itens que mais urgem em
 * cada ambiente. Só aparece quando o servidor tem o Jev ligado, e só consulta quando a pessoa pede.
 */
export function NinoAssistant({
  enxovalId,
  categories,
  items,
  onAddItem,
}: {
  enxovalId: string;
  categories: EnxovalCategory[];
  items: EnxovalItem[];
  onAddItem: (name: string, categoryId?: string, categoryName?: string) => Promise<void>;
}) {
  const enabled = useJevEnabled();
  const baseId = useId();
  const [categoryId, setCategoryId] = useState("");
  const [urgencyCategoryId, setUrgencyCategoryId] = useState("");
  const [busy, setBusy] = useState<"next" | "urgency" | "add" | null>(null);
  const [error, setError] = useState("");
  const [next, setNext] = useState<NextItemRecommendation | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  // Notas recebidas do servidor nesta visita. As que já vieram gravadas no item (`aiUrgency`) não passam por aqui.
  const [fetched, setFetched] = useState<Record<string, Score & { key: string }>>({});
  // Ambiente cuja lista está na tela, e o que a última consulta fez.
  const [shownId, setShownId] = useState("");
  const [lastRun, setLastRun] = useState<Pick<ItemUrgencyResult, "inferred" | "cached" | "unscored"> | null>(null);

  const selectedId = categories.some((category) => category.id === categoryId)
    ? categoryId
    : (categories[0]?.id ?? "");
  const selectedUrgencyId = categories.some((category) => category.id === urgencyCategoryId)
    ? urgencyCategoryId
    : (categories[0]?.id ?? "");

  const scoreOf = (item: EnxovalItem): Score | null => {
    if (typeof item.aiUrgency === "number") {
      return { urgency: item.aiUrgency, confidence: item.aiUrgencyConfidence ?? 0 };
    }
    const received = fetched[item.id];
    return received && received.key === scoreKey(item) ? received : null;
  };

  const pendingOf = (id: string) =>
    items.filter(
      (item) => item.categoryId === id && !isDoneStatus(item.status),
    );

  const shownCategory = categories.find((category) => category.id === shownId);
  const shownPending = useMemo(
    () =>
      items.filter(
        (item) => item.categoryId === shownId && !isDoneStatus(item.status),
      ),
    [items, shownId],
  );
  const ranked = shownPending
    .map((item) => ({ item, score: scoreOf(item) }))
    .filter((entry): entry is { item: EnxovalItem; score: Score } => entry.score !== null)
    .sort((a, b) => b.score.urgency - a.score.urgency)
    .slice(0, TOP_URGENT);

  if (!enabled || categories.length === 0) return null;

  async function askNext() {
    if (!selectedId) return;
    setBusy("next");
    setError("");
    setNext(null);
    try {
      setNext(await recommendNextItem(enxovalId, selectedId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível consultar o Nino.");
    } finally {
      setBusy(null);
    }
  }

  async function addRecommended(name: string) {
    const recommendation = next?.recommendation;
    if (!recommendation) return;
    setBusy("add");
    setError("");
    setAdding(name);
    try {
      await onAddItem(name, recommendation.categoryId);
      setNext(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível adicionar o item.");
    } finally {
      setBusy(null);
      setAdding(null);
    }
  }

  async function askUrgency() {
    if (!selectedUrgencyId) return;
    setError("");
    setShownId(selectedUrgencyId);
    const pending = pendingOf(selectedUrgencyId);
    // Todos os itens já têm nota (gravada antes ou recebida agora): não há o que perguntar ao Jev.
    if (pending.every((item) => scoreOf(item) !== null)) {
      setLastRun({ inferred: 0, cached: pending.length, unscored: 0 });
      return;
    }
    setBusy("urgency");
    try {
      const result = await prioritizeEnvironment(enxovalId, selectedUrgencyId);
      const byId = new Map(pending.map((item) => [item.id, item]));
      setFetched((current) => {
        const merged = { ...current };
        for (const score of result.scores) {
          const item = byId.get(score.id);
          if (item) merged[score.id] = { key: scoreKey(item), urgency: score.urgency, confidence: score.confidence };
        }
        return merged;
      });
      setLastRun({ inferred: result.inferred, cached: result.cached, unscored: result.unscored });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível consultar o Nino.");
    } finally {
      setBusy(null);
    }
  }

  const recommendation = next?.recommendation ?? null;
  const urgencyPendingCount = pendingOf(selectedUrgencyId).length;

  return (
    <section className="pp-card pp-nino" aria-labelledby={`${baseId}-title`}>
      <div className="pp-nino-head">
        <Nino pose="think" size={56} />
        <div>
          <h3 id={`${baseId}-title`}>
            <Sparkles size={15} aria-hidden="true" /> Ajuda do Nino
          </h3>
          <p className="pp-hint">
            O Nino olha a sua casa, quem mora nela e o prazo da mudança para dizer o que
            comprar primeiro. Ele só sugere: a decisão é sua.
          </p>
        </div>
      </div>

      {error && (
        <div className="pp-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" /> {error}
        </div>
      )}

      <div className="pp-nino-block">
        <Label htmlFor={`${baseId}-room`}>Qual o próximo item de um ambiente?</Label>
        <div className="pp-nino-row">
          <Select
            id={`${baseId}-room`}
            value={selectedId}
            disabled={busy !== null}
            options={categories.map((category) => ({ value: category.id, label: category.name }))}
            onChange={(value) => {
              setCategoryId(value);
              setNext(null);
            }}
          />
          <Button variant="brand" size="brand"
            type="button"
            className="button button-outline button-small"
            disabled={busy !== null}
            onClick={() => void askNext()}
          >
            {busy === "next" ? "Pensando…" : "Pedir sugestão"}
          </Button>
        </div>
        {next && !recommendation && (
          <p className="pp-hint" role="status">
            {NO_SUGGESTION[next.reason ?? "none"] ?? NO_SUGGESTION.none}
          </p>
        )}
        {recommendation && (
          <>
            {!recommendation.clear && (
              <p className="pp-hint" role="status">
                O Nino não tem um favorito claro para {recommendation.categoryName}. Estas são as
                melhores opções agora:
              </p>
            )}
            <ul className="pp-nino-options" aria-label="Sugestões do Nino">
              {(recommendation.clear ? recommendation.options.slice(0, 1) : recommendation.options).map(
                (option) => (
                  <li key={option.name} className="pp-nino-result">
                    <div>
                      <strong>{option.name}</strong>
                      <span>
                        {recommendation.clear
                          ? recommendation.confidence >= SURE
                            ? "O Nino recomenda"
                            : "O Nino acha que pode ser este"
                          : "Boa opção"}{" "}
                        · {option.essential ? "essencial" : "opcional"} em {recommendation.categoryName}
                      </span>
                    </div>
                    <Button variant="brand" size="brand"
                      type="button"
                      className="button button-outline button-small"
                      disabled={busy !== null}
                      onClick={() => void addRecommended(option.name)}
                    >
                      <Plus size={14} aria-hidden="true" />
                      {adding === option.name ? "Adicionando…" : "Adicionar"}
                    </Button>
                  </li>
                ),
              )}
            </ul>
          </>
        )}
      </div>

      <div className="pp-nino-block">
        <Label htmlFor={`${baseId}-urgency`}>O que comprar primeiro?</Label>
        <div className="pp-nino-row">
          <Select
            id={`${baseId}-urgency`}
            value={selectedUrgencyId}
            disabled={busy !== null}
            options={categories.map((category) => ({ value: category.id, label: category.name }))}
            onChange={(value) => setUrgencyCategoryId(value)}
          />
          <Button variant="brand" size="brand"
            type="button"
            className="button button-outline button-small"
            disabled={busy !== null || urgencyPendingCount === 0}
            onClick={() => void askUrgency()}
          >
            <ListOrdered size={14} aria-hidden="true" />
            {busy === "urgency" ? "Pensando…" : "Ver os itens prioritários"}
          </Button>
        </div>
        {urgencyPendingCount === 0 && (
          <p className="pp-hint">Este ambiente não tem itens pendentes para priorizar.</p>
        )}
        {shownCategory && ranked.length > 0 && (
          <>
            <ol className="pp-nino-ranking" aria-label={`Itens de ${shownCategory.name} em ordem de urgência`}>
              {ranked.map(({ item, score }) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {shownCategory.name}
                      {score.confidence < UNCERTAIN && " · estimativa incerta"}
                    </span>
                  </div>
                  <span
                    className={`pp-nino-urgency is-${Math.min(URGENCY_LEVELS, Math.max(1, Math.round(score.urgency)))}`}
                  >
                    {urgencyLabel(score.urgency)}
                  </span>
                </li>
              ))}
            </ol>
            {lastRun && (
              <p className="pp-hint" role="status">
                {lastRun.inferred > 0
                  ? `O Nino avaliou ${lastRun.inferred} ${lastRun.inferred === 1 ? "item novo" : "itens novos"}${lastRun.cached > 0 ? ` e reaproveitou a avaliação de ${lastRun.cached}` : ""}.`
                  : "Avaliações já feitas e guardadas: nenhuma nova consulta."}
                {lastRun.unscored > 0 &&
                  ` ${lastRun.unscored} ${lastRun.unscored === 1 ? "item ficou" : "itens ficaram"} sem avaliação; toque de novo para tentar.`}
              </p>
            )}
          </>
        )}
        {shownCategory && ranked.length === 0 && busy === null && urgencyPendingCount > 0 && (
          <p className="pp-hint" role="status">
            O Nino não conseguiu avaliar os itens de {shownCategory.name} agora. Tente de novo mais tarde.
          </p>
        )}
      </div>
    </section>
  );
}
