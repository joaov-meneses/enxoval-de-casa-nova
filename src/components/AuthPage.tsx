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
import { login } from "../api";
import type { BootstrapData } from "../types";
import { Brand } from "./Brand";

export function AuthPage({
  onAuthenticated,
}: {
  onAuthenticated: (
    data: BootstrapData,
    options?: { promptCreateEnxoval?: boolean },
  ) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    document.title = "Entre, a casa é sua | Larume";
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      // A conta só nasce no fim do funil /comecar; aqui só se entra em uma existente.
      const data = await login(email.trim(), password);
      window.history.replaceState(
        {},
        "",
        data.user.mustChangePassword ? "/change-password" : "/app",
      );
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
            <a href="/comecar">Monte seu plano de casa nova</a> e crie a sua no
            final.
          </p>
          <div className="auth-divider">
            <span>ou conheça antes de começar</span>
          </div>
          <a href="/demo" className="button button-outline">
            Explorar a demonstração <ArrowUpIcon />
          </a>
          <p className="auth-note">
            <ShieldCheck size={15} /> Sem cartão de crédito. No seu tempo.
          </p>
        </div>
        <span className="auth-bottom">
          Pequenos planos. Grandes começos. <Heart size={12} />
        </span>
      </section>
    </main>
  );
}
function ArrowUpIcon() {
  return <ArrowRight size={16} />;
}
