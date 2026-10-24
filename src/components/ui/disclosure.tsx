import {
  Children,
  isValidElement,
  type ReactNode,
  type ComponentProps,
} from "react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "./collapsible";
import { Button } from "./button";

/** Casa Mia disclosure, composed from the shadcn Collapsible primitives. */
export function Disclosure({
  children,
  open,
  ...props
}: Omit<ComponentProps<typeof Collapsible>, "open"> & { open?: boolean }) {
  const parts = Children.toArray(children);
  const trigger = parts.find(
    (child) => isValidElement(child) && child.type === DisclosureTrigger,
  );
  return (
    <Collapsible defaultOpen={open} {...props}>
      {trigger}
      <CollapsibleContent>
        {parts.filter((child) => child !== trigger)}
      </CollapsibleContent>
    </Collapsible>
  );
}
export function DisclosureTrigger({
  children,
  ...props
}: ComponentProps<"button">) {
  return (
    <CollapsibleTrigger asChild>
      <Button variant="brand" size="brand" type="button" {...props}>
        {children}
      </Button>
    </CollapsibleTrigger>
  );
}
