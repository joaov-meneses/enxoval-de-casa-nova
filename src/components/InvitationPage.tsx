import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import {
  acceptInvitation,
  checkInvitation,
  fetchBootstrap,
  login,
  logout,
} from "../api";
import { storeEnxovalId } from "../enxovais";
import type { BootstrapData, InvitationPreview } from "../types";
import { Brand } from "./Brand";

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
    <label htmlFor={id}>
      {label}
      <span className="password-field">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={accountExists ? undefined : 8}
          maxLength={128}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
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
            <a className="button button-dark account-cta" href="/app">
              Ir para o login <ArrowRight size={18} />
            </a>
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
                <label htmlFor="invite-name">
                  Seu nome
                  <input
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
                </label>
                {passwordInput("invite-password", "Crie uma senha", "new-password")}
                <label htmlFor="invite-confirmation">
                  Confirme a senha
                  <input
                    id="invite-confirmation"
                    type={visible ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    placeholder="Digite novamente"
                    disabled={busy}
                  />
                </label>
                <p className="account-password-hint">
                  Use pelo menos 8 caracteres. Esta conta serve para usar os
                  enxovais para os quais você for convidado.
                </p>
                {error && (
                  <div className="form-error" role="alert">
                    {error}
                  </div>
                )}
                <button className="button button-dark" type="submit" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="animate-spin" size={18} />
                  ) : (
                    <>
                      Aceitar e entrar <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
            )}

            {accountExists && sameAccount && (
              <div className="auth-form">
                {error && (
                  <div className="form-error" role="alert">
                    {error}
                  </div>
                )}
                <button
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
                </button>
              </div>
            )}

            {accountExists && otherAccount && (
              <div className="auth-form">
                <p className="account-password-hint">
                  Você está logado como {sessionEmail}, mas o convite é para{" "}
                  {invited}.
                </p>
                <button
                  className="button button-dark"
                  type="button"
                  onClick={() => void switchAccount()}
                >
                  Entrar com {invited} <ArrowRight size={18} />
                </button>
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
                <button className="button button-dark" type="submit" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="animate-spin" size={18} />
                  ) : (
                    <>
                      Entrar e aceitar <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
            )}
          </>
        )}
      </section>
      <p className="account-access-footer">Seu lar, tomando forma.</p>
    </main>
  );
}
