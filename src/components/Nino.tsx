import { useEffect, useRef, useState } from "react";
import "./nino.css";

/**
 * Nino, o mascote do Casa Mia: uma casinha-chaveiro viva, com a barriguinha em arco
 * (que se ilumina) e uma chave dourada na alça. A arte fica em `public/brand`.
 *
 * Poses: "wave" (acenando, boas-vindas), "think" (com a pranchetinha e a trena, calculando),
 * "happy" (andando feliz e acenando, item riscado da lista) e "celebrate" (braços erguidos com
 * uma plantinha, item conquistado) e "rest" (sentado no arco, ambiente concluído).
 * "keys": com as chaves na mão, convidando a liberar o acesso ao lar.
 */
const POSES = {
  wave: { src: "/brand/nino.webp", fallback: "/brand/nino.png", width: 809, height: 952 },
  think: { src: "/brand/nino-plan.webp", fallback: "/brand/nino-plan.png", width: 749, height: 962 },
  happy: { src: "/brand/nino-happy.webp", fallback: "/brand/nino-happy.png", width: 820, height: 1077 },
  celebrate: { src: "/brand/nino-celebrate.webp", fallback: "/brand/nino-celebrate.png", width: 820, height: 964 },
  rest: { src: "/brand/nino-rest.webp", fallback: "/brand/nino-rest.png", width: 820, height: 965 },
  keys: { src: "/brand/nino-keys.webp", fallback: "/brand/nino-keys.png", width: 1156, height: 1360 },
} as const;

export function Nino({
  pose = "wave",
  size = 240,
  title,
  className = "",
  loading,
  animated = true,
}: {
  pose?: keyof typeof POSES;
  /** Largura em px; a altura acompanha a proporção da pose. */
  size?: number;
  /** Texto alternativo. Sem ele, a ilustração é decorativa e fica oculta para leitores de tela. */
  title?: string;
  className?: string;
  /** "lazy" para poses abaixo da dobra; sem valor, o navegador carrega de imediato. */
  loading?: "lazy" | "eager";
  /** Movimento curto ao aparecer ou trocar de pose. Use false para uma ilustração estática. */
  animated?: boolean;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [visible, setVisible] = useState(false);
  const [loadedPose, setLoadedPose] = useState<string | null>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (!image || !animated) return;
    if (image.complete && image.naturalWidth > 0) setLoadedPose(pose);
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
    });
    observer.observe(image);
    return () => observer.disconnect();
  }, [pose, animated]);

  const art = POSES[pose];
  // Versões de 260 e 500 px (public/brand/*-260w.webp e *-500w.webp): o navegador escolhe pela
  // largura exibida e pela densidade da tela, sem baixar a arte inteira para um Nino pequeno.
  const base = art.src.replace(/\.webp$/, "");
  const srcSet = `${base}-260w.webp 260w, ${base}-500w.webp 500w, ${art.src} ${art.width}w`;
  return (
    <picture>
      <source srcSet={srcSet} sizes={`${size}px`} type="image/webp" />
      <img
        key={pose}
        ref={imageRef}
        className={`nino ${className}`.trim()}
        data-pose={pose}
        data-animated={animated && visible && loadedPose === pose}
        src={art.fallback}
        onLoad={() => setLoadedPose(pose)}
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
