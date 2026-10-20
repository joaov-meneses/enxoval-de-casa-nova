import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Button } from "@/src/components/ui/button";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Gift, House, LoaderCircle, ShoppingBag } from "@/src/components/icons";
import { Dialog } from "./Dialog";
import { ITEM_STATUS_META, type ItemStatus } from "../itemStatus";
import "./itemCompletion.css";

const choices = [
  {
    value: "bought",
    label: ITEM_STATUS_META.bought.label,
    hint: "Uma nova compra para a casa. O valor entra em Já investimos.",
    Icon: ShoppingBag,
  },
  {
    value: "received",
    label: ITEM_STATUS_META.received.label,
    hint: "Um presente que você recebeu, sem custo de compra.",
    Icon: Gift,
  },
  {
    value: "owned",
    label: ITEM_STATUS_META.owned.label,
    hint: "Você já tinha este item e vai usá-lo na casa.",
    Icon: House,
  },
] as const;

export function ItemCompletionDialog({
  itemName,
  onClose,
  onConfirm,
}: {
  itemName: string;
  onClose: () => void;
  onConfirm: (status: ItemStatus) => Promise<void>;
}) {
  const [selected, setSelected] = useState<ItemStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm(selected);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível atualizar o item. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return createPortal(
    <Dialog
      title="Como você conseguiu?"
      isOpen
      onClose={onClose}
      busy={busy}
      className="item-completion-dialog"
    >
      <div className="item-completion-body">
        <p
          className="item-completion-intro"
          tabIndex={-1}
          data-dialog-autofocus
        >
          <strong>{itemName}</strong>
          <span>
            Escolha uma opção para atualizar o progresso e os valores da sua
            casa.
          </span>
        </p>
        <RadioGroup
          className="item-completion-options"
          value={selected ?? ""}
          disabled={busy}
          onValueChange={(value) => {
            setSelected(value as ItemStatus);
            setError("");
          }}
          aria-label="Como você conseguiu este item?"
        >
          {choices.map(({ value, label, hint, Icon }) => (
            <RadioGroupItem key={value} value={value} asChild>
              <Button
                variant="brand"
                size="brand"
                type="button"
                className={`item-completion-option${selected === value ? " is-selected" : ""}`}
              >
                <span className="item-completion-radio" aria-hidden="true" />
                <Icon size={22} aria-hidden="true" />
                <span>
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </span>
              </Button>
            </RadioGroupItem>
          ))}
        </RadioGroup>
        {error && (
          <p className="item-completion-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="item-completion-footer">
        <Button
          variant="brand"
          size="brand"
          type="button"
          className="button button-outline"
          disabled={busy}
          onClick={onClose}
        >
          Cancelar
        </Button>
        <Button
          variant="brand"
          size="brand"
          type="button"
          className="button button-dark"
          disabled={!selected || busy}
          onClick={() => void confirm()}
        >
          {busy && (
            <LoaderCircle
              size={17}
              className="animate-spin"
              aria-hidden="true"
            />
          )}
          {busy ? "Salvando…" : "Confirmar situação"}
        </Button>
      </div>
    </Dialog>,
    document.body,
  );
}
