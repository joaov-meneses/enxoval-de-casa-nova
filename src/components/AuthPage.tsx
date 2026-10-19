import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Heart,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { login, register } from "../api";
import type { BootstrapData } from "../types";
import { Brand } from "./Brand";
import { FORGOT_EMAIL_KEY } from "./ForgotPasswordPage";
import { Nino } from "./Nino";

type AuthMode = "login" | "register";

const MODE_PATH: Record<AuthMode, string> = {
  login: "/login",
  register: "/cadastro",
};

/** Celular e tablet priorizam o formulário, sem a vitrine de telas. */
const COMPACT_QUERY = "(max-width: 1023px)";

/** `/cadastro` abre a tela já na aba de criar conta (usado pelo CTA "Começar Grátis" da landing). */
function initialMode(): AuthMode {
  return window.location.pathname === MODE_PATH.register ? "register" : "login";
}

function useMatchMedia(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export function AuthPage({
  onAuthenticated,
}: {
  onAuthenticated: (
    data: BootstrapData,
    options?: { promptCreateEnxoval?: boolean },
  ) => void;
}) {
  const [mode, setModeState] = useState<AuthMode>(initialMode);
  const compact = useMatchMedia(COMPACT_QUERY);
  // Ao trocar de aba, a URL acompanha (para recarregar ou compartilhar manter a aba). Na abertura
  // ela não muda, para não perder o endereço de quem chegou aqui vindo de outra rota.
  const setMode = (next: AuthMode) => {
    setModeState(next);
    window.history.replaceState({}, "", MODE_PATH[next]);
  };
  useEffect(() => {
    document.title =
      mode === "register"
        ? "Crie sua conta | Casa Mia"
        : "Entre, a casa é sua | Casa Mia";
  }, [mode]);

  return (
    <main className="auth-shell">
      <div className="auth-hero">
        <header className="auth-topbar">
          <a href="/" className="brand-link">
            <Brand />
          </a>
          <a href="/" className="auth-back">
            <ArrowLeft size={16} aria-hidden="true" /> Voltar ao início
          </a>
        </header>
      </div>

      <div className="auth-door">
        {!compact && <Nino pose="wave" size={104} className="auth-nino" />}
        <div className="auth-card">
          <div
            className="auth-tabs"
            data-mode={mode}
            role="tablist"
            aria-label="Entrar ou criar conta"
          >
            <button
              type="button"
              role="tab"
              id="auth-tab-login"
              aria-selected={mode === "login"}
              aria-controls="auth-panel-login"
              className="auth-tab"
              onClick={() => setMode("login")}
            >
              Entrar
            </button>
            <button
              type="button"
              role="tab"
              id="auth-tab-register"
              aria-selected={mode === "register"}
              aria-controls="auth-panel-register"
              className="auth-tab"
              onClick={() => setMode("register")}
            >
              Criar conta
            </button>
          </div>
          {mode === "login" ? (
            <LoginPanel onAuthenticated={onAuthenticated} onSwitchToRegister={() => setMode("register")} />
          ) : (
            <RegisterPanel onSwitchToLogin={() => setMode("login")} />
          )}
        </div>
        <p className="auth-footnote">
          Pequenos planos. Grandes começos. <Heart size={12} aria-hidden="true" />
        </p>
      </div>
    </main>
  );
}

function PasswordToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
      aria-pressed={visible}
      onClick={onToggle}
    >
      {visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
    </button>
  );
}

