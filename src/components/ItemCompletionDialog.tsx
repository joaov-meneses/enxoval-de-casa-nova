import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { useId, useState } from "react";
import { createPortal } from "react-dom";
import { Gift, House, LoaderCircle, ShoppingBag } from "@/src/components/icons";
import { Dialog } from "./Dialog";
import { Select } from "./Select";
import { Textarea } from "@/src/components/ui/textarea";
import { ITEM_STATUS_META, type ItemStatus } from "../itemStatus";
import { MAX_INSTALLMENTS, PAYMENT_METHOD_LABEL } from "../planning/installments";
import type { ItemExtrasInput, PaymentMethod } from "../types";
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

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatPriceText(cents: number | null | undefined) {
  return cents && cents > 0 ? money.format(cents / 100) : "";
}

const INSTALLMENT_OPTIONS = Array.from({ length: MAX_INSTALLMENTS }, (_, index) => ({
  value: String(index + 1),
  label: index === 0 ? "À vista" : `${index + 1}x`,
}));
const PAYMENT_OPTIONS = [
  { value: "", label: "Não informar" },
  ...(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((value) => ({ value, label: PAYMENT_METHOD_LABEL[value] })),
];

/**
 * Ao riscar um item como "Comprei", pergunta quanto foi pago: sem esse valor, "Já investimos" fica em
 * R$ 0,00 mesmo com a lista andando. O campo vem preenchido com o preço do item (ou o último lido na
 * loja) e é opcional: vazio, o item mantém o preço que já tinha.
 */
export function ItemCompletionDialog({
  itemName,
  suggestedPriceCents = null,
  initialInstallments = 1,
  knownGiftNames = [],
  compact = false,
  onClose,
  onConfirm,
}: {
  itemName: string;
  /** Preço para preencher o campo de "quanto pagou". */
  suggestedPriceCents?: number | null;
  /** Parcelas que a pessoa pretendia (vem preenchido em "Comprei"). */
  initialInstallments?: number;
  /** Nomes de quem já deu presente no enxoval, sugeridos em "Recebido". */
  knownGiftNames?: string[];
  /** Modo loja: só "Comprei", valor e parcelas, para riscar rápido. */
  compact?: boolean;
  onClose: () => void;
  /**
   * `paidCents` só vem em "Comprei", quando a pessoa informou um valor. `details` leva as parcelas e o meio de
   * pagamento (Comprei) ou de quem veio o presente (Recebido).
   */
  onConfirm: (status: ItemStatus, paidCents: number | null, details: ItemExtrasInput) => Promise<void>;
}) {
  const [selected, setSelected] = useState<ItemStatus | null>(compact ? "bought" : null);
  const [paidText, setPaidText] = useState(() => formatPriceText(suggestedPriceCents));
  const [installments, setInstallments] = useState(String(initialInstallments || 1));
  const [paymentMethod, setPaymentMethod] = useState("");
  const [giftFrom, setGiftFrom] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const paidId = useId();
  const fieldId = useId();
  async function confirm() {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    const paidDigits = paidText.replace(/\D/g, "");
    const paidCents =
      selected === "bought" && paidDigits ? Number(paidDigits) || null : null;
    const details: ItemExtrasInput = {};
    if (selected === "bought") {
      if (Number(installments) !== (initialInstallments || 1)) details.installments = Number(installments) || 1;
      if (paymentMethod) details.paymentMethod = paymentMethod as PaymentMethod;
    }
    if (selected === "received") {
      if (giftFrom.trim()) details.giftFrom = giftFrom.trim();
      if (giftMessage.trim()) details.giftMessage = giftMessage.trim();
    }
    try {
      await onConfirm(selected, paidCents, details);
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
      title={compact ? "Comprei" : "Como você conseguiu?"}
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
        {!compact && <RadioGroup
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
        </RadioGroup>}
        {selected === "bought" && (
          <Label htmlFor={paidId} className="item-completion-paid">
            <span>
              Quanto você pagou?
              <small>Valor total, já com frete. Pode deixar em branco e preencher depois.</small>
            </span>
            <Input
              id={paidId}
              inputMode="numeric"
              value={paidText}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, "").slice(0, 12);
                setPaidText(digits ? money.format(Number(digits) / 100) : "");
              }}
              placeholder="R$ 0,00"
              disabled={busy}
            />
          </Label>
        )}
        {selected === "bought" && (
          <div className="item-completion-row">
            <Label htmlFor={`${fieldId}-installments`} className="item-completion-paid">
              <span>Parcelas</span>
              <Select
                id={`${fieldId}-installments`}
                ariaLabel="Parcelas"
                value={installments}
                options={INSTALLMENT_OPTIONS}
                onChange={setInstallments}
                disabled={busy}
              />
            </Label>
            <Label htmlFor={`${fieldId}-payment`} className="item-completion-paid">
              <span>Meio de pagamento</span>
              <Select
                id={`${fieldId}-payment`}
                ariaLabel="Meio de pagamento"
                value={paymentMethod}
                options={PAYMENT_OPTIONS}
                onChange={setPaymentMethod}
                disabled={busy}
              />
            </Label>
          </div>
        )}
        {selected === "received" && (
          <>
            <Label htmlFor={`${fieldId}-gift`} className="item-completion-paid">
              <span>
                De quem foi o presente?
                <small>Opcional. Ajuda a lembrar de agradecer.</small>
              </span>
              <Input
                id={`${fieldId}-gift`}
                value={giftFrom}
                maxLength={120}
                list={`${fieldId}-gift-names`}
                placeholder="Ex.: Tia Rosa"
                onChange={(event) => setGiftFrom(event.target.value)}
                disabled={busy}
              />
              <datalist id={`${fieldId}-gift-names`}>
                {knownGiftNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </Label>
            <Label htmlFor={`${fieldId}-message`} className="item-completion-paid">
              <span>Recado que veio com o presente</span>
              <Textarea
                id={`${fieldId}-message`}
                value={giftMessage}
                maxLength={500}
                rows={2}
                onChange={(event) => setGiftMessage(event.target.value)}
                disabled={busy}
              />
            </Label>
          </>
        )}
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
