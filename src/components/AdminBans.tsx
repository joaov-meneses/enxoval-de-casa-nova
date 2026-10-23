import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LoaderCircle } from "@/src/components/icons";
import { createAdminBan, fetchAdminBans, revokeAdminBan } from "../api";
import type { AdminBan, AdminBanTarget, AdminUser, AdminUserDevice } from "../types";
import { Dialog } from "./Dialog";
import { Select } from "./Select";

export const BAN_REASON_LABEL: Record<string, string> = {
  fraud: "Fraude",
  spam: "Spam",
  abuse: "Abuso",
  scraping: "Extração em massa",
  impersonation: "Se passar por outra pessoa",
  legal: "Ordem legal",
  other: "Outro motivo",
  login_failures: "Muitas falhas de login (automático)",
  signup_burst: "Muitos cadastros seguidos (automático)",
};
const REASON_OPTIONS = ["abuse", "spam", "fraud", "scraping", "impersonation", "legal", "other"].map((value) => ({
  value,
  label: BAN_REASON_LABEL[value],
}));
const DURATION_OPTIONS = [
  { value: "24", label: "24 horas" },
  { value: "168", label: "7 dias" },
  { value: "720", label: "30 dias" },
  { value: "none", label: "Sem prazo" },
];
const TARGET_LABEL: Record<AdminBanTarget, string> = {
  user: "Conta",
  ip: "IP",
  cidr: "Faixa de IP",
  device: "Aparelho",
};

const when = (value: string) =>
  new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function describeDevice(device: AdminUserDevice) {
  return [device.browser, device.os, device.device].filter(Boolean).join(" · ") || "Aparelho sem identificação";
}

function BanFields({
  reason,
  duration,
  notes,
  busy,
  onReason,
  onDuration,
  onNotes,
}: {
  reason: string;
  duration: string;
  notes: string;
  busy: boolean;
  onReason: (value: string) => void;
  onDuration: (value: string) => void;
  onNotes: (value: string) => void;
}) {
  return (
    <>
      <Label className="admin-ban-field">
        Motivo
        <Select value={reason} options={REASON_OPTIONS} onChange={onReason} disabled={busy} ariaLabel="Motivo do bloqueio" />
      </Label>
      <Label className="admin-ban-field">
        Prazo
        <Select value={duration} options={DURATION_OPTIONS} onChange={onDuration} disabled={busy} ariaLabel="Prazo do bloqueio" />
      </Label>
      <Label className="admin-ban-field admin-ban-notes">
        Observação (opcional)
        <Textarea
          value={notes}
          maxLength={500}
          rows={2}
          disabled={busy}
          onChange={(event) => onNotes(event.target.value)}
          placeholder="O que aconteceu, para quem revisar depois"
        />
      </Label>
    </>
  );
}

const durationHours = (value: string) => (value === "none" ? null : Number(value));

