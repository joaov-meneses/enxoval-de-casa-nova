import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { Input } from "@/src/components/ui/input";
import { useEffect, useRef, useState, type FormEvent, type MouseEvent, type Ref } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CreditCard,
  Eye,
  EyeOff,
  Heart,
  LoaderCircle,
} from "@/src/components/icons";
import { ApiError, login, register } from "../api";
import { isAppPath } from "../appRoute";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordPolicyError } from "../../shared/passwordPolicy";
import { PAID_PLAN_OFFERS } from "../plans";
import { PasswordRules } from "./PasswordRules";
import type { BootstrapData } from "../types";
import { Brand } from "./Brand";
import { FORGOT_EMAIL_KEY } from "./ForgotPasswordPage";
import { Nino } from "./Nino";

type AuthMode = "login" | "register";

const MODE_PATH: Record<AuthMode, string> = {
  login: "/login",
  register: "/cadastro",
};

const TECHNICAL_ERROR = "Ops, tropeçamos aqui. Tente de novo em instantes.";
const DUPLICATE_ACCOUNT_ERROR =
  'Não foi possível criar a conta com esse e-mail. Se você já tem cadastro, use "Entre por aqui" abaixo.';

// O servidor só exige "@" no e-mail (contas antigas podem ter domínio sem ponto); o cadastro é mais estrito.
const LOGIN_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;
const REGISTER_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PASS_PRICE = PAID_PLAN_OFFERS.find((offer) => offer.id === "pass")?.price ?? "R$ 99";

type FieldErrors = { email?: string; password?: string };

/** `/cadastro` abre a tela já em criar conta (é o destino do CTA da landing); qualquer outro caminho abre o login. */
function initialMode(): AuthMode {
  return window.location.pathname === MODE_PATH.register ? "register" : "login";
}

