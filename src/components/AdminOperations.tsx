import { Button } from "@/src/components/ui/button";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, RefreshCw } from "@/src/components/icons";
import {
  estimateCampaign,
  fetchAdminOperations,
  sendAdminCampaign,
  testCampaign,
  type AdminOperations as Operations,
  type CampaignDraft,
} from "../api";

const FLOW_LABEL: Record<string, string> = {
  countdown: "L3 Contagem regressiva",
  first_value: "L2 Primeiro valor",
  funnel_resume: "L1 Retomar o funil",
  overdue: "L4 Resumo de atrasos",
  price_drop: "L5 Queda de preço",
  inactive: "L6 Volte quando quiser",
  milestone: "L7 Marcos",
  invite_stalled: "L8 Convite parado",
  post_move: "L9 Pós-mudança",
  warranty: "Garantias",
  campaign: "Campanhas",
};

const JOB_LABEL: Record<string, string> = {
  lifecycle: "Ciclo de vida",
  price_tracker: "Preços acompanhados",
  catalog_refresh: "Catálogo",
  trial_notifications: "Avisos do teste grátis",
  fiscal_invoices: "Notas fiscais",
  warranty_reminders: "Garantias e limpeza de arquivos",
  user_ip_retention: "Retenção de IPs",
};

const MODE_LABEL = { off: "desligados", simulate: "em simulação (nada é enviado)", send: "ligados" } as const;

