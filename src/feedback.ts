/**
 * Central de ajuda: relatos de problemas, sugestões de melhoria e outros assuntos.
 * Este arquivo é a fonte única das listas e dos limites: o formulário (cliente) e o servidor usam as mesmas
 * regras, e o servidor é quem decide (o cliente só adianta o aviso para a pessoa).
 */

export type FeedbackKind = "bug" | "idea" | "other";
export const FEEDBACK_KINDS: readonly FeedbackKind[] = ["bug", "idea", "other"];

export const FEEDBACK_KIND_INFO: Record<
  FeedbackKind,
  { label: string; short: string; hint: string }
> = {
  bug: {
    label: "Algo não está funcionando",
    short: "Problema",
    hint: "Um erro, um botão que não responde, algo que sumiu ou que ficou estranho.",
  },
  idea: {
    label: "Tenho uma ideia de melhoria",
    short: "Sugestão",
    hint: "Uma coisa nova, ou um jeito melhor de fazer algo que já existe.",
  },
  other: {
    label: "Outro assunto",
    short: "Outro",
    hint: "Uma dúvida, um elogio, ou qualquer coisa que não se encaixe nas outras.",
  },
};

export const FEEDBACK_AREAS = [
  { id: "overview", label: "Meu Lar" },
  { id: "plan", label: "Planejamento de compras" },
  { id: "list", label: "Lista do enxoval e ambientes" },
  { id: "items", label: "Itens, preços e acompanhamento de preço" },
  { id: "discounts", label: "Descontos e cashback" },
  { id: "share", label: "Convites e compartilhamento" },
  { id: "import", label: "Importar e exportar planilha" },
  { id: "account", label: "Conta, entrada e senha" },
  { id: "onboarding", label: "Criação do plano (primeiros passos)" },
  { id: "other", label: "Outro lugar" },
] as const;
export type FeedbackArea = (typeof FEEDBACK_AREAS)[number]["id"];

export const FEEDBACK_FREQUENCIES = [
  { id: "always", label: "Sempre que eu faço isso" },
  { id: "sometimes", label: "Às vezes" },
  { id: "once", label: "Aconteceu só uma vez" },
] as const;
export type FeedbackFrequency = (typeof FEEDBACK_FREQUENCIES)[number]["id"];

export const FEEDBACK_SEVERITIES = [
  { id: "blocked", label: "Não consigo continuar", hint: "Travou o que eu queria fazer." },
  { id: "annoying", label: "Atrapalha, mas dá para contornar", hint: "Consigo, só que dá trabalho." },
  { id: "minor", label: "É um detalhe", hint: "Não atrapalha, mas vale ajustar." },
] as const;
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number]["id"];

export const FEEDBACK_IMPORTANCES = [
  { id: "nice", label: "Seria legal ter", hint: "Não faz falta, mas agradaria." },
  { id: "helps", label: "Ajudaria bastante", hint: "Facilitaria o meu uso." },
  { id: "essential", label: "Faz muita falta", hint: "Eu usaria o tempo todo." },
] as const;
export type FeedbackImportance = (typeof FEEDBACK_IMPORTANCES)[number]["id"];

export const FEEDBACK_STATUSES = ["new", "seen", "planned", "done", "dismissed"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "Nova",
  seen: "Vista",
  planned: "Planejada",
  done: "Resolvida",
  dismissed: "Arquivada",
};

export const FEEDBACK_LIMITS = {
  title: { min: 4, max: 100 },
  description: { min: 10, max: 2000 },
  steps: { max: 1500 },
  expected: { max: 1000 },
  problem: { max: 1000 },
  email: { max: 120 },
  /** Tamanho máximo da captura de tela em base64 (cerca de 520 KB de imagem). */
  screenshotBase64: 700_000,
} as const;

/** Informações técnicas que o navegador envia (só se a pessoa deixar) para ajudar a reproduzir o problema. */
export interface FeedbackTech {
  path?: string;
  userAgent?: string;
  viewport?: string;
  language?: string;
  timezone?: string;
}

export const SCREENSHOT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ScreenshotType = (typeof SCREENSHOT_TYPES)[number];

export interface FeedbackScreenshot {
  type: ScreenshotType;
  /** Imagem em base64, sem o prefixo "data:". */
  data: string;
}

export interface FeedbackInput {
  kind: FeedbackKind;
  title: string;
  description: string;
  area?: FeedbackArea | null;
  /** Só para problemas. */
  steps?: string;
  expected?: string;
  frequency?: FeedbackFrequency | null;
  severity?: FeedbackSeverity | null;
  /** Só para sugestões. */
  problem?: string;
  importance?: FeedbackImportance | null;
  contactOk: boolean;
  contactEmail?: string;
  tech?: FeedbackTech | null;
  screenshot?: FeedbackScreenshot | null;
}

