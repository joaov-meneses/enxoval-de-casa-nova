import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ArrowLeft,
  Bug,
  Check,
  ImagePlus,
  Lightbulb,
  LoaderCircle,
  MessageCircleHeart,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useDialogAccessibility } from "../hooks/useDialogAccessibility";
import { sendFeedback } from "../api";
import { Select } from "./Select";
import {
  FEEDBACK_AREAS,
  FEEDBACK_FREQUENCIES,
  FEEDBACK_IMPORTANCES,
  FEEDBACK_KIND_INFO,
  FEEDBACK_LIMITS,
  FEEDBACK_SEVERITIES,
  validateFeedback,
  type FeedbackArea,
  type FeedbackErrors,
  type FeedbackFrequency,
  type FeedbackImportance,
  type FeedbackKind,
  type FeedbackSeverity,
} from "../feedback";

const DRAFT_KEY = "casamia.feedback.draft.v1";

const KIND_ICON: Record<FeedbackKind, typeof Bug> = {
  bug: Bug,
  idea: Lightbulb,
  other: MessageCircleHeart,
};

interface Draft {
  kind: FeedbackKind | null;
  title: string;
  description: string;
  area: FeedbackArea | "";
  steps: string;
  expected: string;
  frequency: FeedbackFrequency | "";
  severity: FeedbackSeverity | "";
  problem: string;
  importance: FeedbackImportance | "";
}

const EMPTY_DRAFT: Draft = {
  kind: null,
  title: "",
  description: "",
  area: "",
  steps: "",
  expected: "",
  frequency: "",
  severity: "",
  problem: "",
  importance: "",
};

/** Rascunho guardado só neste aparelho, para não perder o texto se a janela fechar sem querer. */
function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const data = JSON.parse(raw) as Partial<Draft>;
    return { ...EMPTY_DRAFT, ...data };
  } catch {
    return EMPTY_DRAFT;
  }
}

function saveDraft(draft: Draft) {
  try {
    const empty =
      !draft.title && !draft.description && !draft.steps && !draft.expected && !draft.problem;
    if (empty) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* Armazenamento bloqueado: o formulário continua funcionando sem rascunho. */
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* Nada a limpar. */
  }
}

/* ------------------------------------------------------------- captura de tela */

interface Screenshot {
  data: string;
  previewUrl: string;
  name: string;
}

const MAX_INPUT_BYTES = 15 * 1024 * 1024;

/** Reduz a imagem no próprio aparelho (JPEG, até 1400 px) para caber no limite sem a pessoa se preocupar com tamanho. */
async function compressImage(file: File): Promise<Screenshot> {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem (foto ou captura de tela).");
  if (file.size > MAX_INPUT_BYTES) throw new Error("Essa imagem é muito grande. Tente uma captura de tela.");
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("Não consegui abrir essa imagem. Tente outra.");
  let scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) break;
    // Fundo branco: PNG com transparência não vira um quadro preto no JPEG.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.58]) {
      const url = canvas.toDataURL("image/jpeg", quality);
      const data = url.slice(url.indexOf(",") + 1);
      if (data.length <= FEEDBACK_LIMITS.screenshotBase64 - 20_000) {
        bitmap.close();
        return { data, previewUrl: url, name: file.name || "captura.jpg" };
      }
    }
    scale *= 0.75;
  }
  bitmap.close();
  throw new Error("Não consegui reduzir essa imagem o bastante. Tente uma captura menor.");
}

/* -------------------------------------------------------------- peças do formulário */

