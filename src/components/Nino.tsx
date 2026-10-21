/**
 * Nino, o mascote do Casa Mia: uma casinha-chaveiro viva, com a barriguinha em arco
 * (que se ilumina) e uma chave dourada na alça. A arte fica em `public/brand`.
 *
 * Poses: "wave" (acenando, boas-vindas), "think" (com a pranchetinha e a trena, calculando),
 * "happy" (andando feliz e acenando, item riscado da lista) e "celebrate" (braços erguidos com
 * uma plantinha, cômodo ou casa concluídos).
 */
const POSES = {
  wave: { src: "/brand/nino.webp", fallback: "/brand/nino.png", width: 809, height: 952 },
  think: { src: "/brand/nino-plan.webp", fallback: "/brand/nino-plan.png", width: 749, height: 962 },
  happy: { src: "/brand/nino-happy.webp", fallback: "/brand/nino-happy.png", width: 820, height: 1077 },
  celebrate: { src: "/brand/nino-celebrate.webp", fallback: "/brand/nino-celebrate.png", width: 820, height: 964 },
} as const;

export function Nino({
  pose = "wave",
  size = 240,
  title,
  className = "",
  loading,
}: {
  pose?: keyof typeof POSES;
  /** Largura em px; a altura acompanha a proporção da pose. */
  size?: number;
  /** Texto alternativo. Sem ele, a ilustração é decorativa e fica oculta para leitores de tela. */
  title?: string;
  className?: string;
  /** "lazy" para poses abaixo da dobra; sem valor, o navegador carrega de imediato. */
  loading?: "lazy" | "eager";
}) {
  const art = POSES[pose];
  // Versões de 260 e 500 px (public/brand/*-260w.webp e *-500w.webp): o navegador escolhe pela
  // largura exibida e pela densidade da tela, sem baixar a arte inteira para um Nino pequeno.
  const base = art.src.replace(/\.webp$/, "");
  const srcSet = `${base}-260w.webp 260w, ${base}-500w.webp 500w, ${art.src} ${art.width}w`;
  return (
    <picture>
      <source srcSet={srcSet} sizes={`${size}px`} type="image/webp" />
      <img
        className={`nino ${className}`.trim()}
        src={art.fallback}
        alt={title ?? ""}
        aria-hidden={title ? undefined : true}
        width={size}
        height={Math.round((size * art.height) / art.width)}
        loading={loading}
        decoding="async"
        draggable={false}
      />
    </picture>
  );
}
