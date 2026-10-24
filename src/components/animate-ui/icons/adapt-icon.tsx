import { memo, type ComponentType } from "react";
import {
  useAnimateIconContext,
  type IconProps as AnimateIconProps,
} from "@animate-ui/react/icons";
import { cn } from "@/src/lib/utils";

export type IconProps = Omit<AnimateIconProps<string>, "className"> & {
  className?: string;
  absoluteStrokeWidth?: boolean;
};
export type IconComponent = ComponentType<IconProps>;

/** Shared defaults keep the existing dimensions and stroke weights across official and local icons. */
export function adaptIcon(
  Artwork: ComponentType<any>,
  name: string,
): IconComponent {
  function AnimatedIcon({
    size = 24,
    strokeWidth = 2,
    absoluteStrokeWidth,
    className,
    ...props
  }: IconProps) {
    const context = useAnimateIconContext();
    const standalone = context.active === undefined;
    const spinning = /\banimate-spin\b/.test(className ?? "");
    return (
      <Artwork
        size={size}
        strokeWidth={
          absoluteStrokeWidth ? (Number(strokeWidth) * 24) / size : strokeWidth
        }
        aria-hidden={
          props["aria-label"] || props["aria-labelledby"] ? undefined : true
        }
        data-animate-icon={name}
        className={cn(
          "animate-ui-icon",
          `lucide lucide-${name}`,
          className?.replace(/\banimate-spin\b/g, ""),
        )}
        {...(standalone ? { animateOnHover: true, animateOnTap: true } : {})}
        {...(spinning ? { animate: true, loop: true } : {})}
        {...props}
      />
    );
  }
  AnimatedIcon.displayName = `Animated(${name})`;
  // Memorizado: o ícone (cheio de elementos de animação) não redesenha quando o pai redesenha com as mesmas props.
  return memo(AnimatedIcon) as unknown as IconComponent;
}
