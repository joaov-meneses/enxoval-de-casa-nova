import { Button } from "@/src/components/ui/button";
import { useEffect, useState } from "react";
import { LoaderCircle, MessageCircleHeart } from "@/src/components/icons";
import { answerSurvey, fetchSurvey } from "../api";
import { Brand } from "./Brand";

const SCORES = Array.from({ length: 11 }, (_, score) => score);

function initialScore(value: string | null) {
  const score = Number(value);
  return value !== null && Number.isInteger(score) && score >= 0 && score <= 10 ? score : null;
}

/**
 * Pesquisa de pós-mudança (um mês depois da data da mudança). Abre pelo e-mail, sem login, com a nota já marcada
 * pelo botão clicado; a nota só é gravada quando a pessoa confirma, para verificadores de link não responderem.
 */
export function SurveyPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";
  const messageId = params.get("lm");
  const [score, setScore] = useState<number | null>(initialScore(params.get("nota")));
  const [comment, setComment] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Como foi montar a casa? | Casa Mia";
    if (!token) {
      setError("Link da pesquisa inválido. Use o link do e-mail que você recebeu.");
      setLoading(false);
      return;
    }
    fetchSurvey(token)
      .then((answer) => {
        setEmail(answer.email);
        if (answer.score !== null) {
          setScore((current) => current ?? answer.score);
          setComment(answer.comment);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Não foi possível abrir a pesquisa."))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async () => {
    if (score === null) return;
    setBusy(true);
    setError("");
    try {
      await answerSurvey(token, { score, comment, messageId });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar. Tente novamente.");
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
      <section className="account-access-card survey-card" aria-labelledby="survey-title" aria-busy={busy || loading}>
        <span className="account-access-icon">
          <MessageCircleHeart size={26} aria-hidden="true" />
        </span>
        <h1 id="survey-title">Como foi montar a casa?</h1>
        {loading && (
          <p role="status"><LoaderCircle className="animate-spin" size={18} aria-hidden="true" /> Carregando…</p>
        )}
        {!loading && !error && saved && (
          <p role="status">Obrigado! Sua resposta ajuda o Casa Mia a ficar melhor para quem vem depois.</p>
        )}
        {!loading && email && !saved && (
          <>
            <div className="account-identity">{email}</div>
            <fieldset className="survey-scores" disabled={busy}>
              <legend>De 0 a 10, quanto você indicaria o Casa Mia para quem vai montar a casa?</legend>
              <div className="survey-score-row">
                {SCORES.map((value) => (
                  <Button key={value} variant="brand" size="brand" type="button" className="survey-score"
                    aria-pressed={score === value} onClick={() => setScore(value)}>
                    {value}
                  </Button>
                ))}
              </div>
              <div className="survey-score-legend" aria-hidden="true">
                <span>Nada provável</span>
                <span>Muito provável</span>
              </div>
            </fieldset>
            <label className="survey-comment">
              <span>Quer contar mais? (opcional)</span>
              <textarea rows={4} maxLength={1000} value={comment} disabled={busy}
                onChange={(event) => setComment(event.target.value)} />
            </label>
            <Button variant="brand" size="brand" className="button button-dark" disabled={busy || score === null} onClick={() => void submit()}>
              {busy ? "Enviando…" : "Enviar resposta"}
            </Button>
          </>
        )}
        {error && <div className="form-error" role="alert">{error}</div>}
      </section>
      <p className="account-access-footer">Seu lar, tomando forma.</p>
    </main>
  );
}
