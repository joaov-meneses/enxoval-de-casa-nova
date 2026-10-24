import { Badge } from "@/src/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Button } from "@/src/components/ui/button";
import { FiscalBillingSection } from './FiscalBillingSection';
import { Label } from "@/src/components/ui/label";
import { Input } from "@/src/components/ui/input";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Pencil, LockKeyhole, CreditCard, Home, ShieldCheck, UserRound } from "@/src/components/icons";
import { Dialog } from "./Dialog";
import { ProfilePhotoEditor } from "./ProfilePhotoEditor";
import { Select } from "./Select";
import {
  cancelSubscription,
  fetchBillingStatus,
  fetchMarketingPreference,
  fetchWarrantyReminders,
  updateWarrantyReminders,
  fetchProfile,
  openBillingPortal,
  updateMarketingPreference,
  removeProfileAvatar,
  requestPasswordReset,
  formatBillingAmount,
  updateEnxoval,
  updateProfile,
  uploadProfileAvatar,
  type BillingStatus,
  type ProfileData,
} from "../api";
import type { AuthUser, EnxovalSummary } from "../types";
import { imageFileProblem, prepareImageForUpload } from "../imageUpload";
import { STATES } from "../onboarding/plan";
import { citiesOfState } from "../onboarding/regions";
import type { SpendingTier } from "../planning/spending";
import "./profile.css";

type Section = "profile" | "home" | "billing";
const sections = [
  { id: "profile", label: "Meu perfil", Icon: UserRound },
  { id: "home", label: "Meu lar", Icon: Home },
  { id: "billing", label: "Assinatura", Icon: CreditCard },
] as const;
const dateLabel = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "long",
        timeStyle: "short",
      })
    : "";

