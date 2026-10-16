import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import {
  approveAdminCatalogItem,
  completeAdminCatalogItem,
  fetchAdminCatalog,
  mergeAdminCatalogItem,
} from "../api";
import type { AdminCatalogItem, AdminCatalogMetrics } from "../types";

const ROOMS: { id: string; label: string }[] = [
  { id: "cozinha", label: "Cozinha" },
  { id: "eletro", label: "Eletrodomésticos" },
  { id: "sala", label: "Sala" },
  { id: "quarto", label: "Quarto" },
  { id: "quartoExtra", label: "Quarto extra" },
  { id: "banheiro", label: "Banheiro" },
  { id: "servico", label: "Área de serviço" },
  { id: "externa", label: "Área externa" },
  { id: "escritorio", label: "Escritório" },
];

const percent = (value: number | null) => (value === null ? "sem dados" : `${Math.round(value * 100)}%`);

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="cat-admin-metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PendingRow({
  item,
  busy,
  onApprove,
  onComplete,
  onMerge,
}: {
  item: AdminCatalogItem;
  busy: boolean;
  onApprove: (patch: { canonicalName: string; room: string | null; priority: "essential" | "optional" }) => void;
  onComplete: () => void;
  onMerge: (targetId: string) => void;
}) {
  const [name, setName] = useState(item.canonicalName);
  const [room, setRoom] = useState(item.room ?? "");
  const [priority, setPriority] = useState(item.priority);
  const [target, setTarget] = useState(item.similar[0]?.id ?? "");

  // "Completar com o Jev" muda o item no servidor; o formulário acompanha.
  useEffect(() => {
    setRoom(item.room ?? "");
    setPriority(item.priority);
  }, [item.room, item.priority]);

  return (
    <li className="cat-admin-item">
      <div className="cat-admin-fields">
        <label>
          Nome
          <input value={name} maxLength={36} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Cômodo
          <select value={room} onChange={(event) => setRoom(event.target.value)}>
            <option value="">Sem cômodo</option>
            {ROOMS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Prioridade
          <select value={priority} onChange={(event) => setPriority(event.target.value as "essential" | "optional")}>
            <option value="essential">Essencial</option>
            <option value="optional">Opcional</option>
          </select>
        </label>
      </div>
      <p className="cat-admin-usage">
        {item.usage === 0 ? "Ainda sem itens ligados" : `${item.usage} ${item.usage === 1 ? "item ligado" : "itens ligados"}`}
      </p>
      <div className="cat-admin-actions">
        <button
          type="button"
          className="is-primary"
          disabled={busy || !name.trim()}
          onClick={() => onApprove({ canonicalName: name, room: room || null, priority })}
        >
          Aprovar
        </button>
        <button type="button" disabled={busy} onClick={onComplete}>
          Completar com o Jev
        </button>
        {item.similar.length > 0 && (
          <span className="cat-admin-merge">
            <select aria-label="Mesclar com" value={target} onChange={(event) => setTarget(event.target.value)}>
              {item.similar.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name} ({Math.round(entry.score * 100)}%)
                </option>
              ))}
            </select>
            <button type="button" disabled={busy || !target} onClick={() => onMerge(target)}>
              Mesclar
            </button>
          </span>
        )}
      </div>
    </li>
  );
}

/** Catálogo compartilhado: métricas de acerto e fila de itens novos para a equipe aprovar, mesclar ou completar. */
export function AdminCatalog({ onError }: { onError: (err: unknown) => void }) {
  const [data, setData] = useState<{ metrics: AdminCatalogMetrics; pending: AdminCatalogItem[] } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // O avisador de erro muda a cada renderização do painel; guardá-lo aqui evita buscar a lista de novo toda vez.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const load = () =>
    fetchAdminCatalog()
      .then(setData)
      .catch((err) => {
        setData((current) => current ?? { metrics: EMPTY_METRICS, pending: [] });
        onErrorRef.current(err);
      });

  useEffect(() => {
    void load();
  }, []);

  async function act(id: string, task: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await task();
      await load();
    } catch (err) {
      onErrorRef.current(err);
    } finally {
      setBusyId(null);
    }
  }

  const metrics = data?.metrics;
  return (
    <section className="admin-users fb-admin" aria-labelledby="cat-admin-title">
      <div className="admin-users-heading">
        <h2 id="cat-admin-title">Catálogo de itens</h2>
        <p className="fb-admin-sub">
          Itens novos digitados por quem usa o app. Aprove, ajuste ou mescle com um item parecido.
        </p>
      </div>

      {data === null || !metrics ? (
        <p className="fb-admin-empty">
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Carregando…
        </p>
      ) : (
        <>
          <dl className="cat-admin-metrics">
            <Metric label={`Atendido sem Jev (${metrics.days} dias)`} value={percent(metrics.hitRate)} />
            <Metric label="Consultas ao Jev por dia" value={metrics.jevCallsPerDay.toFixed(1).replace(".", ",")} />
            <Metric label="Pendentes de revisão" value={String(metrics.pendingReview)} />
            <Metric label="Itens sem estimativa" value={String(metrics.itemsWithoutUrgency)} />
          </dl>
          {data.pending.length === 0 ? (
            <p className="fb-admin-empty">Nenhum item aguardando revisão.</p>
          ) : (
            <ul className="cat-admin-list">
              {data.pending.map((item) => (
                <PendingRow
                  key={item.id}
                  item={item}
                  busy={busyId === item.id}
                  onApprove={(patch) => act(item.id, () => approveAdminCatalogItem(item.id, patch))}
                  onComplete={() => act(item.id, () => completeAdminCatalogItem(item.id))}
                  onMerge={(targetId) => act(item.id, () => mergeAdminCatalogItem(item.id, targetId))}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

const EMPTY_METRICS: AdminCatalogMetrics = {
  days: 30,
  resolveHits: 0,
  resolveMisses: 0,
  hitRate: null,
  jevCalls: 0,
  jevCallsPerDay: 0,
  pendingReview: 0,
  itemsWithoutUrgency: 0,
};
