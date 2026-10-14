import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
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

type AuthMode = "login" | "register";

const MODE_PATH: Record<AuthMode, string> = {
  login: "/login",
  register: "/cadastro",
};

/** `/cadastro` abre a tela já na aba de criar conta (usado pelo CTA "Começar Grátis" da landing). */
function initialMode(): AuthMode {
  return window.location.pathname === MODE_PATH.register ? "register" : "login";
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
    <main className="auth-page">
      <section className="auth-story">
        <img
          src="/images/larume-home.webp"
          alt="Seu próximo lar, acolhedor e cheio de possibilidades"
        />
        <div className="auth-story-top">
          <a href="/" className="brand-link">
            <Brand light />
          </a>
          <span>SEU LAR COMEÇA AQUI</span>
        </div>
        <div className="auth-story-copy">
          <Heart size={28} strokeWidth={1.2} />
          <h2>
            O melhor de uma
            <br />
            casa é o que você
            <br />
            <em>vai viver nela.</em>
          </h2>
          <p>
            Organize os detalhes.
            <br />
            Abra espaço para as histórias.
          </p>
          <div className="auth-story-tags">
            <span>
              <Check size={14} /> Planeje com calma
            </span>
            <span>
              <Check size={14} /> Conquiste junto
            </span>
          </div>
        </div>
      </section>
      <section className="auth-panel">
        <a href="/" className="auth-back">
          <ArrowLeft size={16} /> Voltar ao início
        </a>
        <div className="auth-form-wrap">
          <a href="/" className="brand-link auth-mobile-brand">
            <Brand />
          </a>
          <div className="auth-tabs" role="tablist" aria-label="Entrar ou criar conta">
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
            <RegisterPanel />
          )}
        </div>
        <span className="auth-bottom">
          Pequenos planos. Grandes começos. <Heart size={12} />
        </span>
      </section>
    </main>
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
      role="tabpanel"
      aria-labelledby="auth-tab-login"
    >
      <span className="eyebrow">UM CANTINHO PARA OS SEUS PLANOS</span>
      <h1>Entre, a casa é sua.</h1>
      <p>Seu próximo capítulo está esperando por você.</p>
      <form onSubmit={submit} className="auth-form">
        <label htmlFor="auth-email">
          Seu e-mail
          <input
            type="email"
            id="auth-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@exemplo.com"
            autoComplete="email"
            required
          />
        </label>
        <label htmlFor="auth-password">
          Sua senha
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
            <button
              type="button"
              aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>
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
            <LoaderCircle size={18} className="animate-spin" />
          ) : (
            "Entrar no meu enxoval"
          )}
          {!submitting && <ArrowRight size={18} />}
        </button>
      </form>
      <p className="auth-switch">
        Ainda não tem conta?{" "}
        <button type="button" className="auth-switch-link" onClick={onSwitchToRegister}>
          Crie a sua grátis
        </button>
      </p>
      <p className="auth-note">
        <ShieldCheck size={15} /> Sem cartão de crédito. No seu tempo.
      </p>
    </section>
  );
}

function RegisterPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      role="tabpanel"
      aria-labelledby="auth-tab-register"
    >
      <span className="eyebrow">COMECE EM POUCOS MINUTOS</span>
      <h1>Crie sua conta grátis.</h1>
      <p>Depois de criar a conta, você monta o plano da sua casa nova.</p>
      <form onSubmit={submit} className="auth-form">
        <label htmlFor="register-email">
          Seu e-mail
          <input
            type="email"
            id="register-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@exemplo.com"
            autoComplete="email"
            required
          />
        </label>
        <label htmlFor="register-password">
          Crie uma senha
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
              minLength={6}
              required
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
        <label htmlFor="register-password-confirmation">
          Confirme a senha
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
              aria-invalid={confirmation !== "" && confirmation !== password}
              required
            />
          </span>
        </label>
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
            <LoaderCircle size={18} className="animate-spin" />
          ) : (
            "Criar conta e montar meu plano"
          )}
          {!submitting && <ArrowRight size={18} />}
        </button>
      </form>
      <p className="auth-privacy">
        Ao criar a conta, você concorda com a nossa{" "}
        <a href="/privacidade" target="_blank" rel="noopener">
          política de privacidade
        </a>
        .
      </p>
      <p className="auth-note">
        <ShieldCheck size={15} /> Sem cartão de crédito. Seus dados ficam só com você.
      </p>
    </section>
  );
}
