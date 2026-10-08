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
} from "lucide-react";
import type { EnxovalCategory, EnxovalItem } from "../types";
import { Select } from "./Select";

interface ItemRowProps {
  item: EnxovalItem;
  categories: EnxovalCategory[];
  categoryName?: string;
  showUpdatedAt?: boolean;
  updatedAtLabel?: string;
  dragHandle?: ReactNode;
  onUpdate: (id: string, updates: Partial<EnxovalItem>) => Promise<void> | void;
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
  onUpdate,
  onDelete,
}: ItemRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(item.name);
  const [priceText, setPriceText] = useState("");
  const [linkText, setLinkText] = useState(item.link);
  const [description, setDescription] = useState(item.description);
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (expanded) return;
    setName(item.name);
    setPriceText(item.priceCents ? money.format(item.priceCents / 100) : "");
    setLinkText(item.link);
    setDescription(item.description);
    setCategoryId(item.categoryId);
    setError("");
  }, [item, expanded]);
  const price = Number(item.priceCents);
  const formattedPrice =
    Number.isFinite(price) && price > 0 ? money.format(price / 100) : "";
  const link = safeLink(item.link);
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
    let saved = false;
    try {
      await onUpdate(item.id, {
        name: name.trim(),
        priceCents: digits && Number(digits) > 0 ? Number(digits) : null,
        link: linkText.trim(),
        description: description.trim(),
        categoryId,
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
      className={`item-row ${item.checked ? "checked" : ""} ${expanded ? "expanded" : ""}`}
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
            <span className="item-meta-price">
              {formattedPrice || "Sem preço"}
            </span>
            {added && <span className="item-added">Adicionado em {added}</span>}
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
        <span className="item-status">
          {item.checked ? "Conquistado" : "Na lista"}
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
              <label htmlFor={`${id}-name`}>
                Nome do item
                <input
                  id={`${id}-name`}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={200}
                  disabled={busy}
                />
              </label>
              <label htmlFor={`${id}-price`}>
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
              <label htmlFor={`${id}-environment`}>
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
              <label htmlFor={`${id}-link`}>
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
              <label htmlFor={`${id}-description`} className="item-inline-wide">
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
                Data de adição indisponível para este item antigo da
                demonstração.
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
    </div>
  );
}
