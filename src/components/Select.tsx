import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  /** Título do grupo. Opções do mesmo grupo devem vir seguidas; o título aparece antes da primeira. */
  group?: string;
}
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
  const controlId = id ?? generatedId;
  const listId = `${controlId}-options`;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [above, setAbove] = useState(false);
  const [maxHeight, setMaxHeight] = useState(240);
  const search = useRef({ text: "", at: 0 });
  const selected = options.findIndex((option) => option.value === value);
  function positionPopup() {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    let top = 16,
      bottom = (window.visualViewport?.height ?? window.innerHeight) - 16;
    // Keep options within scrollable dialogs and above the mobile navigation.
    for (
      let parent = root.current?.parentElement;
      parent && parent !== document.body;
      parent = parent.parentElement
    ) {
      if (
        /(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)
      ) {
        const bounds = parent.getBoundingClientRect();
        top = Math.max(top, bounds.top + 8);
        bottom = Math.min(bottom, bounds.bottom - 8);
      }
    }
    if (root.current?.closest(".workspace-main")) {
      const nav = document
        .querySelector(".mobile-bottom-nav")
        ?.getBoundingClientRect();
      if (nav?.height) bottom = Math.min(bottom, nav.top - 8);
    }
    const below = bottom - rect.bottom;
    const spaceAbove = rect.top - top;
    const upward =
      below < Math.min(options.length * 44 + 12, 240) && spaceAbove > below;
    setAbove(upward);
    setMaxHeight(
      Math.max(44, Math.min(240, (upward ? spaceAbove : below) - 6)),
    );
  }
  function show() {
    if (disabled || !options.length) return;
    positionPopup();
    setActive(Math.max(0, selected));
    setOpen(true);
  }
  function choose(index: number) {
    if (!options[index]) return;
    onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus();
  }
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function reposition(event: Event) {
      if (
        event.type === "scroll" &&
        root.current?.contains(event.target as Node)
      )
        return;
      positionPopup();
    }
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const option = root.current?.querySelector<HTMLElement>(
      `[data-index="${active}"]`,
    );
    const popup = option?.parentElement;
    if (option && popup) {
      if (option.offsetTop < popup.scrollTop)
        popup.scrollTop = option.offsetTop;
      else if (
        option.offsetTop + option.offsetHeight >
        popup.scrollTop + popup.clientHeight
      )
        popup.scrollTop =
          option.offsetTop + option.offsetHeight - popup.clientHeight;
    }
  }, [active, open]);
  function keydown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (!open) {
        show();
        return;
      }
      setActive((index) =>
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? options.length - 1
            : (index + (event.key === "ArrowUp" ? -1 : 1) + options.length) %
              options.length,
      );
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      open ? choose(active) : show();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      const now = Date.now();
      search.current = {
        text:
          (now - search.current.at < 700 ? search.current.text : "") +
          event.key.toLocaleLowerCase("pt-BR"),
        at: now,
      };
      const index = options.findIndex((option) =>
        option.label.toLocaleLowerCase("pt-BR").startsWith(search.current.text),
      );
      if (index >= 0) {
        if (!open) show();
        setActive(index);
      }
    }
  }
  return (
    <div
      className={`casamia-select ${open ? "is-open" : ""} ${className}`}
      ref={root}
    >
      <button
        id={controlId}
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={disabled || !options.length}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={keydown}
        className="casamia-select-trigger"
        data-dialog-autofocus={autoFocus || undefined}
      >
        <span>{options[selected]?.label ?? "Selecione"}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={
            ariaLabel ?? trigger.current?.labels?.[0]?.textContent ?? "Opções"
          }
          className={`casamia-select-popup ${above ? "above" : ""}`}
          style={{ maxHeight }}
        >
          {options.map((option, index) => (
            <Fragment key={option.value}>
              {option.group && option.group !== options[index - 1]?.group && (
                <div role="presentation" className="casamia-select-group">
                  {option.group}
                </div>
              )}
              <div
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={option.value === value}
                className={`casamia-select-option ${active === index ? "highlighted" : ""}`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onMouseMove={() => setActive(index)}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  choose(index);
                }}
              >
                <span>{option.label}</span>
                {option.value === value && (
                  <Check size={16} aria-hidden="true" />
                )}
              </div>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
