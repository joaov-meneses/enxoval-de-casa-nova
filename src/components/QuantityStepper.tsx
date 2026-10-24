import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Minus, Plus } from "@/src/components/icons";
import { MAX_ITEM_QUANTITY, normalizeQuantity } from "../itemQuantity";

interface QuantityStepperProps {
  id: string;
  /** Texto digitado; pode ficar vazio enquanto a pessoa edita, e volta a 1 ao sair do campo. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  inputClassName?: string;
}

const clamp = (quantity: number) =>
  Math.min(MAX_ITEM_QUANTITY, Math.max(1, quantity));

/** Campo de quantidade com os botões de diminuir e aumentar lado a lado. Nunca chega a zero. */
export function QuantityStepper({
  id,
  value,
  onChange,
  disabled = false,
  inputClassName = "",
}: QuantityStepperProps) {
  const current = Number(value) >= 1 ? normalizeQuantity(Number(value)) : 1;
  return (
    <div className="quantity-stepper">
      <div className="quantity-stepper-buttons">
        <Button variant="brand" size="brand"
          type="button"
          aria-label="Diminuir quantidade"
          title="Diminuir quantidade"
          onClick={() => onChange(String(clamp(current - 1)))}
          disabled={disabled || current <= 1}
        >
          <Minus size={18} aria-hidden="true" />
        </Button>
        <Button variant="brand" size="brand"
          type="button"
          aria-label="Aumentar quantidade"
          title="Aumentar quantidade"
          onClick={() => onChange(String(clamp(current + 1)))}
          disabled={disabled || current >= MAX_ITEM_QUANTITY}
        >
          <Plus size={18} aria-hidden="true" />
        </Button>
      </div>
      <Input
        id={id}
        aria-label="Quantidade"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        className={inputClassName}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "").slice(0, 3);
          // Zero não existe: um "0" digitado vira 1 na hora.
          onChange(digits && Number(digits) < 1 ? "1" : digits);
        }}
        onBlur={() => {
          if (!value || Number(value) < 1) onChange("1");
        }}
        disabled={disabled}
      />
    </div>
  );
}
