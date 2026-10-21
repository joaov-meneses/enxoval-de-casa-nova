import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

// Static versions of the existing artwork, used only by the landing page.
// Lucide geometry (ISC): see animate-ui/icons/LUCIDE-LICENSE.
function staticIcon(name: string, artwork: ReactNode) {
  return function Icon({ size = 24, className = "", ...props }: IconProps) {
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
        aria-hidden={
          props["aria-label"] || props["aria-labelledby"] ? undefined : true
        }
        className={`lucide lucide-${name} ${className}`.trim()}
        {...props}
      >
        {artwork}
      </svg>
    );
  };
}

export const ArrowRight = staticIcon(
  "arrow-right",
  <>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </>,
);
export const Check = staticIcon("check", <path d="m4 12 5 5L20 6" />);
export const ChevronDown = staticIcon(
  "chevron-down",
  <path d="m6 9 6 6 6-6" />,
);
export const Home = staticIcon(
  "house",
  <>
    <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
  </>,
);
export const Menu = staticIcon(
  "menu",
  <>
    <path d="M4 6h16" />
    <path d="M4 12h16" />
    <path d="M4 18h16" />
  </>,
);
export const X = staticIcon(
  "x",
  <>
    <path d="m6 18 12-12" />
    <path d="m6 6 12 12" />
  </>,
);
export const ShieldCheck = staticIcon(
  "shield-check",
  <>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </>,
);
export const Coffee = staticIcon(
  "coffee",
  <>
    <path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" />
    <path d="M6 2v2" />
    <path d="M10 2v2" />
    <path d="M14 2v2" />
  </>,
);

export const Bath = staticIcon(
  "bath",
  <>
    {" "}
    <path d="M10 4 8 6" />
    <path d="M17 19v2" />
    <path d="M2 12h20" />
    <path d="M7 19v2" />
    <path d="M9 5 7.621 3.621A2.121 2.121 0 0 0 4 5v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />{" "}
  </>,
);

export const BedDouble = staticIcon(
  "bed-double",
  <>
    {" "}
    <path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8" />
    <path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" />
    <path d="M12 4v6" />
    <path d="M2 18h20" />{" "}
  </>,
);

export const Sofa = staticIcon(
  "sofa",
  <>
    {" "}
    <path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3" />
    <path d="M2 16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z" />
    <path d="M4 18v2" />
    <path d="M20 18v2" />
    <path d="M12 4v9" />{" "}
  </>,
);

export const WashingMachine = staticIcon(
  "washing-machine",
  <>
    {" "}
    <path d="M3 6h3" />
    <path d="M17 6h.01" />
    <rect width="18" height="20" x="3" y="2" rx="2" />
    <circle cx="12" cy="13" r="5" />
    <path d="M12 18a2.5 2.5 0 0 0 0-5 2.5 2.5 0 0 1 0-5" />{" "}
  </>,
);
