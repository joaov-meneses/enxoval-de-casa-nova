import { createElement, memo, type SVGProps } from "react";
import { householdIconNodes } from "./animate-ui/icons/custom-nodes";

// Mesma geometria dos ícones existentes; sem controles Motion por linha da lista.
const shapes = {
  check: [["path", { d: "m4 12 5 5L20 6" }]],
  "trash-2": [
    ["path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }],
    ["path", { d: "M10 11v6M14 11v6" }],
  ],
  "calendar-clock": [
    ["path", { d: "M21 7.338V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h2.338M16 2v3M8 2v3M3 9h5.859" }],
    ["circle", { cx: 16, cy: 16, r: 6 }],
    ["path", { d: "M16 14v2.2l1.6 1" }],
  ],
  "clock-3": [["circle", { cx: 12, cy: 12, r: 10 }], ["path", { d: "M12 6v6h4.5" }]],
  "align-left": householdIconNodes.AlignLeft,
  "grip-vertical": householdIconNodes.GripVertical,
} as const;

export const StaticListIcon = memo(function StaticListIcon({
  name,
  size = 24,
  className,
  ...props
}: SVGProps<SVGSVGElement> & { name: keyof typeof shapes; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={props["aria-label"] || props["aria-labelledby"] ? undefined : true}
      className={`lucide lucide-${name}${className ? ` ${className}` : ""}`}
      data-static-icon={name}
      {...props}
    >
      {shapes[name].map(([tag, attributes], index) => createElement(tag, { ...attributes, key: index }))}
    </svg>
  );
});
