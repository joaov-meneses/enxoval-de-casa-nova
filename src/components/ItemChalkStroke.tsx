import { useId } from "react";

const scribble =
  "M12 18 Q155 2 346 15 L18 35 Q170 18 350 38 L14 61 Q180 36 344 62 L18 85 Q170 65 348 88 L12 113 Q165 88 346 116 L24 141 Q180 115 340 143";

/** A temporary, transparent chalk stroke over the card; only the title mark remains. */
export function ItemChalkStroke() {
  const mask = useId();
  return (
    <svg
      className="item-chalk-stroke"
      viewBox="0 0 360 160"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <mask
          id={mask}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="360"
          height="160"
        >
          <path
            className="item-chalk-reveal"
            d={scribble}
            pathLength={1}
            fill="none"
            stroke="white"
            strokeWidth={12}
          />
        </mask>
      </defs>
      <g
        mask={`url(#${mask})`}
        fill="none"
        stroke="#302b27"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d={scribble}
          className="item-chalk-grain"
          strokeWidth={2.2}
          strokeDasharray="4 1 .7 1.4"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={scribble}
          strokeWidth={0.65}
          opacity={0.4}
          transform="translate(0 .8)"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  );
}
