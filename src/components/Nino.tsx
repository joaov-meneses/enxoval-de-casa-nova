import { useId } from "react";

/**
 * Nino, o mascote do Casa Mia: uma casinha-chaveiro viva, com a barriguinha em arco
 * (que se ilumina) e uma chave dourada na alça. Ilustração vetorial provisória, feita
 * com as cores oficiais; pode ser trocada por arte final sem mexer nos usos.
 *
 * Poses: "wave" (acenando, boas-vindas) e "think" (com a pranchetinha, calculando).
 */
export function Nino({
  pose = "wave",
  size = 240,
  title,
  className = "",
}: {
  pose?: "wave" | "think";
  /** Largura em px; a altura acompanha (proporção 6:7). */
  size?: number;
  /** Texto alternativo. Sem ele, a ilustração é decorativa e fica oculta para leitores de tela. */
  title?: string;
  className?: string;
}) {
  const glow = useId();
  const thinking = pose === "think";
  return (
    <svg
      className={`nino ${className}`.trim()}
      viewBox="0 0 240 280"
      width={size}
      height={(size * 280) / 240}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={glow} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff6df" />
          <stop offset="0.6" stopColor="#ffe3ac" />
          <stop offset="1" stopColor="#fcc97a" />
        </linearGradient>
      </defs>

      {/* sombra no chão */}
      <ellipse cx="120" cy="266" rx="66" ry="8" fill="#3b2a20" opacity="0.12" />

      {/* chaminé e telhado */}
      <rect x="158" y="64" width="20" height="38" rx="5" fill="#8a3f26" />
      <path
        d="M36 134 L120 54 L204 134 Z"
        fill="#a34c30"
        stroke="#a34c30"
        strokeWidth="14"
        strokeLinejoin="round"
      />
      <path
        d="M52 124 L120 62"
        stroke="#d8795a"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.55"
      />

      {/* alça com a chave dourada */}
      <circle cx="120" cy="40" r="10" fill="none" stroke="#e0a93b" strokeWidth="5" />
      <circle cx="154" cy="42" r="7" fill="none" stroke="#e0a93b" strokeWidth="4" />
      <rect x="161" y="40" width="22" height="4" rx="2" fill="#e0a93b" />
      <rect x="174" y="44" width="3.5" height="6" rx="1" fill="#e0a93b" />
      <rect x="180" y="44" width="3.5" height="4.5" rx="1" fill="#e0a93b" />
      <path d="M130 41 L147 42" stroke="#e0a93b" strokeWidth="3" strokeLinecap="round" />

      {/* corpo de cerâmica terracota */}
      <rect x="52" y="120" width="136" height="132" rx="28" fill="#c2603f" />
      <path
        d="M60 150 Q56 190 62 232"
        stroke="#d8795a"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        opacity="0.45"
      />

      {/* rosto */}
      <ellipse cx="96" cy="146" rx="6.5" ry="8.5" fill="#3b2a20" />
      <ellipse cx="144" cy="146" rx="6.5" ry="8.5" fill="#3b2a20" />
      <circle cx={thinking ? 99 : 98.5} cy={thinking ? 142.5 : 143} r="2.4" fill="#fff" />
      <circle cx={thinking ? 147 : 146.5} cy={thinking ? 142.5 : 143} r="2.4" fill="#fff" />
      <circle cx="80" cy="162" r="7" fill="#f0a98c" opacity="0.55" />
      <circle cx="160" cy="162" r="7" fill="#f0a98c" opacity="0.55" />
      <path
        d={thinking ? "M112 166 Q121 170 130 165" : "M110 164 Q120 174 130 164"}
        stroke="#3b2a20"
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />

      {/* barriguinha: porta em arco iluminada */}
      <path
        d="M88 250 V212 a32 32 0 0 1 64 0 V250 Z"
        fill={`url(#${glow})`}
        stroke="#8a3f26"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        d="M98 250 V214 a22 22 0 0 1 44 0 V250 Z"
        fill="#fffbef"
        opacity="0.55"
      />
      <rect x="82" y="248" width="76" height="9" rx="4" fill="#8a3f26" />
      <circle cx="141" cy="232" r="2.8" fill="#a34c30" />

      {/* braços */}
      {thinking ? (
        <>
          <path
            d="M188 196 q14 14 2 34"
            stroke="#b5532f"
            strokeWidth="13"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M52 196 q-10 8 -12 22"
            stroke="#b5532f"
            strokeWidth="13"
            strokeLinecap="round"
            fill="none"
          />
          {/* pranchetinha */}
          <g transform="rotate(-9 44 208)">
            <rect x="22" y="176" width="40" height="52" rx="6" fill="#fff8ed" stroke="#8a3f26" strokeWidth="3.5" />
            <rect x="34" y="171" width="16" height="9" rx="3" fill="#e0a93b" />
            <path d="M30 192 H54 M30 202 H54 M30 212 H44" stroke="#c2603f" strokeWidth="3" strokeLinecap="round" />
            <path d="M31 192 l3 3 l5 -6" stroke="#5c6643" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </g>
        </>
      ) : (
        <>
          <path
            d="M52 196 q-20 6 -22 26"
            stroke="#b5532f"
            strokeWidth="13"
            strokeLinecap="round"
            fill="none"
          />
          {/* braço levantado, acenando */}
          <path
            d="M188 190 q24 -4 30 -34"
            stroke="#b5532f"
            strokeWidth="13"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M226 132 q6 6 5 15 M233 126 q8 8 7 20"
            stroke="#e0a93b"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />
        </>
      )}

      {/* pés */}
      <ellipse cx="100" cy="258" rx="17" ry="8" fill="#3b2a20" />
      <ellipse cx="140" cy="258" rx="17" ry="8" fill="#3b2a20" />
    </svg>
  );
}
