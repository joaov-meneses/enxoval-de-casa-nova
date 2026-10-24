import { Label } from "@/src/components/ui/label";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LogOut,
} from "@/src/components/icons";
import { changeRequiredPassword } from "../api";
import type { AuthUser, BootstrapData } from "../types";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordPolicyError } from "../../shared/passwordPolicy";
import { Brand } from "./Brand";
import { PasswordRules } from "./PasswordRules";

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
    const weak = passwordPolicyError(password);
    if (weak) {
      setError(weak);
      return;
    }
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
          <Label htmlFor="new-password">
            Nova senha
            <span className="password-field">
              <Input
                id="new-password"
                type={visible ? "text" : "password"}
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={`Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`}
                aria-describedby="new-password-rules"
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
          <PasswordRules password={password} id="new-password-rules" />
          <Label htmlFor="confirm-password">
            Confirme a nova senha
            <Input
              id="confirm-password"
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
            Escolha uma senha diferente da temporária. Seus itens e listas
            continuam salvos.
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
                Salvar senha e continuar <ArrowRight size={18} />
              </>
            )}
          </Button>
        </form>
        <Button variant="brand" size="brand"
          className="account-signout"
          disabled={busy}
          onClick={() => void onLogout()}
        >
          <LogOut size={16} /> Sair desta conta
        </Button>
      </section>
      <p className="account-access-footer">Seu lar, tomando forma.</p>
    </main>
  );
}
