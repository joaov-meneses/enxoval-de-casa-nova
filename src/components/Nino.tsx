/**
 * Nino, o mascote do Casa Mia: uma casinha-chaveiro viva, com a barriguinha em arco
 * (que se ilumina) e uma chave dourada na alça. A arte fica em `public/brand`.
 *
 * Poses: "wave" (acenando, boas-vindas) e "think" (com a pranchetinha e a trena, calculando).
 */
const POSES = {
  wave: { src: "/brand/nino.webp", fallback: "/brand/nino.png", width: 809, height: 952 },
  think: { src: "/brand/nino-plan.webp", fallback: "/brand/nino-plan.png", width: 749, height: 962 },
} as const;

export function Nino({
  pose = "wave",
  size = 240,
  title,
  className = "",
}: {
  pose?: keyof typeof POSES;
  /** Largura em px; a altura acompanha a proporção da pose. */
  size?: number;
  /** Texto alternativo. Sem ele, a ilustração é decorativa e fica oculta para leitores de tela. */
  title?: string;
  className?: string;
}) {
  const art = POSES[pose];
  return (
    <picture>
      <source srcSet={art.src} type="image/webp" />
      <img
        className={`nino ${className}`.trim()}
        src={art.fallback}
        alt={title ?? ""}
        aria-hidden={title ? undefined : true}
        width={size}
        height={Math.round((size * art.height) / art.width)}
        decoding="async"
        draggable={false}
      />
    </picture>
  );
}