export function ProfileDialog({
  open,
  onClose,
  user,
  enxoval,
  onUserChanged,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  user: AuthUser;
  enxoval: EnxovalSummary | null;
  onUserChanged: (profile: ProfileData) => void;
  onChanged: () => void;
}) {
  const id = useId();
  const [editingName, setEditingName] = useState(false);
  const [editingHome, setEditingHome] = useState(false);
  const [section, setSection] = useState<Section>("profile");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [name, setName] = useState(user.name);
  const [homeName, setHomeName] = useState("");
  const [moveDate, setMoveDate] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [tier, setTier] = useState<SpendingTier>("equilibrado");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [marketing, setMarketing] = useState<boolean | null>(null);
  const [warrantyReminders, setWarrantyReminders] = useState<boolean | null>(null);
  useEffect(() => {
    if (!open) return;
    let active = true;
    // A preferência de e-mails carrega à parte: se falhar, o resto do perfil continua.
    fetchMarketingPreference()
      .then((result) => { if (active) setMarketing(result.subscribed); })
      .catch(() => { if (active) setMarketing(null); });
    fetchWarrantyReminders()
      .then((result) => { if (active) setWarrantyReminders(result.enabled); })
      .catch(() => { if (active) setWarrantyReminders(null); });
    setSection("profile");
    setLoading(true);
    setError("");
    setMessage("");
    setConfirmCancel(false);
    setEditingName(false); setEditingHome(false);
    setHomeName(enxoval?.name ?? "");
    setMoveDate(enxoval?.moveDate ?? "");
    setState(enxoval?.state ?? "");
    setCity(enxoval?.city ?? "");
    setTier(enxoval?.spendingTier ?? "equilibrado");
    Promise.all([fetchProfile(), fetchBillingStatus()])
      .then(([account, status]) => {
        if (!active) return;
        setProfile(account);
        setName(account.name);
        setBilling(status);
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar seu perfil.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, enxoval?.id]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  };
  const acceptProfile = (next: ProfileData) => {
    setProfile(next);
    setName(next.name);
    onUserChanged(next);
  };
  const saveProfile = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      acceptProfile(await updateProfile(name));
      setEditingName(false);
      setMessage("Seu perfil foi atualizado.");
    });
  };
  const saveHome = (event: FormEvent) => {
    event.preventDefault();
    if (!enxoval) return;
    void run(async () => {
      await updateEnxoval(enxoval.id, {
        name: homeName,
        moveDate: moveDate || null,
        state: state || null,
        city: city || null,
        spendingTier: tier,
      });
      onChanged();
      setEditingHome(false);
      setMessage("As informações do seu lar foram atualizadas.");
    });
  };
  const canCancel =
    billing?.plan === "monthly" &&
    ["active", "trialing", "past_due"].includes(billing.status ?? "") &&
    !billing.cancelAtPeriodEnd;
  const planName = user.isGuest
    ? "Acesso por convite"
    : billing?.status === "trialing" && billing.plan === "monthly"
      ? "Teste de 2 dias"
      : {
          monthly: "Mensal",
          pass: "Passe da Casa Nova",
          founder: "Acesso fundador",
          free: "Sem assinatura ativa",
        }[billing?.plan ?? "free"];

  return (
    <>
      <Dialog
        title="Meu perfil"
        isOpen={open}
        onClose={onClose}
        busy={busy}
        className="profile-dialog"
      >
        <div className="profile-content">
          <div className="profile-summary" tabIndex={-1} data-dialog-autofocus>
            <ProfilePhotoEditor
              name={profile?.name ?? user.name}
              src={profile ? profile.avatarUrl : user.avatarUrl}
              disabled={busy || loading}
              onUpload={async file => {
                const problem = imageFileProblem(file);
                if (problem) throw new Error(problem);
                setBusy(true); setError(''); setMessage('');
                try {
                  acceptProfile(await uploadProfileAvatar(await prepareImageForUpload(file)));
                  setMessage('Foto de perfil atualizada.');
                } finally { setBusy(false); }
              }}
              onRemove={async () => {
                setBusy(true); setError(''); setMessage('');
                try { acceptProfile(await removeProfileAvatar()); setMessage('Foto removida.'); }
                finally { setBusy(false); }
              }}
            />
            <div>
              <strong>{profile?.name ?? user.name}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <Tabs value={section} onValueChange={value => { setSection(value as typeof section); setError(""); setMessage(""); }}>
          <TabsList className="profile-tabs" aria-label="Configurações do perfil">
            {sections.map(({ id: tab, label, Icon }) => <TabsTrigger key={tab} value={tab}>
              <Icon size={17} aria-hidden="true" />{label}
            </TabsTrigger>)}
          </TabsList>
          {loading ? (
            <p role="status">Carregando suas informações…</p>
          ) : (
            <TabsContent key={section} value={section}>
              {section === "profile" && (
                <>
                  <form className="profile-form" onSubmit={saveProfile}>
                    <Label htmlFor={`${id}-name`}>Seu nome</Label>
                    <div className="profile-editable-field">
                      <Input id={`${id}-name`} value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={80} autoComplete="name" required disabled={busy || !editingName} />
                      <Button variant="brand" size="brand" type="button" aria-label="Alterar seu nome" title="Alterar seu nome" disabled={busy || editingName} onClick={() => { setEditingName(true); requestAnimationFrame(() => document.getElementById(`${id}-name`)?.focus()); }}><Pencil size={18} aria-hidden="true" /></Button>
                    </div>
                    <span id={`${id}-email-label`} className="profile-field-label">E-mail de acesso</span>
                    <div className="profile-email-info" aria-labelledby={`${id}-email-label`}><LockKeyhole size={16} aria-hidden="true" /><span>{user.email}</span></div>
                    <small>
                      Seu e-mail identifica a conta e recebe os avisos da
                      assinatura.
                    </small>
                    <Button variant="brand" size="brand"
                      className="button button-dark"
                      type="submit"
                      disabled={busy || !editingName || name.trim().length < 2}
                    >
                      {busy ? "Salvando…" : "Salvar perfil"}
                    </Button>
                  </form>
                  <section className="profile-security">
                    <h3>
                      <ShieldCheck size={18} />
                      Segurança da conta
                    </h3>
                    <p>
                      Receba no seu e-mail um link para criar uma nova senha.
                    </p>
                    <Button variant="brand" size="brand"
                      className="button button-outline button-small"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await requestPasswordReset(user.email);
                          setMessage(
                            "Enviamos as instruções para redefinir sua senha. Confira seu e-mail.",
                          );
                        })
                      }
                    >
                      Redefinir senha por e-mail
                    </Button>
                    {profile?.createdAt && (
                      <small>
                        Conta criada em{" "}
                        {new Date(profile.createdAt).toLocaleDateString(
                          "pt-BR",
                        )}
                        .
                      </small>
                    )}
                  </section>
                  {marketing !== null && !user.isGuest && (
                    <section className="profile-security">
                      <h3>E-mails do Casa Mia</h3>
                      <label className="profile-optin">
                        <input
                          type="checkbox"
                          checked={marketing}
                          disabled={busy}
                          onChange={(event) => {
                            const next = event.target.checked;
                            void run(async () => {
                              setMarketing((await updateMarketingPreference(next)).subscribed);
                              setMessage(next ? "Pronto: você vai receber lembretes e dicas." : "Você não recebe mais lembretes e dicas.");
                            });
                          }}
                        />
                        <span>Lembretes da mudança e dicas para montar a casa, no máximo dois por semana.</span>
                      </label>
                      <small>Avisos da conta, da assinatura e de queda de preço continuam chegando.</small>
                    </section>
                  )}
                  {warrantyReminders !== null && (
                    <section className="profile-security">
                      <h3>Garantias</h3>
                      <label className="profile-optin">
                        <input
                          type="checkbox"
                          checked={warrantyReminders}
                          disabled={busy}
                          onChange={(event) => {
                            const next = event.target.checked;
                            void run(async () => {
                              setWarrantyReminders((await updateWarrantyReminders(next)).enabled);
                              setMessage(next ? "Pronto: avisamos antes de cada garantia vencer." : "Você não recebe mais avisos de garantia.");
                            });
                          }}
                        />
                        <span>Avisar antes de a garantia vencer (30 e 7 dias antes), para os itens com garantia informada.</span>
                      </label>
                    </section>
                  )}
                </>
              )}
              {section === "home" &&
                (enxoval ? (
                  <form className="profile-form" onSubmit={saveHome}>
                    <p className="profile-description">
                      As informações ajudam a organizar o planejamento da sua
                      casa.
                    </p>
                    {enxoval.role !== "owner" && (
                      <p className="profile-info">
                        Somente o titular pode alterar os dados deste lar.
                      </p>
                    )}
                    <fieldset disabled={busy || enxoval.role !== "owner"}>
                      <Label htmlFor={`${id}-home`}>Nome do lar</Label>
                      <div className="profile-editable-field">
                        <Input id={`${id}-home`} value={homeName} onChange={event => setHomeName(event.target.value)} maxLength={100} required disabled={!editingHome} />
                        <Button variant="brand" size="brand" type="button" aria-label="Alterar nome do lar" title="Alterar nome do lar" disabled={editingHome} onClick={() => { setEditingHome(true); requestAnimationFrame(() => document.getElementById(`${id}-home`)?.focus()); }}><Pencil size={18} aria-hidden="true" /></Button>
                      </div>
                      <Label htmlFor={`${id}-date`}>Data da mudança</Label>
                      <Input
                        id={`${id}-date`}
                        type="date"
                        value={moveDate}
                        onChange={(event) => setMoveDate(event.target.value)}
                      />
                      <div className="profile-field-grid">
                        <div>
                          <Label htmlFor={`${id}-state`}>Estado</Label>
                          <Select
                            id={`${id}-state`}
                            value={state}
                            onChange={(value) => {
                              setState(value);
                              setCity("");
                            }}
                            disabled={busy || enxoval.role !== "owner"}
                            options={[
                              { value: "", label: "Não informado" },
                              ...STATES.map((item) => ({
                                value: item.uf,
                                label: item.name,
                              })),
                            ]}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`${id}-city`}>
                            Cidade de referência
                          </Label>
                          <Select
                            id={`${id}-city`}
                            value={city}
                            onChange={setCity}
                            disabled={
                              busy || !state || enxoval.role !== "owner"
                            }
                            options={[
                              { value: "", label: "Não informada" },
                              ...citiesOfState(state).map((item) => ({
                                value: item.id,
                                label: item.name,
                              })),
                            ]}
                          />
                        </div>
                      </div>
                      <Label htmlFor={`${id}-tier`}>Perfil de gasto</Label>
                      <Select
                        id={`${id}-tier`}
                        value={tier}
                        onChange={(value) => setTier(value as SpendingTier)}
                        disabled={busy || enxoval.role !== "owner"}
                        options={[
                          { value: "economico", label: "Econômico" },
                          { value: "equilibrado", label: "Equilibrado" },
                          { value: "confortavel", label: "Confortável" },
                          { value: "premium", label: "Premium" },
                        ]}
                      />
                    </fieldset>
                    {enxoval.role === "owner" && (
                      <Button variant="brand" size="brand"
                        className="button button-dark"
                        type="submit"
                        disabled={busy || !homeName.trim()}
                      >
                        {busy ? "Salvando…" : "Salvar informações do lar"}
                      </Button>
                    )}
                  </form>
                ) : (
                  <p className="profile-description">
                    Seu lar aparecerá aqui após a liberação do enxoval.
                  </p>
                ))}
              {section === "billing" && (
                <section className="profile-billing">
                  <Badge asChild variant="outline"><span className="profile-plan-badge">{planName}</span></Badge>
                  {user.isGuest ? (
                    <p>
                      O acesso a cada enxoval depende da assinatura de quem
                      convidou você. Somente o titular pode gerenciar essa
                      assinatura.
                    </p>
                  ) : (
                    <>
                      {billing?.plan === "monthly" && (
                        <>
                          <h3>Casa Mia completo</h3>
                          <p>{formatBillingAmount(billing.monthlyPrice)} por mês, com renovação automática. Eventuais descontos seguem as condições do checkout.</p>
                          {billing.status === "trialing" ? (
                            <p>
                              Seu teste termina em{" "}
                              <strong>
                                {dateLabel(billing.trialEndsAt)} (Brasília)
                              </strong>
                              . Depois desse horário, a mensalidade será cobrada
                              automaticamente no cartão. Cancele antes para
                              evitar a cobrança.
                            </p>
                          ) : (
                            billing.renewsAt && (
                              <p>
                                Próxima renovação: {dateLabel(billing.renewsAt)}{" "}
                                (Brasília).
                              </p>
                            )
                          )}
                        </>
                      )}
                      {billing?.plan === "pass" && (
                        <>
                          <h3>Seu Passe está ativo</h3>
                          <p>
                            Acesso completo até{" "}
                            {dateLabel(billing.passExpiresAt)} (Brasília), sem
                            renovação automática.
                          </p>
                        </>
                      )}
                      {billing?.plan === "founder" && (
                        <p>Sua conta tem acesso completo, sem cobrança.</p>
                      )}
                      {billing?.plan === "free" && (
                        <p>
                          Sua conta e seus dados estão preservados. Ative a
                          assinatura para liberar o enxoval novamente.
                        </p>
                      )}
                      <div className="profile-billing-actions">
                        {billing?.canManage && (
                          <Button variant="brand" size="brand"
                            className="button button-dark"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                const result = await openBillingPortal();
                                window.location.assign(result.url);
                              })
                            }
                          >
                            Gerenciar assinatura e cartão
                          </Button>
                        )}
                        {billing?.plan === "free" && (
                          <Button variant="brand" size="brand"
                            className="button button-dark"
                            disabled={busy || !billing.available}
                            onClick={() =>
                              void run(async () => {
                                onClose();
                                window.location.assign("/app");
                              })
                            }
                          >
                            Escolher plano
                          </Button>
                        )}
                        {canCancel && (
                          <Button variant="brand" size="brand"
                            className="button button-outline profile-cancel-button"
                            disabled={busy}
                            onClick={() => setConfirmCancel(true)}
                          >
                            Cancelar assinatura
                          </Button>
                        )}
                      </div>
                      <FiscalBillingSection />
                    </>
                  )}
                </section>
              )}
            </TabsContent>
          )}
          </Tabs>
          {error && (
            <p className="profile-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="profile-success" role="status">
              {message}
            </p>
          )}
        </div>
      </Dialog>
      <Dialog
        title="Cancelar assinatura?"
        isOpen={open && confirmCancel}
        onClose={() => setConfirmCancel(false)}
        busy={busy}
        tone="danger"
      >
        <div className="subscription-cancel-content">
          <p>
            O acesso será encerrado imediatamente para você e seus convidados,
            inclusive importação e exportação. Sua conta e seus dados ficam
            preservados.
          </p>
          {billing?.status === "trialing" && (
            <p>
              Cancelando antes de {dateLabel(billing.trialEndsAt)} (Brasília),
              não haverá cobrança da mensalidade.
            </p>
          )}
          {error && (
            <p className="profile-error" role="alert">
              {error}
            </p>
          )}
          <div className="subscription-dialog-actions">
            <Button variant="brand" size="brand"
              className="button button-outline"
              disabled={busy}
              onClick={() => setConfirmCancel(false)}
              data-dialog-autofocus
            >
              Continuar usando
            </Button>
            <Button variant="brand" size="brand"
              className="button button-dark"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await cancelSubscription();
                  setBilling(await fetchBillingStatus());
                  setConfirmCancel(false);
                  setMessage(
                    "Assinatura cancelada. Sua conta e seus dados estão preservados.",
                  );
                  window.dispatchEvent(
                    new Event("casamia:subscription-required"),
                  );
                  onChanged();
                })
              }
            >
              {busy ? "Cancelando…" : "Confirmar cancelamento"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
