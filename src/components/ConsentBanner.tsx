import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CONSENT_OPEN_EVENT, consentRequired, readConsent, saveConsent } from "../analytics/consent";
import "../consent.css";

/**
 * Aviso de cookies e análise (LGPD). Aparece até a pessoa decidir e volta pelo link "Preferências de privacidade".
 * Aceitar, recusar e personalizar têm o mesmo peso visual; nada de análise ou marketing roda antes da escolha.
 */
export function ConsentBanner() {
  // O /admin é da equipe e não envia análise de produto (ver analytics.ts), então não pede consentimento.
  const [open, setOpen] = useState(
    () => consentRequired() && !readConsent() && !/^\/admin(?:\/|$)/.test(window.location.pathname),
  );
  const [customizing, setCustomizing] = useState(false);
  const [analytics, setAnalytics] = useState(() => Boolean(readConsent()?.analytics));
  const [marketing, setMarketing] = useState(() => Boolean(readConsent()?.marketing));
  const titleId = useId();
  const bannerRef = useRef<HTMLElement>(null);

  // Reserva no fim da página o espaço que o aviso ocupa, para que todo o conteúdo possa rolar para cima dele.
  useLayoutEffect(() => {
    const banner = bannerRef.current;
    if (!open || !banner) return;
    const root = document.documentElement;
    const measure = () => {
      const space = Math.ceil(Math.max(0, window.innerHeight - banner.getBoundingClientRect().top));
      root.style.setProperty("--consent-banner-space", `${space}px`);
    };
    root.dataset.consentOpen = "";
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(banner);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty("--consent-banner-space");
      delete root.dataset.consentOpen;
    };
  }, [open]);

  useEffect(() => {
    const reopen = () => {
      const current = readConsent();
      setAnalytics(Boolean(current?.analytics));
      setMarketing(Boolean(current?.marketing));
      setCustomizing(true);
      setOpen(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
  }, []);

  if (!open) return null;

  const decide = (choice: { analytics: boolean; marketing: boolean }) => {
    saveConsent(choice);
    setOpen(false);
    setCustomizing(false);
  };

  return (
    <section ref={bannerRef} className={`consent-banner${customizing ? " is-customizing" : ""}`} role="region" aria-labelledby={titleId}>
      <h2 id={titleId} className="consent-title">Sua privacidade</h2>
      <div className="consent-scroll">
      <p className="consent-text">
        Cookies essenciais mantêm você conectado. Com sua permissão, também medimos o uso do app (PostHog e Google
        Analytics) e a origem de visitas de anúncios (Google Ads). Mude quando quiser na{" "}
        <a href="/privacidade">política de privacidade</a>.
      </p>
      {customizing && (
        <fieldset className="consent-options">
          <legend className="sr-only">Escolha o que permitir</legend>
          <label className="consent-option">
            <input type="checkbox" checked disabled />
            <span><strong>Essenciais</strong> Login, segurança e preferências. Sempre ligados.</span>
          </label>
          <label className="consent-option">
            <input type="checkbox" checked={analytics} onChange={(event) => {
              setAnalytics(event.target.checked);
              if (!event.target.checked) setMarketing(false);
            }} />
            <span><strong>Análise de uso</strong> Quais telas e recursos são usados, sem nomes, e-mails nem textos que você digita.</span>
          </label>
          <label className="consent-option">
            <input type="checkbox" checked={marketing} onChange={(event) => {
              setMarketing(event.target.checked);
              if (event.target.checked) setAnalytics(true);
            }} />
            <span><strong>Anúncios</strong> Saber qual anúncio trouxe você, para investir só no que funciona.</span>
          </label>
        </fieldset>
      )}
      </div>
      <div className="consent-actions">
        <button type="button" className="consent-button" onClick={() => decide({ analytics: false, marketing: false })}>
          Recusar
        </button>
        {customizing ? (
          <button type="button" className="consent-button" onClick={() => decide({ analytics, marketing })}>
            Salvar escolhas
          </button>
        ) : (
          <button type="button" className="consent-button" onClick={() => setCustomizing(true)}>
            Personalizar
          </button>
        )}
        <button type="button" className="consent-button" onClick={() => decide({ analytics: true, marketing: true })}>
          Aceitar tudo
        </button>
      </div>
    </section>
  );
}
