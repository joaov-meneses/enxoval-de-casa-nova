import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Check,
  ExternalLink,
  AlignLeft,
  Trash2,
  Clock3,
  ChevronDown,
  LoaderCircle,
  Flame,
  TrendingDown,
  TrendingUp,
  PackageX,
  CalendarClock,
} from "lucide-react";
import type {
  EnxovalCategory,
  EnxovalItem,
  ItemStatus,
  ItemTrackingInput,
} from "../types";
import { priceChange } from "../priceTracking";
import { PriceHistoryDialog } from "./PriceHistoryDialog";
import {
  discountApplies,
  isInactiveStatus,
  ITEM_STATUSES,
  ITEM_STATUS_META,
  netPriceCents,
  statusLabel,
} from "../itemStatus";
import { MAX_ITEM_NAME_LENGTH } from "../data";
import { MAX_ITEM_QUANTITY, normalizeQuantity } from "../itemQuantity";
import { QuantityStepper } from "./QuantityStepper";
import { Select } from "./Select";
import { weekOptions } from "../planning/weekOptions";
import { weekLabel } from "../planning/purchasePlan";

/** Semana de compra do item no planejamento (sugerida pelo algoritmo ou escolhida pela pessoa). */
export interface ItemBuyPlan {
  week: number;
  manual: boolean;
  reason: string;
  moveDate: string | null;
  overdue: boolean;
}

