import { Badge } from "@/src/components/ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import {
  useEffect,
  useLayoutEffect,
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
  BadgePercent,
  Gift,
  Receipt,
  ShieldCheck,
} from "@/src/components/icons";
import type {
  EnxovalCategory,
  EnxovalItem,
  EnxovalMember,
  ItemExtrasInput,
  ItemStatus,
  ItemTrackingInput,
  PaymentMethod,
  ScrapedProductPreview,
} from "../types";
import { capture } from "../analytics";
import {
  addMonths,
  installmentBadge,
  installmentPlan,
  MAX_INSTALLMENTS,
  PAYMENT_METHOD_LABEL,
} from "../planning/installments";
import { needsThanks, warrantyDaysLeft, warrantyExpiringSoon } from "../listInsights";
import {
  AssigneeAvatar,
  ItemDocumentsSection,
  ItemOffersSection,
  MAX_OFFERS,
  OffersSummary,
  ThanksDialog,
} from "./ItemExtras";
import { addItemOffer, extractProduct } from "../api";
import { CopyableLinkInput } from "./CopyableLinkInput";
import { priceChange, reachedTarget } from "../priceTracking";
import { PriceHistoryDialog } from "./PriceHistoryDialog";
import {
  discountApplies,
  ITEM_STATUSES,
  ITEM_STATUS_META,
  netPriceCents,
  statusLabel,
} from "../itemStatus";
import { MAX_ITEM_NAME_LENGTH } from "../data";
import { MAX_ITEM_QUANTITY, normalizeQuantity } from "../itemQuantity";
import { QuantityStepper } from "./QuantityStepper";
import { ItemCompletionDialog } from "./ItemCompletionDialog";
import { Select } from "./Select";
import { weekOptions } from "../planning/weekOptions";
import { weekLabel } from "../planning/purchasePlan";
import { ScribbledItemName } from "./ScribbledItemName";
import { ItemChalkStroke } from "./ItemChalkStroke";

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
  completionExiting?: boolean;
  categories: EnxovalCategory[];
  categoryName?: string;
  showUpdatedAt?: boolean;
  updatedAtLabel?: string;
  dragHandle?: ReactNode;
  buyPlan?: ItemBuyPlan;
  onUpdate: (
    id: string,
    updates: Partial<EnxovalItem> & ItemTrackingInput & ItemExtrasInput,
  ) => Promise<void> | void;
  /** Item devolvido pelo servidor ao mexer nas lojas ou nos documentos (salvos na hora). */
  onReplace?: (item: EnxovalItem) => void;
  /** Quem participa do enxoval: o campo "Quem vai comprar" só aparece quando há mais de uma pessoa. */
  members?: EnxovalMember[];
  currentUserId?: string;
  /** Nomes de quem já deu presente no enxoval, para sugerir no campo. */
  knownGiftNames?: string[];
  onDelete: (item: EnxovalItem) => void;
  /** Depois de riscar ou desmarcar com sucesso: o app confirma a mudança e oferece desfazer. */
  onCompletionChange?: (change: {
    id: string;
    name: string;
    previous: ItemStatus;
    done: boolean;
  }) => void;
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
const PAYMENT_OPTIONS = [
  { value: "", label: "Não informado" },
  ...(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((value) => ({ value, label: PAYMENT_METHOD_LABEL[value] })),
];
const INSTALLMENT_OPTIONS = Array.from({ length: MAX_INSTALLMENTS }, (_, index) => ({
  value: String(index + 1),
  label: index === 0 ? "À vista" : `${index + 1}x`,
}));
const centsOf = (text: string) => Number(text.replace(/\D/g, "")) || 0;
const moneyText = (cents: number | null | undefined) => (cents && cents > 0 ? money.format(cents / 100) : "");
const brDate = (iso: string) => iso.split("-").reverse().join("/");

function weekTagLabel(week: number) {
  return week === 0 ? "Na semana da mudança" : `${weekLabel(week)} da mudança`;
}
export function ItemRow({
  item,
  completionExiting = false,
  categories,
  categoryName,
  showUpdatedAt,
  updatedAtLabel,
  dragHandle,
  buyPlan,
  onUpdate,
  onReplace,
  members = [],
  currentUserId,
  knownGiftNames = [],
  onDelete,
  onCompletionChange,
}: ItemRowProps) {
  const [importStep, setImportStep] = useState<'idle' | 'ask' | 'loading' | 'choose' | 'done' | 'error'>('idle');
  const [storeAdded, setStoreAdded] = useState(false);
  const [productPreview, setProductPreview] = useState<ScrapedProductPreview | null>(null);
  const [importError, setImportError] = useState('');
  const importTicket = useRef(0);
  const reviewedLink = useRef(item.link.trim());
  const currentLink = useRef(item.link);
  const [expanded, setExpanded] = useState(false);
  const [completing, setCompleting] = useState(false);
  const wasChecked = useRef(item.checked);
  useLayoutEffect(() => {
    const justCompleted = item.checked && !wasChecked.current;
    wasChecked.current = item.checked;
    if (!justCompleted) {
      if (!item.checked) setCompleting(false);
      return;
    }
    setCompleting(true);
  }, [item.checked]);
  useEffect(() => {
    if (!completing) return;
    const timeout = window.setTimeout(() => setCompleting(false), 760);
    return () => window.clearTimeout(timeout);
  }, [completing]);
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
  const [completionOpen, setCompletionOpen] = useState(false);
  const [thanksOpen, setThanksOpen] = useState(false);
  // Fase 11: parcelas e pagamento, responsável, presente e garantia.
  const [installmentsText, setInstallmentsText] = useState("1");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [purchasedAt, setPurchasedAt] = useState("");
  const [firstInstallmentMonth, setFirstInstallmentMonth] = useState("");
  const [installmentText, setInstallmentText] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [giftFrom, setGiftFrom] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [thanked, setThanked] = useState(false);
  const [warrantyMonthsText, setWarrantyMonthsText] = useState("");
  const [warrantyUntil, setWarrantyUntil] = useState("");
  const [storeName, setStoreName] = useState("");
  const [pointerFocus, setPointerFocus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!['ask', 'choose'].includes(importStep)) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`${id}-import`)?.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [importStep, id]);
  useEffect(() => {
    if (expanded) return;
    setName(item.name);
    setPriceText(item.priceCents ? money.format(item.priceCents / 100) : "");
    setQuantityText(String(normalizeQuantity(item.quantity)));
    setDiscountText(
      item.discountCents > 0 ? money.format(item.discountCents / 100) : "",
    );
    setLinkText(item.link);
    currentLink.current = item.link;
    reviewedLink.current = item.link.trim();
    importTicket.current++;
    setImportStep('idle'); setProductPreview(null); setImportError('');
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
    setInstallmentsText(String(item.installments ?? 1));
    setPaymentMethod(item.paymentMethod ?? "");
    setPurchasedAt(item.purchasedAt ?? "");
    setFirstInstallmentMonth(item.firstInstallmentOn?.slice(0, 7) ?? "");
    setInstallmentText(moneyText(item.installmentCents));
    setAssigneeId(item.assigneeId ?? "");
    setGiftFrom(item.giftFrom ?? "");
    setGiftMessage(item.giftMessage ?? "");
    setThanked(Boolean(item.thankedAt));
    setWarrantyMonthsText(item.warrantyMonths ? String(item.warrantyMonths) : "");
    setWarrantyUntil(item.warrantyUntil ?? "");
    setStoreName(item.storeName ?? "");
    setError("");
  }, [item, expanded]);
  useEffect(() => () => { importTicket.current++; }, []);
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
  const shared = members.length > 1;
  const assignee = item.assigneeId ? members.find((member) => member.id === item.assigneeId) : undefined;
  const installmentsTag = item.status === "bought" ? installmentBadge(item) : null;
  const warrantyDays = warrantyExpiringSoon(item) ? warrantyDaysLeft(item) : null;
  const draftInstallments = Number(installmentsText) || 1;
  const draftPlan = installmentPlan({
    status,
    priceCents: draftPrice || null,
    discountCents: draftDiscount,
    installments: draftInstallments,
    installmentCents: centsOf(installmentText) || null,
  });
  const draftWarrantyUntil =
    warrantyMonthsText && Number(warrantyMonthsText) > 0
      ? addMonths(purchasedAt || new Date().toISOString().slice(0, 10), Number(warrantyMonthsText))
      : "";
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
  const offerImport = () => {
    const url = safeLink(linkText);
    if (!url || reviewedLink.current === url || url === safeLink(item.link)) return false;
    reviewedLink.current = url;
    setImportStep('ask'); setProductPreview(null); setImportError('');
    return true;
  };
  // Já tem um link salvo: o link novo pode virar outra loja em vez de trocar a principal. Links da mesma loja valem,
  // porque cada endereço é um produto; só o mesmo endereço repetido é recusado pelo servidor.
  const canAddStore = Boolean(onReplace) && Boolean(safeLink(item.link)) && (item.offers?.length ?? 0) < MAX_OFFERS;
  const addAsOtherStore = async () => {
    const url = safeLink(linkText);
    if (!url || !onReplace) return;
    const ticket = ++importTicket.current;
    setImportStep('loading'); setImportError('');
    try {
      // A leitura deixa o preço pronto na hora; se a loja bloquear, a oferta espera a rotina de preços.
      const preview = await extractProduct(url).catch(() => null);
      const saved = await addItemOffer(item.id, preview?.url ?? url);
      if (ticket !== importTicket.current) return;
      capture("offer_added", { offers: saved.offers?.length ?? 0 });
      onReplace(saved);
      currentLink.current = saved.link;
      setLinkText(saved.link);
      setImportStep('done'); setProductPreview(null); setStoreAdded(true);
    } catch (err) {
      if (ticket !== importTicket.current) return;
      setImportError(err instanceof Error ? err.message : 'Não foi possível salvar a loja. Tente de novo.');
      setImportStep('error');
    }
  };
  const readProduct = async () => {
    const url = safeLink(linkText);
    const ticket = ++importTicket.current;
    setImportStep('loading'); setImportError('');
    try {
      const preview = await extractProduct(url);
      if (ticket !== importTicket.current || safeLink(currentLink.current) !== url) return;
      setProductPreview(preview); setImportStep('choose');
    } catch (err) {
      if (ticket !== importTicket.current) return;
      setImportError(err instanceof Error ? err.message : 'Não foi possível ler este produto. Você pode preencher os dados manualmente.');
      setImportStep('error');
    }
  };
  const applyProduct = (useStoreName: boolean) => {
    if (!productPreview) return;
    if (useStoreName && productPreview.title.trim()) setName(productPreview.title.replace(/\s+/g, ' ').trim().slice(0, MAX_ITEM_NAME_LENGTH));
    if (!productPreview.partial) {
      if (typeof productPreview.priceCents === 'number' && productPreview.priceCents >= 0 && productPreview.currency?.toUpperCase() === 'BRL') {
        setPriceText(money.format(productPreview.priceCents / 100));
        setDiscountText('');
      }
    }
    setImportStep('done');
    if (!useStoreName) requestAnimationFrame(() => {
      const input = document.getElementById(`${id}-name`) as HTMLInputElement | null;
      input?.focus(); input?.select();
    });
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    if (offerImport() || ['ask', 'loading', 'choose'].includes(importStep)) return;
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
    const warrantyMonthsValue = warrantyMonthsText ? Number(warrantyMonthsText) : null;
    if (warrantyMonthsValue !== null && (!Number.isInteger(warrantyMonthsValue) || warrantyMonthsValue < 1 || warrantyMonthsValue > 240)) {
      setError("A garantia deve ter de 1 a 240 meses.");
      setBusy(false);
      return;
    }
    const installmentsValue = Number(installmentsText) || 1;
    const installmentCentsValue = installmentsValue > 1 ? centsOf(installmentText) || null : null;
    const extras: ItemExtrasInput = {};
    if (installmentsValue !== (item.installments ?? 1)) extras.installments = installmentsValue;
    if (installmentCentsValue !== (item.installmentCents ?? null)) extras.installmentCents = installmentCentsValue;
    if ((paymentMethod || null) !== (item.paymentMethod ?? null)) extras.paymentMethod = (paymentMethod || null) as PaymentMethod | null;
    const firstOn = firstInstallmentMonth ? `${firstInstallmentMonth}-01` : null;
    if (firstOn !== (item.firstInstallmentOn ?? null)) extras.firstInstallmentOn = firstOn;
    if (status === "bought" && (purchasedAt || null) !== (item.purchasedAt ?? null)) extras.purchasedAt = purchasedAt || null;
    if ((assigneeId || null) !== (item.assigneeId ?? null)) extras.assigneeId = assigneeId || null;
    if (giftFrom.trim() !== (item.giftFrom ?? "")) extras.giftFrom = giftFrom.trim() || null;
    if (giftMessage.trim() !== (item.giftMessage ?? "")) extras.giftMessage = giftMessage.trim() || null;
    if (thanked !== Boolean(item.thankedAt)) extras.thanked = thanked;
    if (warrantyMonthsValue !== (item.warrantyMonths ?? null)) extras.warrantyMonths = warrantyMonthsValue;
    // Fim da garantia escrito à mão vale mais que o calculado pela data da compra.
    // Mudou só os meses: o servidor recalcula o fim pela data da compra.
    if ((warrantyUntil || null) !== (item.warrantyUntil ?? null) && !(extras.warrantyMonths !== undefined && !warrantyUntil))
      extras.warrantyUntil = warrantyUntil || null;
    if (storeName.trim() !== (item.storeName ?? "")) extras.storeName = storeName.trim() || null;
    let saved = false;
    try {
      await onUpdate(item.id, {
        ...extras,
        name: name.trim(),
        priceCents: priceValue,
        quantity: quantityValue,
        discountCents: discountValue,
        link: linkText.trim(),
        description: description.trim(),
        categoryId,
        status,
        // Trocar o link não mantém o acompanhamento da loja anterior.
        ...(linkText.trim() !== item.link.trim() && tracking ? { trackedProductUrl: null } : {}),
        ...(importStep === 'done' && productPreview && !productPreview.partial ? {
          trackedProductUrl: productPreview.url,
          initialPriceCents: productPreview.priceCents,
          priceBasis: 'regular' as const,
          selectedVariation: null,
        } : {}),
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
      if (extras.assigneeId !== undefined && extras.assigneeId !== null)
        capture("item_assigned", { self: extras.assigneeId === currentUserId });
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
      data-item-id={item.id}
      data-pointer-focus={pointerFocus || undefined}
      onPointerDownCapture={() => setPointerFocus(true)}
      onKeyDownCapture={() => setPointerFocus(false)}

      className={`item-row ${item.checked ? "checked" : ""} ${expanded ? "expanded" : ""} ${completing ? "is-completing" : ""} ${completionExiting ? "is-completion-exiting" : ""}`}
    >
      {completing && <ItemChalkStroke />}
      <div className="item-row-inner">
        <div className="item-row-controls">
        <Checkbox asChild checked={item.checked}><Button variant="brand" size="brand"
          type="button"
          aria-label={`${item.checked ? "Desmarcar" : "Marcar como conquistado"}: ${item.name}`}
          aria-haspopup={item.checked ? undefined : 'dialog'}
          className="item-check"
          data-pointer-focus={pointerFocus || undefined}
          onBlur={() => setPointerFocus(false)}
          disabled={busy}
          onClick={() => {
            if (!item.checked) { setCompletionOpen(true); return; }
            const previous = item.status;
            void Promise.resolve(onUpdate(item.id, { checked: false }))
              .then(() => onCompletionChange?.({ id: item.id, name: item.name, previous, done: false }))
              .catch(() => undefined);
          }}
        >
          <Check size={15} strokeWidth={2.5} />
        </Button></Checkbox>
        </div>
        <div className="item-content">
          <Button variant="brand" size="brand"
            type="button"
            className="item-title-button"
            onBlur={() => setPointerFocus(false)}
            aria-expanded={expanded}
            aria-controls={`${id}-details`}
            onClick={toggle}
            disabled={busy}
            title={item.name}
          >
            <ScribbledItemName name={item.name} checked={item.checked} />
          </Button>
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
            {shared && assignee && (
              <AssigneeAvatar member={assignee} isMe={assignee.id === currentUserId} />
            )}
            {installmentsTag && (
              <span className="item-quantity-tag item-installments-tag" title="Compra parcelada">
                {installmentsTag}
              </span>
            )}
            {item.status === "received" && item.giftFrom && (
              <span className="item-gift-tag" title={item.giftMessage || undefined}>
                <Gift size={11} aria-hidden="true" /> de {item.giftFrom}
              </span>
            )}
            {needsThanks(item) && (
              <Button variant="brand" size="brand"
                type="button"
                className="price-badge item-thanks-badge"
                onClick={() => setThanksOpen(true)}
                aria-haspopup="dialog"
              >
                Agradecer
              </Button>
            )}
            {(item.documentCount ?? 0) > 0 && (
              <span className="item-doc-tag" title={`${item.documentCount} ${item.documentCount === 1 ? "documento guardado" : "documentos guardados"}`}>
                <Receipt size={11} aria-hidden="true" />
                <span className="sr-only">{item.documentCount} {item.documentCount === 1 ? "documento" : "documentos"}</span>
                {item.documentCount! > 1 && <span aria-hidden="true">{item.documentCount}</span>}
              </span>
            )}
            {warrantyDays !== null && (
              <span className="item-warranty-tag" title={`Garantia até ${brDate(item.warrantyUntil!)}`}>
                <ShieldCheck size={11} aria-hidden="true" />
                {warrantyDays === 0 ? "Garantia vence hoje" : `Garantia vence em ${warrantyDays} ${warrantyDays === 1 ? "dia" : "dias"}`}
              </span>
            )}
            <OffersSummary item={item} onOpen={() => !expanded && toggle()} />
            {/* Sem a data da mudança, "11 semanas depois" não diz nada: a semana fica só no Planejamento. */}
            {buyPlan?.moveDate && !item.checked && (
              <span
                className={`item-week-tag${buyPlan.overdue ? " is-late" : ""}${buyPlan.manual ? " is-manual" : ""}`}
                title={buyPlan.reason}
              >
                <CalendarClock size={12} aria-hidden="true" />
                {buyPlan.overdue ? "Semana sugerida já passou" : weekTagLabel(buyPlan.week)}
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
              <Button variant="brand" size="brand"
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
              </Button>
            )}
            {tracking?.isLowestIn60d && (
              <Button variant="brand" size="brand"
                type="button"
                className="price-badge is-lowest"
                onClick={() => setHistoryOpen(true)}
                title="Ver histórico de preços"
              >
                <Flame size={12} aria-hidden="true" /> Menor preço em 60 dias
              </Button>
            )}
            {/* O alerta de preço já existe; aqui ele aparece na própria linha, sem abrir o histórico. */}
            {!item.checked && reachedTarget(tracking) && (
              <Button variant="brand" size="brand"
                type="button"
                className="price-badge is-target"
                onClick={() => setHistoryOpen(true)}
                title="Ver histórico de preços"
              >
                <BadgePercent size={12} aria-hidden="true" /> Chegou no seu preço
              </Button>
            )}
            {tracking && !change && tracking.currentPriceCents !== null && (
              <Button variant="brand" size="brand"
                type="button"
                className="price-badge"
                onClick={() => setHistoryOpen(true)}
                title="Ver histórico de preços"
              >
                Acompanhando o preço
              </Button>
            )}
            {tracking && !tracking.inStock && (
              <Badge asChild variant="outline"><span className="price-badge is-out">
                <PackageX size={12} aria-hidden="true" /> Indisponível
              </span></Badge>
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
        {/* A alça de arrastar ocupa a coluna da direita, longe do quadrado de riscar. */}
        {dragHandle && <div className="item-actions">{dragHandle}</div>}
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
              <Label htmlFor={`${id}-name`} className="item-inline-wide item-field-name">
                <span className="item-inline-label-row">
                  Nome do item
                  <span
                    className={`name-counter${name.length >= MAX_ITEM_NAME_LENGTH ? " is-full" : ""}`}
                    aria-hidden="true"
                  >
                    {name.length}/{MAX_ITEM_NAME_LENGTH}
                  </span>
                </span>
                <Input
                  id={`${id}-name`}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={MAX_ITEM_NAME_LENGTH}
                  disabled={busy}
                />
              </Label>
              <Label htmlFor={`${id}-environment`} className="item-field-env">
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
              </Label>
              <Label htmlFor={`${id}-status`} className="item-field-status" title={ITEM_STATUS_META[status].hint}>
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
              </Label>
              {buyPlan && (
                <Label
                  htmlFor={`${id}-week`}
                  className="item-inline-wide item-field-week"
                  title={weekValue === "auto" ? `Sugestão: ${buyPlan.reason}` : "Semana escolhida por você, contada a partir da mudança."}
                >
                  Semana para conquistar
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
                </Label>
              )}
              {shared && (
                <Label htmlFor={`${id}-assignee`} className="item-inline-wide item-field-assignee">
                  Quem vai comprar
                  <Select
                    id={`${id}-assignee`}
                    ariaLabel="Quem vai comprar"
                    value={assigneeId}
                    options={[
                      { value: "", label: "Ninguém ainda" },
                      ...members.map((member) => ({
                        value: member.id,
                        label: member.id === currentUserId ? `${member.name || member.email} (você)` : member.name || member.email,
                      })),
                    ]}
                    onChange={setAssigneeId}
                    disabled={busy}
                  />
                  <span className="item-inline-hint">Evita compra repetida. Qualquer pessoa do enxoval continua podendo editar o item.</span>
                </Label>
              )}
              <h4 className="item-inline-section item-inline-wide">Valores</h4>
              <Label htmlFor={`${id}-price`} className="item-field-price">
                Preço
                <Input
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
              </Label>
              <Label
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
                <Input
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
              </Label>
              <Label htmlFor={`${id}-quantity`} className="item-field-qty" title="Só informa quantas unidades há. Não muda o preço.">
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
              </Label>
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
              {(
                <>
                  <Label htmlFor={`${id}-installments`} className="item-field-installments">
                    Parcelas
                    <Select
                      id={`${id}-installments`}
                      ariaLabel="Parcelas"
                      value={installmentsText}
                      options={INSTALLMENT_OPTIONS}
                      onChange={setInstallmentsText}
                      disabled={busy}
                    />
                    <span className="item-inline-hint item-extra-note">
                      {draftPlan && draftPlan.count > 1
                        ? `${draftPlan.count}x de ${money.format(draftPlan.amounts.at(-1)! / 100)}${draftPlan.interestCents > 0 ? ` · juros: ${money.format(draftPlan.interestCents / 100)}` : ""}`
                        : status === "bought"
                          ? "Entra no fluxo mensal do Planejamento."
                          : "Ajusta a previsão de parcelas do Planejamento."}
                    </span>
                  </Label>
                  {(
                    <Label htmlFor={`${id}-payment`} className="item-field-payment">
                      Meio de pagamento
                      <Select
                        id={`${id}-payment`}
                        ariaLabel="Meio de pagamento"
                        value={paymentMethod}
                        options={PAYMENT_OPTIONS}
                        onChange={setPaymentMethod}
                        disabled={busy}
                      />
                    </Label>
                  )}
                  {draftInstallments > 1 && (
                    <Label htmlFor={`${id}-installment-value`} className="item-field-installment-value">
                      Valor da parcela, se teve juros
                      <Input
                        id={`${id}-installment-value`}
                        inputMode="numeric"
                        value={installmentText}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/\D/g, "").slice(0, 12);
                          setInstallmentText(digits ? money.format(Number(digits) / 100) : "");
                        }}
                        placeholder="Sem juros"
                        disabled={busy}
                      />
                    </Label>
                  )}
                  {(
                    <Label htmlFor={`${id}-purchased`} className="item-field-purchased">
                      Data da compra
                      <Input
                        id={`${id}-purchased`}
                        type="date"
                        value={purchasedAt}
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={(event) => setPurchasedAt(event.target.value)}
                        disabled={busy || status !== "bought"}
                      />
                      {status !== "bought" && <span className="item-inline-hint item-extra-note">Preenche ao marcar como Comprado.</span>}
                    </Label>
                  )}
                  {draftInstallments > 1 && (
                    <Label htmlFor={`${id}-first-installment`} className="item-field-first-installment">
                      Primeira parcela
                      <Input
                        id={`${id}-first-installment`}
                        type="month"
                        value={firstInstallmentMonth}
                        onChange={(event) => setFirstInstallmentMonth(event.target.value)}
                        disabled={busy}
                      />
                      <span className="item-inline-hint">
                        {status === "bought" ? "Em branco: o mês da compra." : "Em branco: o mês da semana planejada."}
                      </span>
                    </Label>
                  )}
                </>
              )}
              {status === "received" && (
                <>
                  <h4 className="item-inline-section item-inline-wide is-visible">Presente</h4>
                  <Label htmlFor={`${id}-gift-from`} className="item-field-gift-from">
                    De quem foi o presente?
                    <Input
                      id={`${id}-gift-from`}
                      value={giftFrom}
                      maxLength={120}
                      list={`${id}-gift-names`}
                      placeholder="Ex.: Tia Rosa"
                      onChange={(event) => setGiftFrom(event.target.value)}
                      disabled={busy}
                    />
                    <datalist id={`${id}-gift-names`}>
                      {knownGiftNames.map((giftName) => (
                        <option key={giftName} value={giftName} />
                      ))}
                    </datalist>
                  </Label>
                  <Label htmlFor={`${id}-thanked`} className="item-inline-check item-field-thanked">
                    <Checkbox
                      id={`${id}-thanked`}
                      checked={thanked}
                      onCheckedChange={(checked) => setThanked(checked === true)}
                      disabled={busy}
                    />
                    <span>Já agradeci</span>
                  </Label>
                  <Label htmlFor={`${id}-gift-message`} className="item-inline-wide item-field-gift-message">
                    Recado que veio com o presente
                    <Textarea
                      id={`${id}-gift-message`}
                      value={giftMessage}
                      maxLength={500}
                      rows={2}
                      onChange={(event) => setGiftMessage(event.target.value)}
                      disabled={busy}
                    />
                  </Label>
                </>
              )}
              {tracking && (
                <>
                  <h4 className="item-inline-section item-inline-wide">Acompanhar preço</h4>
                  <Label htmlFor={`${id}-target`} className="item-field-target">
                    Me avise se cair abaixo de
                    <Input
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
                  </Label>
                  <Label htmlFor={`${id}-alert`} className="item-inline-check item-field-alert">
                    <Checkbox
                      id={`${id}-alert`}
                      checked={alertEnabled}
                      onCheckedChange={checked => setAlertEnabled(checked === true)}
                      disabled={busy}
                    />
                    <span>Avisar por e-mail quando o preço cair</span>
                  </Label>
                </>
              )}
              {(
                <>
                  <h4 className="item-inline-section item-inline-wide is-visible">
                    Nota e garantia
                    <small className="item-inline-caption">(Avisamos 30 e 7 dias antes de vencer.)</small>
                  </h4>
                  <Label htmlFor={`${id}-warranty-months`} className="item-field-warranty">
                    Garantia (meses)
                    <Input
                      id={`${id}-warranty-months`}
                      inputMode="numeric"
                      value={warrantyMonthsText}
                      placeholder="Ex.: 12"
                      onChange={(event) => {
                        setWarrantyMonthsText(event.target.value.replace(/\D/g, "").slice(0, 3));
                        setWarrantyUntil("");
                      }}
                      disabled={busy}
                    />
                    <span className="item-inline-hint">Do fabricante mais a estendida, se houver.</span>
                  </Label>
                  <Label htmlFor={`${id}-warranty-until`} className="item-field-warranty-until">
                    Garantia até
                    <Input
                      id={`${id}-warranty-until`}
                      type="date"
                      value={warrantyUntil || draftWarrantyUntil}
                      onChange={(event) => setWarrantyUntil(event.target.value)}
                      disabled={busy}
                    />
                    {warrantyMonthsText && (warrantyUntil || draftWarrantyUntil) && (
                      <span className="item-inline-hint item-extra-note">
                        {`${warrantyMonthsText} ${Number(warrantyMonthsText) === 1 ? "mês" : "meses"}, até ${brDate(warrantyUntil || draftWarrantyUntil)}`}
                      </span>
                    )}
                  </Label>
                  <Label htmlFor={`${id}-store`} className="item-inline-wide item-field-store">
                    Onde foi comprado
                    <Input
                      id={`${id}-store`}
                      value={storeName}
                      maxLength={80}
                      placeholder={tracking ? `Ex.: ${tracking.domain}` : "Ex.: Loja do bairro"}
                      onChange={(event) => setStoreName(event.target.value)}
                      disabled={busy}
                    />
                  </Label>
                  {onReplace && <ItemDocumentsSection item={item} disabled={busy} onReplace={onReplace} />}
                </>
              )}
              {onReplace && (
                <ItemOffersSection item={item} disabled={busy} onReplace={onReplace} />
              )}
              <h4 className="item-inline-section item-inline-wide">Detalhes</h4>
              <div className="item-inline-wide item-field-link">
                <Label htmlFor={`${id}-link`}>Link do produto</Label>
                <CopyableLinkInput id={`${id}-link`} type="url" value={linkText} copyLabel="Copiar link do produto"
                  onChange={event => { currentLink.current = event.target.value; setLinkText(event.target.value); importTicket.current++; setImportStep('idle'); setStoreAdded(false); setProductPreview(null); setImportError(''); }}
                  onBlur={() => { offerImport(); }}
                  onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); offerImport(); } }}
                  placeholder="https://..." disabled={busy} />
              </div>
              {importStep !== 'idle' && <div id={`${id}-import`} className="item-link-import item-inline-wide" aria-busy={importStep === 'loading'}>
                {importStep === 'ask' && <>
                  <h5>Quer aproveitar os dados deste link?</h5>
                  <p>{canAddStore ? 'Você pode trocar o link principal ou guardar este link como outra loja para comparar preços (até 3 lojas).' : 'Podemos buscar o nome e o preço na loja para ajudar a preencher este item. Você revisa tudo antes de salvar.'}</p>
                  <div className="item-link-import-actions"><Button variant="brand" size="brand" type="button" className="button button-dark" onClick={() => void readProduct()}>{canAddStore ? 'Trocar link principal' : 'Buscar dados do produto'}</Button>{canAddStore && <Button variant="brand" size="brand" type="button" className="button button-dark" onClick={() => void addAsOtherStore()}>Adicionar como outra loja</Button>}<Button variant="brand" size="brand" type="button" className="button button-outline" onClick={() => setImportStep('idle')}>Preencher manualmente</Button></div>
                </>}
                {importStep === 'loading' && <><p className="item-link-import-loading" role="status"><LoaderCircle size={18} className="animate-spin" />Buscando informações na loja…</p><Button variant="brand" size="brand" type="button" className="button button-outline" onClick={() => { importTicket.current++; setImportStep('idle'); }}>Continuar manualmente</Button></>}
                {importStep === 'choose' && productPreview && <>
                  <h5>Como prefere chamar este item?</h5>
                  <div className="item-link-import-preview">
                    <div><strong>{productPreview.title || 'A loja não informou um nome'}</strong>{!productPreview.partial && productPreview.currency?.toUpperCase() === 'BRL' && productPreview.priceCents !== null && <span>{money.format(productPreview.priceCents / 100)}</span>}</div>
                  </div>
                  <p>{productPreview.partial ? 'A loja limitou a leitura. Encontramos apenas uma sugestão de nome pelo endereço; confira os outros dados manualmente.' : 'O preço encontrado será preenchido. Para o nome, escolha uma das opções abaixo. Seus dados só serão gravados ao salvar as alterações.'}</p>
                  <div className="item-link-import-actions"><Button variant="brand" size="brand" type="button" className="button button-dark" disabled={!productPreview.title.trim()} onClick={() => applyProduct(true)}>Usar nome da loja</Button><Button variant="brand" size="brand" type="button" className="button button-outline" onClick={() => applyProduct(false)}>Definir meu próprio nome</Button></div>
                  <Button variant="brand" size="brand" type="button" className="button button-outline" onClick={() => { setProductPreview(null); setImportStep('idle'); }}>Manter meus dados atuais</Button>
                </>}
                {importStep === 'done' && <p role="status">{storeAdded ? 'Loja adicionada. Compare os preços em Lojas e escolha a principal.' : productPreview?.partial ? 'Nome revisado. Confira os demais dados antes de salvar.' : 'Dados preenchidos. Revise as informações e salve quando estiver tudo certo.'}</p>}
                {importStep === 'error' && <><p role="alert">{importError}</p><p>O link foi mantido. Você pode continuar preenchendo manualmente.</p><div className="item-link-import-actions"><Button variant="brand" size="brand" type="button" className="button button-outline" onClick={() => void readProduct()}>Tentar buscar novamente</Button><Button variant="brand" size="brand" type="button" className="button button-outline" onClick={() => setImportStep('idle')}>Continuar manualmente</Button></div></>}
              </div>}
              <Label htmlFor={`${id}-description`} className="item-inline-wide item-field-notes">
                Observações
                <Textarea
                  id={`${id}-description`}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={2}
                  disabled={busy}
                />
              </Label>
            </div>
            <div className="item-inline-footnote">
              <p className="item-inline-note">
                {added ? `Adicionado em ${added}.` : "Data de adição indisponível para este item antigo."}
              </p>
              {/* Tirar da lista mora aqui dentro, longe do toque de riscar: na linha fechada era fácil acertar sem querer. */}
              <Button variant="brand" size="brand"
                className="item-remove-button"
                type="button"
                onClick={() => onDelete(item)}
                disabled={busy}
              >
                <Trash2 size={16} aria-hidden="true" /> Tirar da lista
              </Button>
            </div>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <div className="item-inline-actions">
              <Button variant="brand" size="brand"
                className="button button-outline"
                type="button"
                onClick={close}
                disabled={busy}
              >
                Cancelar
              </Button>
              <Button variant="brand" size="brand"
                className="button button-dark"
                type="submit"
                disabled={busy || !name.trim() || ['loading', 'choose'].includes(importStep)}
              >
                {busy ? (
                  <LoaderCircle size={17} className="animate-spin" />
                ) : (
                  "Salvar alterações"
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
      <div className="item-footer">
          <Button variant="brand" size="brand"
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
          </Button>
      </div>
      {tracking && (
        <PriceHistoryDialog
          item={item}
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      {thanksOpen && (
        <ThanksDialog
          item={item}
          onClose={() => setThanksOpen(false)}
          onMarkThanked={async (channel) => {
            await onUpdate(item.id, { thanked: true });
            capture("gift_thanked", { channel });
          }}
        />
      )}
      {completionOpen && <ItemCompletionDialog itemName={item.name} suggestedPriceCents={item.priceCents || tracking?.currentPriceCents || null} initialInstallments={item.installments ?? 1} knownGiftNames={knownGiftNames} onClose={() => setCompletionOpen(false)} onConfirm={async (next, paidCents, details) => {
        // Confirme antes de aplicar à lista; uma falha não pode tachar nem ocultar o item nos filtros.
        const previous = item.status;
        // O valor pago vira o preço do item; o desconto já registrado não pode passar dele.
        const paid = paidCents !== null && paidCents !== item.priceCents
          ? { priceCents: paidCents, ...(item.discountCents > paidCents ? { discountCents: paidCents } : {}) }
          : {};
        await onUpdate(item.id, { status: next, checked: true, ...paid, ...details });
        setStatus(next);
        onCompletionChange?.({ id: item.id, name: item.name, previous, done: true });
        if (!discountApplies(next)) setDiscountText('');
      }} />}
    </div>
  );
}
