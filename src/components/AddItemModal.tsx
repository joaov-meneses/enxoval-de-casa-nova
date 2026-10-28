import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Sparkles, LoaderCircle, PackageCheck, PackageX, X } from "@/src/components/icons";
import type {
  CatalogSearchResult,
  EnxovalCategory,
  EnxovalItem,
  EnxovalMember,
  ItemExtrasInput,
  ItemStatus,
  PaymentMethod,
  ItemTrackingInput,
  ItemAssessment,
  PriceBasis,
  ScrapedProductPreview,
} from "../types";
import { assessItemDraft, extractProduct, searchCatalog } from "../api";
import { categoryForRoom } from "../catalog/rooms";
import { storeLabel } from "../priceTracking";
import {
  DEFAULT_ITEM_STATUS,
  discountApplies,
  ITEM_STATUSES,
  ITEM_STATUS_META,
} from "../itemStatus";
import { MAX_ENVIRONMENT_NAME_LENGTH, normalizeEnvironmentName, sanitizeEnvironmentNameInput } from "../data";
import { DEFAULT_ITEM_QUANTITY, MAX_ITEM_QUANTITY } from "../itemQuantity";
import { MAX_ITEM_NAME_LENGTH } from "../data";
import { MAX_INSTALLMENTS, PAYMENT_METHOD_LABEL } from "../planning/installments";
import { Dialog } from "./Dialog";
import { QuantityStepper } from "./QuantityStepper";
import { Select } from "./Select";

const NEW_CATEGORY_VALUE = "__new_category__";
const PAYMENT_OPTIONS = [
  { value: "", label: "Não informado" },
  ...(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((value) => ({ value, label: PAYMENT_METHOD_LABEL[value] })),
];
const INSTALLMENT_OPTIONS = Array.from({ length: MAX_INSTALLMENTS }, (_, index) => ({
  value: String(index + 1),
  label: index === 0 ? "À vista" : `${index + 1}x`,
}));
const FIELD_CLASS =
  "w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood";
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (
    name: string,
    categoryId?: string,
    categoryName?: string,
    details?: Pick<
      EnxovalItem,
      "priceCents" | "quantity" | "discountCents" | "link" | "description" | "status"
    > &
      ItemTrackingInput &
      ItemExtrasInput,
  ) => Promise<void> | void;
  defaultCategoryId: string;
  categories: EnxovalCategory[];
  /** Quem participa do enxoval: "Quem vai comprar" só aparece com mais de uma pessoa. */
  members?: EnxovalMember[];
  currentUserId?: string;
  /** Enxoval em que o item será criado; com ele (e o Jev ligado) o Nino ajuda a escolher o ambiente e avisa de repetições. */
  enxovalId?: string;
}

/** Quanto tempo a pessoa precisa parar de digitar o nome para o Nino analisar o item. */
const NINO_DELAY_MS = 1000;
const NINO_MIN_NAME_LENGTH = 3;
/** Espera curta entre teclas antes de buscar no catálogo (a busca é local no servidor, sem IA). */
const SUGGEST_DELAY_MS = 150;
const SUGGEST_MIN_LENGTH = 2;

/** Texto que parece o endereço de um site (com ou sem "https://"), sem espaços. */
function looksLikeUrl(text: string) {
  return /^(https?:\/\/)?[^\s/.]+(\.[^\s/.]+)+(\/\S*)?$/i.test(text.trim());
}