/** Bloqueio a partir da ficha de uma conta: a conta inteira, um dos aparelhos ou um dos IPs usados. */
export function AdminBanDialog({
  user,
  onClose,
  onCreated,
}: {
  user: AdminUser | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("abuse");
  const [duration, setDuration] = useState("none");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setTarget(`user:${user.id}`);
    setReason("abuse");
    setDuration("none");
    setNotes("");
    setError("");
  }, [user]);

  const options = user
    ? [
        { value: `user:${user.id}`, label: "A conta inteira" },
        ...(user.devices ?? []).map((device) => ({
          value: `device:${device.deviceId}`,
          label: `Aparelho: ${describeDevice(device)}`,
        })),
        ...(user.ipAddresses ?? []).map((ip) => ({ value: `ip:${ip}`, label: `IP: ${ip}` })),
      ]
    : [];

  async function submit(event: FormEvent) {
    event.preventDefault();
    const separator = target.indexOf(":");
    setBusy(true);
    setError("");
    try {
      await createAdminBan({
        targetType: target.slice(0, separator) as AdminBanTarget,
        targetValue: target.slice(separator + 1),
        reasonCode: reason,
        notes,
        durationHours: durationHours(duration),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível bloquear.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog isOpen={Boolean(user)} title="Bloquear acesso" tone="danger" busy={busy} onClose={onClose}>
      {user && (
        <form className="admin-dialog-content" onSubmit={submit}>
          <p className="admin-dialog-user">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </p>
          <Label className="admin-ban-field">
            O que bloquear
            <Select value={target} options={options} onChange={setTarget} disabled={busy} ariaLabel="O que bloquear" />
          </Label>
          <BanFields
            reason={reason}
            duration={duration}
            notes={notes}
            busy={busy}
            onReason={setReason}
            onDuration={setDuration}
            onNotes={setNotes}
          />
          <p>
            As sessões abertas são encerradas e a entrada fica recusada até o fim do prazo ou até você revogar. Bloquear
            um IP atinge todas as pessoas da mesma rede; prefira a conta ou o aparelho.
          </p>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="admin-dialog-actions">
            <Button variant="brand" size="brand" type="button" className="button button-outline" disabled={busy} onClick={onClose} data-dialog-autofocus>
              Cancelar
            </Button>
            <Button variant="brand" size="brand" type="submit" className="button admin-danger-button" disabled={busy || !target}>
              {busy ? <LoaderCircle size={18} className="animate-spin" /> : "Bloquear"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/** Bloqueios em vigor (e os encerrados há até 30 dias), com revogação e bloqueio direto de IP, faixa ou aparelho. */
export function AdminBanList({
  refreshKey,
  onChanged,
  onError,
}: {
  refreshKey: number;
  onChanged: () => void;
  onError: (err: unknown) => void;
}) {
  const [bans, setBans] = useState<AdminBan[] | null>(null);
  const [type, setType] = useState<"ip" | "cidr" | "device">("ip");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("abuse");
  const [duration, setDuration] = useState("24");
  const [notes, setNotes] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let mounted = true;
    fetchAdminBans()
      .then((data) => {
        if (mounted) setBans(data.bans);
      })
      .catch((err) => {
        if (mounted) {
          setBans([]);
          onErrorRef.current(err);
        }
      });
    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusyId("new");
    setFormError("");
    try {
      await createAdminBan({ targetType: type, targetValue: value, reasonCode: reason, notes, durationHours: durationHours(duration) });
      setValue("");
      setNotes("");
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não foi possível bloquear.");
    } finally {
      setBusyId(null);
    }
  }

  async function revoke(id: string) {
    setBusyId(id);
    try {
      await revokeAdminBan(id);
      onChanged();
    } catch (err) {
      onErrorRef.current(err);
    } finally {
      setBusyId(null);
    }
  }

  const active = (bans ?? []).filter((ban) => ban.active);
  const ended = (bans ?? []).filter((ban) => !ban.active);

  return (
    <section className="admin-users admin-bans" aria-labelledby="bans-title">
      <div className="admin-users-heading">
        <h2 id="bans-title">Bloqueios</h2>
        <p className="fb-admin-sub">
          Contas, aparelhos e IPs barrados. O sistema bloqueia sozinho, por 1 hora e só na entrada, IPs com rajadas de
          falhas de login ou de cadastros.
        </p>
      </div>
      <form className="admin-ban-form" onSubmit={submit} aria-busy={busyId === "new"}>
        <Label className="admin-ban-field">
          Tipo
          <Select
            value={type}
            options={[
              { value: "ip", label: "IP" },
              { value: "cidr", label: "Faixa de IP" },
              { value: "device", label: "Aparelho" },
            ]}
            onChange={(next) => setType(next as typeof type)}
            disabled={busyId === "new"}
            ariaLabel="Tipo de bloqueio"
          />
        </Label>
        <Label className="admin-ban-field">
          {type === "device" ? "Identificador do aparelho" : type === "cidr" ? "Faixa" : "Endereço"}
          <Input
            value={value}
            required
            maxLength={64}
            disabled={busyId === "new"}
            onChange={(event) => setValue(event.target.value)}
            placeholder={type === "device" ? "00000000-0000-0000-0000-000000000000" : type === "cidr" ? "203.0.113.0/24" : "203.0.113.7"}
            spellCheck={false}
          />
        </Label>
        <BanFields
          reason={reason}
          duration={duration}
          notes={notes}
          busy={busyId === "new"}
          onReason={setReason}
          onDuration={setDuration}
          onNotes={setNotes}
        />
        {formError && (
          <div className="form-error" role="alert">
            {formError}
          </div>
        )}
        <Button variant="brand" size="brand" type="submit" className="button admin-danger-button" disabled={busyId === "new"}>
          {busyId === "new" ? <LoaderCircle size={18} className="animate-spin" /> : "Bloquear"}
        </Button>
      </form>

      {bans === null ? (
        <p className="fb-admin-empty">
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Carregando…
        </p>
      ) : (
        <>
          {!active.length && <p className="fb-admin-empty">Nenhum bloqueio em vigor.</p>}
          <ul className="admin-ban-list">
            {[...active, ...ended].map((ban) => (
              <li key={ban.id} className={`admin-ban-item${ban.active ? "" : " is-ended"}`}>
                <div>
                  <strong>
                    {TARGET_LABEL[ban.targetType]}: {ban.targetLabel ?? ban.targetValue}
                  </strong>
                  <small>
                    {BAN_REASON_LABEL[ban.reasonCode] ?? ban.reasonCode} · por {ban.createdBy} em {when(ban.createdAt)}
                    {ban.scope === "block_auth" ? " · só na entrada" : ""}
                  </small>
                  {ban.notes && <small>{ban.notes}</small>}
                  <small>
                    {ban.revokedAt
                      ? `Revogado por ${ban.revokedBy} em ${when(ban.revokedAt)}`
                      : ban.expiresAt
                        ? `${ban.active ? "Vale até" : "Encerrado em"} ${when(ban.expiresAt)}`
                        : "Sem prazo"}
                  </small>
                </div>
                {ban.active ? (
                  <Button
                    variant="brand"
                    size="brand"
                    type="button"
                    className="button button-outline"
                    disabled={busyId === ban.id}
                    onClick={() => void revoke(ban.id)}
                    aria-label={`Revogar bloqueio de ${ban.targetLabel ?? ban.targetValue}`}
                  >
                    {busyId === ban.id ? <LoaderCircle size={16} className="animate-spin" /> : "Revogar"}
                  </Button>
                ) : (
                  <Badge asChild variant="outline">
                    <span className="admin-badge inactive">Encerrado</span>
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