function Field({
  id,
  label,
  required,
  optional,
  hint,
  error,
  counter,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
  counter?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`fb-field${error ? " has-error" : ""}`}>
      <div className="fb-label-row">
        <label htmlFor={id}>
          {label}
          {required && <span className="fb-req"> (obrigatório)</span>}
          {optional && <span className="fb-opt"> (opcional)</span>}
        </label>
        {counter}
      </div>
      {hint && (
        <p className="fb-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p className="fb-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span className={`fb-counter${value.length > max ? " is-over" : ""}`} aria-hidden="true">
      {value.length}/{max}
    </span>
  );
}

function ChoiceGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  error,
  required,
  optional,
}: {
  legend: string;
  name: string;
  value: T | "";
  options: readonly { id: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
  error?: string;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <fieldset className={`fb-choices${error ? " has-error" : ""}`}>
      <legend>
        {legend}
        {required && <span className="fb-req"> (obrigatório)</span>}
        {optional && <span className="fb-opt"> (opcional)</span>}
      </legend>
      <div className="fb-choice-grid">
        {options.map((option) => (
          <label key={option.id} className={`fb-choice${value === option.id ? " is-selected" : ""}`}>
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
            />
            <span className="fb-choice-mark" aria-hidden="true">
              <Check size={13} strokeWidth={3} />
            </span>
            <span className="fb-choice-text">
              <strong>{option.label}</strong>
              {option.hint && <small>{option.hint}</small>}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p className="fb-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/* ------------------------------------------------------------------- diálogo */

export function FeedbackDialog({
  open,
  onClose,
  user,
  currentArea,
  triggerRef,
}: {
  open: boolean;
  onClose: () => void;
  user: { name: string; email: string };
  /** Onde a pessoa estava quando abriu a central: já vem preenchido. */
  currentArea?: FeedbackArea;
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [screenshot, setScreenshot] = useState<Screenshot | null>(null);
  const [imageError, setImageError] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [errors, setErrors] = useState<FeedbackErrors>({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ email: string } | null>(null);
  const [restored, setRestored] = useState(false);
  const baseId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const close = () => {
    if (!busy) onClose();
  };
  const dialogRef = useDialogAccessibility(open, close, triggerRef);

  // Ao abrir: recupera o rascunho (se houver) e já marca onde a pessoa estava.
  useEffect(() => {
    if (!open) return;
    const saved = loadDraft();
    const hasText = Boolean(saved.title || saved.description);
    setRestored(hasText);
    setDraft({
      ...saved,
      area: saved.area || (currentArea ?? ""),
    });
    setErrors({});
    setServerError("");
    setSent(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && !sent) saveDraft(draft);
  }, [draft, open, sent]);

  const kind = draft.kind;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (errors[key as keyof FeedbackErrors]) {
      setErrors((current) => ({ ...current, [key]: undefined }));
    }
  };

  const areaOptions = useMemo(
    () => [
      ...(kind === "bug" ? [{ value: "", label: "Escolha onde aconteceu" }] : [{ value: "", label: "Não sei / não se aplica" }]),
      ...FEEDBACK_AREAS.map((area) => ({ value: area.id, label: area.label })),
    ],
    [kind],
  );

  function chooseKind(next: FeedbackKind) {
    setDraft((current) => ({ ...current, kind: next }));
    setErrors({});
    setServerError("");
    requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0 }));
  }

  function backToKinds() {
    setDraft((current) => ({ ...current, kind: null }));
    setErrors({});
    setServerError("");
    requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0 }));
  }

  async function pickImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImageError("");
    setImageBusy(true);
    try {
      setScreenshot(await compressImage(file));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Não foi possível usar essa imagem.");
    } finally {
      setImageBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!kind) return;
    setServerError("");
    const payload = {
      kind,
      title: draft.title,
      description: draft.description,
      area: draft.area || null,
      steps: draft.steps,
      expected: draft.expected,
      frequency: draft.frequency || null,
      severity: draft.severity || null,
      problem: draft.problem,
      importance: draft.importance || null,
      contactOk: true,
      contactEmail: user.email,
      tech: null,
      screenshot: screenshot ? { type: "image/jpeg" as const, data: screenshot.data } : null,
    };
    const { value, errors: found } = validateFeedback(payload);
    if (!value) {
      setErrors(found);
      // Leva a pessoa ao primeiro campo com problema.
      requestAnimationFrame(() => {
        const first = bodyRef.current?.querySelector<HTMLElement>(".has-error input, .has-error textarea, .has-error button, .has-error select");
        first?.focus();
        first?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await sendFeedback(value);
      clearDraft();
      setDraft(EMPTY_DRAFT);
      setScreenshot(null);
      setSent({ email: user.email });
      requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0 }));
    } catch (err) {
      setServerError(
        err instanceof Error
          ? err.message
          : "Não foi possível enviar agora. Seu texto continua aqui: tente de novo em instantes.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const info = kind ? FEEDBACK_KIND_INFO[kind] : null;
  const KindIcon = kind ? KIND_ICON[kind] : null;
  const errorList = Object.values(errors).filter(Boolean) as string[];

  const titleId = `${baseId}-title`;

  return (
    <div className="dialog-layer fb-layer">
      <div className="dialog-backdrop" onClick={close} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fb-dialog"
      >
        <header className="fb-header">
          <span className="fb-header-icon" aria-hidden="true">
            <MessageCircleHeart size={22} />
          </span>
          <div>
            <h2 id={titleId}>{sent ? "Recebemos a sua mensagem" : "Central de ajuda"}</h2>
            <p>
              {sent
                ? "Obrigado por parar um minuto para ajudar."
                : "Sua voz ajuda o Casa Mia a ficar melhor. Escreva do seu jeito."}
            </p>
          </div>
          <button type="button" className="fb-close" onClick={close} disabled={busy} aria-label="Fechar janela">
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="fb-body" ref={bodyRef}>
          {sent ? (
            <div className="fb-thanks">
              <span className="fb-thanks-mark" aria-hidden="true">
                <Check size={30} strokeWidth={2.6} />
              </span>
              <h3>Deu tudo certo, {user.name.split(" ")[0]}!</h3>
              <p>
                A sua mensagem chegou para a equipe do Casa Mia. A gente lê cada uma com carinho e usa o que você
                contou para melhorar o app.
              </p>
              <p>
                Se precisarmos de mais detalhes, escrevemos para <strong>{sent.email}</strong>.
              </p>
              <div className="fb-actions fb-actions-center">
                <button type="button" className="button button-outline" onClick={() => setSent(null)}>
                  Enviar outra mensagem
                </button>
                <button type="button" className="button button-dark" onClick={onClose}>
                  Voltar para o app
                </button>
              </div>
            </div>
          ) : !kind ? (
            <>
              <p className="fb-lead">
                Encontrou um problema, tem uma ideia ou quer só conversar? Sobre o que você quer falar?
              </p>
              {restored && (
                <p className="fb-restored" role="status">
                  Guardamos o rascunho que você começou. É só escolher o tipo para continuar de onde parou.
                </p>
              )}
              <div className="fb-kinds" role="list">
                {(Object.keys(FEEDBACK_KIND_INFO) as FeedbackKind[]).map((option) => {
                  const Icon = KIND_ICON[option];
                  return (
                    <button
                      key={option}
                      type="button"
                      role="listitem"
                      className={`fb-kind is-${option}`}
                      onClick={() => chooseKind(option)}
                    >
                      <span className="fb-kind-icon" aria-hidden="true">
                        <Icon size={24} />
                      </span>
                      <span className="fb-kind-text">
                        <strong>{FEEDBACK_KIND_INFO[option].label}</strong>
                        <small>{FEEDBACK_KIND_INFO[option].hint}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="fb-promise">
                <ShieldCheck size={16} aria-hidden="true" />
                <span>
                  Só a equipe do Casa Mia lê o que você escreve. Nenhum relato é bobo, e ninguém vai te julgar.
                </span>
              </p>
            </>
          ) : (
            <form onSubmit={submit} noValidate className="fb-form" aria-label={info?.label}>
              <div className="fb-kind-bar">
                <span className={`fb-kind-chip is-${kind}`}>
                  {KindIcon && <KindIcon size={16} aria-hidden="true" />}
                  {info?.label}
                </span>
                <button type="button" className="fb-link" onClick={backToKinds} disabled={busy}>
                  <ArrowLeft size={14} aria-hidden="true" /> Trocar tipo
                </button>
              </div>

              {kind === "bug" && (
                <p className="fb-lead">
                  Poxa, sentimos por isso. Quanto mais você contar, mais rápido a gente acha o problema. Pode escrever do
                  seu jeito, sem termo técnico.
                </p>
              )}
              {kind === "idea" && (
                <p className="fb-lead">
                  Que bom ter você ajudando a construir o Casa Mia! Conte o que você imagina; ideias simples também
                  valem muito.
                </p>
              )}
              {kind === "other" && (
                <p className="fb-lead">Pode falar à vontade: uma dúvida, um elogio ou qualquer coisa que queira dizer.</p>
              )}

              {errorList.length > 0 && (
                <div className="fb-summary" role="alert">
                  <strong>Falta pouco para enviar:</strong>
                  <ul>
                    {errorList.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <section className="fb-section" aria-labelledby={`${baseId}-s1`}>
                <h3 id={`${baseId}-s1`}>
                  <span className="fb-step" aria-hidden="true">1</span>
                  {kind === "bug" ? "O que aconteceu" : kind === "idea" ? "A sua ideia" : "A sua mensagem"}
                </h3>

                <Field
                  id={`${baseId}-title`}
                  label="Resumo em uma frase"
                  required
                  error={errors.title}
                  counter={<Counter value={draft.title} max={FEEDBACK_LIMITS.title.max} />}
                  hint={
                    kind === "bug"
                      ? "Por exemplo: “Não consigo salvar a semana de compra do sofá”."
                      : kind === "idea"
                        ? "Por exemplo: “Ver a lista agrupada por loja”."
                        : "Por exemplo: “Dúvida sobre o convite” ou “Adorei o planejamento”."
                  }
                >
                  <input
                    id={`${baseId}-title`}
                    value={draft.title}
                    maxLength={FEEDBACK_LIMITS.title.max + 20}
                    onChange={(event) => set("title", event.target.value)}
                    aria-invalid={Boolean(errors.title)}
                    aria-describedby={`${baseId}-title-hint${errors.title ? ` ${baseId}-title-error` : ""}`}
                    autoComplete="off"
                    data-dialog-autofocus
                  />
                </Field>

                <Field
                  id={`${baseId}-area`}
                  label={kind === "bug" ? "Onde isso aconteceu?" : "Sobre qual parte do app?"}
                  required={kind === "bug"}
                  optional={kind !== "bug"}
                  error={errors.area}
                >
                  <Select
                    id={`${baseId}-area`}
                    ariaLabel={kind === "bug" ? "Onde isso aconteceu" : "Sobre qual parte do app"}
                    value={draft.area}
                    options={areaOptions}
                    onChange={(value) => set("area", value as FeedbackArea | "")}
                    disabled={busy}
                  />
                </Field>

                <Field
                  id={`${baseId}-desc`}
                  label={
                    kind === "bug"
                      ? "Conte o que aconteceu"
                      : kind === "idea"
                        ? "Descreva a sua ideia"
                        : "Escreva a sua mensagem"
                  }
                  required
                  error={errors.description}
                  counter={<Counter value={draft.description} max={FEEDBACK_LIMITS.description.max} />}
                  hint={
                    kind === "bug"
                      ? "O que você viu na tela? Apareceu alguma mensagem de erro?"
                      : kind === "idea"
                        ? "Como você imagina que funcionaria?"
                        : undefined
                  }
                >
                  <textarea
                    id={`${baseId}-desc`}
                    rows={5}
                    value={draft.description}
                    onChange={(event) => set("description", event.target.value)}
                    aria-invalid={Boolean(errors.description)}
                    aria-describedby={`${baseId}-desc-hint${errors.description ? ` ${baseId}-desc-error` : ""}`}
                  />
                </Field>
              </section>

              {kind === "bug" && (
                <section className="fb-section" aria-labelledby={`${baseId}-s2`}>
                  <h3 id={`${baseId}-s2`}>
                    <span className="fb-step" aria-hidden="true">2</span>
                    Ajude a gente a repetir o problema
                  </h3>
                  <Field
                    id={`${baseId}-steps`}
                    label="Como chegar nisso, passo a passo?"
                    optional
                    error={errors.steps}
                    counter={<Counter value={draft.steps} max={FEEDBACK_LIMITS.steps.max} />}
                    hint="Conte o que você tocou, uma coisa depois da outra. Por exemplo: 1. Abri o Planejamento. 2. Troquei a semana. 3. Toquei em salvar."
                  >
                    <textarea
                      id={`${baseId}-steps`}
                      rows={4}
                      value={draft.steps}
                      onChange={(event) => set("steps", event.target.value)}
                      aria-describedby={`${baseId}-steps-hint`}
                    />
                  </Field>
                  <Field
                    id={`${baseId}-expected`}
                    label="O que você esperava que acontecesse?"
                    optional
                    error={errors.expected}
                    counter={<Counter value={draft.expected} max={FEEDBACK_LIMITS.expected.max} />}
                  >
                    <textarea
                      id={`${baseId}-expected`}
                      rows={2}
                      value={draft.expected}
                      onChange={(event) => set("expected", event.target.value)}
                    />
                  </Field>
                  <ChoiceGroup
                    legend="O quanto isso atrapalha você?"
                    name={`${baseId}-severity`}
                    value={draft.severity}
                    options={FEEDBACK_SEVERITIES}
                    onChange={(value) => set("severity", value)}
                    error={errors.severity}
                    required
                  />
                  <ChoiceGroup
                    legend="Com que frequência acontece?"
                    name={`${baseId}-frequency`}
                    value={draft.frequency}
                    options={FEEDBACK_FREQUENCIES}
                    onChange={(value) => set("frequency", value)}
                    error={errors.frequency}
                    optional
                  />
                </section>
              )}

              {kind === "idea" && (
                <section className="fb-section" aria-labelledby={`${baseId}-s2`}>
                  <h3 id={`${baseId}-s2`}>
                    <span className="fb-step" aria-hidden="true">2</span>
                    Por que isso ajudaria
                  </h3>
                  <Field
                    id={`${baseId}-problem`}
                    label="Que dificuldade isso resolve para você?"
                    optional
                    error={errors.problem}
                    counter={<Counter value={draft.problem} max={FEEDBACK_LIMITS.problem.max} />}
                    hint="Entender o motivo nos ajuda a pensar na melhor solução, que às vezes é diferente da ideia inicial."
                  >
                    <textarea
                      id={`${baseId}-problem`}
                      rows={3}
                      value={draft.problem}
                      onChange={(event) => set("problem", event.target.value)}
                      aria-describedby={`${baseId}-problem-hint`}
                    />
                  </Field>
                  <ChoiceGroup
                    legend="O quanto faria falta?"
                    name={`${baseId}-importance`}
                    value={draft.importance}
                    options={FEEDBACK_IMPORTANCES}
                    onChange={(value) => set("importance", value)}
                    error={errors.importance}
                    optional
                  />
                </section>
              )}

              {kind !== "other" && (
                <section className="fb-section" aria-labelledby={`${baseId}-s3`}>
                  <h3 id={`${baseId}-s3`}>
                    <span className="fb-step" aria-hidden="true">3</span>
                    Uma imagem ajuda muito
                  </h3>
                  <p className="fb-hint">
                    {kind === "bug"
                      ? "Se der, anexe uma captura da tela com o problema. Ela encurta muito a conversa."
                      : "Um desenho, uma captura de tela ou uma foto de como você imagina. Opcional."}{" "}
                    A imagem é reduzida no seu aparelho antes de enviar.
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="fb-file"
                    onChange={pickImage}
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                  {screenshot ? (
                    <div className="fb-shot">
                      <img src={screenshot.previewUrl} alt="Pré-visualização da imagem anexada" />
                      <div>
                        <strong>{screenshot.name}</strong>
                        <small>Anexada e pronta para enviar</small>
                      </div>
                      <button
                        type="button"
                        className="fb-link is-danger"
                        onClick={() => setScreenshot(null)}
                        disabled={busy}
                      >
                        <Trash2 size={14} aria-hidden="true" /> Remover
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="fb-attach"
                      onClick={() => fileRef.current?.click()}
                      disabled={busy || imageBusy}
                    >
                      {imageBusy ? (
                        <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <ImagePlus size={18} aria-hidden="true" />
                      )}
                      {imageBusy ? "Preparando a imagem…" : "Anexar uma imagem"}
                    </button>
                  )}
                  {(imageError || errors.screenshot) && (
                    <p className="fb-error" role="alert">
                      {imageError || errors.screenshot}
                    </p>
                  )}
                </section>
              )}

              {serverError && (
                <div className="fb-summary is-server" role="alert">
                  {serverError}
                </div>
              )}

              <div className="fb-actions">
                <p className="fb-promise">
                  <ShieldCheck size={16} aria-hidden="true" />
                  <span>Só a equipe do Casa Mia lê esta mensagem. Responderemos pelo e-mail cadastrado na sua conta.</span>
                </p>
                <div className="fb-actions-buttons">
                  <button type="button" className="button button-outline" onClick={close} disabled={busy}>
                    Cancelar
                  </button>
                  <button type="submit" className="button button-dark" disabled={busy || imageBusy}>
                    {busy ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : null}
                    {busy ? "Enviando…" : "Enviar mensagem"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
