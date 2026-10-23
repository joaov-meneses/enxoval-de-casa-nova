// Partes da linha do item que nasceram na Fase 11: lojas do item, notas e garantias, agradecimento do presente e
// avatar de quem vai comprar. Lojas e documentos salvam na hora (não esperam o "Salvar alterações" do formulário).
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  ExternalLink,
  Flame,
  LoaderCircle,
  MessageCircleHeart,
  Receipt,
  Trash2,
  Upload,
} from "@/src/components/icons";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import {
  deleteItemDocument,
  fetchItemDocuments,
  promoteItemOffer,
  removeItemOffer,
  uploadItemDocument,
} from "../api";
import { capture } from "../analytics";
import { prepareImageForUpload } from "../imageUpload";
import { cheapestOffer, storeLabel } from "../priceTracking";
import type { EnxovalItem, EnxovalMember, ItemDocument, ItemDocumentKind } from "../types";
import { Dialog } from "./Dialog";
import { Select } from "./Select";
import { UserAvatar } from "./UserAvatar";
import "./itemExtras.css";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const wholeMoney = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export const MAX_OFFERS = 3;
const MAX_DOCUMENTS = 20;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_KIND_LABEL: Record<ItemDocumentKind, string> = {
  invoice: "Nota fiscal",
  warranty: "Garantia",
  manual: "Manual",
  other: "Outro",
};

function safeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function fileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/* ------------------------------------------------------------ responsável */