interface ItemRowProps {
  item: EnxovalItem;
  categories: EnxovalCategory[];
  categoryName?: string;
  showUpdatedAt?: boolean;
  updatedAtLabel?: string;
  dragHandle?: ReactNode;
  buyPlan?: ItemBuyPlan;
  onUpdate: (
    id: string,
    updates: Partial<EnxovalItem> & ItemTrackingInput,
  ) => Promise<void> | void;
  onDelete: (item: EnxovalItem) => void;
}
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
function safeLink(value: string) {
  if (!value.trim()) return "";
  try {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    );
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}
export function ItemRow({
  item,
  categories,
  categoryName,
  showUpdatedAt,
  updatedAtLabel,
  dragHandle,
  buyPlan,
  onUpdate,
  onDelete,
}: ItemRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(item.name);
  const [priceText, setPriceText] = useState("");
  const [discountText, setDiscountText] = useState("");
  const [quantityText, setQuantityText] = useState("1");
  const [linkText, setLinkText] = useState(item.link);
  const [description, setDescription] = useState(item.description);
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [status, setStatus] = useState<ItemStatus>(item.status);
  const [weekValue, setWeekValue] = useState("auto");
  const [targetText, setTargetText] = useState("");
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (expanded) return;
    setName(item.name);
    setPriceText(item.priceCents ? money.format(item.priceCents / 100) : "");
    setQuantityText(String(normalizeQuantity(item.quantity)));
    setDiscountText(
      item.discountCents > 0 ? money.format(item.discountCents / 100) : "",
    );
    setLinkText(item.link);
    setDescription(item.description);
    setCategoryId(item.categoryId);
    setStatus(item.status);
    setWeekValue(item.buyWeek === null ? "auto" : String(item.buyWeek));
    setTargetText(
      item.priceTracking?.targetPriceCents
        ? money.format(item.priceTracking.targetPriceCents / 100)
        : "",
    );
    setAlertEnabled(item.priceTracking?.priceAlertEnabled ?? true);
    setError("");
  }, [item, expanded]);
  useEffect(() => setThumbFailed(false), [item.imageUrl]);
  // O preço da linha já considera o desconto/cashback registrado (itens ganhos mantêm o valor cheio).
  const price = netPriceCents(item);
  const itemDiscount = discountApplies(item.status) ? item.discountCents : 0;
  const quantity = normalizeQuantity(item.quantity);
  // Rascunho do formulário: mostra o valor final antes de salvar.
  const draftPrice = Number(priceText.replace(/\D/g, "")) || 0;
  const draftDiscount = discountApplies(status)
    ? Math.min(Number(discountText.replace(/\D/g, "")) || 0, draftPrice)
    : 0;
  const draftFinal = draftPrice - draftDiscount;
  const formattedPrice =
    Number.isFinite(price) && price > 0 ? money.format(price / 100) : "";
  const link = safeLink(item.link);
  const tracking = item.priceTracking ?? null;
  const change = priceChange(tracking);
  const thumbnail = item.imageUrl && !thumbFailed ? item.imageUrl : "";
  const added =
    item.createdAt && Number.isFinite(Date.parse(item.createdAt))
      ? new Date(item.createdAt).toLocaleDateString("pt-BR")
      : null;
  function toggle() {
    if (!busy) setExpanded((value) => !value);
  }
  function close() {
    setExpanded(false);
    toggleRef.current?.focus();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const digits = priceText.replace(/\D/g, "");
    const priceValue = digits && Number(digits) > 0 ? Number(digits) : null;
    const discountDigits = discountText.replace(/\D/g, "");
    const discountValue = discountApplies(status) ? Number(discountDigits) || 0 : 0;
    const quantityValue = Number(quantityText.replace(/\D/g, ""));
    if (!Number.isInteger(quantityValue) || quantityValue < 1 || quantityValue > MAX_ITEM_QUANTITY) {
      setError(`A quantidade deve ser um número de 1 a ${MAX_ITEM_QUANTITY}.`);
      setBusy(false);
      return;
    }
    if (discountValue > 0 && !priceValue) {
      setError("Informe o preço do item antes do desconto ou cashback.");
      setBusy(false);
      return;
    }
    if (priceValue !== null && discountValue > priceValue) {
      setError("O desconto ou cashback não pode ser maior que o preço do item.");
      setBusy(false);
      return;
    }
    let saved = false;
    try {
      await onUpdate(item.id, {
        name: name.trim(),
        priceCents: priceValue,
        quantity: quantityValue,
        discountCents: discountValue,
        link: linkText.trim(),
        description: description.trim(),
        categoryId,
        status,
        // A semana só vai no pedido quando a pessoa mexeu nela.
        ...(weekValue !== (item.buyWeek === null ? "auto" : String(item.buyWeek))
          ? { buyWeek: weekValue === "auto" ? null : Number(weekValue) }
          : {}),
        ...(tracking
          ? {
              targetPriceCents: Number(targetText.replace(/\D/g, "")) || null,
              priceAlertEnabled: alertEnabled,
            }
          : {}),
      });
      setExpanded(false);
      saved = true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar. Tente novamente.",
      );
    } finally {
      setBusy(false);
      if (saved) requestAnimationFrame(() => toggleRef.current?.focus());
    }
  }
  return (
    <div
      className={`item-row ${item.checked ? "checked" : ""} ${isInactiveStatus(item.status) ? "inactive" : ""} ${expanded ? "expanded" : ""}`}
    >
      <div className="item-row-inner">
        {dragHandle}
        <button
          type="button"
          role="checkbox"
          aria-checked={item.checked}
          aria-label={`${item.checked ? "Desmarcar" : "Marcar como comprado"}: ${item.name}`}
          className="item-check"
          disabled={busy}
          onClick={() =>
            void Promise.resolve(
              onUpdate(item.id, { checked: !item.checked }),
            ).catch(() => undefined)
          }
        >
          <Check size={13} strokeWidth={2.5} />
        </button>
        {thumbnail && (
          <img
            className="item-thumb"
            src={thumbnail}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setThumbFailed(true)}
          />
        )}
        <div className="item-content">
          <button
            type="button"
            className="item-title-button"
            aria-expanded={expanded}
            aria-controls={`${id}-details`}
            onClick={toggle}
            disabled={busy}
            title={item.name}
          >
            <span className="item-name">{item.name}</span>
          </button>
          <div className="item-meta">
            {categoryName && (
              <span className="item-category-tag">{categoryName}</span>
            )}
            <span className={`item-status-tag status-${item.status}`}>
              {statusLabel(item.status)}
            </span>
            <span className="item-meta-price">
              {formattedPrice || "Sem preço"}
            </span>
            {quantity > 1 && (
              <span className="item-quantity-tag">{quantity} un.</span>
            )}
            {buyPlan && !item.checked && !isInactiveStatus(item.status) && (
              <span
                className={`item-week-tag${buyPlan.overdue ? " is-late" : ""}${buyPlan.manual ? " is-manual" : ""}`}
                title={buyPlan.reason}
              >
                <CalendarClock size={11} aria-hidden="true" />
                {buyPlan.overdue ? "Atrasado · " : "Comprar: "}
                {weekLabel(buyPlan.week).toLowerCase()}
              </span>
            )}
            {itemDiscount > 0 && (
              <span className="item-discount-tag">
                Desconto/cashback {money.format(itemDiscount / 100)}
              </span>
            )}
            {item.selectedVariation && (
              <span className="item-quantity-tag">{item.selectedVariation}</span>
            )}
            {tracking && change && change.direction !== "same" && (
              <button
                type="button"
                className={`price-badge ${change.direction === "down" ? "is-down" : "is-up"}`}
                onClick={() => setHistoryOpen(true)}
                aria-label={`${change.direction === "down" ? "Preço caiu" : "Preço subiu"} ${money.format(Math.abs(change.deltaCents) / 100)} (${change.percent}%) desde o cadastro. Abrir histórico de preços.`}
                title="Ver histórico de preços"
              >
                {change.direction === "down" ? (
                  <TrendingDown size={12} aria-hidden="true" />
                ) : (
                  <TrendingUp size={12} aria-hidden="true" />
                )}
                {change.direction === "down" ? "−" : "+"}
                {money.format(Math.abs(change.deltaCents) / 100)} ({change.percent}%)
              </button>
            )}
            {tracking?.isLowestIn60d && (
              <button
                type="button"
                className="price-badge is-lowest"
                onClick={() => setHistoryOpen(true)}
                title="Ver histórico de preços"
              >
                <Flame size={12} aria-hidden="true" /> Menor preço em 60 dias
              </button>
            )}
            {tracking && !change && tracking.currentPriceCents !== null && (
              <button
                type="button"
                className="price-badge"
                onClick={() => setHistoryOpen(true)}
                title="Ver histórico de preços"
              >
                Acompanhando o preço
              </button>
            )}
            {tracking && !tracking.inStock && (
              <span className="price-badge is-out">
                <PackageX size={12} aria-hidden="true" /> Indisponível
              </span>
            )}
            {added && (
              <span className="item-added">
                <span className="item-added-prefix">Adicionado em </span>
                {added}
              </span>
            )}
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <ExternalLink size={10} /> Ver na loja
              </a>
            )}
            {item.description && (
              <span title={item.description}>
                <AlignLeft size={11} />
              </span>
            )}
            {showUpdatedAt && updatedAtLabel && (
              <span className="inline-flex items-center gap-1">
                <Clock3 size={10} /> {updatedAtLabel}
              </span>
            )}
          </div>
        </div>
        <span className="item-price">{formattedPrice || "Sem preço"}</span>
        <span className={`item-status status-${item.status}`}>
          {statusLabel(item.status)}
        </span>
        <div className="item-actions">
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="item-delete"
            aria-label={`Remover ${item.name}`}
            title="Remover item"
            disabled={busy}
          >
            <Trash2 size={15} />
          </button>
          <button
            ref={toggleRef}
            type="button"
            onClick={toggle}
            aria-label={`${expanded ? "Fechar" : "Abrir"} detalhes de ${item.name}`}
            aria-expanded={expanded}
            aria-controls={`${id}-details`}
            className="item-expand"
            disabled={busy}
          >
            <ChevronDown size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div
        id={`${id}-details`}
        hidden={!expanded}
        className="item-inline-panel"
      >
        {expanded && (
          <form
            onSubmit={save}
            className="item-inline-form"
            aria-label={`Editar ${item.name} na lista`}
            aria-busy={busy}
          >
            <div className="item-inline-grid">
              <h4 className="item-inline-section item-inline-wide">Sobre o item</h4>
              <label htmlFor={`${id}-name`} className="item-inline-wide item-field-name">
                <span className="item-inline-label-row">
                  Nome do item
                  <span
                    className={`name-counter${name.length >= MAX_ITEM_NAME_LENGTH ? " is-full" : ""}`}
                    aria-hidden="true"
                  >
                    {name.length}/{MAX_ITEM_NAME_LENGTH}
                  </span>
                </span>
                <input
                  id={`${id}-name`}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={MAX_ITEM_NAME_LENGTH}
                  disabled={busy}
                />
              </label>
              <label htmlFor={`${id}-environment`} className="item-field-env">
                Ambiente
                <Select
                  id={`${id}-environment`}
                  ariaLabel="Ambiente"
                  value={categoryId}
                  options={categories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  }))}
                  onChange={setCategoryId}
                  disabled={busy}
                />
              </label>
              <label htmlFor={`${id}-status`} className="item-field-status" title={ITEM_STATUS_META[status].hint}>
                Situação
                <Select
                  id={`${id}-status`}
                  ariaLabel="Situação"
                  value={status}
                  options={ITEM_STATUSES.map((value) => ({
                    value,
                    label: ITEM_STATUS_META[value].label,
                  }))}
                  onChange={(value) => {
                    setStatus(value as ItemStatus);
                    if (!discountApplies(value as ItemStatus)) setDiscountText("");
                  }}
                  disabled={busy}
                />
                <span className="item-inline-hint">
                  {ITEM_STATUS_META[status].hint}
                </span>
              </label>
              {buyPlan && (
                <label
                  htmlFor={`${id}-week`}
                  className="item-inline-wide item-field-week"
                  title={weekValue === "auto" ? `Sugestão: ${buyPlan.reason}` : "Semana escolhida por você, contada a partir da mudança."}
                >
                  Quando comprar
                  <Select
                    id={`${id}-week`}
                    ariaLabel="Semana de compra"
                    value={weekValue}
                    options={weekOptions({
                      moveDate: buyPlan.moveDate,
                      week: item.buyWeek ?? buyPlan.week,
                      manual: item.buyWeek !== null,
                    })}
                    onChange={setWeekValue}
                    disabled={busy}
                  />
                  <span className="item-inline-hint">
                    {weekValue === "auto"
                      ? `Sugestão: ${buyPlan.reason}`
                      : "Semana escolhida por você, contada a partir da mudança. Vale mais que a sugestão."}
                  </span>
                </label>
              )}
              <h4 className="item-inline-section item-inline-wide">Valores</h4>
              <label htmlFor={`${id}-price`} className="item-field-price">
                Preço
                <input
                  id={`${id}-price`}
                  inputMode="numeric"
                  value={priceText}
                  onChange={(event) => {
                    const digits = event.target.value
                      .replace(/\D/g, "")
                      .slice(0, 12);
                    setPriceText(
                      digits ? money.format(Number(digits) / 100) : "",
                    );
                  }}
                  placeholder="R$ 0,00"
                  disabled={busy}
                />
              </label>
              <label
                htmlFor={`${id}-discount`}
                className="item-field-discount"
                title={
                  discountApplies(status)
                    ? "Quanto foi abatido do preço. Aparece no resumo de descontos e cashback."
                    : status === "received"
                      ? "Item ganho: o valor cheio já vai para o resumo, sem desconto."
                      : "Esta situação não tem compra, então não há desconto."
                }
              >
                Desconto ou cashback
                <input
                  id={`${id}-discount`}
                  inputMode="numeric"
                  value={discountText}
                  onChange={(event) => {
                    const digits = event.target.value
                      .replace(/\D/g, "")
                      .slice(0, 12);
                    setDiscountText(
                      digits ? money.format(Number(digits) / 100) : "",
                    );
                  }}
                  placeholder="R$ 0,00"
                  disabled={busy || !discountApplies(status)}
                />
                <span className="item-inline-hint">
                  {discountApplies(status)
                    ? "Quanto foi abatido do preço. Aparece no resumo de descontos e cashback."
                    : status === "received"
                      ? "Item ganho: o valor cheio já vai para o resumo, sem desconto."
                      : "Esta situação não tem compra, então não há desconto."}
                </span>
              </label>
              <label htmlFor={`${id}-quantity`} className="item-field-qty" title="Só informa quantas unidades há. Não muda o preço.">
                Quantidade
                <QuantityStepper
                  id={`${id}-quantity`}
                  value={quantityText}
                  onChange={setQuantityText}
                  disabled={busy}
                />
                <span className="item-inline-hint">
                  Só informa quantas unidades há. Não muda o preço.
                </span>
              </label>
              <div className="item-inline-summary item-field-total" aria-live="polite">
                <span className="item-inline-summary-label">
                  {status === "received" ? "Valor ganho" : "Valor final"}
                </span>
                <strong>{draftPrice > 0 ? money.format(draftFinal / 100) : "—"}</strong>
                <span className="item-inline-hint">
                  {status === "received"
                    ? "Vai para Descontos e cashback, não para Já investimos."
                    : draftDiscount > 0
                      ? `${money.format(draftPrice / 100)} menos ${money.format(draftDiscount / 100)} de desconto.`
                      : "Preço menos o desconto ou cashback."}
                </span>
              </div>
              {tracking && (
                <>
                  <h4 className="item-inline-section item-inline-wide">Acompanhar preço</h4>
                  <label htmlFor={`${id}-target`} className="item-field-target">
                    Me avise se cair abaixo de
                    <input
                      id={`${id}-target`}
                      inputMode="numeric"
                      value={targetText}
                      onChange={(event) => {
                        const digits = event.target.value
                          .replace(/\D/g, "")
                          .slice(0, 12);
                        setTargetText(
                          digits ? money.format(Number(digits) / 100) : "",
                        );
                      }}
                      placeholder="R$ 0,00"
                      disabled={busy}
                    />
                  </label>
                  <label htmlFor={`${id}-alert`} className="item-inline-check item-field-alert">
                    <input
                      id={`${id}-alert`}
                      type="checkbox"
                      checked={alertEnabled}
                      onChange={(event) => setAlertEnabled(event.target.checked)}
                      disabled={busy}
                    />
                    <span>Avisar por e-mail quando o preço cair</span>
                  </label>
                </>
              )}
              <h4 className="item-inline-section item-inline-wide">Detalhes</h4>
              <label htmlFor={`${id}-link`} className="item-inline-wide item-field-link">
                Link do produto
                <input
                  id={`${id}-link`}
                  type="url"
                  value={linkText}
                  onChange={(event) => setLinkText(event.target.value)}
                  placeholder="https://..."
                  disabled={busy}
                />
              </label>
              <label htmlFor={`${id}-description`} className="item-inline-wide item-field-notes">
                Observações
                <textarea
                  id={`${id}-description`}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={2}
                  disabled={busy}
                />
              </label>
            </div>
            {!added && (
              <p className="item-inline-note">
                Data de adição indisponível para este item antigo.
              </p>
            )}
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <div className="item-inline-actions">
              <button
                className="button button-outline"
                type="button"
                onClick={close}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                className="button button-dark"
                type="submit"
                disabled={busy || !name.trim()}
              >
                {busy ? (
                  <LoaderCircle size={17} className="animate-spin" />
                ) : (
                  "Salvar alterações"
                )}
              </button>
            </div>
          </form>
        )}
      </div>
      {tracking && (
        <PriceHistoryDialog
          item={item}
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}