const when = (value: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const every = (ms: number) =>
  ms >= 3_600_000 ? `${Math.round(ms / 3_600_000)} h` : `${Math.round(ms / 60_000)} min`;

const percent = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}%` : "—");

const EMPTY: CampaignDraft = { name: "", segment: "all", subject: "", body: "", ctaLabel: "Abrir minha lista", ctaPath: "/app" };

/** Operação: rotinas agendadas, efeito dos e-mails de ciclo de vida (contra o grupo de controle) e campanhas. */
export function AdminOperations({ onError }: { onError: (err: unknown) => void }) {
  const [data, setData] = useState<Operations | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<CampaignDraft>(EMPTY);
  const [testEmail, setTestEmail] = useState("");
  const [estimate, setEstimate] = useState<{ eligible: number; holdout: number; limited: number } | null>(null);
  const [busy, setBusy] = useState<"" | "estimate" | "test" | "send">("");
  const [notice, setNotice] = useState("");
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchAdminOperations());
    } catch (err) {
      onErrorRef.current(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (key: keyof CampaignDraft) => (event: { target: { value: string } }) => {
    setDraft((current) => ({ ...current, [key]: event.target.value }));
    if (key === "segment") setEstimate(null);
  };

  const run = async (kind: "estimate" | "test" | "send", action: () => Promise<void>) => {
    setBusy(kind);
    setNotice("");
    try {
      await action();
    } catch (err) {
      onErrorRef.current(err);
    } finally {
      setBusy("");
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run("send", async () => {
      const result = await sendAdminCampaign(draft);
      setNotice(
        data?.mode === "simulate"
          ? `Simulação: ${result.simulated} pessoas receberiam (${result.deferred} ficaram de fora pelo limite de frequência).`
          : `Campanha enviada para ${result.sent} pessoas; ${result.holdout} no grupo de controle; ${result.deferred} de fora pelo limite de frequência${result.failed ? `; ${result.failed} falharam` : ""}.`,
      );
      setDraft(EMPTY);
      setEstimate(null);
      await load();
    });
  };

  return (
    <section className="admin-users admin-ops" aria-labelledby="admin-ops-title" aria-busy={loading}>
      <div className="admin-users-heading">
        <h2 id="admin-ops-title">Operação</h2>
        <Button variant="brand" size="brand" type="button" className="admin-refresh" disabled={loading} onClick={() => void load()}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} aria-hidden="true" /> Atualizar
        </Button>
      </div>
      {!data ? (
        <p className="fb-admin-empty">
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Carregando…
        </p>
      ) : (
        <>
          <h3>Rotinas agendadas</h3>
          {data.jobs.length === 0 ? (
            <p className="admin-ops-note">Nenhuma rotina registrada ainda.</p>
          ) : (
            <div className="admin-ops-table-wrap">
              <table className="admin-ops-table">
                <thead>
                  <tr><th>Rotina</th><th>A cada</th><th>Último sucesso</th><th>Última falha</th><th>Versão</th><th>Situação</th></tr>
                </thead>
                <tbody>
                  {data.jobs.map((job) => (
                    <tr key={job.job}>
                      <td>{JOB_LABEL[job.job] ?? job.job}</td>
                      <td>{every(job.interval_ms)}</td>
                      <td>{when(job.last_succeeded_at)}</td>
                      <td title={job.last_error ?? undefined}>{when(job.last_failed_at)}</td>
                      <td>{job.app_version ?? "—"}</td>
                      <td className={job.stale ? "is-alert" : "is-ok"}>{job.stale ? "Atrasada" : "Em dia"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3>E-mails de relacionamento ({data.lifecycle.days} dias)</h3>
          <p className="admin-ops-note">
            Envios {MODE_LABEL[data.mode]}. “Usou em 7 dias” compara quem recebeu com o grupo de controle (elegível, mas
            sem e-mail); a diferença é o efeito do fluxo. Pesquisa de pós-mudança: {data.lifecycle.survey.responses} respostas
            {data.lifecycle.survey.nps !== null ? `, NPS ${data.lifecycle.survey.nps}` : ""}.
            {data.lifecycle.suppressions.length > 0 &&
              ` Endereços suprimidos: ${data.lifecycle.suppressions.map((entry) => `${entry.count} por ${entry.reason}`).join(", ")}.`}
          </p>
          {data.lifecycle.flows.length === 0 ? (
            <p className="admin-ops-note">Nenhum e-mail registrado no período.</p>
          ) : (
            <div className="admin-ops-table-wrap">
              <table className="admin-ops-table">
                <thead>
                  <tr>
                    <th>Fluxo</th><th>Enviados</th><th>Entregues</th><th>Cliques</th><th>Voltaram</th><th>Descadastros</th>
                    <th>Usou em 7 dias</th><th>Controle</th><th>Efeito</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lifecycle.flows.map((flow) => (
                    <tr key={flow.flow}>
                      <td>{FLOW_LABEL[flow.flow] ?? flow.flow}</td>
                      <td>{flow.sent}{flow.simulated ? ` (+${flow.simulated} simulados)` : ""}{flow.failed ? `, ${flow.failed} falhas` : ""}</td>
                      <td>{percent(flow.delivered, flow.sent)}</td>
                      <td>{percent(flow.clicked, flow.sent)}</td>
                      <td>{percent(flow.returned, flow.sent)}</td>
                      <td>{percent(flow.unsubscribed, flow.sent)}</td>
                      <td>{percent(flow.sentActive7d, flow.sent)}</td>
                      <td>{flow.holdout ? `${percent(flow.holdoutActive7d, flow.holdout)} de ${flow.holdout}` : "—"}</td>
                      <td>{flow.liftPoints === null ? "—" : `${flow.liftPoints > 0 ? "+" : ""}${flow.liftPoints} p.p.`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3>Nova campanha</h3>
          <form className="cat-admin-form admin-ops-form" onSubmit={submit}>
            <label>
              Nome interno
              <input value={draft.name} onChange={update("name")} maxLength={80} required />
            </label>
            <label>
              Segmento
              <select value={draft.segment} onChange={update("segment")}>
                {data.segments.map((segment) => (
                  <option key={segment.key} value={segment.key}>{segment.label}</option>
                ))}
              </select>
            </label>
            <label className="admin-ops-wide">
              Assunto
              <input value={draft.subject} onChange={update("subject")} maxLength={120} required />
            </label>
            <label className="admin-ops-wide">
              Texto (linha em branco separa parágrafos)
              <textarea value={draft.body} onChange={update("body")} maxLength={3000} rows={5} required />
            </label>
            <label>
              Texto do botão
              <input value={draft.ctaLabel} onChange={update("ctaLabel")} maxLength={40} required />
            </label>
            <label>
              Página do botão
              <input value={draft.ctaPath} onChange={update("ctaPath")} maxLength={120} pattern="/[a-z0-9\-/]*" required />
            </label>
            <label>
              E-mail para teste
              <input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} />
            </label>
            <div className="cat-admin-actions">
              <Button variant="brand" size="brand" type="button" className="admin-status-action" disabled={Boolean(busy)}
                onClick={() => void run("estimate", async () => setEstimate(await estimateCampaign(draft.segment)))}>
                {busy === "estimate" ? "Calculando…" : "Estimar público"}
              </Button>
              <Button variant="brand" size="brand" type="button" className="admin-status-action" disabled={Boolean(busy) || !testEmail}
                onClick={() => void run("test", async () => {
                  await testCampaign(draft, testEmail);
                  setNotice(`Teste enviado para ${testEmail}.`);
                })}>
                {busy === "test" ? "Enviando…" : "Enviar teste"}
              </Button>
              <Button variant="brand" size="brand" type="submit" className="admin-status-action admin-ops-send"
                disabled={Boolean(busy) || data.mode === "off"}>
                {busy === "send" ? "Enviando…" : data.mode === "simulate" ? "Simular envio" : "Enviar campanha"}
              </Button>
            </div>
            {estimate && (
              <p className="admin-ops-note admin-ops-wide" role="status">
                {estimate.eligible} pessoas no segmento (já sem descadastros e supressões): cerca de {estimate.holdout} ficam no
                grupo de controle e {estimate.limited} hoje ficariam de fora pelo limite de frequência.
              </p>
            )}
            {data.mode === "off" && (
              <p className="admin-ops-note admin-ops-wide">Para enviar, configure LIFECYCLE_MODE=simulate ou send no servidor.</p>
            )}
          </form>
          {notice && <p className="admin-ops-note" role="status">{notice}</p>}

          {data.campaigns.length > 0 && (
            <div className="admin-ops-table-wrap">
              <table className="admin-ops-table">
                <thead>
                  <tr><th>Campanha</th><th>Segmento</th><th>Data</th><th>Público</th><th>Enviados</th><th>Cliques</th><th>Voltaram</th><th>Descadastros</th></tr>
                </thead>
                <tbody>
                  {data.campaigns.map((campaign) => (
                    <tr key={campaign.id}>
                      <td>{campaign.name}{campaign.status === "failed" ? " (falhou)" : ""}</td>
                      <td>{data.segments.find((segment) => segment.key === campaign.segment)?.label ?? campaign.segment}</td>
                      <td>{when(campaign.createdAt)}</td>
                      <td>{campaign.audienceCount}</td>
                      <td>{campaign.sent || (campaign.simulated ? `${campaign.simulated} simulados` : 0)}</td>
                      <td>{percent(campaign.clicked, campaign.sent)}</td>
                      <td>{percent(campaign.returned, campaign.sent)}</td>
                      <td>{percent(campaign.unsubscribed, campaign.sent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