/** O nome do item cabe em poucos caracteres: corta o título da loja no fim de uma palavra. */
function shortenName(title: string, max = MAX_ITEM_NAME_LENGTH) {
  const text = title.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace >= 12 ? cut.slice(0, lastSpace) : cut;
  return base.replace(/[\s,;:|\-–—(/]+$/, "");
}

const plain = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const CATEGORY_HINTS: Record<string, string[]> = {
  Cozinha: ["cozinha"],
  Quarto: ["quarto", "suite"],
  Banheiro: ["banheiro", "lavabo"],
  Sala: ["sala", "estar"],
  "Área de Serviço": ["servico", "lavanderia"],
};

/** Ambiente do enxoval que combina com a sugestão da loja (ex.: "Cozinha" -> "Cozinha"), se houver. */
function matchCategory(categories: EnxovalCategory[], suggestion?: string) {
  const hints = suggestion ? CATEGORY_HINTS[suggestion] : undefined;
  if (!hints) return undefined;
  return categories.find((category) =>
    hints.some((hint) => plain(category.name).includes(hint)),
  )?.id;
}

const moneyText = (cents: number) => money.format(cents / 100);

export function AddItemModal({
  isOpen,
  onClose,
  onAdd,
  defaultCategoryId,
  categories,
  members = [],
  currentUserId,
  enxovalId,
}: AddItemModalProps) {
  const [installmentsText, setInstallmentsText] = useState("1");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [purchasedAt, setPurchasedAt] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [warrantyMonthsText, setWarrantyMonthsText] = useState("");
  const [storeName, setStoreName] = useState("");
  const [giftFrom, setGiftFrom] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [priceText, setPriceText] = useState("");
  const [discountText, setDiscountText] = useState("");
  const [quantityText, setQuantityText] = useState(String(DEFAULT_ITEM_QUANTITY));
  const [link, setLink] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ItemStatus>(DEFAULT_ITEM_STATUS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [error, setError] = useState("");
  // Importação por link: a leitura é só uma ajuda; falhar não impede preencher tudo à mão.
  const [importUrl, setImportUrl] = useState("");
  // "partial": a loja barrou a leitura; só o nome (tirado do link) foi preenchido.
  const [importStatus, setImportStatus] = useState<"idle" | "loading" | "done" | "partial" | "error">("idle");
  const [importError, setImportError] = useState("");
  const [preview, setPreview] = useState<ScrapedProductPreview | null>(null);
  const [priceBasis, setPriceBasis] = useState<PriceBasis>("regular");
  const [voltage, setVoltage] = useState("");
  const [color, setColor] = useState("");
  const [targetText, setTargetText] = useState("");
  // Só preenche sozinho o que a pessoa ainda não mexeu.
  const autoName = useRef("");
  const autoPrice = useRef("");
  const categoryTouched = useRef(false);
  const importTicket = useRef(0);
  // Último endereço já lido, para o campo "Link do produto" não buscar a mesma loja de novo ao perder o foco.
  const lastImportedUrl = useRef("");
  // Nino: o catálogo mestre responde sozinho para itens conhecidos e o Jev (quando o servidor tem a chave) cuida do
  // resto. A análise é uma ajuda, nunca bloqueia o formulário.
  const [ninoTip, setNinoTip] = useState<{
    redundancy: ItemAssessment["redundancy"];
    environmentName: string | null;
    catalogItem: ItemAssessment["catalogItem"];
  } | null>(null);
  const lastAssessedName = useRef("");
  // Autocomplete do catálogo: só aparece enquanto a pessoa digita, e nunca para um nome que veio de um link.
  const [suggestions, setSuggestions] = useState<CatalogSearchResult[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [pickedItem, setPickedItem] = useState<CatalogSearchResult | null>(null);
  const nameTyped = useRef(false);

  useEffect(() => {
    const query = name.trim();
    if (!isOpen || !nameTyped.current || query.length < SUGGEST_MIN_LENGTH) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const { results } = await searchCatalog(query, controller.signal);
        if (controller.signal.aborted) return;
        // Só o próprio texto digitado não é sugestão.
        const useful = results.filter((result) => plain(result.name) !== plain(query));
        setSuggestions(useful);
        setActiveSuggestion(-1);
        setSuggestionsOpen(useful.length > 0);
      } catch {
        // Sem sugestões o campo continua igual.
      }
    }, SUGGEST_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [name, isOpen]);

  const pickSuggestion = (result: CatalogSearchResult) => {
    nameTyped.current = false;
    setName(result.name.slice(0, MAX_ITEM_NAME_LENGTH));
    setPickedItem(result);
    setSuggestions([]);
    setSuggestionsOpen(false);
    if (!categoryTouched.current) {
      const category = categoryForRoom(categories, result.room);
      if (category) setCategoryId(category.id);
    }
  };

  const handleNameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestionsOpen || suggestions.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveSuggestion((current) => (current + step + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" && activeSuggestion >= 0) {
      event.preventDefault();
      pickSuggestion(suggestions[activeSuggestion]);
    } else if (event.key === "Escape") {
      // Fecha só a lista, e não o diálogo inteiro.
      event.preventDefault();
      event.stopPropagation();
      setSuggestionsOpen(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !enxovalId) return;
    const draft = name.trim();
    if (draft.length < NINO_MIN_NAME_LENGTH) {
      lastAssessedName.current = "";
      setNinoTip(null);
      return;
    }
    if (draft === lastAssessedName.current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const result = await assessItemDraft(
          {
            enxovalId,
            name: draft,
            // Só sugere o ambiente enquanto a pessoa não escolheu um.
            classify: !categoryTouched.current && categories.length >= 2,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        lastAssessedName.current = draft;
        let environmentName: string | null = null;
        if (result.environment && !categoryTouched.current) {
          setCategoryId(result.environment.id);
          environmentName = result.environment.name;
        }
        setNinoTip({ redundancy: result.redundancy, environmentName, catalogItem: result.catalogItem ?? null });
      } catch {
        // Sem a ajuda do Nino o formulário continua igual.
      }
    }, NINO_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [name, isOpen, enxovalId, categories.length]);

  useEffect(() => {
    if (!isOpen) return;
    lastAssessedName.current = "";
    setNinoTip(null);
    nameTyped.current = false;
    setSuggestions([]);
    setSuggestionsOpen(false);
    setPickedItem(null);
    importTicket.current += 1;
    lastImportedUrl.current = "";
    setImportUrl("");
    setImportStatus("idle");
    setImportError("");
    setPreview(null);
    setPriceBasis("regular");
    setVoltage("");
    setColor("");
    setTargetText("");
    autoName.current = "";
    autoPrice.current = "";
    categoryTouched.current = false;
    setCategoryId(defaultCategoryId || categories[0]?.id || NEW_CATEGORY_VALUE);
    setNewCategoryName("");
    setName("");
    setPriceText("");
    setDiscountText("");
    setQuantityText(String(DEFAULT_ITEM_QUANTITY));
    setLink("");
    setDescription("");
    setStatus(DEFAULT_ITEM_STATUS);
    setInstallmentsText("1");
    setPaymentMethod("");
    setPurchasedAt("");
    setAssigneeId("");
    setWarrantyMonthsText("");
    setStoreName("");
    setGiftFrom("");
    setError("");
    setLinkOpen(false);
    setMoreOpen(false);
  }, [categories, defaultCategoryId, isOpen]);

  const draftPrice = Number(priceText.replace(/\D/g, "")) || 0;
  const draftDiscount = discountApplies(status)
    ? Math.min(Number(discountText.replace(/\D/g, "")) || 0, draftPrice)
    : 0;
  const draftFinal = draftPrice - draftDiscount;
  // Faixa nacional estimada do item, baseada em lojas ou em clientes distintos; nunca vira preço preenchido.
  const priceRange =
    (pickedItem && plain(pickedItem.name) === plain(name.trim()) ? pickedItem.priceRange : null) ??
    ninoTip?.catalogItem?.priceRange ??
    null;

  const applyPreview = (data: ScrapedProductPreview) => {
    setPreview(data);
    setPriceBasis("regular");
    setColor("");
    setVoltage(data.variations?.voltage?.length === 1 ? data.variations.voltage[0] : "");

    const shortName = shortenName(data.title);
    if (shortName && (!name.trim() || name === autoName.current)) {
      setName(shortName);
      autoName.current = shortName;
    }
    if (data.priceCents && (!priceText || priceText === autoPrice.current)) {
      autoPrice.current = moneyText(data.priceCents);
      setPriceText(autoPrice.current);
    }
    if (!link.trim()) setLink(data.url);
    if (!description.trim() && data.title.length > MAX_ITEM_NAME_LENGTH) setDescription(data.title);
    if (!categoryTouched.current) {
      // O cômodo do catálogo vale mais que a regra de palavras do título; ela fica como reserva.
      const suggested = categoryForRoom(categories, data.suggestedRoom)?.id ?? matchCategory(categories, data.suggestedCategory);
      if (suggested) setCategoryId(suggested);
    }
  };

  const runImport = async (rawUrl: string) => {
    const url = rawUrl.trim();
    if (!url || !looksLikeUrl(url)) {
      setImportStatus("error");
      setImportError("Cole o endereço completo de um produto, por exemplo https://loja.com.br/produto.");
      return;
    }
    const ticket = ++importTicket.current;
    lastImportedUrl.current = url;
    setImportUrl(url);
    // O link já vale para o item mesmo que a loja barre a leitura do produto.
    if (!link.trim()) setLink(url);
    setImportStatus("loading");
    setImportError("");
    try {
      const data = await extractProduct(url);
      if (ticket !== importTicket.current) return;
      applyPreview(data);
      setImportStatus(data.partial ? "partial" : "done");
    } catch (err) {
      if (ticket !== importTicket.current) return;
      setPreview(null);
      setImportStatus("error");
      setImportError(
        err instanceof Error
          ? `${err.message} Você pode preencher os campos abaixo manualmente.`
          : "Não foi possível ler esse link. Preencha os campos abaixo manualmente.",
      );
    }
  };

  /** Busca o produto a partir do campo "Link do produto", se for um endereço novo. */
  const importFromLinkField = (rawUrl: string) => {
    const url = rawUrl.trim();
    if (!looksLikeUrl(url) || url === lastImportedUrl.current || importStatus === "loading") return;
    void runImport(url);
  };

  const clearImport = () => {
    importTicket.current += 1;
    lastImportedUrl.current = "";
    setImportUrl("");
    setImportStatus("idle");
    setImportError("");
    setPreview(null);
    setVoltage("");
    setColor("");
    setTargetText("");
    setPriceBasis("regular");
  };

  const choosePriceBasis = (basis: PriceBasis) => {
    if (!preview) return;
    const cents = basis === "pix" ? preview.pixPriceCents : preview.priceCents;
    if (!cents) return;
    setPriceBasis(basis);
    autoPrice.current = moneyText(cents);
    setPriceText(autoPrice.current);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    const trimmedCategoryName = normalizeEnvironmentName(newCategoryName);

    const digits = priceText.replace(/\D/g, "");

    if (!trimmedName) return;
    if (categoryId === NEW_CATEGORY_VALUE && !trimmedCategoryName) {
      setError("Informe o nome do novo ambiente.");
      return;
    }

    const priceValue = digits && Number(digits) > 0 ? Number(digits) : null;
    const discountValue = discountApplies(status)
      ? Number(discountText.replace(/\D/g, "")) || 0
      : 0;
    const quantityValue = Number(quantityText.replace(/\D/g, ""));
    if (!Number.isInteger(quantityValue) || quantityValue < 1 || quantityValue > MAX_ITEM_QUANTITY) {
      setError(`A quantidade deve ser um número de 1 a ${MAX_ITEM_QUANTITY}.`);
      return;
    }
    if (discountValue > 0 && !priceValue) {
      setError("Informe o preço do item antes do desconto ou cashback.");
      return;
    }
    if (priceValue !== null && discountValue > priceValue) {
      setError("O desconto ou cashback não pode ser maior que o preço do item.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    const installments = Number(installmentsText) || 1;
    const warrantyMonths = Number(warrantyMonthsText) || null;
    const todayBr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const extras: ItemExtrasInput = {
      installments: installments > 1 ? installments : undefined,
      ...(status === "bought"
        ? {
            purchasedAt: purchasedAt || todayBr,
            paymentMethod: (paymentMethod || null) as PaymentMethod | null,
          }
        : {}),
      warrantyMonths: warrantyMonths ?? undefined,
      storeName: storeName.trim() || undefined,
      ...(status === "received" && giftFrom.trim() ? { giftFrom: giftFrom.trim() } : {}),
      ...(members.length > 1 && assigneeId ? { assigneeId } : {}),
    };
    // Só manda o que a pessoa preencheu; o resto continua com o padrão do servidor.
    if (extras.paymentMethod === null) delete extras.paymentMethod;

    try {
      await onAdd(
        trimmedName,
        categoryId === NEW_CATEGORY_VALUE ? undefined : categoryId,
        categoryId === NEW_CATEGORY_VALUE ? trimmedCategoryName : undefined,
        {
          priceCents: priceValue,
          quantity: quantityValue,
          discountCents: discountValue,
          link: link.trim(),
          description: description.trim(),
          status,
          ...extras,
          ...(preview && importStatus === "done"
            ? {
                trackedProductUrl: preview.url,
                // O preço de referência é o da loja no tipo escolhido (normal ou Pix), não o texto do campo.
                initialPriceCents:
                  (priceBasis === "pix" ? preview.pixPriceCents : preview.priceCents) ?? priceValue,
                targetPriceCents: Number(targetText.replace(/\D/g, "")) || null,
                selectedVariation: [voltage, color].filter(Boolean).join(" · ") || null,
                priceBasis,
              }
            : {}),
        },
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível adicionar o item.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      title="Novo item"
      isOpen={isOpen}
      onClose={onClose}
      busy={isSubmitting}
      className="add-item-dialog"
    >
      <form onSubmit={handleSubmit} className="add-item-form">
        <div className="add-item-form-body">


        <div>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <Label htmlFor="new-item-name" className="block text-sm font-medium text-stone-700">
              Nome do produto
            </Label>
            <span className={`name-counter${name.length >= MAX_ITEM_NAME_LENGTH ? " is-full" : ""}`} aria-hidden="true">
              {name.length}/{MAX_ITEM_NAME_LENGTH}
            </span>
          </div>
          <div className="relative">
            <Input
              type="text"
              id="new-item-name"
              data-dialog-autofocus
              required
              maxLength={MAX_ITEM_NAME_LENGTH}
              value={name}
              onChange={(e) => {
                nameTyped.current = true;
                setName(e.target.value);
              }}
              onKeyDown={handleNameKeyDown}
              onBlur={() => setSuggestionsOpen(false)}
              placeholder="Ex: Jogo de Taças"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={suggestionsOpen}
              aria-controls="new-item-suggestions"
              aria-activedescendant={activeSuggestion >= 0 ? `new-item-suggestion-${activeSuggestion}` : undefined}
              autoComplete="off"
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
            />
            {suggestionsOpen && suggestions.length > 0 && (
              <ul
                id="new-item-suggestions"
                role="listbox"
                aria-label="Itens do catálogo"
                className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
              >
                {suggestions.map((result, index) => (
                  <li
                    key={result.id}
                    id={`new-item-suggestion-${index}`}
                    role="option"
                    aria-selected={index === activeSuggestion}
                    // mousedown, e não click: o campo perderia o foco (e a lista fecharia) antes do clique.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      pickSuggestion(result);
                    }}
                    className={`flex cursor-pointer items-baseline justify-between gap-3 px-4 py-2 text-sm ${index === activeSuggestion ? "bg-stone-100" : "hover:bg-stone-50"}`}
                  >
                    <span className="text-stone-800">{result.name}</span>
                    {result.priceRange && (
                      <span className="shrink-0 text-xs text-stone-500">
                        ~{moneyText(result.priceRange.p50)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {ninoTip?.redundancy && (
            <p
              role="status"
              className="nino-tip mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-sm leading-snug"
            >
              <Sparkles size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                <strong className="font-semibold">Nino:</strong>{" "}
                {ninoTip.redundancy.overlapsWith ? (
                  <>
                    você já tem <b>{ninoTip.redundancy.overlapsWith}</b> na lista. Este item
                    pode fazer o mesmo trabalho, e dá para economizar.
                  </>
                ) : (
                  <>este item parece repetir algo que você já tem. Vale conferir a lista antes de comprar.</>
                )}
              </span>
            </p>
          )}
        </div>

        <div className="add-item-row grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="new-item-category" className="block text-sm font-medium text-stone-700 mb-1">
              Ambiente
            </Label>
            <Select
              id="new-item-category"
              value={categoryId}
              onChange={(value) => {
                categoryTouched.current = true;
                setCategoryId(value);
              }}
              disabled={isSubmitting}
              options={[
                ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
                { value: NEW_CATEGORY_VALUE, label: "+ Novo ambiente" },
              ]}
            />
            {ninoTip?.environmentName && !categoryTouched.current && (
              <p className="mt-1 flex items-center gap-1 text-xs text-stone-500">
                <Sparkles size={12} aria-hidden="true" /> Ambiente sugerido pelo Nino
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="new-item-status" className="block text-sm font-medium text-stone-700 mb-1">
              Situação
            </Label>
            <Select
              id="new-item-status"
              value={status}
              onChange={(value) => {
                setStatus(value as ItemStatus);
                if (!discountApplies(value as ItemStatus)) setDiscountText("");
              }}
              disabled={isSubmitting}
              options={ITEM_STATUSES.map((value) => ({
                value,
                label: ITEM_STATUS_META[value].label,
              }))}
            />
            <p className="mt-1 text-xs text-stone-500">
              {ITEM_STATUS_META[status].hint}
            </p>
          </div>
        </div>

        {categoryId === NEW_CATEGORY_VALUE && (
          <div>
            <Label htmlFor="new-item-category-name" className="block text-sm font-medium text-stone-700 mb-1">
              Nome do ambiente
            </Label>
            <Input
              id="new-item-category-name"
              required
              maxLength={MAX_ENVIRONMENT_NAME_LENGTH}
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(sanitizeEnvironmentNameInput(e.target.value))}
              aria-describedby="new-item-category-name-count"
              placeholder="Ex: Escritório"
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
            />
            <span
              id="new-item-category-name-count"
              className={`env-name-counter${newCategoryName.length >= MAX_ENVIRONMENT_NAME_LENGTH ? " is-full" : ""}`}
            >
              {newCategoryName.length}/{MAX_ENVIRONMENT_NAME_LENGTH} caracteres
            </span>
          </div>
        )}

        <div className="add-item-row grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="new-item-price" className="block text-sm font-medium text-stone-700 mb-1">
              Preço
            </Label>
            <Input
              id="new-item-price"
              type="text"
              inputMode="numeric"
              value={priceText}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
                setPriceText(digits ? money.format(Number(digits) / 100) : "");
              }}
              placeholder="R$ 0,00"
              disabled={isSubmitting}
              aria-describedby={priceRange ? "new-item-price-range" : undefined}
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
            />
            {priceRange && (
              <p id="new-item-price-range" className="mt-1 text-xs text-stone-500">
                Faixa estimada nacional: {moneyText(priceRange.p10)} a {moneyText(priceRange.p90)}.
                {priceRange.meanCents != null && <> Média: {moneyText(priceRange.meanCents)}.</>}
                {" "}{priceRange.samples} {priceRange.source === 'serpapi' ? 'lojas pesquisadas' : 'clientes'}.
                {priceRange.samples < 5 && <> Amostra inicial.</>}
                {draftPrice > priceRange.p90 && (
                  <span className="price-above-hint block font-medium">Este preço está acima da faixa estimada.</span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* O link é um atalho opcional: fica recolhido para o formulário começar pelo nome. */}
        {!linkOpen ? (
          <Button variant="brand" size="brand"
            type="button"
            className="add-item-disclosure"
            aria-expanded={false}
            aria-controls="add-item-import"
            onClick={() => {
              setLinkOpen(true);
              requestAnimationFrame(() => document.getElementById("import-link-url")?.focus());
            }}
          >
            <Sparkles size={16} aria-hidden="true" />
            Tem o link da loja? Preencher pelo link
          </Button>
        ) : (
        <section
          aria-labelledby="import-link-title"
          id="add-item-import"
          className="add-item-import rounded-2xl border border-brand-wood/20 bg-brand-wood/5 p-3.5 space-y-3"
        >
          <div>
            <h3 id="import-link-title" className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
              <Sparkles size={15} aria-hidden="true" /> Importar por link
            </h3>
            <p id="import-link-hint" className="mt-0.5 text-xs text-stone-500">
              Cole o link de um produto (Mercado Livre, Amazon, Magalu...) e a gente preenche nome e preço. Depois acompanhamos se ele ficou mais barato.
            </p>
          </div>
          <div className="flex gap-2">
            <Input
              id="import-link-url"
              type="text"
              inputMode="url"
              autoComplete="off"
              aria-label="Link do produto para importar"
              aria-describedby="import-link-hint"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text").trim();
                if (!looksLikeUrl(pasted)) return;
                e.preventDefault();
                setImportUrl(pasted);
                void runImport(pasted);
              }}
              onKeyDown={(e) => {
                // Enter aqui busca o produto em vez de enviar o formulário inteiro.
                if (e.key !== "Enter") return;
                e.preventDefault();
                void runImport(importUrl);
              }}
              placeholder="https://..."
              disabled={isSubmitting}
              className="min-w-0 flex-1 px-3.5 py-2.5 text-base border border-stone-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
            />
            <Button variant="brand" size="brand"
              type="button"
              onClick={() => void runImport(importUrl)}
              disabled={!importUrl.trim() || importStatus === "loading" || isSubmitting}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-dark px-3.5 py-2.5 text-sm font-medium text-white hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importStatus === "loading" ? (
                <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles size={16} aria-hidden="true" />
              )}
              <span>Buscar<span className="hidden sm:inline"> informações</span></span>
            </Button>
          </div>

          <div aria-live="polite">
            {importStatus === "loading" && (
              <div className="flex gap-3 rounded-xl border border-stone-200 bg-white p-3" role="status" aria-label="Buscando informações do produto">
                <div className="h-16 w-16 shrink-0 animate-pulse rounded-lg bg-stone-200" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3 w-4/5 animate-pulse rounded bg-stone-200" />
                  <div className="h-3 w-3/5 animate-pulse rounded bg-stone-200" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-stone-200" />
                </div>
              </div>
            )}
            {importStatus === "error" && (
              <p role="alert" className="form-error">
                {importError}
              </p>
            )}
            {importStatus === "partial" && preview && (
              <div role="status" className="nino-tip flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
                <p className="min-w-0 flex-1">
                  Essa loja não deixou ler o preço. Preenchemos o nome pelo link: confira o nome e informe o preço abaixo.
                </p>
                <Button variant="brand" size="brand"
                  type="button"
                  onClick={clearImport}
                  aria-label="Remover importação"
                  title="Remover importação"
                  className="nino-tip-close grid h-11 w-11 -my-2 -mr-2 shrink-0 place-items-center rounded-md"
                >
                  <X size={14} aria-hidden="true" />
                </Button>
              </div>
            )}
            {importStatus === "done" && preview && (
              <div className="rounded-xl border border-stone-200 bg-white p-3">
                <div className="flex gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-xs font-semibold text-stone-700">
                        {storeLabel(preview.domain)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold ${preview.inStock ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}
                      >
                        {preview.inStock ? <PackageCheck size={11} aria-hidden="true" /> : <PackageX size={11} aria-hidden="true" />}
                        {preview.inStock ? "Em estoque" : "Indisponível"}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm font-medium text-stone-800">{preview.title}</p>
                    <p className="mt-0.5 text-sm text-stone-600">
                      {preview.priceCents ? moneyText(preview.priceCents) : "Preço não encontrado"}
                      {preview.pixPriceCents ? ` · ${moneyText(preview.pixPriceCents)} no Pix` : ""}
                    </p>
                  </div>
                  <Button variant="brand" size="brand"
                    type="button"
                    onClick={clearImport}
                    aria-label="Remover importação"
                    title="Remover importação"
                    className="h-8 w-8 shrink-0 grid place-items-center rounded-lg text-stone-500 hover:bg-stone-100"
                  >
                    <X size={16} aria-hidden="true" />
                  </Button>
                </div>

                {preview.pixPriceCents && preview.priceCents ? (
                  <div className="mt-3">
                    <span id="import-price-basis" className="block text-xs font-medium text-stone-600 mb-1">
                      Qual preço usar?
                    </span>
                    <RadioGroup value={priceBasis} onValueChange={value => setPriceBasis(value as PriceBasis)} aria-labelledby="import-price-basis" className="grid grid-cols-2 gap-1.5">
                      {([
                        ["regular", "Normal", preview.priceCents],
                        ["pix", "No Pix", preview.pixPriceCents],
                      ] as const).map(([value, label, cents]) => (
                        <RadioGroupItem key={value} value={value} asChild><Button variant="brand" size="brand"
                          key={value}
                          type="button"
                          className={`rounded-lg border px-2 py-2 text-sm transition-colors ${priceBasis === value ? "border-brand-dark bg-brand-dark text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"}`}
                        >
                          {label} · {moneyText(cents)}
                        </Button></RadioGroupItem>
                      ))}
                    </RadioGroup>
                  </div>
                ) : null}

                {preview.variations?.voltage?.length ? (
                  <div className="mt-3">
                    <span id="import-voltage" className="block text-xs font-medium text-stone-600 mb-1">Voltagem</span>
                    <RadioGroup value={voltage} onValueChange={value => setVoltage(value)} aria-labelledby="import-voltage" className="flex flex-wrap gap-1.5">
                      {preview.variations.voltage.map((option) => (
                        <RadioGroupItem key={option} value={option} asChild><Button variant="brand" size="brand"
                          key={option}
                          type="button"
                          className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${voltage === option ? "border-brand-dark bg-brand-dark text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"}`}
                        >
                          {option}
                        </Button></RadioGroupItem>
                      ))}
                    </RadioGroup>
                  </div>
                ) : null}

                {preview.variations?.colors?.length ? (
                  <div className="mt-3">
                    <span id="import-color" className="block text-xs font-medium text-stone-600 mb-1">Cor</span>
                    <RadioGroup value={color} onValueChange={value => setColor(value)} aria-labelledby="import-color" className="flex flex-wrap gap-1.5">
                      {preview.variations.colors.map((option) => (
                        <RadioGroupItem key={option} value={option} asChild><Button variant="brand" size="brand"
                          key={option}
                          type="button"
                          className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${color === option ? "border-brand-dark bg-brand-dark text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"}`}
                        >
                          {option}
                        </Button></RadioGroupItem>
                      ))}
                    </RadioGroup>
                  </div>
                ) : null}

                <div className="mt-3">
                  <Label htmlFor="import-target" className="block text-xs font-medium text-stone-600 mb-1">
                    Me avise se o preço cair abaixo de <span className="font-normal text-stone-500">(opcional)</span>
                  </Label>
                  <Input
                    id="import-target"
                    type="text"
                    inputMode="numeric"
                    value={targetText}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
                      setTargetText(digits ? money.format(Number(digits) / 100) : "");
                    }}
                    placeholder="R$ 0,00"
                    disabled={isSubmitting}
                    className="w-full px-3.5 py-2.5 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
                  />
                </div>
              </div>
            )}
          </div>
        </section>
        )}

        <Button variant="brand" size="brand"
          type="button"
          className="add-item-disclosure"
          aria-expanded={moreOpen}
          aria-controls="add-item-more"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <ChevronDown size={16} aria-hidden="true" className="add-item-disclosure-chevron" />
          {moreOpen ? "Menos detalhes" : "Mais detalhes"}
        </Button>

        <div id="add-item-more" hidden={!moreOpen} className="add-item-more space-y-4">

        <div className="add-item-row add-item-row-values grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="new-item-discount" className="block text-sm font-medium text-stone-700 mb-1">
              Desconto ou cashback
            </Label>
            <Input
              id="new-item-discount"
              type="text"
              inputMode="numeric"
              value={discountText}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
                setDiscountText(digits ? money.format(Number(digits) / 100) : "");
              }}
              placeholder="R$ 0,00"
              disabled={isSubmitting || !discountApplies(status)}
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood disabled:opacity-60"
            />
            <p className="mt-1 text-xs text-stone-500">
              {discountApplies(status)
                ? "Quanto foi abatido do preço. Vai para o resumo de descontos."
                : status === "received"
                  ? "Item ganho: o valor cheio vai para o resumo, sem desconto."
                  : "Esta situação não tem compra, então não há desconto."}
            </p>
          </div>
          <div>
            <Label htmlFor="new-item-quantity" className="block text-sm font-medium text-stone-700 mb-1">
              Quantidade
            </Label>
            <QuantityStepper
              id="new-item-quantity"
              value={quantityText}
              onChange={setQuantityText}
              disabled={isSubmitting}
              inputClassName="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
            />
            <p className="mt-1 text-xs text-stone-500">
              Só informa quantas unidades há. Não muda o preço.
            </p>
          </div>
          <div
            className="add-item-final rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-3"
            aria-live="polite"
          >
            <span className="block text-sm font-medium text-stone-700">
              {status === "received" ? "Valor ganho" : "Valor final"}
            </span>
            <strong className="block text-xl font-medium text-stone-800">
              {draftPrice > 0 ? money.format(draftFinal / 100) : "—"}
            </strong>
            <span className="block text-xs text-stone-500">
              {status === "received"
                ? "Vai para Descontos e cashback, não para Já investimos."
                : draftDiscount > 0
                  ? `${money.format(draftPrice / 100)} menos ${money.format(draftDiscount / 100)} de desconto.`
                  : "Preço menos o desconto ou cashback."}
            </span>
          </div>
        </div>

        {(
          <div className="add-item-row grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="new-item-installments" className="block text-sm font-medium text-stone-700 mb-1">
                Parcelas
              </Label>
              <Select
                id="new-item-installments"
                ariaLabel="Parcelas"
                value={installmentsText}
                options={INSTALLMENT_OPTIONS}
                onChange={setInstallmentsText}
                disabled={isSubmitting}
              />
              <p className="mt-1 text-xs text-stone-500">
                {status === "bought" ? "Entra no fluxo mensal do Planejamento." : "Ajusta a previsão de parcelas do Planejamento."}
              </p>
            </div>
            {(
              <div>
                <Label htmlFor="new-item-payment" className="block text-sm font-medium text-stone-700 mb-1">
                  Meio de pagamento
                </Label>
                <Select
                  id="new-item-payment"
                  ariaLabel="Meio de pagamento"
                  value={paymentMethod}
                  options={PAYMENT_OPTIONS}
                  onChange={setPaymentMethod}
                  disabled={isSubmitting}
                />
              </div>
            )}
            {(
              <div>
                <Label htmlFor="new-item-purchased" className="block text-sm font-medium text-stone-700 mb-1">
                  Data da compra
                </Label>
                <Input
                  id="new-item-purchased"
                  type="date"
                  value={purchasedAt}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setPurchasedAt(e.target.value)}
                  disabled={isSubmitting || status !== "bought"}
                  className={FIELD_CLASS}
                />
                <p className="mt-1 text-xs text-stone-500">
                  {status === "bought" ? "Em branco: hoje." : "Preenche ao marcar como Comprado."}
                </p>
              </div>
            )}
          </div>
        )}

        {status === "received" && (
          <div>
            <Label htmlFor="new-item-gift-from" className="block text-sm font-medium text-stone-700 mb-1">
              De quem foi o presente?
            </Label>
            <Input
              id="new-item-gift-from"
              value={giftFrom}
              maxLength={120}
              placeholder="Ex.: Tia Rosa"
              onChange={(e) => setGiftFrom(e.target.value)}
              disabled={isSubmitting}
              className={FIELD_CLASS}
            />
          </div>
        )}

        {members.length > 1 && (
          <div>
            <Label htmlFor="new-item-assignee" className="block text-sm font-medium text-stone-700 mb-1">
              Quem vai comprar
            </Label>
            <Select
              id="new-item-assignee"
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
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-stone-500">Evita compra repetida entre quem divide a lista.</p>
          </div>
        )}

        {(
          <div className="add-item-row grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="new-item-warranty" className="block text-sm font-medium text-stone-700 mb-1">
                Garantia (meses)
              </Label>
              <Input
                id="new-item-warranty"
                inputMode="numeric"
                value={warrantyMonthsText}
                placeholder="Ex.: 12"
                onChange={(e) => setWarrantyMonthsText(e.target.value.replace(/\D/g, "").slice(0, 3))}
                disabled={isSubmitting}
                className={FIELD_CLASS}
              />
              <p className="mt-1 text-xs text-stone-500">Avisamos 30 e 7 dias antes de vencer.</p>
            </div>
            <div>
              <Label htmlFor="new-item-store" className="block text-sm font-medium text-stone-700 mb-1">
                Onde foi comprado
              </Label>
              <Input
                id="new-item-store"
                value={storeName}
                maxLength={80}
                placeholder="Ex.: Loja do bairro"
                onChange={(e) => setStoreName(e.target.value)}
                disabled={isSubmitting}
                className={FIELD_CLASS}
              />
            </div>
            <p className="text-xs text-stone-500 sm:col-span-2">
              Nota fiscal, garantia em foto e outras lojas ficam no item, depois de adicionar.
            </p>
          </div>
        )}

        <div className="add-item-pair">
        <div>
          <Label htmlFor="new-item-link" className="block text-sm font-medium text-stone-700 mb-1">
            Link do produto
          </Label>
          <Input
            id="new-item-link"
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text").trim();
              if (!looksLikeUrl(pasted)) return;
              e.preventDefault();
              setLink(pasted);
              importFromLinkField(pasted);
            }}
            onBlur={(e) => importFromLinkField(e.target.value)}
            onKeyDown={(e) => {
              // Enter com um link novo busca o produto em vez de enviar o formulário.
              if (e.key !== "Enter") return;
              const url = e.currentTarget.value.trim();
              if (!looksLikeUrl(url) || url === lastImportedUrl.current) return;
              e.preventDefault();
              importFromLinkField(url);
            }}
            placeholder="https://..."
            disabled={isSubmitting}
            className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
          />
          <p className="add-item-link-hint mt-1 text-xs text-stone-500">
            Cole o link e preenchemos nome e preço automaticamente.
          </p>
        </div>

        <div>
          <Label htmlFor="new-item-description" className="block text-sm font-medium text-stone-700 mb-1">
            Observações
          </Label>
          <Textarea
            id="new-item-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Ex: Comprar na cor branca, voltagem 110 V..."
            disabled={isSubmitting}
            className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood resize-none"
          />
        </div>
        </div>
        </div>
        </div>

        <div className="add-item-form-footer">
          {error && (
            <p
              role="alert"
              className="form-error"
            >
              {error}
            </p>
          )}
          <Button variant="brand" size="brand"
            type="submit"
            disabled={!name.trim() || isSubmitting}
            className="add-item-submit w-full py-4 bg-brand-dark text-white rounded-xl font-medium text-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Salvando..." : "Adicionar à lista"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
