export function Brand({
  light = false,
  compact = false,
  stacked = false,
  className = "",
}: {
  light?: boolean;
  compact?: boolean;
  stacked?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`brand ${light ? "brand-light" : ""} ${stacked ? "brand-stacked" : ""} ${className}`.trim()}
      role="img"
      aria-label="Casa Mia — sua casa, item por item"
    >
      <picture className="brand-picture">
        <source srcSet="/brand/casamia-symbol.svg" type="image/svg+xml" />
        <img
          src="/brand/casamia-symbol.png"
          alt=""
          aria-hidden="true"
          className="brand-symbol"
          width="512"
          height="512"
        />
      </picture>
      {!compact && <span className="brand-word">Casa Mia</span>}
    </span>
  );
}
