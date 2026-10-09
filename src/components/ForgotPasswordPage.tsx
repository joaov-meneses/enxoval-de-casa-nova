import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, KeyRound, LoaderCircle, MailCheck } from "lucide-react";
import { requestPasswordReset } from "../api";
import { Brand } from "./Brand";

/** O login guarda o e-mail digitado aqui para esta tela já abrir preenchida (nunca vai na URL). */
export const FORGOT_EMAIL_KEY = "larume.forgot.email";
const RESEND_AFTER_SECONDS = 60;

function takePrefilledEmail() {
  try {
    const value = sessionStorage.getItem(FORGOT_EMAIL_KEY) ?? "";
    sessionStorage.removeItem(FORGOT_EMAIL_KEY);
    return value;
  } catch {
    return "";
  }
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState(takePrefilledEmail);
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useState(0);
  useEffect(() => {
    document.title = "Esqueci minha senha | Larume";
  }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const target = (sentTo || email).trim();
    if (!target || busy) return;
    setBusy(true);
    setError("");
    try {
      await requestPasswordReset(target);
      setSentTo(target);
      setWait(RESEND_AFTER_SECONDS);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível enviar agora. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="account-access-page">
      <div className="account-access-brand">
        <a href="/" className="brand-link">
          <Brand />
        </a>
      </div>
      <section className="account-access-card" aria-labelledby="forgot-title">
        <span className="account-access-icon">
          {sentTo ? (
            <MailCheck size={26} aria-hidden="true" />
          ) : (
            <KeyRound size={26} aria-hidden="true" />
          )}
        </span>
        {sentTo ? (
          <>
            <h1 id="forgot-title">Confira o seu e-mail.</h1>
            <p>
              Se existe uma conta com o e-mail abaixo, enviamos um link para
              criar uma nova senha. Ele vale por 1 hora e só pode ser usado uma
              vez.
            </p>
            <div className="account-identity">{sentTo}</div>
            <p className="account-password-hint" role="status">
              Não chegou? Veja a caixa de spam ou aguarde um minuto e peça de
              novo.
            </p>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button
              type="button"
              className="button button-outline account-resend"
              disabled={busy || wait > 0}
              onClick={() => void send()}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" size={18} />
              ) : wait > 0 ? (
                `Reenviar em ${wait}s`
              ) : (
                "Reenviar o link"
              )}
            </button>
          </>
        ) : (
          <>
            <h1 id="forgot-title">Esqueceu a senha?</h1>
            <p>
              Sem problema. Informe o e-mail da sua conta e enviaremos um link
              para você criar uma nova senha.
            </p>
            <form className="auth-form" onSubmit={send} aria-busy={busy}>
              <label htmlFor="forgot-email">
                Seu e-mail
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="voce@exemplo.com"
                  autoComplete="email"
                  autoFocus
                  required
                  maxLength={254}
                  disabled={busy}
                />
              </label>
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              <button
                className="button button-dark"
                type="submit"
                disabled={busy || !email.trim()}
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" size={18} />
                ) : (
                  <>
                    Enviar link de redefinição <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          </>
        )}
        <a className="account-signout" href="/app">
          Voltar para o login
        </a>
      </section>
      <p className="account-access-footer">Seu lar, tomando forma.</p>
    </main>
  );
}