export type FeedbackErrors = Partial<Record<keyof FeedbackInput, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function oneOf<T extends string>(list: readonly { id: T }[], value: unknown): value is T {
  return typeof value === "string" && list.some((item) => item.id === value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/** Limpa o que veio de fora para o formato esperado (sem confiar em nada) e aponta o que está errado. */
export function validateFeedback(raw: unknown): {
  value: FeedbackInput | null;
  errors: FeedbackErrors;
} {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const errors: FeedbackErrors = {};
  const kind = FEEDBACK_KINDS.includes(source.kind as FeedbackKind)
    ? (source.kind as FeedbackKind)
    : null;
  if (!kind) errors.kind = "Escolha o tipo da mensagem.";

  const title = text(source.title);
  if (title.length < FEEDBACK_LIMITS.title.min || title.length > FEEDBACK_LIMITS.title.max) {
    errors.title = `Dê um título de ${FEEDBACK_LIMITS.title.min} a ${FEEDBACK_LIMITS.title.max} letras.`;
  }
  const description = text(source.description);
  if (
    description.length < FEEDBACK_LIMITS.description.min ||
    description.length > FEEDBACK_LIMITS.description.max
  ) {
    errors.description = `Conte um pouco mais (de ${FEEDBACK_LIMITS.description.min} a ${FEEDBACK_LIMITS.description.max} letras).`;
  }

  const optionalText = (key: "steps" | "expected" | "problem", max: number) => {
    const value = text(source[key]);
    if (value.length > max) errors[key] = `Use no máximo ${max} letras.`;
    return value;
  };
  const steps = kind === "bug" ? optionalText("steps", FEEDBACK_LIMITS.steps.max) : "";
  const expected = kind === "bug" ? optionalText("expected", FEEDBACK_LIMITS.expected.max) : "";
  const problem = kind === "idea" ? optionalText("problem", FEEDBACK_LIMITS.problem.max) : "";

  let area: FeedbackArea | null = null;
  if (source.area !== undefined && source.area !== null && source.area !== "") {
    if (oneOf(FEEDBACK_AREAS, source.area)) area = source.area;
    else errors.area = "Escolha um lugar da lista.";
  }
  if (kind === "bug" && !area && !errors.area) errors.area = "Diga onde isso aconteceu.";

  let frequency: FeedbackFrequency | null = null;
  let severity: FeedbackSeverity | null = null;
  let importance: FeedbackImportance | null = null;
  if (kind === "bug") {
    if (source.frequency !== undefined && source.frequency !== null && source.frequency !== "") {
      if (oneOf(FEEDBACK_FREQUENCIES, source.frequency)) frequency = source.frequency;
      else errors.frequency = "Escolha uma opção.";
    }
    if (oneOf(FEEDBACK_SEVERITIES, source.severity)) severity = source.severity;
    else errors.severity = "Conte o quanto isso atrapalha.";
  }
  if (kind === "idea" && source.importance !== undefined && source.importance !== null && source.importance !== "") {
    if (oneOf(FEEDBACK_IMPORTANCES, source.importance)) importance = source.importance;
    else errors.importance = "Escolha uma opção.";
  }

  const contactOk = source.contactOk === true;
  const contactEmail = text(source.contactEmail).toLowerCase();
  if (contactOk && (!EMAIL.test(contactEmail) || contactEmail.length > FEEDBACK_LIMITS.email.max)) {
    errors.contactEmail = "Informe um e-mail válido para a gente responder.";
  }

  let tech: FeedbackTech | null = null;
  if (source.tech && typeof source.tech === "object") {
    const t = source.tech as Record<string, unknown>;
    const clip = (value: unknown, max: number) => {
      const v = text(value).slice(0, max);
      return v || undefined;
    };
    tech = {
      path: clip(t.path, 200),
      userAgent: clip(t.userAgent, 300),
      viewport: clip(t.viewport, 20),
      language: clip(t.language, 20),
      timezone: clip(t.timezone, 60),
    };
  }

  let screenshot: FeedbackScreenshot | null = null;
  if (source.screenshot && typeof source.screenshot === "object") {
    const s = source.screenshot as Record<string, unknown>;
    if (
      !(SCREENSHOT_TYPES as readonly unknown[]).includes(s.type) ||
      typeof s.data !== "string" ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(s.data) ||
      s.data.length > FEEDBACK_LIMITS.screenshotBase64
    ) {
      errors.screenshot = "Não foi possível usar essa imagem. Tente uma captura menor.";
    } else {
      screenshot = { type: s.type as ScreenshotType, data: s.data };
    }
  }

  if (Object.keys(errors).length > 0 || !kind) return { value: null, errors };
  return {
    value: {
      kind,
      title,
      description,
      area,
      steps,
      expected,
      frequency,
      severity,
      problem,
      importance,
      contactOk,
      contactEmail: contactOk ? contactEmail : "",
      tech,
      screenshot,
    },
    errors,
  };
}

/** Confere se os primeiros bytes são mesmo de uma imagem do tipo informado (não basta confiar no texto enviado). */
export function imageMatchesType(bytes: Uint8Array, type: ScreenshotType) {
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (type === "image/jpeg") return startsWith(0xff, 0xd8, 0xff);
  if (type === "image/png") return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  return (
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

/** Mensagem como o painel administrativo recebe. */
export interface AdminFeedback {
  id: string;
  createdAt: string;
  status: FeedbackStatus;
  kind: FeedbackKind;
  title: string;
  description: string;
  area: FeedbackArea | null;
  steps: string;
  expected: string;
  frequency: FeedbackFrequency | null;
  severity: FeedbackSeverity | null;
  problem: string;
  importance: FeedbackImportance | null;
  contactOk: boolean;
  contactEmail: string;
  userName: string;
  userEmail: string;
  tech: FeedbackTech | null;
  hasScreenshot: boolean;
}
