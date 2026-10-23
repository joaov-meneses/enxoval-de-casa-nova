import { Button } from "@/src/components/ui/button";
import { useEffect, useState } from "react";
import { LoaderCircle, MailCheck } from "@/src/components/icons";
import { fetchEmailPreferences, updateEmailPreferences, type EmailPreferences } from "../api";
import { Brand } from "./Brand";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" });

/** Central de preferências dos e-mails de lembretes e dicas. Abre pelo link do e-mail, sem login. */
export function EmailPreferencesPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";
  // O "Cancelar" do rodapé do e-mail chega aqui e pede confirmação (verificadores de link não descadastram ninguém).
  const askedToCancel = params.get("acao") === "cancelar";
  const [prefs, setPrefs] = useState<EmailPreferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    document.title = "Preferências de e-mail | Casa Mia";
    if (!token) {
      setError("Link de preferências inválido. Use o link do último e-mail que você recebeu.");
      return;
    }
    fetchEmailPreferences(token)
      .then(setPrefs)
      .catch((err) => setError(err instanceof Error ? err.message : "Não foi possível abrir suas preferências."));
  }, [token]);

  const save = async (changes: Parameters<typeof updateEmailPreferences>[1], done: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setPrefs(await updateEmailPreferences(token, changes));
      setMessage(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="account-access-page">
      <div className="account-access-brand">
        <a href="/" className="brand-link">
          <Brand />
        </a>
      </div>
      <section className="account-access-card" aria-labelledby="preferences-title" aria-busy={busy}>
        <span className="account-access-icon">
          <MailCheck size={26} aria-hidden="true" />
        </span>
        <h1 id="preferences-title">Seus e-mails do Casa Mia</h1>
        {!prefs && !error && (
          <p role="status"><LoaderCircle className="animate-spin" size={18} aria-hidden="true" /> Carregando…</p>
        )}
        {prefs && (
          <>
            <div className="account-identity">{prefs.email}</div>
            {!prefs.subscribed ? (
              <>
                <p>Você não recebe lembretes nem dicas por e-mail. Avisos da conta e da assinatura continuam chegando.</p>
                <Button variant="brand" size="brand" className="button button-outline" disabled={busy}
                  onClick={() => void save({ subscribed: true }, "Pronto: os lembretes e dicas voltaram.")}>
                  Voltar a receber
                </Button>
              </>
            ) : askedToCancel ? (
              <>
                <p>Quer mesmo parar de receber lembretes da mudança e dicas para montar a casa?</p>
                <Button variant="brand" size="brand" className="button button-dark" disabled={busy}
                  onClick={() => void save({ subscribed: false }, "Pronto: você não recebe mais lembretes e dicas.")}>
                  Sim, cancelar os e-mails
                </Button>
                <a className="account-signout" href={`/preferencias?token=${encodeURIComponent(token)}`}>Prefiro escolher o que receber</a>
              </>
            ) : (
              <>
                <fieldset className="preferences-options" disabled={busy}>
                  <legend className="sr-only">O que você quer receber</legend>
                  <label className="auth-optin">
                    <input type="checkbox" checked={prefs.reminders}
                      onChange={(event) => void save({ reminders: event.target.checked }, "Preferência salva.")} />
                    <span><strong>Lembretes da mudança</strong> O que comprar em cada fase, até a primeira semana na casa nova.</span>
                  </label>
                  <label className="auth-optin">
                    <input type="checkbox" checked={prefs.tips}
                      onChange={(event) => void save({ tips: event.target.checked }, "Preferência salva.")} />
                    <span><strong>Dicas e novidades</strong> Ideias para começar a lista e lembretes quando ela fica parada.</span>
                  </label>
                </fieldset>
                {prefs.pausedUntil ? (
                  <Button variant="brand" size="brand" className="button button-outline" disabled={busy}
                    onClick={() => void save({ pause: false }, "Os e-mails voltaram.")}>
                    Pausado até {dateFormatter.format(new Date(prefs.pausedUntil))}. Retomar agora
                  </Button>
                ) : (
                  <Button variant="brand" size="brand" className="button button-outline" disabled={busy}
                    onClick={() => void save({ pause: true }, "Pausamos os e-mails por 30 dias.")}>
                    Pausar tudo por 30 dias
                  </Button>
                )}
                <Button variant="brand" size="brand" className="button button-outline" disabled={busy}
                  onClick={() => void save({ subscribed: false }, "Pronto: você não recebe mais lembretes e dicas.")}>
                  Cancelar todos os lembretes e dicas
                </Button>
              </>
            )}
          </>
        )}
        {message && <p className="account-password-hint" role="status">{message}</p>}
        {error && <div className="form-error" role="alert">{error}</div>}
      </section>
      <p className="account-access-footer">Seu lar, tomando forma.</p>
    </main>
  );
}
