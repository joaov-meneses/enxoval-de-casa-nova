import { createElement } from "react";
import { motion, type Variants } from "motion/react";
import {
  getVariants,
  IconWrapper,
  useAnimateIconContext,
  type IconProps,
} from "@animate-ui/react/icons";

type IconNode = readonly [string, Readonly<Record<string, string | number>>];
const animations = {
  default: {
    group: {},
    shape: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [1, 0.12, 1],
        opacity: [1, 0.6, 1],
        transition: { duration: 0.65, ease: "easeInOut" },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

/** Local Animate UI extensions for household symbols not yet in its public registry. */
export function createHouseholdIcon(
  nodes: readonly IconNode[],
  viewBox = "0 0 24 24",
) {
  function Artwork({ size, ...props }: IconProps<string>) {
    const { controls } = useAnimateIconContext();
    const variants = getVariants(animations);
    return (
      <motion.svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={variants.group}
        initial="initial"
        animate={controls}
        {...props}
      >
        {nodes.map(([tag, attributes], index) =>
          createElement(motion[tag as "path"], {
            ...attributes,
            key: attributes.key ?? index,
            variants: variants.shape,
            initial: "initial",
            animate: controls,
          }),
        )}
      </motion.svg>
    );
  }
  return function HouseholdIcon(props: IconProps<string>) {
    return <IconWrapper icon={Artwork} {...props} />;
  };
}
