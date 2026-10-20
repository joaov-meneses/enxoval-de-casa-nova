import { Badge } from "@/src/components/ui/badge";
import { Label } from "@/src/components/ui/label";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/src/components/ui/native-select";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Combine, LoaderCircle, Pencil, Search, Sparkles, Trash2, X } from "@/src/components/icons";
import {
  completeAdminCatalogItem,
  deleteAdminCatalogAlias,
  deleteAdminCatalogItem,
  fetchAdminCatalogItems,
  fetchAdminCatalogOverview,
  mergeAdminCatalogItem,
  updateAdminCatalogItem,
} from "../api";
import type { AdminCatalogItem, AdminCatalogOverview } from "../types";
import type { RoomKey } from "../onboarding/types";
import { ROOM_CATEGORY_NAME } from "../planning/regional";

type Filter = AdminCatalogItem["status"];

const SOURCE_LABEL: Record<AdminCatalogItem["source"], string> = {
  curated: "Curadoria",
  users: "Vindo das listas",
  jev: "Criado pelo Jev",
};

const TIMING_LABEL = { first_night: "Primeira noite", first_week: "Primeira semana" } as const;

const percent = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);

interface Draft {
  name: string;
  room: RoomKey | "";
  priority: "essential" | "optional";
  timing: "" | "first_night" | "first_week";
  leadTimeWeeks: string;
  priceCategory: "" | "1" | "2" | "3" | "4";
  functionGroup: string;
}

const toDraft = (item: AdminCatalogItem): Draft => ({
  name: item.name,
  room: item.room ?? "",
  priority: item.priority ?? "optional",
  timing: item.timing ?? "",
  leadTimeWeeks: String(item.leadTimeWeeks),
  priceCategory: item.priceCategory ? (String(item.priceCategory) as Draft["priceCategory"]) : "",
  functionGroup: item.functionGroup ?? "",
});

