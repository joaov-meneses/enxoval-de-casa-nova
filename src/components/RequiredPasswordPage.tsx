import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LogOut,
} from "lucide-react";
import { changeRequiredPassword } from "../api";
import type { AuthUser, BootstrapData } from "../types";
import { Brand } from "./Brand";

export function RequiredPasswordPage({
  user,
  onChanged,
  onLogout,
}: {
  user: AuthUser;
  onChanged: (data: BootstrapData) => void;
  onLogout: () => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    document.title = "Defina sua nova senha | Casa Mia";
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
      const data = await changeRequiredPassword(password, confirmation);
      window.history.replaceState({}, "", "/app");
      onChanged(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível alterar sua senha.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="account-access-page">
      <div className="account-access-brand">
        <Brand />
      </div>
      <section className="account-access-card" aria-labelledby="password-title">
        <span className="account-access-icon">
          <KeyRound size={26} aria-hidden="true" />
        </span>
        <span className="eyebrow">UM NOVO ACESSO AO SEU CANTINHO</span>
        <h1 id="password-title">Defina sua nova senha.</h1>
        <p>
          Olá, {user.name}. Sua senha temporária funcionou. Escolha uma senha
          pessoal para continuar no seu enxoval.
        </p>
        <div className="account-identity">{user.email}</div>
        <form className="auth-form" onSubmit={submit} aria-busy={busy}>
          <label htmlFor="new-password">
            Nova senha
            <span className="password-field">
              <input
                id="new-password"
                type={visible ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
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
          <label htmlFor="confirm-password">
            Confirme a nova senha
            <input
              id="confirm-password"
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
            Escolha uma senha diferente da temporária. Seus itens e listas
            continuam salvos.
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
                Salvar senha e continuar <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
        <button
          className="account-signout"
          disabled={busy}
          onClick={() => void onLogout()}
        >
          <LogOut size={16} /> Sair desta conta
        </button>
      </section>
      <p className="account-access-footer">Seu lar, tomando forma.</p>
    </main>
  );
}
