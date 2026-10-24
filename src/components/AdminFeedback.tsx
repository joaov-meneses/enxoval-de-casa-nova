import { Button } from "@/src/components/ui/button";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bug, ChevronDown, LoaderCircle, MessageCircleHeart, Lightbulb } from "@/src/components/icons";
import { fetchAdminFeedback, updateAdminFeedbackStatus } from "../api";
import {
  FEEDBACK_AREAS,
  FEEDBACK_FREQUENCIES,
  FEEDBACK_IMPORTANCES,
  FEEDBACK_KIND_INFO,
  FEEDBACK_SEVERITIES,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABEL,
  type AdminFeedback,
  type FeedbackKind,
  type FeedbackStatus,
} from "../feedback";

const KIND_ICON: Record<FeedbackKind, typeof Bug> = {
  bug: Bug,
  idea: Lightbulb,
  other: MessageCircleHeart,
};

const when = (value: string) =>
  new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const labelOf = <T extends string>(list: readonly { id: T; label: string }[], id: T | null) =>
  list.find((item) => item.id === id)?.label;

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="fb-admin-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Mensagens da central de ajuda, para a gestão ler e acompanhar. */
export function AdminFeedbackList({ onError }: { onError: (err: unknown) => void }) {
  const [items, setItems] = useState<AdminFeedback[] | null>(null);
  const [filter, setFilter] = useState<FeedbackStatus | "all">("new");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // O avisador de erro muda a cada renderização do painel; guardá-lo aqui evita buscar a lista de novo toda vez.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let mounted = true;
    fetchAdminFeedback()
      .then((data) => {
        if (mounted) setItems(data.feedback);
      })
      .catch((err) => {
        if (mounted) {
          setItems([]);
          onErrorRef.current(err);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const visible = useMemo(
    () => (items ?? []).filter((entry) => filter === "all" || entry.status === filter),
    [items, filter],
  );
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: items?.length ?? 0 };
    for (const status of FEEDBACK_STATUSES) {
      result[status] = (items ?? []).filter((entry) => entry.status === status).length;
    }
    return result;
  }, [items]);

  async function setStatus(id: string, status: FeedbackStatus) {
    setBusyId(id);
    try {
      const saved = await updateAdminFeedbackStatus(id, status);
      setItems((current) => (current ?? []).map((entry) => (entry.id === id ? saved : entry)));
    } catch (err) {
      onErrorRef.current(err);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="admin-users fb-admin" aria-labelledby="fb-admin-title">
      <div className="admin-users-heading">
        <h2 id="fb-admin-title">Central de ajuda</h2>
        <p className="fb-admin-sub">Problemas, sugestões e outros assuntos enviados por quem usa o app.</p>
      </div>
      <div className="fb-admin-filters" role="group" aria-label="Filtrar mensagens">
        {(["all", ...FEEDBACK_STATUSES] as const).map((status) => (
          <Button variant="brand" size="brand"
            key={status}
            type="button"
            aria-pressed={filter === status}
            onClick={() => setFilter(status)}
          >
            {status === "all" ? "Todas" : FEEDBACK_STATUS_LABEL[status]}
            <span>{counts[status]}</span>
          </Button>
        ))}
      </div>

      {items === null ? (
        <p className="fb-admin-empty">
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Carregando…
        </p>
      ) : visible.length === 0 ? (
        <p className="fb-admin-empty">Nenhuma mensagem neste filtro.</p>
      ) : (
        <ul className="fb-admin-list">
          {visible.map((entry) => {
            const Icon = KIND_ICON[entry.kind];
            const open = openId === entry.id;
            return (
              <li key={entry.id} className={`fb-admin-item${open ? " is-open" : ""}`}>
                <Button variant="brand" size="brand"
                  type="button"
                  className="fb-admin-head"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : entry.id)}
                >
                  <span className={`fb-admin-kind is-${entry.kind}`}>
                    <Icon size={16} aria-hidden="true" />
                    {FEEDBACK_KIND_INFO[entry.kind].short}
                  </span>
                  <span className="fb-admin-title">
                    <strong>{entry.title}</strong>
                    <small>
                      {entry.userName} · {when(entry.createdAt)}
                    </small>
                  </span>
                  {entry.severity === "blocked" && <span className="fb-admin-flag">Trava o uso</span>}
                  <span className={`fb-admin-status is-${entry.status}`}>{FEEDBACK_STATUS_LABEL[entry.status]}</span>
                  <ChevronDown size={18} aria-hidden="true" className="fb-admin-chevron" />
                </Button>
                {open && (
                  <div className="fb-admin-body">
                    <p className="fb-admin-text">{entry.description}</p>
                    <dl>
                      <Row label="Onde" value={labelOf(FEEDBACK_AREAS, entry.area)} />
                      <Row label="Quanto atrapalha" value={labelOf(FEEDBACK_SEVERITIES, entry.severity)} />
                      <Row label="Frequência" value={labelOf(FEEDBACK_FREQUENCIES, entry.frequency)} />
                      <Row label="Importância" value={labelOf(FEEDBACK_IMPORTANCES, entry.importance)} />
                      <Row label="Passo a passo" value={entry.steps} />
                      <Row label="O que esperava" value={entry.expected} />
                      <Row label="Dificuldade que resolve" value={entry.problem} />
                      <Row label="Conta" value={`${entry.userName} <${entry.userEmail}>`} />
                      <Row
                        label="Responder para"
                        value={entry.contactOk ? entry.contactEmail : "Não pediu resposta por e-mail"}
                      />
                      {entry.tech && (
                        <Row
                          label="Informações técnicas"
                          value={[entry.tech.path, entry.tech.viewport, entry.tech.language, entry.tech.timezone, entry.tech.userAgent]
                            .filter(Boolean)
                            .join(" · ")}
                        />
                      )}
                    </dl>
                    {entry.hasScreenshot && (
                      <a
                        className="fb-admin-shot"
                        href={`/api/admin/feedback/${encodeURIComponent(entry.id)}/screenshot`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img
                          src={`/api/admin/feedback/${encodeURIComponent(entry.id)}/screenshot`}
                          alt="Captura de tela anexada à mensagem"
                          loading="lazy"
                        />
                        <span>Abrir a imagem inteira</span>
                      </a>
                    )}
                    <div className="fb-admin-actions" role="group" aria-label="Andamento da mensagem">
                      {FEEDBACK_STATUSES.map((status) => (
                        <Button variant="brand" size="brand"
                          key={status}
                          type="button"
                          aria-pressed={entry.status === status}
                          disabled={busyId === entry.id}
                          onClick={() => void setStatus(entry.id, status)}
                        >
                          {FEEDBACK_STATUS_LABEL[status]}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