/** Escolhe o item que fica, ao mesclar um duplicado: busca entre os aprovados. */
function MergePicker({ item, onMerge, onCancel }: { item: AdminCatalogItem; onMerge: (target: AdminCatalogItem) => void; onCancel: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminCatalogItem[]>([]);
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      fetchAdminCatalogItems({ status: "approved", q: query.trim() })
        .then((data) => alive && setResults(data.items.filter((candidate) => candidate.id !== item.id).slice(0, 6)))
        .catch(() => alive && setResults([]));
    }, 200);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, item.id]);

  return (
    <div className="cat-admin-merge">
      <Label className="admin-search">
        <Search size={16} aria-hidden="true" />
        <Input
          autoFocus
          type="search"
          aria-label={`Mesclar "${item.name}" em qual item?`}
          placeholder="Em qual item juntar? Busque pelo nome"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </Label>
      <ul>
        {results.map((candidate) => (
          <li key={candidate.id}>
            <Button variant="brand" size="brand" type="button" onClick={() => onMerge(candidate)}>
              Juntar em <strong>{candidate.name}</strong>
              {candidate.room && <small>{ROOM_CATEGORY_NAME[candidate.room]}</small>}
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="brand" size="brand" type="button" className="cat-admin-link" onClick={onCancel}>
        Cancelar
      </Button>
    </div>
  );
}

/**
 * Catálogo mestre no /admin: quanto o catálogo poupa o Jev, a fila do que o Jev e as listas criaram (para aprovar,
 * corrigir, mesclar ou recusar) e os apelidos de cada item (que podem ser desfeitos).
 */
export function AdminCatalog({ onError }: { onError: (err: unknown) => void }) {
  const [overview, setOverview] = useState<AdminCatalogOverview | null>(null);
  const [items, setItems] = useState<AdminCatalogItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>("pending_review");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [merging, setMerging] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // O avisador de erro muda a cada renderização do painel; guardá-lo aqui evita buscar a lista de novo toda vez.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const load = useCallback(async (status: Filter, q: string) => {
    try {
      const [summary, list] = await Promise.all([fetchAdminCatalogOverview(), fetchAdminCatalogItems({ status, q })]);
      setOverview(summary);
      setItems(list.items);
    } catch (err) {
      setItems([]);
      onErrorRef.current(err);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(filter, query.trim()), query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [filter, query, load]);

  async function act(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await action();
      setEditing(null);
      setMerging(null);
      setConfirmDelete(null);
      await load(filter, query.trim());
    } catch (err) {
      onErrorRef.current(err);
    } finally {
      setBusyId(null);
    }
  }

  function saveDraft(item: AdminCatalogItem, draft: Draft) {
    void act(item.id, () =>
      updateAdminCatalogItem(item.id, {
        name: draft.name.trim(),
        room: draft.room || null,
        priority: draft.priority,
        timing: draft.timing || null,
        leadTimeWeeks: Number(draft.leadTimeWeeks) || 0,
        priceCategory: draft.priceCategory ? (Number(draft.priceCategory) as 1 | 2 | 3 | 4) : null,
        functionGroup: draft.functionGroup.trim() || null,
      }),
    );
  }

  const count = (status: string) => overview?.catalog.filter((row) => row.status === status).reduce((sum, row) => sum + row.total, 0) ?? 0;

  return (
    <section className="admin-users fb-admin cat-admin" aria-labelledby="catalog-title">
      <div className="admin-users-heading">
        <div>
          <h2 id="catalog-title">Catálogo de itens</h2>
          <p className="fb-admin-sub">
            O que um enxoval descobre vale para todos. O Jev só é consultado para o que o catálogo ainda não conhece.
          </p>
        </div>
      </div>

      {overview && (
        <dl className="cat-admin-metrics">
          <div>
            <dt>Itens resolvidos sem Jev</dt>
            <dd>{percent(overview.hitRate)}</dd>
            <small>Meta: 90% ou mais</small>
          </div>
          <div>
            <dt>Urgências vindas do catálogo</dt>
            <dd>{percent(overview.urgencyHitRate)}</dd>
            <small>Notas por faixa de perfil</small>
          </div>
          <div>
            <dt>Consultas ao Jev em {overview.days} dias</dt>
            <dd>{overview.jevCalls}</dd>
            <small>
              {overview.jevCallsPerActiveUser === null
                ? "Sem pessoas ativas no período"
                : `${overview.jevCallsPerActiveUser.toFixed(1)} por pessoa ativa`}
            </small>
          </div>
          <div>
            <dt>Itens de listas sem estimativa</dt>
            <dd>{overview.gaps.unlinked}</dd>
            <small>
              {overview.gaps.without_urgency} do catálogo sem urgência · {overview.gaps.price_ranges} com faixa de preço
            </small>
          </div>
        </dl>
      )}

      <div className="cat-admin-toolbar">
        <div className="fb-admin-filters" role="group" aria-label="Filtrar itens do catálogo">
          {(
            [
              ["pending_review", "Aguardando revisão"],
              ["approved", "Aprovados"],
            ] as const
          ).map(([status, label]) => (
            <Button variant="brand" size="brand" key={status} type="button" aria-pressed={filter === status} onClick={() => setFilter(status)}>
              {label}
              <span>{count(status)}</span>
            </Button>
          ))}
        </div>
        <Label className="admin-search">
          <Search size={18} aria-hidden="true" />
          <Input
            aria-label="Buscar no catálogo"
            type="search"
            placeholder="Busque por nome ou apelido"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Label>
      </div>

      {items === null ? (
        <p className="fb-admin-empty">
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Carregando…
        </p>
      ) : items.length === 0 ? (
        <p className="fb-admin-empty">
          {filter === "pending_review" && !query ? "Nada aguardando revisão." : "Nenhum item encontrado."}
        </p>
      ) : (
        <ul className="fb-admin-list">
          {items.map((item) => {
            const busy = busyId === item.id;
            const draft = editing?.id === item.id ? editing.draft : null;
            return (
              <li key={item.id} className="fb-admin-item cat-admin-item" aria-busy={busy}>
                <div className="cat-admin-head">
                  <div className="cat-admin-title">
                    <strong>{item.name}</strong>
                    <small>
                      {item.room ? ROOM_CATEGORY_NAME[item.room] : "Cômodo não definido"}
                      {" · "}
                      {item.priority === "essential" ? "Essencial" : "Opcional"}
                      {item.timing ? ` · ${TIMING_LABEL[item.timing]}` : ""}
                      {item.leadTimeWeeks > 0 ? ` · entrega em ${item.leadTimeWeeks} sem.` : ""}
                      {item.functionGroup ? ` · grupo ${item.functionGroup}` : ""}
                    </small>
                  </div>
                  <Badge asChild variant="outline"><span className="admin-badge pending">{SOURCE_LABEL[item.source]}</span></Badge>
                  <span className="cat-admin-usage">
                    {item.usage} {item.usage === 1 ? "item em listas" : "itens em listas"}
                  </span>
                </div>

                {item.aliases.length > 0 && (
                  <ul className="cat-admin-aliases" aria-label={`Apelidos de ${item.name}`}>
                    {item.aliases.map((alias) => (
                      <li key={alias.key}>
                        {alias.alias}
                        <Button variant="brand" size="brand"
                          type="button"
                          aria-label={`Desfazer o apelido "${alias.alias}"`}
                          title={`Origem: ${alias.source}. Desfazer desliga os itens que entraram por este apelido.`}
                          disabled={busy}
                          onClick={() => void act(item.id, () => deleteAdminCatalogAlias(alias.key))}
                        >
                          <X size={13} aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                {draft && (
                  <form
                    className="cat-admin-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      saveDraft(item, draft);
                    }}
                  >
                    <Label>
                      Nome
                      <Input
                        required
                        maxLength={120}
                        value={draft.name}
                        onChange={(event) => setEditing({ id: item.id, draft: { ...draft, name: event.target.value } })}
                      />
                    </Label>
                    <Label>
                      Cômodo
                      <NativeSelect value={draft.room} onChange={(event) => setEditing({ id: item.id, draft: { ...draft, room: event.target.value as Draft["room"] } })}>
                        <NativeSelectOption value="">Não definido</NativeSelectOption>
                        {Object.entries(ROOM_CATEGORY_NAME).map(([room, label]) => (
                          <NativeSelectOption key={room} value={room}>
                            {label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Label>
                    <Label>
                      Prioridade
                      <NativeSelect value={draft.priority} onChange={(event) => setEditing({ id: item.id, draft: { ...draft, priority: event.target.value as Draft["priority"] } })}>
                        <NativeSelectOption value="essential">Essencial</NativeSelectOption>
                        <NativeSelectOption value="optional">Opcional</NativeSelectOption>
                      </NativeSelect>
                    </Label>
                    <Label>
                      Quando
                      <NativeSelect value={draft.timing} onChange={(event) => setEditing({ id: item.id, draft: { ...draft, timing: event.target.value as Draft["timing"] } })}>
                        <NativeSelectOption value="">Pode esperar</NativeSelectOption>
                        <NativeSelectOption value="first_night">Primeira noite</NativeSelectOption>
                        <NativeSelectOption value="first_week">Primeira semana</NativeSelectOption>
                      </NativeSelect>
                    </Label>
                    <Label>
                      Entrega (semanas)
                      <Input
                        type="number"
                        min={0}
                        max={26}
                        value={draft.leadTimeWeeks}
                        onChange={(event) => setEditing({ id: item.id, draft: { ...draft, leadTimeWeeks: event.target.value } })}
                      />
                    </Label>
                    <Label>
                      Faixa de preço
                      <NativeSelect value={draft.priceCategory} onChange={(event) => setEditing({ id: item.id, draft: { ...draft, priceCategory: event.target.value as Draft["priceCategory"] } })}>
                        <NativeSelectOption value="">Não definida</NativeSelectOption>
                        <NativeSelectOption value="1">1 · até R$ 80</NativeSelectOption>
                        <NativeSelectOption value="2">2 · R$ 80 a 250</NativeSelectOption>
                        <NativeSelectOption value="3">3 · R$ 250 a 1.200</NativeSelectOption>
                        <NativeSelectOption value="4">4 · acima de R$ 1.200</NativeSelectOption>
                      </NativeSelect>
                    </Label>
                    <Label>
                      Grupo de função
                      <Input
                        placeholder="ex.: fritura-sem-oleo"
                        pattern="[a-z0-9\-]{2,60}"
                        title="Letras minúsculas, números e hífen"
                        value={draft.functionGroup}
                        onChange={(event) => setEditing({ id: item.id, draft: { ...draft, functionGroup: event.target.value } })}
                      />
                    </Label>
                    <div className="cat-admin-actions">
                      <Button variant="brand" size="brand" type="submit" className="button button-dark" disabled={busy}>
                        Salvar
                      </Button>
                      <Button variant="brand" size="brand" type="button" className="button button-outline" onClick={() => setEditing(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </form>
                )}

                {merging === item.id && (
                  <MergePicker
                    item={item}
                    onCancel={() => setMerging(null)}
                    onMerge={(target) => void act(item.id, () => mergeAdminCatalogItem(item.id, target.id))}
                  />
                )}

                {!draft && merging !== item.id && (
                  <div className="cat-admin-actions">
                    {item.status === "pending_review" && (
                      <Button variant="brand" size="brand"
                        type="button"
                        className="button button-dark"
                        disabled={busy}
                        onClick={() => void act(item.id, () => updateAdminCatalogItem(item.id, { status: "approved" }))}
                      >
                        <Check size={16} aria-hidden="true" /> Aprovar
                      </Button>
                    )}
                    {item.status === "pending_review" && (
                      <Button variant="brand" size="brand"
                        type="button"
                        className="button button-outline"
                        disabled={busy}
                        title="Uma consulta ao Jev preenche cômodo, prioridade, prazo, faixa de preço e grupo que estiverem vazios."
                        onClick={() => void act(item.id, () => completeAdminCatalogItem(item.id))}
                      >
                        <Sparkles size={15} aria-hidden="true" /> Completar com o Jev
                      </Button>
                    )}
                    <Button variant="brand" size="brand" type="button" className="button button-outline" disabled={busy} onClick={() => setEditing({ id: item.id, draft: toDraft(item) })}>
                      <Pencil size={15} aria-hidden="true" /> Corrigir
                    </Button>
                    <Button variant="brand" size="brand" type="button" className="button button-outline" disabled={busy} onClick={() => setMerging(item.id)}>
                      <Combine size={15} aria-hidden="true" /> Mesclar
                    </Button>
                    {confirmDelete === item.id ? (
                      <Button variant="brand" size="brand"
                        type="button"
                        className="button admin-danger-button"
                        disabled={busy}
                        onClick={() => void act(item.id, () => deleteAdminCatalogItem(item.id))}
                      >
                        Confirmar: recusar
                      </Button>
                    ) : (
                      <Button variant="brand" size="brand" type="button" className="admin-status-action" disabled={busy} onClick={() => setConfirmDelete(item.id)}>
                        <Trash2 size={15} aria-hidden="true" /> Recusar
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="admin-list-note">
        Recusar apaga o item do catálogo; os itens das listas continuam, só sem as estimativas. Mesclar junta apelidos e
        vínculos no item escolhido.
      </p>
    </section>
  );
}
