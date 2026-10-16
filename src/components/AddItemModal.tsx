import React, { useEffect, useRef, useState } from "react";
import { Sparkles, LoaderCircle, PackageCheck, PackageX, X } from "lucide-react";
import type {
  EnxovalCategory,
  EnxovalItem,
  ItemStatus,
  ItemTrackingInput,
  CatalogSuggestion,
  ItemAssessment,
  PriceBasis,
  ScrapedProductPreview,
} from "../types";
import { assessItemDraft, extractProduct, searchCatalog } from "../api";
import { useJevEnabled } from "../hooks/useJevEnabled";
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
import { Dialog } from "./Dialog";
import { QuantityStepper } from "./QuantityStepper";
import { Select } from "./Select";

const NEW_CATEGORY_VALUE = "__new_category__";
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
      ItemTrackingInput,
  ) => Promise<void> | void;
  defaultCategoryId: string;
  categories: EnxovalCategory[];
  /** Enxoval em que o item será criado; com ele (e o Jev ligado) o Nino ajuda a escolher o ambiente e avisa de repetições. */
  enxovalId?: string;
}

/** Quanto tempo a pessoa precisa parar de digitar o nome para o Nino analisar o item. */
const NINO_DELAY_MS = 1000;
const NINO_MIN_NAME_LENGTH = 3;

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
  enxovalId,
}: AddItemModalProps) {
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
  const [error, setError] = useState("");
  // Importação por link: a leitura é só uma ajuda; falhar não impede preencher tudo à mão.
  const [importUrl, setImportUrl] = useState("");
  // "partial": a loja barrou a leitura; só o nome (tirado do link) foi preenchido.
  const [importStatus, setImportStatus] = useState<"idle" | "loading" | "done" | "partial" | "error">("idle");
  const [importError, setImportError] = useState("");
  const [preview, setPreview] = useState<ScrapedProductPreview | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
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
  // Nino (Jev): só existe quando o servidor tem a chave; a análise é uma ajuda, nunca bloqueia o formulário.
  const jevEnabled = useJevEnabled();
  const [ninoTip, setNinoTip] = useState<{
    redundancy: ItemAssessment["redundancy"];
    environmentName: string | null;
  } | null>(null);
  const lastAssessedName = useRef("");
  // Autocomplete do catálogo compartilhado: vem do banco do servidor, sem Jev, e some se a busca falhar.
  const [suggestions, setSuggestions] = useState<CatalogSuggestion[]>([]);

  useEffect(() => {
    const draft = name.trim();
    if (!isOpen || draft.length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const { results } = await searchCatalog(draft, controller.signal);
        if (!controller.signal.aborted) setSuggestions(results);
      } catch {
        // Sem sugestões o campo funciona como sempre.
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [name, isOpen]);

  const commonRange = suggestions.find(
    (suggestion) => suggestion.name.toLowerCase() === name.trim().toLowerCase(),
  )?.priceRange;

  useEffect(() => {
    if (!isOpen || !jevEnabled || !enxovalId) return;
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
        setNinoTip({ redundancy: result.redundancy, environmentName });
      } catch {
        // Sem a ajuda do Nino o formulário continua igual.
      }
    }, NINO_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [name, isOpen, jevEnabled, enxovalId, categories.length]);

  useEffect(() => {
    if (!isOpen) return;
    lastAssessedName.current = "";
    setNinoTip(null);
    importTicket.current += 1;
    lastImportedUrl.current = "";
    setImportUrl("");
    setImportStatus("idle");
    setImportError("");
    setPreview(null);
    setImageFailed(false);
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
    setError("");
  }, [categories, defaultCategoryId, isOpen]);

  const draftPrice = Number(priceText.replace(/\D/g, "")) || 0;
  const draftDiscount = discountApplies(status)
    ? Math.min(Number(discountText.replace(/\D/g, "")) || 0, draftPrice)
    : 0;
  const draftFinal = draftPrice - draftDiscount;

  const applyPreview = (data: ScrapedProductPreview) => {
    setPreview(data);
    setImageFailed(false);
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
      const suggested = matchCategory(categories, data.suggestedCategory);
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
          ...(preview && importStatus === "done"
            ? {
                trackedProductUrl: preview.url,
                // O preço de referência é o da loja no tipo escolhido (normal ou Pix), não o texto do campo.
                initialPriceCents:
                  (priceBasis === "pix" ? preview.pixPriceCents : preview.priceCents) ?? priceValue,
                targetPriceCents: Number(targetText.replace(/\D/g, "")) || null,
                selectedVariation: [voltage, color].filter(Boolean).join(" · ") || null,
                imageUrl: preview.imageUrl ?? null,
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
    >
      <form
        onSubmit={handleSubmit}
        className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4"
      >
        <section
          aria-labelledby="import-link-title"
          className="rounded-2xl border border-brand-wood/20 bg-brand-wood/5 p-3.5 space-y-3"
        >
          <div>
            <h3 id="import-link-title" className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
              <Sparkles size={15} aria-hidden="true" /> Importar por link
            </h3>
            <p id="import-link-hint" className="mt-0.5 text-xs text-stone-500">
              Cole o link de um produto (Mercado Livre, Amazon, Magalu...) e a gente preenche nome, foto e preço. Depois acompanhamos se ele ficou mais barato.
            </p>
          </div>
          <div className="flex gap-2">
            <input
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
            <button
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
            </button>
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
              <p role="alert" className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                {importError}
              </p>
            )}
            {importStatus === "partial" && preview && (
              <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <p className="min-w-0 flex-1">
                  Essa loja não deixou ler o preço e a foto. Preenchemos o nome pelo link: confira o nome e informe o preço abaixo.
                </p>
                <button
                  type="button"
                  onClick={clearImport}
                  aria-label="Remover importação"
                  title="Remover importação"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-amber-800 hover:bg-amber-100"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            )}
            {importStatus === "done" && preview && (
              <div className="rounded-xl border border-stone-200 bg-white p-3">
                <div className="flex gap-3">
                  {preview.imageUrl && !imageFailed ? (
                    <img
                      src={preview.imageUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      onError={() => setImageFailed(true)}
                      className="h-16 w-16 shrink-0 rounded-lg border border-stone-100 bg-white object-contain"
                    />
                  ) : (
                    <div className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-400" aria-hidden="true">
                      <PackageCheck size={22} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-semibold text-stone-700">
                        {storeLabel(preview.domain)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${preview.inStock ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}
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
                  <button
                    type="button"
                    onClick={clearImport}
                    aria-label="Remover importação"
                    title="Remover importação"
                    className="h-8 w-8 shrink-0 grid place-items-center rounded-lg text-stone-500 hover:bg-stone-100"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>

                {preview.pixPriceCents && preview.priceCents ? (
                  <div className="mt-3">
                    <span id="import-price-basis" className="block text-xs font-medium text-stone-600 mb-1">
                      Qual preço usar?
                    </span>
                    <div role="radiogroup" aria-labelledby="import-price-basis" className="grid grid-cols-2 gap-1.5">
                      {([
                        ["regular", "Normal", preview.priceCents],
                        ["pix", "No Pix", preview.pixPriceCents],
                      ] as const).map(([value, label, cents]) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={priceBasis === value}
                          onClick={() => choosePriceBasis(value)}
                          className={`rounded-lg border px-2 py-2 text-sm transition-colors ${priceBasis === value ? "border-brand-dark bg-brand-dark text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"}`}
                        >
                          {label} · {moneyText(cents)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {preview.variations?.voltage?.length ? (
                  <div className="mt-3">
                    <span id="import-voltage" className="block text-xs font-medium text-stone-600 mb-1">Voltagem</span>
                    <div role="radiogroup" aria-labelledby="import-voltage" className="flex flex-wrap gap-1.5">
                      {preview.variations.voltage.map((option) => (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={voltage === option}
                          onClick={() => setVoltage(voltage === option ? "" : option)}
                          className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${voltage === option ? "border-brand-dark bg-brand-dark text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"}`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {preview.variations?.colors?.length ? (
                  <div className="mt-3">
                    <span id="import-color" className="block text-xs font-medium text-stone-600 mb-1">Cor</span>
                    <div role="radiogroup" aria-labelledby="import-color" className="flex flex-wrap gap-1.5">
                      {preview.variations.colors.map((option) => (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={color === option}
                          onClick={() => setColor(color === option ? "" : option)}
                          className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${color === option ? "border-brand-dark bg-brand-dark text-white" : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"}`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-3">
                  <label htmlFor="import-target" className="block text-xs font-medium text-stone-600 mb-1">
                    Me avise se o preço cair abaixo de <span className="font-normal text-stone-500">(opcional)</span>
                  </label>
                  <input
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

        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Sobre o item</h3>

        <div>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <label htmlFor="new-item-name" className="block text-sm font-medium text-stone-700">
              Nome do produto
            </label>
            <span className={`name-counter${name.length >= MAX_ITEM_NAME_LENGTH ? " is-full" : ""}`} aria-hidden="true">
              {name.length}/{MAX_ITEM_NAME_LENGTH}
            </span>
          </div>
          <input
            type="text"
            id="new-item-name"
            required
            maxLength={MAX_ITEM_NAME_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
            list="new-item-name-suggestions"
            autoComplete="off"
            placeholder="Ex: Jogo de Taças"
            className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
          />
          <datalist id="new-item-name-suggestions">
            {suggestions
              .filter((suggestion) => suggestion.name.length <= MAX_ITEM_NAME_LENGTH)
              .map((suggestion) => (
                <option key={suggestion.id} value={suggestion.name} />
              ))}
          </datalist>
          {commonRange && (
            <p className="mt-2 text-sm text-stone-600">
              Faixa comum: {money.format(commonRange.p10Cents / 100)} a{" "}
              {money.format(commonRange.p90Cents / 100)}
            </p>
          )}
          {ninoTip?.redundancy && (
            <p
              role="status"
              className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-snug text-amber-900"
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="new-item-category" className="block text-sm font-medium text-stone-700 mb-1">
              Ambiente
            </label>
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
            <label htmlFor="new-item-status" className="block text-sm font-medium text-stone-700 mb-1">
              Situação
            </label>
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
            <label htmlFor="new-item-category-name" className="block text-sm font-medium text-stone-700 mb-1">
              Nome do ambiente
            </label>
            <input
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

        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500 pt-1">Valores</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="new-item-price" className="block text-sm font-medium text-stone-700 mb-1">
              Preço
            </label>
            <input
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
              className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood"
            />
          </div>
          <div>
            <label htmlFor="new-item-discount" className="block text-sm font-medium text-stone-700 mb-1">
              Desconto ou cashback
            </label>
            <input
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
            <label htmlFor="new-item-quantity" className="block text-sm font-medium text-stone-700 mb-1">
              Quantidade
            </label>
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
            className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-3"
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

        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500 pt-1">Detalhes</h3>

        <div>
          <label htmlFor="new-item-link" className="block text-sm font-medium text-stone-700 mb-1">
            Link do produto
          </label>
          <input
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
          <p className="mt-1 text-xs text-stone-500">
            Cole o link e preenchemos nome, preço e foto automaticamente.
          </p>
        </div>

        <div>
          <label htmlFor="new-item-description" className="block text-sm font-medium text-stone-700 mb-1">
            Observações
          </label>
          <textarea
            id="new-item-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Ex: Comprar na cor branca, voltagem 110 V..."
            disabled={isSubmitting}
            className="w-full px-4 py-3 text-base border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood resize-none"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"
          >
            {error}
          </p>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={!name.trim() || isSubmitting}
            className="w-full py-4 bg-brand-dark text-white rounded-xl font-medium text-lg hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Salvando..." : "Adicionar à lista"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
