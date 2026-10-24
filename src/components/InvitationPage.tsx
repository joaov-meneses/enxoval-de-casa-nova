import { Label } from "@/src/components/ui/label";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  TriangleAlert,
  UserPlus,
} from "@/src/components/icons";
import {
  acceptInvitation,
  checkInvitation,
  fetchBootstrap,
  login,
  logout,
} from "../api";
import { storeEnxovalId } from "../enxovais";
import type { BootstrapData, InvitationPreview } from "../types";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordPolicyError } from "../../shared/passwordPolicy";
import { Brand } from "./Brand";
import { PasswordRules } from "./PasswordRules";

// O token vem no fragmento (#token=...) do link do e-mail. É lido uma vez, no carregamento do módulo,
// porque o fragmento é apagado da barra de endereço logo depois (ele não deve ficar no histórico).
const initialToken =
  new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token") ??
  "";

type Stage = "checking" | "invalid" | "ready";

export function InvitationPage() {
  const [stage, setStage] = useState<Stage>(
    initialToken ? "checking" : "invalid",
  );
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  /** E-mail da conta que está logada neste navegador, se houver. */
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Convite para um enxoval | Casa Mia";
    if (window.location.hash)
      window.history.replaceState({}, "", "/convite");
    if (!initialToken) return;
    let cancelled = false;
    Promise.all([
      checkInvitation(initialToken),
      fetchBootstrap()
        .then((data) => data.user.email)
        .catch(() => null),
    ])
      .then(([result, email]) => {
        if (cancelled) return;
        setPreview(result);
        setSessionEmail(email);
        setStage(result.valid ? "ready" : "invalid");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível conferir o convite.",
        );
        setStage("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function finish(data: BootstrapData) {
    // O app abre direto no enxoval do convite.
    storeEnxovalId(data.activeEnxoval?.id ?? null);
    window.location.assign("/app");
  }

  async function run(action: () => Promise<BootstrapData>) {
    setBusy(true);
    setError("");
    try {
      finish(await action());
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Não foi possível aceitar o convite. Tente novamente.";
      if (message.startsWith("Este convite expirou")) setStage("invalid");
      else setError(message);
      setBusy(false);
    }
  }

  function createAccount(event: FormEvent) {
    event.preventDefault();
    const weak = passwordPolicyError(password);
    if (weak) {
      setError(weak);
      return;
    }
    if (password !== confirmation) {
      setError("As senhas não coincidem.");
      return;
    }
    void run(() =>
      acceptInvitation(initialToken, {
        name: name.trim(),
        password,
        confirmation,
      }),
    );
  }

  function signInAndAccept(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await login(preview?.email ?? "", password);
      return acceptInvitation(initialToken);
    });
  }

  async function switchAccount() {
    await logout().catch(() => undefined);
    setSessionEmail(null);
    setError("");
  }

  const invited = preview?.email ?? "";
  const accountExists = preview?.accountExists === true;
  const sameAccount =
    sessionEmail !== null && sessionEmail.toLowerCase() === invited;
  const otherAccount = sessionEmail !== null && !sameAccount;

  const passwordInput = (id: string, label: string, autoComplete: string) => (
    <Label htmlFor={id}>
      {label}
      <span className="password-field">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={accountExists ? undefined : PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-describedby={accountExists ? undefined : "invite-password-rules"}
          disabled={busy}
        />
        <Button variant="brand" size="brand"
          type="button"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </Button>
      </span>
    </Label>
  );

  return (
    <main className="account-access-page">
      <div className="account-access-brand">
        <a href="/" className="brand-link">
          <Brand />
        </a>
      </div>
      <section className="account-access-card" aria-labelledby="invite-title">
        {stage === "checking" && (
          <div role="status" className="account-checking">
            <LoaderCircle
              className="animate-spin"
              size={22}
              aria-hidden="true"
            />
            Conferindo o seu convite…
          </div>
        )}

        {stage === "invalid" && (
          <>
            <span className="account-access-icon">
              <TriangleAlert size={26} aria-hidden="true" />
            </span>
            <h1 id="invite-title">Este convite não vale mais.</h1>
            <p>
              {error ||
                `Ele pode ter expirado (vale por 7 dias), já ter sido usado ou ter
              sido cancelado. Peça um novo convite a quem convidou você.`}
            </p>
            <Button asChild variant="brand" size="brand"><a className="button button-dark account-cta" href="/app">
              Ir para o login <ArrowRight size={18} />
            </a></Button>
          </>
        )}

        {stage === "ready" && preview && (
          <>
            <span className="account-access-icon">
              <UserPlus size={26} aria-hidden="true" />
            </span>
            <h1 id="invite-title">
              {preview.inviterName} convidou você para montar um enxoval.
            </h1>
            <p>
              <strong>{preview.enxovalName}</strong>: vocês editam a mesma
              lista. Só quem criou o enxoval convida outras pessoas ou o
              exclui.
            </p>
            <p className="account-identity">{invited}</p>

            {!accountExists && (
              <form className="auth-form" onSubmit={createAccount} aria-busy={busy}>
                <Label htmlFor="invite-name">
                  Seu nome
                  <Input
                    id="invite-name"
                    type="text"
                    autoComplete="name"
                    maxLength={100}
                    required
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={busy}
                  />
                </Label>
                {passwordInput("invite-password", "Crie uma senha", "new-password")}
                <PasswordRules password={password} id="invite-password-rules" />
                <Label htmlFor="invite-confirmation">
                  Confirme a senha
                  <Input
                    id="invite-confirmation"
                    type={visible ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={PASSWORD_MIN_LENGTH}
                    maxLength={PASSWORD_MAX_LENGTH}
                    required
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    placeholder="Digite novamente"
                    disabled={busy}
                  />
                </Label>
                <p className="account-password-hint">
                  Esta conta serve para usar os enxovais para os quais você for
                  convidado.
                </p>
                {error && (
                  <div className="form-error" role="alert">
                    {error}
                  </div>
                )}
                <Button variant="brand" size="brand" className="button button-dark" type="submit" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="animate-spin" size={18} />
                  ) : (
                    <>
                      Aceitar e entrar <ArrowRight size={18} />
                    </>
                  )}
                </Button>
              </form>
            )}

            {accountExists && sameAccount && (
              <div className="auth-form">
                {error && (
                  <div className="form-error" role="alert">
                    {error}
                  </div>
                )}
                <Button variant="brand" size="brand"
                  className="button button-dark"
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => acceptInvitation(initialToken))}
                >
                  {busy ? (
                    <LoaderCircle className="animate-spin" size={18} />
                  ) : (
                    <>
                      Aceitar convite <ArrowRight size={18} />
                    </>
                  )}
                </Button>
              </div>
            )}

            {accountExists && otherAccount && (
              <div className="auth-form">
                <p className="account-password-hint">
                  Você está logado como {sessionEmail}, mas o convite é para{" "}
                  {invited}.
                </p>
                <Button variant="brand" size="brand"
                  className="button button-dark"
                  type="button"
                  onClick={() => void switchAccount()}
                >
                  Entrar com {invited} <ArrowRight size={18} />
                </Button>
              </div>
            )}

            {accountExists && sessionEmail === null && (
              <form className="auth-form" onSubmit={signInAndAccept} aria-busy={busy}>
                <p className="account-password-hint">
                  Você já tem conta no Casa Mia. Entre com a sua senha para
                  aceitar. Seu enxoval e este ficam separados e você troca entre
                  eles no menu.
                </p>
                {passwordInput("invite-login-password", "Sua senha", "current-password")}
                {error && (
                  <div className="form-error" role="alert">
                    {error}
                  </div>
                )}
                <Button variant="brand" size="brand" className="button button-dark" type="submit" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="animate-spin" size={18} />
                  ) : (
                    <>
                      Entrar e aceitar <ArrowRight size={18} />
                    </>
                  )}
                </Button>
              </form>
            )}
          </>
        )}
      </section>
      <p className="account-access-footer">Seu lar, tomando forma.</p>
    </main>
  );
}
