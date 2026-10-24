import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Heart, Pencil } from "@/src/components/icons";
import { Confetti } from "./controls";

const HOLD_MS = 1400;
const HOLD_REDUCED_MS = 600;
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" });

/**
 * O "pacto" da casa nova: a pessoa segura o botão até o anel encher e o compromisso é assinado com o nome dela,
 * com corações e confete. Segurar (e não só tocar) dá o peso de uma decisão; o teclado também segura (Espaço ou
 * Enter). Soltar antes desfaz devagar.
 */
export function CommitmentPact({
  name,
  shared,
  signed,
  onSigned,
  reduced,
}: {
  name: string;
  shared: boolean;
  signed: boolean;
  onSigned: () => void;
  reduced: boolean;
}) {
  const [progress, setProgress] = useState(signed ? 1 : 0);
  const value = useRef(signed ? 1 : 0);
  const holding = useRef(false);
  const frame = useRef(0);
  const last = useRef(0);
  const done = useRef(signed);
  const total = reduced ? HOLD_REDUCED_MS : HOLD_MS;

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const tick = (now: number) => {
    const delta = last.current ? now - last.current : 16;
    last.current = now;
    if (done.current) return;
    // Segurando, enche; soltando, esvazia três vezes mais rápido.
    const next = Math.min(1, Math.max(0, value.current + (holding.current ? delta / total : (-3 * delta) / total)));
    value.current = next;
    setProgress(next);
    if (next >= 1) {
      done.current = true;
      holding.current = false;
      try { navigator.vibrate?.([30, 40, 60]); } catch { /* Vibração é opcional. */ }
      onSigned();
      return;
    }
    if (holding.current || next > 0) frame.current = requestAnimationFrame(tick);
  };

  const start = () => {
    if (done.current || holding.current) return;
    holding.current = true;
    last.current = 0;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (!holding.current) return;
    holding.current = false;
    last.current = 0;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(tick);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault();
      start();
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === " " || event.key === "Enter") stop();
  };

  const circumference = 2 * Math.PI * 30;
  const today = dateFormatter.format(new Date());

  return (
    <div className="ob-pact" data-signed={signed}>
      <p className="ob-pact-text">
        Eu, <strong>{name}</strong>, prometo montar {shared ? "o nosso lar" : "o meu lar"} com calma, sem
        exageros e sem esquecer o que importa.
      </p>
      <div className="ob-pact-sign" aria-live="polite">
        <AnimatePresence initial={false}>
          {signed ? (
            <motion.div
              key="signed"
              className="ob-pact-signature"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <motion.span
                className="ob-pact-name"
                initial={reduced ? false : { clipPath: "inset(0 100% 0 0)" }}
                animate={{ clipPath: "inset(0 0% 0 0)" }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              >
                {name}
              </motion.span>
              <svg className="ob-pact-swash" viewBox="0 0 220 18" aria-hidden="true">
                <motion.path
                  d="M4 12 C 50 2, 90 18, 130 9 S 200 4, 216 10"
                  initial={reduced ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
                />
              </svg>
              <small>Assinado em {today}</small>
              <Confetti reduced={reduced} />
              {!reduced && (
                <span className="ob-pact-hearts" aria-hidden="true">
                  {Array.from({ length: 6 }, (_, i) => (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0, y: 0, x: (i - 2.5) * 22, scale: 0.6 }}
                      animate={{ opacity: [0, 1, 0], y: -70 - (i % 3) * 18, scale: 1 }}
                      transition={{ duration: 1.4, delay: 0.15 + i * 0.08, ease: "easeOut" }}
                    >
                      <Heart size={14 + (i % 3) * 4} />
                    </motion.span>
                  ))}
                </span>
              )}
              <span className="ob-sr">Compromisso assinado.</span>
            </motion.div>
          ) : (
            <motion.span key="line" className="ob-pact-line" exit={reduced ? undefined : { opacity: 0 }}>
              sua assinatura aqui
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {!signed && (
        <button
          type="button"
          className="ob-pact-hold"
          data-holding={progress > 0}
          aria-describedby="ob-pact-hint"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            start();
          }}
          onPointerUp={stop}
          onPointerCancel={stop}
          onLostPointerCapture={stop}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onBlur={stop}
          onContextMenu={(event) => event.preventDefault()}
        >
          <svg className="ob-pact-ring" viewBox="0 0 68 68" aria-hidden="true">
            <circle cx="34" cy="34" r="30" className="ob-pact-ring-track" />
            <circle
              cx="34"
              cy="34"
              r="30"
              className="ob-pact-ring-fill"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
            />
          </svg>
          <span className="ob-pact-hold-icon">
            <Pencil size={22} aria-hidden="true" />
          </span>
          <span className="ob-pact-hold-label">{progress > 0 ? "Continue segurando…" : "Segure para assinar"}</span>
        </button>
      )}
      {!signed && (
        <p id="ob-pact-hint" className="ob-pact-hint">
          Toque e segure até o círculo completar. No teclado, segure Espaço.
        </p>
      )}
    </div>
  );
}