/** Falha de rede ou 5xx vira uma frase única; 4xx traz a mensagem do servidor, sem texto técnico cru. */
function authErrorMessage(err: unknown, mode: AuthMode): string {
  if (!(err instanceof ApiError) || err.status === 0 || err.status >= 500) return TECHNICAL_ERROR;
  if (mode === "register" && err.status === 409) return DUPLICATE_ACCOUNT_ERROR;
  return err.message || TECHNICAL_ERROR;
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
  // O e-mail digitado acompanha a pessoa entre entrar e criar conta; a senha não.
  const [email, setEmail] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocusHeading = useRef(false);

  // Ao trocar de modo, a URL acompanha (para recarregar ou compartilhar manter o modo). Na abertura
  // ela não muda, para não perder o endereço de quem chegou aqui vindo de outra rota.
  const setMode = (next: AuthMode) => {
    shouldFocusHeading.current = true;
    setModeState(next);
    window.history.replaceState({}, "", MODE_PATH[next]);
  };
  useEffect(() => {
    document.title =
      mode === "register"
        ? "Crie sua conta | Casa Mia"
        : "Entre, a casa é sua | Casa Mia";
    // O link clicado desmonta com o painel: o foco vai para o título do novo modo.
    if (shouldFocusHeading.current) {
      shouldFocusHeading.current = false;
      headingRef.current?.focus();
    }
  }, [mode]);

  return (
    <main className="auth-shell">
      <header className="auth-topbar">
        <a href="/" className="brand-link">
          <Brand />
        </a>
        <a href="/" className="auth-back">
          <ArrowLeft size={16} aria-hidden="true" /> Voltar ao início
        </a>
      </header>

      <div className="auth-door">
        <div className="auth-nino-arch">
          <Nino pose="wave" size={104} className="auth-nino" />
        </div>
        <div className="auth-card">
          <header className="auth-heading">
            <h1 ref={headingRef} tabIndex={-1} id="auth-title">
              {mode === "register" ? "Crie sua conta." : "Entre, a casa é sua."}
            </h1>
            {mode === "register" ? (
              <p className="auth-billing">
                <CreditCard size={16} aria-hidden="true" />
                <span>
                  Depois você escolhe: Passe de {PASS_PRICE} ou Mensal com 2 dias grátis, com cartão.
                </span>
              </p>
            ) : (
              <p>Seu próximo capítulo está esperando por você.</p>
            )}
          </header>
          {mode === "register" ? (
            <RegisterPanel email={email} onEmailChange={setEmail} onSwitchToLogin={() => setMode("login")} />
          ) : (
            <LoginPanel
              email={email}
              onEmailChange={setEmail}
              onAuthenticated={onAuthenticated}
              onSwitchToRegister={() => setMode("register")}
            />
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
    <Button variant="brand" size="brand"
      type="button"
      aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
      aria-pressed={visible}
      onClick={onToggle}
    >
      {visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
    </Button>
  );
}

/** Mensagem junto do campo. O foco e o aria-describedby já a anunciam, por isso sem role. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="auth-hint is-error">
      {message}
    </p>
  );
}

function EmailField({
  id,
  value,
  onChange,
  error,
  inputRef,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  inputRef: Ref<HTMLInputElement>;
}) {
  return (
    <div className="auth-field">
      <Label htmlFor={id}>Seu e-mail</Label>
      <Input
        ref={inputRef}
        type="email"
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="voce@exemplo.com"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

/** Link de troca de modo: abre em nova aba normalmente; o clique simples só troca o painel. */
function SwitchLink({ mode, onSwitch, children }: { mode: AuthMode; onSwitch: () => void; children: string }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onSwitch();
  };
  return (
    <a href={MODE_PATH[mode]} className="auth-switch-link" onClick={onClick}>
      {children}
    </a>
  );
}

function SubmitLabel({ submitting, idle, busy }: { submitting: boolean; idle: string; busy: string }) {
  return submitting ? (
    <>
      <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
      {busy}
    </>
  ) : (
    <>
      {idle}
      <ArrowRight size={18} aria-hidden="true" />
    </>
  );
}

function LoginPanel({
  email,
  onEmailChange,
  onAuthenticated,
  onSwitchToRegister,
}: {
  email: string;
  onEmailChange: (value: string) => void;
  onAuthenticated: (data: BootstrapData) => void;
  onSwitchToRegister: () => void;
}) {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const errors: FieldErrors = {};
    const typed = email.trim();
    if (!typed) errors.email = "Digite seu e-mail.";
    else if (!LOGIN_EMAIL_PATTERN.test(typed)) errors.email = "Confira o e-mail: use o formato nome@exemplo.com.";
    if (!password) errors.password = "Digite sua senha.";
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      setError("");
      (errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const data = await login(typed, password);
      if (data.user.mustChangePassword) {
        if (!isAppPath(window.location.pathname)) window.history.replaceState({}, "", "/change-password");
        onAuthenticated(data);
        return;
      }
      // Conta sem enxoval ainda (cadastro feito, funil não terminado): retoma em /comecar.
      if (data.enxovais.length === 0) {
        window.location.assign("/comecar");
        return;
      }
      if (!isAppPath(window.location.pathname)) window.history.replaceState({}, "", "/app");
      onAuthenticated(data);
    } catch (err) {
      setError(authErrorMessage(err, "login"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="auth-panel-login" className="auth-panel" aria-labelledby="auth-title">
      <form onSubmit={submit} className="auth-form auth-fields" noValidate>
        <EmailField
          id="auth-email"
          value={email}
          inputRef={emailRef}
          error={fieldErrors.email}
          onChange={(value) => {
            onEmailChange(value);
            setFieldErrors((prev) => ({ ...prev, email: undefined }));
          }}
        />
        <div className="auth-field">
          <Label htmlFor="auth-password">Sua senha</Label>
          <span className="password-field">
            <Input
              ref={passwordRef}
              type={visible ? "text" : "password"}
              id="auth-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }}
              placeholder="Digite sua senha"
              autoComplete="current-password"
              required
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? "auth-password-error" : undefined}
            />
            <PasswordToggle visible={visible} onToggle={() => setVisible(!visible)} />
          </span>
          <FieldError id="auth-password-error" message={fieldErrors.password} />
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
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <Button variant="brand" size="brand"
          type="submit"
          aria-disabled={submitting}
          aria-busy={submitting}
          className="button button-dark"
        >
          <SubmitLabel submitting={submitting} idle="Entrar no meu enxoval" busy="Entrando…" />
        </Button>
      </form>
      <p className="auth-switch">
        Ainda não tem conta?{" "}
        <SwitchLink mode="register" onSwitch={onSwitchToRegister}>
          Criar conta
        </SwitchLink>
      </p>
    </section>
  );
}

function RegisterPanel({
  email,
  onEmailChange,
  onSwitchToLogin,
}: {
  email: string;
  onEmailChange: (value: string) => void;
  onSwitchToLogin: () => void;
}) {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  // Consentimento de marketing por e-mail: separado da política e desmarcado por padrão (LGPD).
  const [emailMarketing, setEmailMarketing] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<number>(undefined);

  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  // Recolher as regras no mousedown deslocaria a caixa de consentimento e o botão sob o ponteiro e o
  // clique se perderia; por isso o recolhimento espera um instante e o foco seguinte o cancela.
  const onPasswordFocus = () => {
    window.clearTimeout(blurTimer.current);
    setPasswordFocused(true);
  };
  const onPasswordBlur = () => {
    window.clearTimeout(blurTimer.current);
    blurTimer.current = window.setTimeout(() => setPasswordFocused(false), 200);
  };

  const showRules = passwordFocused || password !== "";
  const passwordDescribedBy = [fieldErrors.password ? "register-password-error" : "", "register-password-hint"]
    .filter(Boolean)
    .join(" ");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const errors: FieldErrors = {};
    const typed = email.trim();
    if (!typed) errors.email = "Digite seu e-mail.";
    else if (!REGISTER_EMAIL_PATTERN.test(typed)) errors.email = "Confira o e-mail: use o formato nome@exemplo.com.";
    if (!password) errors.password = "Digite sua senha.";
    else {
      const weak = passwordPolicyError(password);
      if (weak) errors.password = weak;
    }
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      setError("");
      (errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const data = await register(typed, password, { emailMarketing });
      // Conta criada: o funil de perguntas monta o plano e o primeiro enxoval a seguir. Quando o e-mail
      // ainda precisa ser confirmado, o app mostra antes a tela de confirmação.
      window.location.assign(data.user.emailVerified === false ? "/app" : "/comecar");
    } catch (err) {
      setError(authErrorMessage(err, "register"));
      setSubmitting(false);
    }
  }

  return (
    <section id="auth-panel-register" className="auth-panel" aria-labelledby="auth-title">
      <form onSubmit={submit} className="auth-form auth-fields" noValidate>
        <EmailField
          id="register-email"
          value={email}
          inputRef={emailRef}
          error={fieldErrors.email}
          onChange={(value) => {
            onEmailChange(value);
            setFieldErrors((prev) => ({ ...prev, email: undefined }));
          }}
        />
        <div className="auth-field">
          <Label htmlFor="register-password">Crie uma senha</Label>
          <span className="password-field" onFocus={onPasswordFocus} onBlur={onPasswordBlur}>
            <Input
              ref={passwordRef}
              type={visible ? "text" : "password"}
              id="register-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors((prev) => ({ ...prev, password: undefined }));
                setError("");
              }}
              placeholder={`${PASSWORD_MIN_LENGTH} ou mais caracteres`}
              autoComplete="new-password"
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={passwordDescribedBy}
              maxLength={PASSWORD_MAX_LENGTH}
              required
            />
            <PasswordToggle visible={visible} onToggle={() => setVisible(!visible)} />
          </span>
          <FieldError id="register-password-error" message={fieldErrors.password} />
          {showRules ? (
            <PasswordRules password={password} id="register-password-hint" />
          ) : (
            <p id="register-password-hint" className="auth-hint">
              Com letras, números e um caractere especial.
            </p>
          )}
        </div>
        <label className="auth-optin">
          <input
            type="checkbox"
            checked={emailMarketing}
            onChange={(e) => setEmailMarketing(e.target.checked)}
          />
          <span>
            Quero receber por e-mail lembretes da mudança e dicas para montar a casa. Dá para cancelar a qualquer
            momento.
          </span>
        </label>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <p className="auth-legal">
          Ao criar a conta, você concorda com os{" "}
          <a href="/termos" target="_blank" rel="noopener">
            Termos de Uso
            <span className="sr-only"> (abre em nova aba)</span>
          </a>{" "}
          e confirma que leu a{" "}
          <a href="/privacidade" target="_blank" rel="noopener">
            Política de Privacidade
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
          .
        </p>
        <Button variant="brand" size="brand"
          type="submit"
          aria-disabled={submitting}
          aria-busy={submitting}
          className="button button-dark"
        >
          <SubmitLabel submitting={submitting} idle="Criar minha conta" busy="Criando sua conta…" />
        </Button>
      </form>
      <p className="auth-switch">
        Já tem conta?{" "}
        <SwitchLink mode="login" onSwitch={onSwitchToLogin}>
          Entre por aqui
        </SwitchLink>
      </p>
    </section>
  );
}
