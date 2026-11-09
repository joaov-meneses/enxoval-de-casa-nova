import { PurchaseTimingFields, purchaseDateLabel } from './PurchaseTiming';
import { PriceOpportunityNote } from './PriceOpportunityNote';
import type { SchedulingInput } from '../planning/scheduling';
import { Badge } from "@/src/components/ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ExternalLink,
  Trash2,
  LoaderCircle,
  Flame,
  TrendingDown,
  TrendingUp,
  PackageX,
  BadgePercent,
  Gift,
  Receipt,
  ShieldCheck,
  Link2,
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
import { AddLinkInput } from "./AddLinkInput";
import { knownStoreLabel, priceChange, reachedTarget } from "../priceTracking";
import { PriceHistoryDialog } from "./PriceHistoryDialog";
import {
  discountApplies,
  ITEM_STATUS_META,
  netPriceCents,
  statusLabel,
} from "../itemStatus";
import { MAX_ITEM_NAME_LENGTH } from "../data";
import { MAX_ITEM_QUANTITY, normalizeQuantity } from "../itemQuantity";
import { QuantityStepper } from "./QuantityStepper";
import { ItemCompletionDialog } from "./ItemCompletionDialog";
import { Dialog } from "./Dialog";
import "./itemCard.css";
import { Select } from "./Select";
import { FormBlock, StatusSegmented, statusFamily, TipButton, TipPanel, useTips } from "./ItemFormParts";
import "./itemEditForm.css";
import { weekOptions } from "../planning/weekOptions";
import { weekLabel } from "../planning/purchasePlan";
import { ScribbledItemName } from "./ScribbledItemName";
import { ItemChalkStroke } from "./ItemChalkStroke";
import { StaticListIcon } from "./StaticListIcon";

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
  planningItems?: EnxovalItem[];
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
/** Quantas linhas estão abertas agora (normalmente uma). */
let expandedItems = 0;
const centsOf = (text: string) => Number(text.replace(/\D/g, "")) || 0;
const moneyText = (cents: number | null | undefined) => (cents && cents > 0 ? money.format(cents / 100) : "");
const brDate = (iso: string) => iso.split("-").reverse().join("/");