function LoginPanel({
  onAuthenticated,
  onSwitchToRegister,
}: {
  onAuthenticated: (data: BootstrapData) => void;
  onSwitchToRegister: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const data = await login(email.trim(), password);
      if (data.user.mustChangePassword) {
        window.history.replaceState({}, "", "/change-password");
        onAuthenticated(data);
        return;
      }
      // Conta sem enxoval ainda (cadastro feito, funil não terminado): retoma em /comecar.
      if (data.enxovais.length === 0) {
        window.location.assign("/comecar");
        return;
      }
      window.history.replaceState({}, "", "/app");
      onAuthenticated(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível entrar. Tente novamente.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      id="auth-panel-login"
      className="auth-panel"
      role="tabpanel"
      aria-labelledby="auth-tab-login"
    >
      <header className="auth-heading">
        <h1>Entre, a casa é sua.</h1>
        <p>Seu próximo capítulo está esperando por você.</p>
      </header>
      <form onSubmit={submit} className="auth-form auth-fields">
        <div className="auth-field">
          <label htmlFor="auth-email">Seu e-mail</label>
          <input
            type="email"
            id="auth-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@exemplo.com"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </div>
        <div className="auth-field">
          <div className="auth-field-head">
            <label htmlFor="auth-password">Sua senha</label>
            <a
              className="auth-forgot"
              href="/esqueci-senha"
              onClick={() => {
                // Leva o e-mail já digitado para a próxima tela (fica só na sessão, nunca na URL).
                try {
                  if (email.trim())
                    sessionStorage.setItem(FORGOT_EMAIL_KEY, email.trim());
                } catch {
                  /* Sem armazenamento, a pessoa digita o e-mail de novo. */
                }
              }}
            >
              Esqueci minha senha
            </a>
          </div>
          <span className="password-field">
            <input
              type={visible ? "text" : "password"}
              id="auth-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite sua senha"
              autoComplete="current-password"
              required
            />
            <PasswordToggle visible={visible} onToggle={() => setVisible(!visible)} />
          </span>
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="button button-dark"
        >
          {submitting ? (
            <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
          ) : (
            "Entrar no meu enxoval"
          )}
          {!submitting && <ArrowRight size={18} aria-hidden="true" />}
        </button>
      </form>
      <p className="auth-switch">
        Ainda não tem conta?{" "}
        <button type="button" className="auth-switch-link" onClick={onSwitchToRegister}>
          Crie a sua grátis
        </button>
      </p>
      <p className="auth-note">
        <ShieldCheck size={15} aria-hidden="true" /> Teste completo por 2 dias. Cancele antes da cobrança.
      </p>
    </section>
  );
}

function RegisterPanel({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const mismatch = confirmation !== "" && confirmation !== password;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmation) {
      setError("As senhas não coincidem.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await register(email.trim(), password);
      // Conta criada: o funil de perguntas monta o plano e o primeiro enxoval a seguir.
      window.location.assign("/comecar");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível criar a conta agora. Tente novamente.",
      );
      setSubmitting(false);
    }
  }

  return (
    <section
      id="auth-panel-register"
      className="auth-panel"
      role="tabpanel"
      aria-labelledby="auth-tab-register"
    >
      <header className="auth-heading">
        <h1>Crie sua conta grátis.</h1>
        <p>Depois de criar a conta, você monta o plano da sua casa nova.</p>
      </header>
      <form onSubmit={submit} className="auth-form auth-fields">
        <div className="auth-field">
          <label htmlFor="register-email">Seu e-mail</label>
          <input
            type="email"
            id="register-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@exemplo.com"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </div>
        <div className="auth-field">
          <label htmlFor="register-password">Crie uma senha</label>
          <span className="password-field">
            <input
              type={visible ? "text" : "password"}
              id="register-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              placeholder="6 ou mais caracteres"
              autoComplete="new-password"
              aria-describedby="register-password-hint"
              minLength={6}
              required
            />
            <PasswordToggle visible={visible} onToggle={() => setVisible(!visible)} />
          </span>
          <p className="auth-hint" id="register-password-hint">
            Use 6 caracteres ou mais.
          </p>
        </div>
        <div className="auth-field">
          <label htmlFor="register-password-confirmation">Confirme a senha</label>
          <span className="password-field">
            <input
              type={visible ? "text" : "password"}
              id="register-password-confirmation"
              value={confirmation}
              onChange={(e) => {
                setConfirmation(e.target.value);
                setError("");
              }}
              placeholder="Repita a senha"
              autoComplete="new-password"
              aria-invalid={mismatch}
              aria-describedby={mismatch ? "register-password-mismatch" : undefined}
              required
            />
          </span>
          {mismatch && (
            <p className="auth-hint is-error" id="register-password-mismatch" role="status">
              As senhas ainda não são iguais.
            </p>
          )}
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="button button-dark"
        >
          {submitting ? (
            <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
          ) : (
            "Criar minha conta"
          )}
          {!submitting && <ArrowRight size={18} aria-hidden="true" />}
        </button>
      </form>
      <p className="auth-switch">
        Já tem conta?{" "}
        <button type="button" className="auth-switch-link" onClick={onSwitchToLogin}>
          Entre por aqui
        </button>
      </p>
      <p className="auth-privacy">
        Ao criar a conta, você concorda com a nossa{" "}
        <a href="/privacidade" target="_blank" rel="noopener">
          política de privacidade
        </a>
        .
      </p>
      <p className="auth-note">
        <ShieldCheck size={15} aria-hidden="true" /> Teste completo por 2 dias. Cancele no app antes da cobrança.
      </p>
    </section>
  );
}
