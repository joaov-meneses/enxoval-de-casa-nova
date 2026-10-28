import { Button } from "@/src/components/ui/button";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CircleCheck,
  LoaderCircle,
  LogOut,
  MailCheck,
  RefreshCw,
  TriangleAlert,
} from "@/src/components/icons";
import { fetchBootstrap, resendEmailVerification, verifyEmail } from "../api";
import type { AuthUser, BootstrapData } from "../types";
import { Brand } from "./Brand";

/** Conta nova que ainda não confirmou o e-mail: nada do app abre até o link ser usado. */
export function EmailVerificationPending({
  user,
  onVerified,
  onLogout,
}: {
  user: AuthUser;
  onVerified: (data: BootstrapData) => void;
  onLogout: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<"" | "resend" | "check">("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Confirme seu e-mail | Casa Mia";
  }, []);

  async function check() {
    setBusy("check");
    setError("");
    setNotice("");
    try {
      const data = await fetchBootstrap();
      if (data.user.emailVerified === false) setNotice("Ainda não recebemos a confirmação. Abra o link do e-mail e volte aqui.");
      else onVerified(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível conferir agora.");
    } finally {
      setBusy("");
    }
  }

  async function resend() {
    setBusy("resend");
    setError("");
    setNotice("");
    try {
      const result = await resendEmailVerification();
      if (result.alreadyVerified) await check();
      else setNotice(`Enviamos um novo link para ${user.email}. O anterior deixou de valer.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível reenviar agora.");
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="account-access-page">
      <div className="account-access-brand">
        <Brand />
      </div>
      <section className="account-access-card" aria-labelledby="verify-title">
        <span className="account-access-icon">
          <MailCheck size={26} aria-hidden="true" />
        </span>
        <span className="eyebrow">FALTA SÓ UM PASSO</span>
        <h1 id="verify-title">Confirme seu e-mail.</h1>
        <p>
          Enviamos um link de confirmação para o endereço abaixo. Abra o e-mail
          e toque em “Confirmar e-mail” para começar a montar o plano da sua
          casa nova.
        </p>
        <div className="account-identity">{user.email}</div>
        <p className="account-password-hint">
          Não chegou? Confira o spam e a aba Promoções. O link vale por 48 horas.
        </p>
        {notice && (
          <p className="account-password-hint" role="status">
            {notice}
          </p>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <Button
          variant="brand"
          size="brand"
          className="button button-dark account-cta"
          disabled={Boolean(busy)}
          onClick={() => void check()}
        >
          {busy === "check" ? (
            <LoaderCircle className="animate-spin" size={18} />
          ) : (
            <>
              Já confirmei <ArrowRight size={18} />
            </>
          )}
        </Button>
        <Button
          variant="brand"
          size="brand"
          className="button button-outline"
          disabled={Boolean(busy)}
          onClick={() => void resend()}
        >
          {busy === "resend" ? (
            <LoaderCircle className="animate-spin" size={18} />
          ) : (
            <>
              <RefreshCw size={16} /> Reenviar o link
            </>
          )}
        </Button>
        <button
          type="button"
          className="account-signout"
          onClick={() => void onLogout()}
        >
          <LogOut size={16} /> Sair e usar outro e-mail
        </button>
      </section>
      <p className="account-access-footer">Seu lar, tomando forma.</p>
    </main>
  );
}

// O token vem no fragmento (#token=...) do link do e-mail e é apagado da barra de endereço logo depois.
const initialToken =
  new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token") ??
  "";

/** Destino do link do e-mail (/verificar-email). Funciona mesmo em outro navegador, sem sessão aberta. */
export function VerifyEmailPage() {
  const [stage, setStage] = useState<"checking" | "done" | "invalid">(
    initialToken ? "checking" : "invalid",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    document.title = "Confirmar e-mail | Casa Mia";
    if (window.location.hash)
      window.history.replaceState({}, "", "/verificar-email");
    if (!initialToken) return;
    let cancelled = false;
    verifyEmail(initialToken)
      .then(() => {
        if (!cancelled) setStage("done");
      })
      .catch((err) => {
        if (cancelled) return;
        setMessage(err instanceof Error ? err.message : "");
        setStage("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="account-access-page">
      <div className="account-access-brand">
        <a href="/" className="brand-link">
          <Brand />
        </a>
      </div>
      <section className="account-access-card" aria-labelledby="verify-link-title">
        {stage === "checking" && (
          <div role="status" className="account-checking">
            <LoaderCircle className="animate-spin" size={22} aria-hidden="true" />
            Confirmando o seu e-mail…
          </div>
        )}
        {stage === "done" && (
          <>
            <span className="account-access-icon">
              <CircleCheck size={26} aria-hidden="true" />
            </span>
            <h1 id="verify-link-title">E-mail confirmado.</h1>
            <p>Tudo certo! Agora é montar o plano da sua casa nova.</p>
            <Button asChild variant="brand" size="brand">
              <a className="button button-dark account-cta" href="/app">
                Continuar <ArrowRight size={18} />
              </a>
            </Button>
          </>
        )}
        {stage === "invalid" && (
          <>
            <span className="account-access-icon">
              <TriangleAlert size={26} aria-hidden="true" />
            </span>
            <h1 id="verify-link-title">Este link não vale mais.</h1>
            <p>
              {message ||
                "Ele pode ter expirado (vale por 48 horas), já ter sido usado ou ter sido substituído por um mais novo."}{" "}
              Entre na sua conta para pedir outro.
            </p>
            <Button asChild variant="brand" size="brand">
              <a className="button button-dark account-cta" href="/app">
                Entrar na minha conta <ArrowRight size={18} />
              </a>
            </Button>
          </>
        )}
      </section>
      <p className="account-access-footer">Seu lar, tomando forma.</p>
    </main>
  );
}