/** Blocos do formulário que já têm dados: abrem sozinhos ao abrir o item. Os demais ficam recolhidos. */
function blocksWithData(item: EnxovalItem): Record<string, boolean> {
  return {
    payment: (item.installments ?? 1) > 1 || Boolean(item.paymentMethod) || Boolean(item.installmentCents) || Boolean(item.firstInstallmentOn),
    planning: item.buyWeek !== null || item.leadTimeWeeks != null || item.researchWeeks != null
      || Boolean(item.hasTemporarySolution) || Boolean(item.dependsOnItemId),
    gift: Boolean(item.giftFrom || item.giftMessage),
    tracking: Boolean(item.priceTracking?.targetPriceCents),
    warranty: Boolean(item.warrantyMonths || item.warrantyUntil || item.storeName || item.documentCount),
    stores: (item.offers?.length ?? 0) > 0,
    notes: Boolean(item.description?.trim()),
  };
}
/** "dez" a partir de "2026-12". */
function shortMonth(yearMonth: string) {
  const [year, month] = yearMonth.split("-").map(Number);
  if (!year || !month) return "";
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function weekTagLabel(week: number) {
  return week === 0 ? "Na semana da mudança" : `${weekLabel(week)} da mudança`;
}

function sameRowProps(previous: ItemRowProps, next: ItemRowProps) {
  const keys = Object.keys(previous) as (keyof ItemRowProps)[];
  if (keys.length !== Object.keys(next).length) return false;
  return keys.every((key) => {
    if (Object.is(previous[key], next[key])) return true;
    // O plano e as sugestões são recalculados ao salvar qualquer item. Compara os valores para preservar as
    // outras linhas; callbacks e os dados do item continuam sendo comparados pela identidade.
    if (key === "buyPlan") {
      const a = previous.buyPlan, b = next.buyPlan;
      return !!a && !!b && a.week === b.week && a.manual === b.manual && a.reason === b.reason
        && a.moveDate === b.moveDate && a.overdue === b.overdue;
    }
    if (key === "knownGiftNames") {
      const a = previous.knownGiftNames, b = next.knownGiftNames;
      return !!a && !!b && a.length === b.length && a.every((name, index) => name === b[index]);
    }
    if (key === "planningItems") {
      const a = previous.planningItems, b = next.planningItems;
      return !!a && !!b && a.length === b.length && a.every((entry, index) =>
        entry.id === b[index].id && entry.name === b[index].name && entry.dependsOnItemId === b[index].dependsOnItemId);
    }
    return false;
  });
}
/**
 * Linha de item. Memorizada: só redesenha quando os dados dela mudam (o workspace passa callbacks estáveis e o plano
 * de compra de cada item já pronto), em vez de refazer todas as linhas a cada render do app.
 */
export const ItemRow = memo(function ItemRow({
  item,
  planningItems = [],
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
  const [importStep, setImportStep] = useState<'idle' | 'loading' | 'choose' | 'done'>('idle');
  const [productPreview, setProductPreview] = useState<ScrapedProductPreview | null>(null);
  const [importError, setImportError] = useState('');
  const importTicket = useRef(0);
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
  const [timingDraft, setTimingDraft] = useState<SchedulingInput>({});
  const [name, setName] = useState(item.name);
  const [priceText, setPriceText] = useState("");
  const [discountText, setDiscountText] = useState("");
  const [quantityText, setQuantityText] = useState("1");
  const [linkDraft, setLinkDraft] = useState("");
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
  // Blocos recolhíveis do formulário: quais estão abertos. Os campos de um bloco fechado seguem no estado e no envio.
  const [openBlocks, setOpenBlocks] = useState<Record<string, boolean>>(() => blocksWithData(item));
  const tips = useTips();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (importStep !== 'choose') return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`${id}-import`)?.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [importStep, id]);
  useEffect(() => {
    if (expanded) return;
    setTimingDraft({ leadTimeWeeks: item.leadTimeWeeks ?? null, researchWeeks: item.researchWeeks ?? null,
      hasTemporarySolution: item.hasTemporarySolution ?? false, dependsOnItemId: item.dependsOnItemId ?? null });
    setName(item.name);
    setPriceText(item.priceCents ? money.format(item.priceCents / 100) : "");
    setQuantityText(String(normalizeQuantity(item.quantity)));
    setDiscountText(
      item.discountCents > 0 ? money.format(item.discountCents / 100) : "",
    );
    setLinkDraft("");
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
    setOpenBlocks(blocksWithData(item));
    tips.closeAll();
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
  // Nome curto da loja ao lado de "Ver na loja": a loja conhecida do link ou a que a pessoa escreveu.
  const linkStore = link
    ? (knownStoreLabel(new URL(link).hostname) ?? (item.storeName?.trim() || null))
    : null;
  const tracking = item.priceTracking ?? null;
  const change = priceChange(tracking);
  const shared = members.length > 1;
  const assignee = item.assigneeId ? members.find((member) => member.id === item.assigneeId) : undefined;
  const installmentsTag = item.status === "bought" ? installmentBadge(item) : null;
  const warrantyDays = warrantyExpiringSoon(item) ? warrantyDaysLeft(item) : null;
  const showAcquisitionDetails = status === "bought" || status === "received";
  const showPurchasePlanning = status === "researching";
  const draftInstallments = Number(installmentsText) || 1;
  const draftPlan = installmentPlan({
    status,
    priceCents: draftPrice || null,
    discountCents: draftDiscount,
    installments: draftInstallments,
    installmentCents: centsOf(installmentText) || null,
  });
  const offerCount = item.offers?.length ?? 0;
  const isBlockOpen = (key: string) => Boolean(openBlocks[key]);
  const toggleBlock = (key: string) => setOpenBlocks((current) => ({ ...current, [key]: !current[key] }));
  const openBlock = (key: string) => setOpenBlocks((current) => ({ ...current, [key]: true }));
  const tipButton = (key: string, subject: string) => (
    <TipButton subject={subject} open={tips.isOpen(key)} panelId={`${id}-tip-${key}`} onToggle={() => tips.toggle(key)} />
  );
  const tipPanel = (key: string, text: string) => (
    <TipPanel id={`${id}-tip-${key}`} open={tips.isOpen(key)}>{text}</TipPanel>
  );
  const weekChoices = buyPlan
    ? weekOptions({ moveDate: buyPlan.moveDate, week: item.buyWeek ?? buyPlan.week, manual: item.buyWeek !== null })
    : [];
  // Uma linha por bloco, mostrada com o bloco fechado: o estado de cada assunto sem precisar abrir.
  const planningSummary = !buyPlan ? "" : showPurchasePlanning
    ? (weekChoices.find((option) => option.value === weekValue)?.label ?? "Semana sugerida")
    : timingDraft.leadTimeWeeks != null
      ? `Entrega em ${timingDraft.leadTimeWeeks} ${timingDraft.leadTimeWeeks === 1 ? "semana" : "semanas"}`
      : "Prazo de entrega pela estimativa";
  const paymentSummary = (() => {
    const parts = [draftInstallments > 1 ? `${draftInstallments}x` : "À vista"];
    if (paymentMethod) parts.push(PAYMENT_METHOD_LABEL[paymentMethod as PaymentMethod] ?? paymentMethod);
    if (draftInstallments > 1 && firstInstallmentMonth) parts.push(`1ª em ${shortMonth(firstInstallmentMonth)}`);
    return draftInstallments === 1 && !paymentMethod ? "À vista · pagamento não informado" : parts.join(" · ");
  })();
  const giftSummary = giftFrom.trim()
    ? `De ${clip(giftFrom.trim(), 24)}${thanked ? " · já agradecido" : ""}`
    : "Quem deu o presente";
  const trackingSummary = (centsOf(targetText) > 0 ? `Avisar abaixo de ${targetText}` : "Sem preço-alvo")
    + (alertEnabled ? "" : " · sem e-mail");
  const documentCount = item.documentCount ?? 0;
  const warrantySummary = (() => {
    const parts: string[] = [];
    const months = Number(warrantyMonthsText);
    if (months > 0) parts.push(`${months} ${months === 1 ? "mês" : "meses"} de garantia`);
    if (documentCount > 0) parts.push(`${documentCount} ${documentCount === 1 ? "arquivo" : "arquivos"}`);
    if (storeName.trim()) parts.push(clip(storeName.trim(), 24));
    return parts.length ? parts.join(" · ") : "Garantia, nota e loja";
  })();
  const storesSummary = offerCount === 0 ? "Nenhuma loja ainda" : `${offerCount} ${offerCount === 1 ? "loja" : "lojas"}`;
  const notesSummary = description.trim() ? clip(description.trim().replace(/\s+/g, " "), 44) : "Nada anotado";
  const draftWarrantyUntil =
    warrantyMonthsText && Number(warrantyMonthsText) > 0
      ? addMonths(purchasedAt || new Date().toISOString().slice(0, 10), Number(warrantyMonthsText))
      : "";
  const added =
    item.createdAt && Number.isFinite(Date.parse(item.createdAt))
      ? new Date(item.createdAt).toLocaleDateString("pt-BR")
      : null;
  // Só o botão flutuante precisa mudar de estilo. Marcar body/workspace invalidaria os estilos de toda a lista.
  useEffect(() => {
    if (!expanded) return;
    expandedItems += 1;
    const fab = toggleRef.current?.closest(".workspace-app")?.querySelector<HTMLElement>(".mobile-fab-add");
    if (fab) fab.dataset.itemExpanded = "true";
    return () => {
      expandedItems = Math.max(0, expandedItems - 1);
      if (!expandedItems && fab) delete fab.dataset.itemExpanded;
    };
  }, [expanded]);
  function toggle() {
    if (!busy) setExpanded((value) => !value);
  }
  // O cabeçalho e a barra Cancelar/Salvar são fixos: o navegador considera "visível" um campo que ficou por baixo
  // deles. Ao focar, rola só o necessário para o campo aparecer inteiro entre as duas barras.
  function keepFocusClear(event: FocusEvent<HTMLFormElement>) {
    const field = event.target as HTMLElement;
    const scroller = field.closest<HTMLElement>(".item-edit-dialog");
    const bar = event.currentTarget.querySelector<HTMLElement>(".item-inline-actions");
    const heading = scroller?.querySelector<HTMLElement>(".dialog-heading");
    if (!scroller || !bar || !heading || !field.matches("input, textarea, select, button")) return;
    const box = field.getBoundingClientRect();
    const hidden = box.bottom - bar.getBoundingClientRect().top;
    const above = heading.getBoundingClientRect().bottom - box.top;
    if (hidden > 0 && !bar.contains(field)) scroller.scrollBy({ top: hidden + 12 });
    else if (above > 0 && !heading.contains(field)) scroller.scrollBy({ top: -(above + 12) });
  }
  function close() {
    setExpanded(false);
    toggleRef.current?.focus();
  }
  // O link só vira loja no toque do "+". A primeira loja vira a principal e pode sugerir nome e preço; as outras
  // entram para comparar o preço. Links da mesma loja valem, porque cada endereço é um produto; só o mesmo endereço
  // repetido é recusado pelo servidor. No limite de lojas o campo some.
  const canAddLink = Boolean(onReplace) && offerCount < MAX_OFFERS;
  const addLink = async () => {
    if (!onReplace || importStep === 'loading') return;
    const url = safeLink(linkDraft);
    if (!url) { setImportError('Cole o endereço completo do produto, começando com https://.'); return; }
    const first = offerCount === 0;
    const ticket = ++importTicket.current;
    setImportStep('loading'); setImportError(''); setProductPreview(null);
    try {
      // A leitura deixa o preço pronto na hora; se a loja bloquear, a oferta espera a rotina de preços.
      const preview = await extractProduct(url).catch(() => null);
      const saved = await addItemOffer(item.id, preview?.url ?? url);
      if (ticket !== importTicket.current) return;
      capture("offer_added", { offers: saved.offers?.length ?? 0 });
      onReplace(saved);
      setLinkDraft("");
      // Só pergunta quando a leitura traz algo novo: outro nome ou um preço.
      const storeTitle = preview?.title?.replace(/\s+/g, ' ').trim() ?? '';
      const brlPrice = Boolean(preview && !preview.partial && preview.priceCents !== null && preview.currency?.toUpperCase() === 'BRL');
      if (first && preview && ((storeTitle && storeTitle !== name.trim()) || brlPrice)) { setProductPreview(preview); setImportStep('choose'); }
      else setImportStep('done');
    } catch (err) {
      if (ticket !== importTicket.current) return;
      setImportError(err instanceof Error ? err.message : 'Não foi possível salvar a loja. Tente de novo.');
      setImportStep('idle');
    }
  };
  const applyProduct = (useStoreName: boolean) => {
    if (!productPreview) return;
    if (useStoreName && productPreview.title?.trim()) setName(productPreview.title.replace(/\s+/g, ' ').trim().slice(0, MAX_ITEM_NAME_LENGTH));
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
    if (['loading', 'choose'].includes(importStep)) return;
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
      // O campo está num bloco que pode estar recolhido: abre e leva o foco até ele.
      openBlock("warranty");
      requestAnimationFrame(() => document.getElementById(`${id}-warranty-months`)?.focus());
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
    if (showAcquisitionDetails && (purchasedAt || null) !== (item.purchasedAt ?? null)) extras.purchasedAt = purchasedAt || null;
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
        ...timingDraft,
        name: name.trim(),
        priceCents: priceValue,
        quantity: quantityValue,
        discountCents: discountValue,
        description: description.trim(),
        categoryId,
        // Situação só vai quando mudou: salvar a ficha não é uma nova mudança de situação (nem na análise de uso).
        ...(status !== item.status ? { status } : {}),
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
      // Só quais campos mudaram, nunca os valores.
      const edited = {
        changed_name: name.trim() !== item.name,
        changed_price: priceValue !== (item.priceCents ?? null) || discountValue !== (item.discountCents ?? 0),
        changed_quantity: quantityValue !== item.quantity,
        changed_notes: description.trim() !== (item.description ?? ""),
        changed_room: categoryId !== item.categoryId,
      };
      if (Object.values(edited).some(Boolean)) capture("item_edited", edited);
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
          <StaticListIcon name="check" size={15} strokeWidth={2.5} />
        </Button></Checkbox>
        </div>
        <div className="item-content">
          {/* O botão do título cobre o card inteiro: tocar em qualquer parte abre a edição. */}
          <Button variant="brand" size="brand"
            ref={toggleRef}
            type="button"
            className="item-title-button"
            onBlur={() => setPointerFocus(false)}
            aria-label={`Abrir detalhes de ${item.name}`}
            aria-haspopup="dialog"
            aria-expanded={expanded}
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
            <span className={`item-meta-price${formattedPrice ? "" : " is-empty"}`}>
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
            {buyPlan && !item.checked && (
              <button
                type="button" onClick={() => !expanded && toggle()} aria-label={`Quando comprar ${item.name}`}
                className={`item-week-tag${buyPlan.overdue ? " is-late" : ""}${buyPlan.manual ? " is-manual" : ""}`}
                title={buyPlan.reason}
              >
                <StaticListIcon name="calendar-clock" size={12} />
                {buyPlan.overdue ? "Semana sugerida já passou" : purchaseDateLabel(buyPlan.week, buyPlan.moveDate)}
              </button>
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
            {/* Juntos: no celular, o ícone da observação não desce sozinho para outra linha. */}
            {(link || item.description) && (
              <span className="item-meta-tail">
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <ExternalLink size={10} /> Ver na loja
                    {linkStore && <span className="item-link-store">- {linkStore}</span>}
                  </a>
                )}
                {item.description && (
                  <span title={item.description}>
                    <StaticListIcon name="align-left" size={11} />
                  </span>
                )}
              </span>
            )}
            {showUpdatedAt && updatedAtLabel && (
              <span className="inline-flex items-center gap-1">
                <StaticListIcon name="clock-3" size={10} /> {updatedAtLabel}
              </span>
            )}
          </div>
          {added && !showUpdatedAt && (
            <span className="item-added">
              <span className="item-added-prefix">Adicionado em </span>
              {added}
            </span>
          )}
        </div>
        <span className="item-price">{formattedPrice || "Sem preço"}</span>
        <span className={`item-status status-${item.status}`}>
          {statusLabel(item.status)}
        </span>
        {/* Lixeira e alça ficam na lateral direita, longe do círculo de riscar; apagar sempre pede confirmação. */}
        <div className="item-actions">
          <Button variant="brand" size="brand"
            type="button"
            className="item-delete"
            aria-label={`Tirar ${item.name} da lista`}
            title="Tirar da lista"
            onClick={() => onDelete(item)}
            disabled={busy}
          >
            <StaticListIcon name="trash-2" size={17} />
          </Button>
          {dragHandle}
        </div>
      </div>
      <Dialog
        title={item.name}
        isOpen={expanded}
        onClose={close}
        busy={busy}
        className={`item-edit-dialog is-${statusFamily(status)}`}
        // Dentro da área de trabalho, o formulário herda os mesmos estilos de antes.
        container={expanded ? toggleRef.current?.closest<HTMLElement>(".workspace-app") : undefined}
      >
        <div id={`${id}-details`} className="item-inline-panel" tabIndex={-1} data-dialog-autofocus>
          <form
            onSubmit={save}
            onFocus={keepFocusClear}
            className="item-inline-form"
            aria-label={`Editar ${item.name} na lista`}
            aria-busy={busy}
          >
            <div className="item-inline-grid">
              {/* Colar o link é a ação de entrada: o servidor lê a loja e sugere nome e preço. */}
              {canAddLink && (
                <section className="item-card item-link-card" aria-label="Colar link do produto">
                  <div className="item-field">
                    <div className="item-field-head">
                      <Label htmlFor={`${id}-link`} className="item-field-label item-link-label">
                        <Link2 size={15} aria-hidden="true" />
                        {offerCount === 0 ? 'Link do produto' : 'Link de outra loja'}
                      </Label>
                      {tipButton('link', 'link do produto')}
                    </div>
                    <AddLinkInput id={`${id}-link`} type="url" inputMode="url" value={linkDraft}
                      addLabel={offerCount === 0 ? 'Adicionar link do produto' : 'Adicionar outra loja'}
                      busy={importStep === 'loading'} message={importError}
                      onChange={event => { setLinkDraft(event.target.value); setImportError(''); if (importStep === 'done') setImportStep('idle'); }}
                      onAdd={() => void addLink()}
                      placeholder="https://..." disabled={busy} />
                    {tipPanel('link', 'Cole o endereço do produto na loja. Lemos o nome e o preço e você escolhe o que usar; nada é gravado antes de salvar.')}
                  </div>
                </section>
              )}
              {importStep !== 'idle' && <div id={`${id}-import`} className="item-link-import" aria-busy={importStep === 'loading'}>
                {importStep === 'loading' && <p className="item-link-import-loading" role="status"><LoaderCircle size={18} className="animate-spin" />Buscando informações na loja…</p>}
                {importStep === 'choose' && productPreview && <>
                  <h5>Como prefere chamar este item?</h5>
                  <div className="item-link-import-preview">
                    <div><strong>{productPreview.title || 'A loja não informou um nome'}</strong>{!productPreview.partial && productPreview.currency?.toUpperCase() === 'BRL' && productPreview.priceCents !== null && <span>{money.format(productPreview.priceCents / 100)}</span>}</div>
                  </div>
                  <p>{productPreview.partial ? 'A loja limitou a leitura. Encontramos apenas uma sugestão de nome pelo endereço; confira os outros dados manualmente.' : 'O preço encontrado será preenchido. Para o nome, escolha uma das opções abaixo. Seus dados só serão gravados ao salvar as alterações.'}</p>
                  <div className="item-link-import-actions"><Button variant="brand" size="brand" type="button" className="button button-dark" disabled={!productPreview.title?.trim()} onClick={() => applyProduct(true)}>Usar nome da loja</Button><Button variant="brand" size="brand" type="button" className="button button-outline" onClick={() => applyProduct(false)}>Definir meu próprio nome</Button></div>
                  <Button variant="brand" size="brand" type="button" className="button button-outline" onClick={() => { setProductPreview(null); setImportStep('idle'); }}>Manter meus dados atuais</Button>
                </>}
                {importStep === 'done' && <p role="status">{!productPreview ? 'Loja adicionada. Compare os preços em Lojas e escolha a principal.' : productPreview.partial ? 'Nome revisado. Confira os demais dados antes de salvar.' : 'Dados preenchidos. Revise as informações e salve quando estiver tudo certo.'}</p>}
              </div>}
              <PriceOpportunityNote item={item} />

              {/* O essencial: nome, situação e ambiente; depois o preço. Tudo o mais fica em blocos que abrem sob demanda. */}
              <section className="item-card" aria-labelledby={`${id}-about`}>
                <h4 className="item-card-title" id={`${id}-about`}>Sobre o item</h4>
                <div className="item-field item-field-name">
                  <div className="item-field-head">
                    <Label htmlFor={`${id}-name`} className="item-field-label">Nome do item</Label>
                    <span
                      className={`name-counter${name.length >= MAX_ITEM_NAME_LENGTH ? " is-full" : ""}`}
                      aria-hidden="true"
                    >
                      {name.length}/{MAX_ITEM_NAME_LENGTH}
                    </span>
                  </div>
                  <Input
                    id={`${id}-name`}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    maxLength={MAX_ITEM_NAME_LENGTH}
                    disabled={busy}
                  />
                </div>
                <StatusSegmented
                  id={id}
                  value={status}
                  disabled={busy}
                  tip={tipButton('status', 'situação')}
                  onChange={(value) => {
                    setStatus(value);
                    if (!discountApplies(value)) setDiscountText("");
                    // Presente: quem acabou de marcar "Recebido" provavelmente quer dizer de quem veio.
                    if (value === "received") openBlock("gift");
                  }}
                />
                {tipPanel('status', ITEM_STATUS_META[status].hint)}
                <div className="item-field-row">
                  <div className="item-field item-field-env">
                    <div className="item-field-head">
                      <Label htmlFor={`${id}-environment`} className="item-field-label">Ambiente</Label>
                    </div>
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
                  </div>
                  <div className="item-field item-field-qty">
                    <div className="item-field-head">
                      <Label htmlFor={`${id}-quantity`} className="item-field-label">Quantidade</Label>
                      {tipButton('qty', 'quantidade')}
                    </div>
                    <QuantityStepper
                      id={`${id}-quantity`}
                      value={quantityText}
                      onChange={setQuantityText}
                      disabled={busy}
                    />
                  </div>
                  {tipPanel('qty', 'Só informa quantas unidades há. Não muda o preço.')}
                </div>
                {shared && (
                  <div className="item-field item-field-assignee">
                    <div className="item-field-head">
                      <Label htmlFor={`${id}-assignee`} className="item-field-label">Quem vai comprar</Label>
                      {tipButton('assignee', 'quem vai comprar')}
                    </div>
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
                    {tipPanel('assignee', 'Evita compra repetida. Qualquer pessoa do enxoval continua podendo editar o item.')}
                  </div>
                )}
              </section>

              <section className="item-card" aria-labelledby={`${id}-values`}>
                <h4 className="item-card-title" id={`${id}-values`}>Valores</h4>
                <div className="item-field-row">
                  <div className="item-field item-field-price">
                    <div className="item-field-head">
                      <Label htmlFor={`${id}-price`} className="item-field-label">Preço</Label>
                    </div>
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
                  </div>
                  <div className="item-field item-field-discount">
                    <div className="item-field-head">
                      <Label htmlFor={`${id}-discount`} className="item-field-label">Desconto ou cashback</Label>
                      {discountApplies(status) && tipButton('discount', 'desconto ou cashback')}
                    </div>
                    <Input
                      id={`${id}-discount`}
                      inputMode="numeric"
                      value={discountText}
                      aria-describedby={discountApplies(status) ? undefined : `${id}-discount-note`}
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
                  </div>
                  {/* Com o desconto desligado pela situação, o motivo fica à vista: é o que evita a dúvida do campo travado. */}
                  {discountApplies(status)
                    ? tipPanel('discount', 'Quanto foi abatido do preço. Aparece no resumo de descontos e cashback.')
                    : (
                      <p id={`${id}-discount-note`} className="item-field-note">
                        {status === "received"
                          ? "Item ganho: o valor cheio já vai para o resumo, sem desconto."
                          : "Esta situação não tem compra, então não há desconto."}
                      </p>
                    )}
                </div>
                {status !== "received" && (
                  <div className="item-total" aria-live="polite">
                    <div className="item-total-head">
                      <span className="item-total-label">Valor final</span>
                      {tipButton('total', 'valor final')}
                    </div>
                    <strong className="item-total-value">{draftPrice > 0 ? money.format(draftFinal / 100) : "—"}</strong>
                    {draftDiscount > 0 && (
                      <span className="item-total-note">
                        {`${money.format(draftPrice / 100)} menos ${money.format(draftDiscount / 100)} de desconto.`}
                      </span>
                    )}
                    {tipPanel('total', 'Preço menos o desconto ou cashback.')}
                  </div>
                )}
              </section>

              {buyPlan && (
                <FormBlock id={`${id}-b-planning`} title="Planejamento de compra" summary={planningSummary}
                  open={isBlockOpen('planning')} onToggle={() => toggleBlock('planning')}>
                  <div className="item-block-fields">
                    {showPurchasePlanning && (
                      <div className="item-field item-field-week"
                        title={weekValue === "auto" ? `Sugestão: ${buyPlan.reason}` : "Semana escolhida por você, contada a partir da mudança."}>
                        <div className="item-field-head">
                          <Label htmlFor={`${id}-week`} className="item-field-label">Semana para conquistar</Label>
                          {tipButton('week', 'semana para conquistar')}
                        </div>
                        <Select
                          id={`${id}-week`}
                          ariaLabel="Semana de compra"
                          value={weekValue}
                          options={weekChoices}
                          onChange={setWeekValue}
                          disabled={busy}
                        />
                        {tipPanel('week', weekValue === "auto"
                          ? `Sugestão: ${buyPlan.reason}`
                          : "Semana escolhida por você, contada a partir da mudança. Vale mais que a sugestão.")}
                      </div>
                    )}
                    <PurchaseTimingFields item={item} items={planningItems}
                      value={timingDraft} onChange={setTimingDraft} disabled={busy} showPlanningFields={showPurchasePlanning} tips />
                  </div>
                </FormBlock>
              )}

              {status !== "received" && (
                <FormBlock id={`${id}-b-payment`} title="Parcelas e pagamento" summary={paymentSummary}
                  open={isBlockOpen('payment')} onToggle={() => toggleBlock('payment')}>
                  <div className="item-block-fields">
                    <div className="item-field-row">
                      <div className="item-field item-field-installments">
                        <div className="item-field-head">
                          <Label htmlFor={`${id}-installments`} className="item-field-label">Parcelas</Label>
                        </div>
                        <Select
                          id={`${id}-installments`}
                          ariaLabel="Parcelas"
                          value={installmentsText}
                          options={INSTALLMENT_OPTIONS}
                          onChange={setInstallmentsText}
                          disabled={busy}
                        />
                      </div>
                      <div className="item-field item-field-payment">
                        <div className="item-field-head">
                          <Label htmlFor={`${id}-payment`} className="item-field-label">Meio de pagamento</Label>
                        </div>
                        <Select
                          id={`${id}-payment`}
                          ariaLabel="Meio de pagamento"
                          value={paymentMethod}
                          options={PAYMENT_OPTIONS}
                          onChange={setPaymentMethod}
                          disabled={busy}
                        />
                      </div>
                      {/* A conta das parcelas (com os juros) evita o erro de valor: fica à vista. */}
                      <p className="item-field-note">
                        {draftPlan && draftPlan.count > 1
                          ? `${draftPlan.count}x de ${money.format(draftPlan.amounts.at(-1)! / 100)}${draftPlan.interestCents > 0 ? ` · juros: ${money.format(draftPlan.interestCents / 100)}` : ""}`
                          : status === "bought"
                            ? "Entra no fluxo mensal do Planejamento."
                            : "Ajusta a previsão de parcelas do Planejamento."}
                      </p>
                    </div>
                    {draftInstallments > 1 && (
                      <div className="item-field-row">
                        <div className="item-field item-field-installment-value">
                          <div className="item-field-head">
                            <Label htmlFor={`${id}-installment-value`} className="item-field-label">Valor da parcela, se teve juros</Label>
                          </div>
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
                        </div>
                        <div className="item-field item-field-first-installment">
                          <div className="item-field-head">
                            <Label htmlFor={`${id}-first-installment`} className="item-field-label">Primeira parcela</Label>
                            {tipButton('first', 'primeira parcela')}
                          </div>
                          <Input
                            id={`${id}-first-installment`}
                            type="month"
                            value={firstInstallmentMonth}
                            onChange={(event) => setFirstInstallmentMonth(event.target.value)}
                            disabled={busy}
                          />
                        </div>
                        {tipPanel('first', status === "bought" ? "Em branco: o mês da compra." : "Em branco: o mês da semana planejada.")}
                      </div>
                    )}
                  </div>
                </FormBlock>
              )}

              {status === "received" && (
                <FormBlock id={`${id}-b-gift`} title="Presente" summary={giftSummary}
                  open={isBlockOpen('gift')} onToggle={() => toggleBlock('gift')}>
                  <div className="item-block-fields">
                    <div className="item-field item-field-gift-from">
                      <div className="item-field-head">
                        <Label htmlFor={`${id}-gift-from`} className="item-field-label">De quem foi o presente?</Label>
                      </div>
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
                    </div>
                    <div className="item-field item-field-gift-message">
                      <div className="item-field-head">
                        <Label htmlFor={`${id}-gift-message`} className="item-field-label">Recado que veio com o presente</Label>
                      </div>
                      <Textarea
                        id={`${id}-gift-message`}
                        value={giftMessage}
                        maxLength={500}
                        rows={2}
                        onChange={(event) => setGiftMessage(event.target.value)}
                        disabled={busy}
                      />
                    </div>
                    <Label htmlFor={`${id}-thanked`} className="item-inline-check item-field-thanked">
                      <Checkbox
                        id={`${id}-thanked`}
                        checked={thanked}
                        onCheckedChange={(checked) => setThanked(checked === true)}
                        disabled={busy}
                      />
                      <span>Já agradeci</span>
                    </Label>
                  </div>
                </FormBlock>
              )}

              {tracking && (
                <FormBlock id={`${id}-b-tracking`} title="Acompanhar preço" summary={trackingSummary}
                  open={isBlockOpen('tracking')} onToggle={() => toggleBlock('tracking')}>
                  <div className="item-block-fields">
                    <div className="item-field item-field-target">
                      <div className="item-field-head">
                        <Label htmlFor={`${id}-target`} className="item-field-label">Me avise se cair abaixo de</Label>
                      </div>
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
                    </div>
                    <Label htmlFor={`${id}-alert`} className="item-inline-check item-field-alert">
                      <Checkbox
                        id={`${id}-alert`}
                        checked={alertEnabled}
                        onCheckedChange={checked => setAlertEnabled(checked === true)}
                        disabled={busy}
                      />
                      <span>Avisar por e-mail quando o preço cair</span>
                    </Label>
                  </div>
                </FormBlock>
              )}

              {showAcquisitionDetails && (
                <FormBlock id={`${id}-b-warranty`} title="Garantia e nota fiscal" summary={warrantySummary}
                  open={isBlockOpen('warranty')} onToggle={() => toggleBlock('warranty')}>
                  <div className="item-block-fields">
                    <div className="item-field-row">
                      <div className="item-field item-field-purchased">
                        <div className="item-field-head">
                          <Label htmlFor={`${id}-purchased`} className="item-field-label">Data da compra</Label>
                        </div>
                        <Input
                          id={`${id}-purchased`}
                          type="date"
                          value={purchasedAt}
                          max={new Date().toISOString().slice(0, 10)}
                          onChange={(event) => setPurchasedAt(event.target.value)}
                          disabled={busy}
                        />
                      </div>
                      <div className="item-field item-field-warranty">
                        <div className="item-field-head">
                          <Label htmlFor={`${id}-warranty-months`} className="item-field-label">Garantia (meses)</Label>
                          {tipButton('warranty', 'garantia')}
                        </div>
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
                      </div>
                      {tipPanel('warranty', 'Do fabricante mais a estendida, se houver. Avisamos 30 e 7 dias antes de vencer.')}
                    </div>
                    <div className="item-field item-field-warranty-until">
                      <div className="item-field-head">
                        <Label htmlFor={`${id}-warranty-until`} className="item-field-label">Garantia até</Label>
                      </div>
                      <Input
                        id={`${id}-warranty-until`}
                        type="date"
                        value={warrantyUntil || draftWarrantyUntil}
                        onChange={(event) => setWarrantyUntil(event.target.value)}
                        disabled={busy}
                      />
                      {warrantyMonthsText && (warrantyUntil || draftWarrantyUntil) && (
                        <span className="item-field-note">
                          {`${warrantyMonthsText} ${Number(warrantyMonthsText) === 1 ? "mês" : "meses"}, até ${brDate(warrantyUntil || draftWarrantyUntil)}`}
                        </span>
                      )}
                    </div>
                    <div className="item-field item-field-store">
                      <div className="item-field-head">
                        <Label htmlFor={`${id}-store`} className="item-field-label">Onde foi comprado</Label>
                      </div>
                      <Input
                        id={`${id}-store`}
                        value={storeName}
                        maxLength={80}
                        placeholder={tracking ? `Ex.: ${tracking.domain}` : "Ex.: Loja do bairro"}
                        onChange={(event) => setStoreName(event.target.value)}
                        disabled={busy}
                      />
                    </div>
                    {onReplace && <ItemDocumentsSection item={item} disabled={busy} onReplace={onReplace} onReceiptApply={fields => {
                      if (fields.storeName) setStoreName(fields.storeName);
                      if (fields.purchasedAt && status === 'bought') setPurchasedAt(fields.purchasedAt);
                      if (fields.priceCents !== undefined) setPriceText(money.format(fields.priceCents / 100));
                    }} />}
                  </div>
                </FormBlock>
              )}

              {onReplace && (
                <FormBlock id={`${id}-b-stores`} title="Links e lojas" summary={storesSummary}
                  open={isBlockOpen('stores')} onToggle={() => toggleBlock('stores')}>
                  <ItemOffersSection item={item} disabled={busy} onReplace={onReplace} />
                </FormBlock>
              )}

              <FormBlock id={`${id}-b-notes`} title="Observações" summary={notesSummary}
                open={isBlockOpen('notes')} onToggle={() => toggleBlock('notes')}>
                <div className="item-field item-field-notes">
                  <div className="item-field-head">
                    <Label htmlFor={`${id}-description`} className="item-field-label">Observações</Label>
                  </div>
                  <Textarea
                    id={`${id}-description`}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                    disabled={busy}
                  />
                </div>
              </FormBlock>

              {/* Tirar da lista é destrutivo: mora no fim, longe de Cancelar e Salvar. */}
              <div className="item-inline-footnote">
                <p className="item-inline-note">
                  {added ? `Adicionado em ${added}.` : "Data de adição indisponível para este item antigo."}
                </p>
                <Button variant="brand" size="brand"
                  className="item-remove-button"
                  type="button"
                  onClick={() => onDelete(item)}
                  disabled={busy}
                >
                  <Trash2 size={16} aria-hidden="true" /> Tirar da lista
                </Button>
              </div>
            </div>
            <div className="item-inline-actions">
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              <div className="item-inline-actions-buttons">
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
            </div>
          </form>
        </div>
      </Dialog>
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
}, sameRowProps);