/** Avatar pequeno de quem vai comprar, com o nome no `title` (só aparece em enxoval dividido). */
export function AssigneeAvatar({ member, isMe }: { member: EnxovalMember; isMe: boolean }) {
  const label = isMe ? "Com você" : `Com ${member.name.split(" ")[0] || member.email}`;
  return (
    <span className="item-assignee" title={label}>
      <UserAvatar name={member.name || member.email} src={member.avatarUrl} className="item-assignee-avatar" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/* ------------------------------------------------------------ resumo das lojas */

/** "3 lojas · a partir de R$ 899": abre os detalhes do item, onde fica a comparação. */
export function OffersSummary({ item, onOpen }: { item: EnxovalItem; onOpen: () => void }) {
  const offers = item.offers ?? [];
  if (offers.length < 2) return null;
  const cheapest = cheapestOffer(item);
  return (
    <Button variant="brand" size="brand" type="button" className="price-badge item-offers-badge" onClick={onOpen}>
      {offers.length} lojas
      {cheapest?.currentPriceCents ? <> · a partir de {wholeMoney.format(cheapest.currentPriceCents / 100)}</> : null}
    </Button>
  );
}

/* ------------------------------------------------------------ agradecimento */

/** Mensagem pronta para o WhatsApp; a pessoa edita antes de enviar e escolhe o contato no próprio WhatsApp. */
export function thanksMessage(item: Pick<EnxovalItem, "name" | "giftFrom" | "category">) {
  const who = item.giftFrom?.trim();
  const room = item.category ? ` já está na nossa ${item.category.toLowerCase()}` : " já está na nossa casa";
  return `Oi${who ? `, ${who}` : ""}! O presente (${item.name})${room}. Muito obrigado pelo carinho! 💛`;
}

export function ThanksDialog({
  item,
  onClose,
  onMarkThanked,
}: {
  item: EnxovalItem;
  onClose: () => void;
  onMarkThanked: (channel: "manual" | "whatsapp") => Promise<void>;
}) {
  const [message, setMessage] = useState(() => thanksMessage(item));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  async function mark(channel: "manual" | "whatsapp") {
    setBusy(true);
    setError("");
    try {
      if (channel === "whatsapp") window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      await onMarkThanked(channel);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }
  return createPortal(
    <Dialog title="Agradecer o presente" isOpen onClose={onClose} busy={busy} className="item-thanks-dialog">
      <div className="item-thanks-body">
        <p className="item-thanks-intro" tabIndex={-1} data-dialog-autofocus>
          <strong>{item.name}</strong>
          {item.giftFrom && <span>Presente de {item.giftFrom}</span>}
        </p>
        <Label htmlFor={`${id}-message`} className="item-thanks-field">
          Mensagem
          <Textarea id={`${id}-message`} value={message} rows={4} maxLength={600} onChange={(event) => setMessage(event.target.value)} disabled={busy} />
          <small>O WhatsApp abre com a mensagem pronta; você escolhe o contato lá. O app não guarda telefones.</small>
        </Label>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <div className="item-completion-footer">
        <Button variant="brand" size="brand" type="button" className="button button-outline" disabled={busy} onClick={() => void mark("manual")}>
          Marquei como agradecido
        </Button>
        <Button variant="brand" size="brand" type="button" className="button button-dark" disabled={busy || !message.trim()} onClick={() => void mark("whatsapp")}>
          {busy ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <MessageCircleHeart size={17} aria-hidden="true" />}
          Agradecer pelo WhatsApp
        </Button>
      </div>
    </Dialog>,
    document.body,
  );
}

/* ------------------------------------------------------------ lojas do item */

export function ItemOffersSection({
  item,
  disabled,
  onReplace,
}: {
  item: EnxovalItem;
  disabled?: boolean;
  onReplace: (item: EnxovalItem) => void;
}) {
  const offers = item.offers ?? [];
  const cheapest = offers.length > 1 ? cheapestOffer(item) : null;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const id = useId();

  async function run(key: string, action: () => Promise<EnxovalItem>) {
    setBusy(key);
    setError("");
    try {
      onReplace(await action());
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a loja. Tente de novo.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <h4 className="item-inline-section item-inline-wide is-visible" id={`${id}-title`}>Lojas</h4>
      <div className="item-offers item-inline-wide" aria-labelledby={`${id}-title`}>
        {offers.length === 0 ? (
          <p className="item-inline-hint">Cole o link do produto em "Link do produto" para guardar a loja. Com um link salvo, outro link pode virar mais uma loja (até {MAX_OFFERS}) para comparar o preço.</p>
        ) : (
          <ul className="item-offer-list">
            {offers.map((offer) => {
              const href = safeHttpUrl(offer.url);
              const isCheapest = cheapest?.id === offer.id;
              return (
                <li key={offer.id} className={`item-offer${offer.isPrimary ? " is-primary" : ""}`}>
                  <span className="item-offer-store">
                    <strong>{storeLabel(offer.domain)}</strong>
                    {offer.isPrimary && <small className="item-offer-tag">Principal</small>}
                    {isCheapest && (
                      <small className="item-offer-tag is-cheapest">
                        <Flame size={11} aria-hidden="true" /> Mais barato
                      </small>
                    )}
                  </span>
                  <span className="item-offer-price">
                    {offer.currentPriceCents !== null ? money.format(offer.currentPriceCents / 100) : "Aguardando leitura"}
                    {offer.pixPriceCents !== null && offer.pixPriceCents !== offer.currentPriceCents && (
                      <small> · {money.format(offer.pixPriceCents / 100)} no Pix</small>
                    )}
                  </span>
                  <span className="item-offer-meta">
                    {!offer.inStock && <b>Indisponível · </b>}
                    {offer.lastCheckedAt ? `Lido em ${new Date(offer.lastCheckedAt).toLocaleDateString("pt-BR")}` : "Ainda não lido"}
                  </span>
                  <span className="item-offer-actions">
                    {href && (
                      <a href={href} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={12} aria-hidden="true" /> Ver na loja
                      </a>
                    )}
                    {!offer.isPrimary && (
                      <Button
                        variant="brand"
                        size="brand"
                        type="button"
                        className="button button-outline button-small"
                        disabled={disabled || busy !== null}
                        onClick={() =>
                          void run(offer.id, async () => {
                            const saved = await promoteItemOffer(item.id, offer.id);
                            capture("offer_promoted", { cheapest: isCheapest });
                            return saved;
                          })
                        }
                      >
                        {busy === offer.id ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : null}
                        Tornar principal
                      </Button>
                    )}
                    <Button
                      variant="brand"
                      size="brand"
                      type="button"
                      className="item-offer-remove"
                      aria-label={`Remover ${storeLabel(offer.domain)} das lojas`}
                      title="Remover loja"
                      disabled={disabled || busy !== null}
                      onClick={() => void run(`remove-${offer.id}`, () => removeItemOffer(item.id, offer.id))}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </>
  );
}

/* ------------------------------------------------------------ notas e garantias */

export function ItemDocumentsSection({
  item,
  disabled,
  onReplace,
}: {
  item: EnxovalItem;
  disabled?: boolean;
  onReplace: (item: EnxovalItem) => void;
}) {
  const [documents, setDocuments] = useState<ItemDocument[] | null>(item.documentCount ? null : []);
  const [kind, setKind] = useState<ItemDocumentKind>("invoice");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    if (!item.documentCount) return;
    let alive = true;
    fetchItemDocuments(item.id)
      .then((result) => alive && setDocuments(result.documents))
      .catch((err) => alive && setError(err instanceof Error ? err.message : "Não foi possível carregar os documentos."));
    return () => {
      alive = false;
    };
    // Carrega uma vez ao abrir os detalhes; envios e exclusões atualizam a lista localmente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf && file.type && !file.type.startsWith("image/")) {
      setError("Envie uma foto (JPG, PNG, WebP ou HEIC) ou um PDF.");
      return;
    }
    setBusy("upload");
    try {
      // Fotos de nota precisam de leitura: reduz menos que a foto de perfil.
      const body = isPdf ? file : await prepareImageForUpload(file, { maxSide: 2400, quality: 0.88 });
      if (body.size > MAX_DOCUMENT_BYTES) throw new Error("Este arquivo passa de 10 MB. Envie uma foto menor ou um PDF mais leve.");
      const result = await uploadItemDocument(item.id, body, kind, file.name);
      setDocuments((current) => [...(current ?? []), result.document]);
      onReplace(result.item);
      capture("document_uploaded", { kind, source: isPdf ? "pdf" : "photo" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o arquivo.");
    } finally {
      setBusy(null);
      if (cameraRef.current) cameraRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(document: ItemDocument) {
    setBusy(document.id);
    setError("");
    try {
      onReplace(await deleteItemDocument(document.id));
      setDocuments((current) => (current ?? []).filter((entry) => entry.id !== document.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível apagar o arquivo.");
    } finally {
      setBusy(null);
    }
  }

  const count = documents?.length ?? item.documentCount ?? 0;
  return (
    <div className="item-docs item-inline-wide" aria-busy={busy === "upload" || documents === null}>
      {documents === null ? (
        <p className="item-inline-hint" role="status">
          <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> Carregando documentos…
        </p>
      ) : documents.length > 0 ? (
        <ul className="item-doc-list">
          {documents.map((document) => (
            <li key={document.id}>
              <Receipt size={16} aria-hidden="true" />
              <a href={document.url} target="_blank" rel="noopener noreferrer" className="item-doc-name">
                {document.fileName}
              </a>
              <small>
                {DOCUMENT_KIND_LABEL[document.kind]} · {fileSize(document.sizeBytes)}
              </small>
              <Button
                variant="brand"
                size="brand"
                type="button"
                className="item-offer-remove"
                aria-label={`Apagar ${document.fileName}`}
                title="Apagar arquivo"
                disabled={disabled || busy !== null}
                onClick={() => void remove(document)}
              >
                {busy === document.id ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {count < MAX_DOCUMENTS && (
        <div className="item-doc-actions">
          <Label htmlFor={`${id}-kind`} className="sr-only">Tipo do documento</Label>
          <Select
            id={`${id}-kind`}
            ariaLabel="Tipo do documento"
            value={kind}
            options={(Object.keys(DOCUMENT_KIND_LABEL) as ItemDocumentKind[]).map((value) => ({ value, label: DOCUMENT_KIND_LABEL[value] }))}
            onChange={(value) => setKind(value as ItemDocumentKind)}
            disabled={disabled || busy !== null}
          />
          <Button
            variant="brand"
            size="brand"
            type="button"
            className="button button-outline button-small item-doc-camera"
            disabled={disabled || busy !== null}
            onClick={() => cameraRef.current?.click()}
          >
            <Camera size={15} aria-hidden="true" /> Fotografar
          </Button>
          <Button
            variant="brand"
            size="brand"
            type="button"
            className="button button-outline button-small"
            disabled={disabled || busy !== null}
            onClick={() => fileRef.current?.click()}
          >
            {busy === "upload" ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Upload size={15} aria-hidden="true" />}
            Enviar arquivo
          </Button>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => void upload(event.target.files?.[0])} />
          <input ref={fileRef} type="file" accept="application/pdf,image/*" hidden onChange={(event) => void upload(event.target.files?.[0])} />
        </div>
      )}
      <p className="item-inline-hint">Fotos ou PDF de até 10 MB, até {MAX_DOCUMENTS} por item. Só quem participa do enxoval vê os arquivos.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
