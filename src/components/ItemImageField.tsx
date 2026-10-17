import { useId, useRef, useState } from "react";
import { ImagePlus, ImageOff, Link2, LoaderCircle, Trash2 } from "lucide-react";
import { importItemImageFromUrl, uploadItemImage } from "../api";
import { IMAGE_UPLOAD_ACCEPT } from "../itemImages";
import { imageFileProblem, prepareImageForUpload } from "../imageUpload";

interface ItemImageFieldProps {
  /** Enxoval em que a imagem será guardada. Sem ele não há onde guardar, e o campo não aparece. */
  enxovalId?: string;
  /** Endereço atual da imagem do item (guardada no banco ou, antes de salvar, o da loja). */
  value: string | null;
  onChange: (imageUrl: string | null) => void;
  disabled?: boolean;
  className?: string;
}

const inputClass =
  "min-w-0 flex-1 px-3.5 py-2.5 text-base border border-stone-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-brand-wood/50 focus:border-brand-wood disabled:opacity-60";
const buttonClass =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Imagem do item: enviar um arquivo do aparelho ou colar o link de uma imagem. Nos dois casos o servidor
 * confere, reduz e guarda a imagem no banco, e o item passa a apontar para ela.
 */
export function ItemImageField({ enxovalId, value, onChange, disabled, className = "" }: ItemImageFieldProps) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [linkText, setLinkText] = useState("");
  const [busy, setBusy] = useState<"file" | "link" | null>(null);
  const [error, setError] = useState("");
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!enxovalId) return null;
  const locked = disabled || busy !== null;
  const showPreview = value && failedUrl !== value;

  async function pickFile(file: File | undefined) {
    if (!file || !enxovalId) return;
    const problem = imageFileProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy("file");
    setError("");
    try {
      const { imageUrl } = await uploadItemImage(enxovalId, await prepareImageForUpload(file));
      onChange(imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar a imagem.");
    } finally {
      setBusy(null);
      // Permite escolher o mesmo arquivo de novo depois de um erro.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function useLink() {
    const url = linkText.trim();
    if (!url || !enxovalId) return;
    if (!/^https?:\/\//i.test(url)) {
      setError("Cole o endereço completo da imagem, começando com https://.");
      return;
    }
    setBusy("link");
    setError("");
    try {
      const { imageUrl } = await importItemImageFromUrl(enxovalId, url);
      onChange(imageUrl);
      setLinkText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível importar a imagem desse link.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`item-image-field ${className}`.trim()} aria-busy={busy !== null}>
      <span id={`${id}-label`} className="block text-sm font-medium text-stone-700 mb-1">
        Imagem do item <span className="font-normal text-stone-500">(opcional)</span>
      </span>
      <div className="flex gap-3 rounded-2xl border border-stone-200 bg-white p-3">
        <div className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-stone-100 bg-stone-50 text-stone-400">
          {showPreview ? (
            <img
              src={value}
              alt="Imagem do item"
              referrerPolicy="no-referrer"
              onError={() => setFailedUrl(value)}
              className="h-full w-full object-contain"
            />
          ) : (
            <ImageOff size={22} aria-hidden="true" />
          )}
          {busy && (
            <span className="absolute inset-0 grid place-items-center bg-white/70" role="status" aria-label="Enviando imagem">
              <LoaderCircle size={20} className="animate-spin text-stone-600" aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              onClick={() => fileInput.current?.click()}
              disabled={locked}
              aria-describedby={`${id}-label`}
            >
              <ImagePlus size={16} aria-hidden="true" />
              {value ? "Trocar imagem" : "Enviar imagem"}
            </button>
            {value && (
              <button
                type="button"
                className={`${buttonClass} text-red-700 hover:border-red-200 hover:bg-red-50`}
                onClick={() => {
                  setError("");
                  onChange(null);
                }}
                disabled={locked}
              >
                <Trash2 size={16} aria-hidden="true" />
                Remover
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept={IMAGE_UPLOAD_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-label="Escolher arquivo de imagem"
              onChange={(event) => void pickFile(event.target.files?.[0])}
              disabled={locked}
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              aria-label="Link de uma imagem"
              value={linkText}
              onChange={(event) => setLinkText(event.target.value)}
              onKeyDown={(event) => {
                // Enter aqui importa a imagem em vez de enviar o formulário inteiro.
                if (event.key !== "Enter") return;
                event.preventDefault();
                void useLink();
              }}
              placeholder="Ou cole o link de uma imagem"
              disabled={locked}
              className={inputClass}
            />
            <button type="button" className={buttonClass} onClick={() => void useLink()} disabled={locked || !linkText.trim()}>
              {busy === "link" ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
              <span>Usar<span className="hidden sm:inline"> link</span></span>
            </button>
          </div>
        </div>
      </div>
      <p className="mt-1 text-xs text-stone-500">JPG, PNG, WebP, GIF ou AVIF. A gente reduz o tamanho e guarda com segurança.</p>
      {error && (
        <p role="alert" className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
