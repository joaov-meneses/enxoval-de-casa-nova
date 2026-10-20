import { useEffect, useId, useRef } from "react";
import {
  Select as SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "./ui/select";

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
}
// Radix reserves an empty value for clearing. A generated token keeps existing optional choices selectable.
export function Select({
  value,
  options,
  onChange,
  id,
  disabled = false,
  ariaLabel,
  className = "",
  autoFocus = false,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const generatedId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreAfterSave = useRef(false);
  useEffect(() => {
    if (disabled || !restoreAfterSave.current) return;
    restoreAfterSave.current = false;
    if (document.activeElement === document.body)
      triggerRef.current?.focus({ preventScroll: true });
  }, [disabled]);
  const emptyValue = `empty-${generatedId}`;
  const groups: { label?: string; options: SelectOption[] }[] = [];
  for (const option of options) {
    const previous = groups.at(-1);
    if (previous && previous.label === option.group)
      previous.options.push(option);
    else groups.push({ label: option.group, options: [option] });
  }
  return (
    <div className={`casamia-select ${className}`}>
      <SelectRoot
        value={value === "" ? emptyValue : value}
        onValueChange={(next) => onChange(next === emptyValue ? "" : next)}
        disabled={disabled || !options.length}
      >
        <SelectTrigger
          ref={triggerRef}
          id={id ?? generatedId}
          aria-label={ariaLabel}
          autoFocus={autoFocus}
          data-dialog-autofocus={autoFocus || undefined}
          className="casamia-select-trigger"
        >
          <SelectValue placeholder="Selecione" />
        </SelectTrigger>
        <SelectContent
          position="popper"
          align="start"
          collisionPadding={12}
          onCloseAutoFocus={(event) => {
            // A save temporarily disables the trigger; restore focus when it becomes available.
            if (triggerRef.current?.disabled) {
              event.preventDefault();
              restoreAfterSave.current = true;
            }
          }}
          className={
            groups.some((group) => group.label)
              ? "casamia-select-grouped"
              : undefined
          }
          aria-label={ariaLabel ?? "Opções"}
        >
          {groups.map((group, index) => (
            <SelectGroup key={index}>
              {group.label && <SelectLabel>{group.label}</SelectLabel>}
              {group.options.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value === "" ? emptyValue : option.value}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </SelectRoot>
    </div>
  );
}
