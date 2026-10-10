import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  CircleCheck,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";
import { checkPasswordResetToken, resetPassword } from "../api";
import { Brand } from "./Brand";

// O token vem no fragmento (#token=...) do link do e-mail. É lido uma vez, no carregamento do módulo,
// porque o fragmento é apagado da barra de endereço logo depois (ele não deve ficar no histórico).
const initialToken = new URLSearchParams(
  window.location.hash.replace(/^#/, ""),
).get("token") ?? "";

type Stage = "checking" | "ready" | "invalid" | "done";

export function ResetPasswordPage() {
  const [stage, setStage] = useState<Stage>(initialToken ? "checking" : "invalid");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Criar nova senha | Casa Mia";
    if (window.location.hash)
      window.history.replaceState({}, "", "/redefinir-senha");
    if (!initialToken) return;
    let cancelled = false;
    checkPasswordResetToken(initialToken)
      .then(({ valid }) => {
        if (!cancelled) setStage(valid ? "ready" : "invalid");
      })
      .catch(() => {
        // Sem conseguir validar, deixa tentar: o servidor valida de novo ao enviar.
        if (!cancelled) setStage("ready");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmation) {
      setError("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await resetPassword(initialToken, password, confirmation);
      setStage("done");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Não foi possível alterar a senha. Tente novamente.";
      if (message.startsWith("Este link")) setStage("invalid");
      else setError(message);
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
      <section className="account-access-card" aria-labelledby="reset-title">
        {stage === "checking" && (
          <div role="status" className="account-checking">
            <LoaderCircle className="animate-spin" size={22} aria-hidden="true" />
            Conferindo o seu link…
          </div>
        )}

        {stage === "invalid" && (
          <>
            <span className="account-access-icon">
              <TriangleAlert size={26} aria-hidden="true" />
            </span>
            <h1 id="reset-title">Este link não vale mais.</h1>
            <p>
              Ele pode ter expirado (vale por 1 hora), já ter sido usado ou ter
              sido substituído por um pedido mais novo. É só pedir outro.
            </p>
            <a className="button button-dark account-cta" href="/esqueci-senha">
              Pedir um novo link <ArrowRight size={18} />
            </a>
            <a className="account-signout" href="/app">
              Voltar para o login
            </a>
          </>
        )}

        {stage === "ready" && (
          <>
            <span className="account-access-icon">
              <KeyRound size={26} aria-hidden="true" />
            </span>
            <h1 id="reset-title">Crie uma nova senha.</h1>
            <p>
              Escolha uma senha que só você conheça. Seus itens e listas
              continuam salvos.
            </p>
            <form className="auth-form" onSubmit={submit} aria-busy={busy}>
              <label htmlFor="reset-password">
                Nova senha
                <span className="password-field">
                  <input
                    id="reset-password"
                    type={visible ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                    autoFocus
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Pelo menos 8 caracteres"
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
              <label htmlFor="reset-confirmation">
                Confirme a nova senha
                <input
                  id="reset-confirmation"
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
                Ao salvar, você sai de todos os aparelhos e entra de novo com a
                senha nova.
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
                    Salvar nova senha <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          </>
        )}

        {stage === "done" && (
          <>
            <span className="account-access-icon">
              <CircleCheck size={26} aria-hidden="true" />
            </span>
            <h1 id="reset-title">Senha alterada.</h1>
            <p>
              Tudo certo! Agora é só entrar com a sua nova senha. Também
              enviamos um aviso para o seu e-mail.
            </p>
            <a className="button button-dark account-cta" href="/app">
              Entrar no meu enxoval <ArrowRight size={18} />
            </a>
          </>
        )}
      </section>
      <p className="account-access-footer">Seu lar, tomando forma.</p>
    </main>
  );
}
