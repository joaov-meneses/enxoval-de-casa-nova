import type {
  AdminCatalogItem,
  AdminCatalogOverview,
  AuthUser,
  AdminBan,
  AdminBanTarget,
  AdminUser,
  CatalogNameMatch,
  CatalogSearchResult,
  BootstrapData,
  EnxovalCategory,
  EnxovalInvitation,
  EnxovalItem,
  EnxovalMember,
  EnxovalWorkspace,
  InvitationPreview,
  ItemAssessment,
  ItemDocument,
  ItemDocumentKind,
  ItemExtrasInput,
  ItemPriceHistory,
  ItemStatus,
  ItemTrackingInput,
  ItemUrgencyResult,
  NextItemRecommendation,
  ScrapedProductPreview,
} from "./types";
import { isDoneStatus, isItemStatus, normalizeItemStatus } from "./itemStatus";
import { SESSION_AUTHENTICATED_EVENT, SESSION_EXPIRED_EVENT } from './sessionActivity';
import * as analytics from './analytics';
import { recordApiSuccess } from './analytics/apiEvents';
import { acquisitionPayload } from './analytics/firstTouch';
import type { Answers, PlanPayload } from "./onboarding/types";
import type { AdminFeedback, FeedbackInput, FeedbackStatus } from "./feedback";
import {
  isLimitCode,
  type AccountPlan,
  type LimitCode,
  type PaidPlanOffer,
} from "./plans";

export type PaidPlanId = PaidPlanOffer["id"];

export class ApiError extends Error {
  status: number;
  /** Código estável do servidor, quando houver (ex.: LIMIT_REACHED_ITEMS). */
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Mensagens de erro na voz da marca ("Ops, tropeçamos aqui"), sempre com o caminho de volta. */
export const NETWORK_ERROR_MESSAGE =
  "Ops, tropeçamos aqui: parece que a conexão caiu. Confira a internet e tente de novo; nada do que você já salvou se perdeu.";
export const GENERIC_ERROR_MESSAGE =
  "Ops, tropeçamos aqui e não deu para concluir agora. Tente de novo em instantes.";

/** Disparado quando o servidor recusa algo pelo limite do plano gratuito: o app abre o convite para os planos. */
export const LIMIT_REACHED_EVENT = "casamia:limit-reached";
export type LimitReachedDetail = { code: LimitCode; message: string };

/**
 * Itens vindos de um servidor ainda sem `status` (ou de dados antigos) recebem a situação
 * derivada do marcador `checked`, para o resto do app poder confiar que ela sempre existe.
 */
function withItemStatus(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(withItemStatus);
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (
      typeof obj.checked === "boolean" &&
      "categoryId" in obj &&
      !isItemStatus(obj.status)
    ) {
      const status = normalizeItemStatus(obj);
      return { ...obj, status, checked: isDoneStatus(status) };
    }
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key, withItemStatus(value)]),
    );
  }
  return data;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (path === '/api/auth/register') analytics.capture('signup_submit');
  const started = performance.now();
  const input = { path, method: options.method ?? 'GET', body: options.body, headers: options.headers };
  analytics.captureOperational('application.api.started', input);
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch (error) {
    analytics.captureOperational('application.api.failed', { ...input, duration_ms: performance.now() - started, error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error });
    if (error instanceof Error && error.name === 'AbortError') throw error;
    analytics.captureError(error, { ...input, error_source: 'api' });
    // Sem resposta do servidor (sem internet, servidor fora): a mensagem do navegador vem crua e em inglês.
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0, 'NETWORK');
  }

  const context = { ...input, request_id: response.headers.get('x-request-id'), http_status: response.status,
    duration_ms: performance.now() - started, response_headers: Object.fromEntries(response.headers.entries()) };
  const readBody = async () => {
    try { return await response.text(); }
    catch (error) {
      analytics.captureOperational('application.api.failed', { ...context, phase: 'response.read', error: String(error) });
      if (!(error instanceof Error && error.name === 'AbortError')) analytics.captureError(error, { ...context, error_source: 'api', phase: 'response.read' });
      throw error;
    }
  };
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    const rawResponse = await readBody();
    let parsedResponse: unknown;
    try { parsedResponse = JSON.parse(rawResponse); } catch { parsedResponse = null; }
    const body = parsedResponse as {
      error?: string;
      code?: string;
    } | null;
    // Rota que o servidor não conhece (404 sem mensagem): em desenvolvimento quase sempre é um servidor que
    // ainda roda o código antigo. A dica some do build de produção, que usa a mensagem genérica.
    const staleServerHint =
      import.meta.env.DEV && !body?.error && response.status === 404
        ? "O servidor não reconheceu esta ação. Se você acabou de atualizar o código, reinicie o servidor (npm run dev)."
        : null;
    const error = new ApiError(
      body?.error ??
        staleServerHint ??
        GENERIC_ERROR_MESSAGE,
      response.status,
      body?.code,
    );
    analytics.captureOperational('application.api.failed', { ...context, response: body ?? rawResponse, error: { name: error.name, message: error.message, stack: error.stack, code: error.code } });
    analytics.captureError(error, { ...context, response: body ?? rawResponse, error_source: 'api' });
    if (body?.code === "SUBSCRIPTION_REQUIRED") window.dispatchEvent(new Event("casamia:subscription-required"));
    if (isLimitCode(body?.code))
      window.dispatchEvent(
        new CustomEvent<LimitReachedDetail>(LIMIT_REACHED_EVENT, {
          detail: { code: body.code, message: error.message },
        }),
      );
    if (path === '/api/billing/checkout') {
      try {
        const { plan } = JSON.parse(String(options.body));
        if (plan === 'monthly' || plan === 'pass') analytics.capture('checkout_failed', { plan });
      } catch { /* Do not inspect non-JSON bodies. */ }
    }
    throw error;
  }

  if (path.startsWith('/api/bootstrap') || ['/api/auth/login', '/api/auth/register', '/api/auth/change-password'].includes(path)) {
    window.dispatchEvent(new Event(SESSION_AUTHENTICATED_EVENT));
  }
  let data: unknown;
  let originalData: unknown;
  const rawResponse = response.status === 204 ? '' : await readBody();
  try {
    originalData = response.status === 204 ? undefined : JSON.parse(rawResponse);
    data = withItemStatus(originalData);
  } catch (error) {
    analytics.captureOperational('application.api.failed', { ...context, response: rawResponse, phase: 'response.parse', error: String(error) });
    analytics.captureError(error, { ...context, response: rawResponse, error_source: 'api', phase: 'response.parse' });
    throw error;
  }
  analytics.captureOperational('application.api.completed', { ...context, duration_ms: performance.now() - started, response: originalData });
  try {
    const input = typeof options.body === 'string' ? JSON.parse(options.body) : {};
    recordApiSuccess(analytics, path, options.method ?? 'GET', input, data);
  } catch { /* Telemetry never changes the result of an API action. */ }
  return data as T;
}

export function fetchBootstrap(enxovalId?: string) {
  const suffix = enxovalId ? `?enxovalId=${encodeURIComponent(enxovalId)}` : "";
  return request<BootstrapData>(`/api/bootstrap${suffix}`);
}

export function login(email: string, password: string) {
  return request<BootstrapData>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

/** Cria só a conta (sem enxoval, e sem nome: o funil /comecar pergunta o nome e monta o primeiro enxoval depois, já autenticado). */
/** `emailMarketing`: caixa "quero lembretes e dicas por e-mail" do cadastro (desmarcada por padrão). */
export function register(email: string, password: string, options: { emailMarketing?: boolean } = {}) {
  return request<BootstrapData>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, emailMarketing: Boolean(options.emailMarketing), acquisition: acquisitionPayload() }),
  });
}

export function logout() {
  return request<void>("/api/auth/logout", { method: "POST" });
}

export function changeRequiredPassword(password: string, confirmation: string) {
  return request<BootstrapData>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ password, confirmation }),
  });
}

/** Pede o link de redefinição. A resposta é a mesma exista ou não conta com o e-mail. */
export function requestPasswordReset(email: string) {
  return request<{ ok: boolean }>("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function checkPasswordResetToken(token: string) {
  return request<{ valid: boolean }>("/api/auth/reset-password/check", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function resetPassword(
  token: string,
  password: string,
  confirmation: string,
) {
  return request<{ ok: boolean }>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password, confirmation }),
  });
}

export const adminSession = () =>
  request<{ login: string }>("/api/admin/session");
export const adminLogin = (login: string, password: string) =>
  request<{ login: string }>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ login, password }),
  });
export const adminLogout = () =>
  request<void>("/api/admin/logout", { method: "POST" });
export const fetchAdminUsers = () =>
  request<{ users: AdminUser[] }>("/api/admin/users");
export const resetUserPassword = (id: string) =>
  request<{ temporaryPassword: string; expiresAt: string }>(
    `/api/admin/users/${encodeURIComponent(id)}/reset-password`,
    { method: "POST" },
  );
export const setUserActive = (id: string, isActive: boolean) =>
  request<void>(`/api/admin/users/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
export const markUserEmailVerified = (id: string) =>
  request<{ emailVerifiedAt: string }>(
    `/api/admin/users/${encodeURIComponent(id)}/verify-email`,
    { method: "POST" },
  );
export const fetchAdminBans = () => request<{ bans: AdminBan[] }>("/api/admin/bans");
export const createAdminBan = (input: {
  targetType: AdminBanTarget;
  targetValue: string;
  reasonCode: string;
  notes: string;
  /** null = sem prazo. */
  durationHours: number | null;
}) =>
  request<{ id: string }>("/api/admin/bans", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const revokeAdminBan = (id: string) =>
  request<void>(`/api/admin/bans/${encodeURIComponent(id)}/revoke`, { method: "POST" });

/** Confirma o e-mail com o token do link (vale mesmo sem sessão aberta neste navegador). */
export function verifyEmail(token: string) {
  return request<{ ok: true }>("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function resendEmailVerification() {
  return request<{ ok: true; alreadyVerified: boolean }>("/api/auth/verify-email/resend", { method: "POST" });
}

export function fetchEnxoval(enxovalId: string) {
  return request<EnxovalWorkspace>(`/api/enxovais/${enxovalId}`);
}

export function createEnxoval(name: string, useDefaultTemplate: boolean) {
  return request<EnxovalWorkspace>("/api/enxovais", {
    method: "POST",
    body: JSON.stringify({ name, useDefaultTemplate }),
  });
}

/** Compatibilidade com telas antigas: salva o onboarding sem criar ou liberar o enxoval. */
export function createEnxovalFromOnboarding(
  enxovalName: string,
  plan: PlanPayload,
  profile: Answers,
  userName: string,
) {
  return completeOnboarding(enxovalName, plan, profile, userName);
}
export function completeOnboarding(name: string, plan: PlanPayload, profile: Answers, userName: string) {
  return request<{ completed: boolean }>("/api/onboarding/complete", {
    method: "POST", body: JSON.stringify({ name, plan, profile, userName }),
  });
}
export interface ProfileData { id: string; name: string; email: string; avatarUrl: string | null; createdAt: string; }
export const fetchProfile = () => request<ProfileData>('/api/profile');
export const fetchMarketingPreference = () => request<{ subscribed: boolean }>('/api/profile/marketing');
export const updateMarketingPreference = (subscribed: boolean) =>
  request<{ subscribed: boolean }>('/api/profile/marketing', { method: 'PATCH', body: JSON.stringify({ subscribed }) });

export interface EmailPreferences {
  email: string;
  subscribed: boolean;
  reminders: boolean;
  tips: boolean;
  pausedUntil: string | null;
}
export const fetchEmailPreferences = (token: string) =>
  request<EmailPreferences>(`/api/preferences?token=${encodeURIComponent(token)}`);
export const updateEmailPreferences = (token: string, changes: { subscribed?: boolean; reminders?: boolean; tips?: boolean; pause?: boolean }) =>
  request<EmailPreferences>('/api/preferences', { method: 'POST', body: JSON.stringify({ token, ...changes }) });
export const updateProfile = (name: string) => request<ProfileData>('/api/profile', { method: 'PATCH', body: JSON.stringify({ name }) });
export const uploadProfileAvatar = (image: Blob) => request<ProfileData>('/api/profile/avatar', { method: 'POST', headers: { 'Content-Type': image.type || 'image/jpeg' }, body: image });
export const removeProfileAvatar = () => request<ProfileData>('/api/profile/avatar', { method: 'DELETE' });
export function updateEnxoval(
  enxovalId: string,
  updates:
    | string
    | Partial<
        Pick<
          EnxovalWorkspace["enxoval"],
          | "name"
          | "discountCents"
          | "moveDate"
          | "spendingTier"
          | "state"
          | "city"
          | "monthlyBudgetCents"
        >
      >,
) {
  const body = typeof updates === "string" ? { name: updates } : updates;
  return request<EnxovalWorkspace["enxoval"]>(`/api/enxovais/${enxovalId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteEnxoval(enxovalId: string) {
  return request<void>(`/api/enxovais/${enxovalId}`, { method: "DELETE" });
}

/** Envia o convite por e-mail. A pessoa só entra no enxoval quando aceita pelo link. */
export function inviteMember(enxovalId: string, email: string) {
  return request<EnxovalInvitation>(`/api/enxovais/${enxovalId}/invitations`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function fetchInvitations(enxovalId: string) {
  return request<EnxovalInvitation[]>(`/api/enxovais/${enxovalId}/invitations`);
}

export function revokeInvitation(enxovalId: string, invitationId: string) {
  return request<void>(
    `/api/enxovais/${enxovalId}/invitations/${encodeURIComponent(invitationId)}`,
    { method: "DELETE" },
  );
}

export function removeMember(enxovalId: string, userId: string) {
  return request<void>(
    `/api/enxovais/${enxovalId}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
}

export function checkInvitation(token: string) {
  return request<InvitationPreview>("/api/invitations/check", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

/** Quem já tem conta aceita logado (sem `account`); quem não tem cria nome e senha aqui. */
export function acceptInvitation(
  token: string,
  account?: { name: string; password: string; confirmation: string },
) {
  return request<BootstrapData>("/api/invitations/accept", {
    method: "POST",
    body: JSON.stringify({ token, ...account, ...(account ? { acquisition: acquisitionPayload() } : {}) }),
  });
}

export function createCategory(enxovalId: string, name: string) {
  return request<EnxovalCategory>("/api/categories", {
    method: "POST",
    body: JSON.stringify({ enxovalId, name }),
  });
}

export function reorderCategories(enxovalId: string, categoryIds: string[]) {
  return request<EnxovalCategory[]>("/api/categories/order", {
    method: "PATCH",
    body: JSON.stringify({ enxovalId, categoryIds }),
  });
}

export function renameCategory(
  enxovalId: string,
  categoryId: string,
  name: string,
) {
  return request<EnxovalCategory>(
    `/api/categories/${encodeURIComponent(categoryId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ enxovalId, name }),
    },
  );
}
export function deleteCategory(enxovalId: string, categoryId: string) {
  return request<void>(
    `/api/categories/${encodeURIComponent(categoryId)}?enxovalId=${encodeURIComponent(enxovalId)}`,
    { method: "DELETE" },
  );
}
export function reorderItems(
  enxovalId: string,
  categoryId: string,
  itemIds: string[],
) {
  return request<EnxovalItem[]>("/api/items/order", {
    method: "PATCH",
    body: JSON.stringify({ enxovalId, categoryId, itemIds }),
  });
}

export function createItem(input: {
  enxovalId: string;
  name: string;
  categoryId?: string;
  categoryName?: string;
  priceCents?: number | null;
  link?: string;
  description?: string;
  status?: ItemStatus;
  discountCents?: number;
  quantity?: number;
  buyWeek?: number | null;
  /** "top" (padrão): o item novo entra no topo do ambiente. "end": no fim, para manter a ordem de uma planilha importada. */
  placement?: "top" | "end";
} & ItemTrackingInput) {
  return request<{ item: EnxovalItem; category: EnxovalCategory }>(
    "/api/items",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function updateItem(
  id: string,
  updates: Partial<
    Pick<
      EnxovalItem,
      | "name"
      | "checked"
      | "status"
      | "link"
      | "description"
      | "priceCents"
      | "quantity"
      | "discountCents"
      | "categoryId"
      | "buyWeek"
    >
  > &
    ItemTrackingInput &
    ItemExtrasInput,
) {
  return request<EnxovalItem>(`/api/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

/* ---------------------------------------------- Fase 11: lojas e documentos */

/** Adiciona outra loja ao item. Leia o link antes com `extractProduct`, para o preço já vir preenchido. */
export const addItemOffer = (itemId: string, url: string) =>
  request<EnxovalItem>(`/api/items/${encodeURIComponent(itemId)}/offers`, { method: "POST", body: JSON.stringify({ url }) });
export const promoteItemOffer = (itemId: string, offerId: string) =>
  request<EnxovalItem>(`/api/items/${encodeURIComponent(itemId)}/offers/${encodeURIComponent(offerId)}`, { method: "PATCH", body: JSON.stringify({ isPrimary: true }) });
export const removeItemOffer = (itemId: string, offerId: string) =>
  request<EnxovalItem>(`/api/items/${encodeURIComponent(itemId)}/offers/${encodeURIComponent(offerId)}`, { method: "DELETE" });

export const fetchItemDocuments = (itemId: string) =>
  request<{ documents: ItemDocument[] }>(`/api/items/${encodeURIComponent(itemId)}/documents`);
export const uploadItemDocument = (itemId: string, file: Blob, kind: ItemDocumentKind, name: string) =>
  request<{ document: ItemDocument; item: EnxovalItem }>(
    `/api/items/${encodeURIComponent(itemId)}/documents?kind=${kind}&name=${encodeURIComponent(name)}`,
    { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file },
  );
export const deleteItemDocument = (documentId: string) =>
  request<EnxovalItem>(`/api/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" });
export const fetchEnxovalDocuments = (enxovalId: string) =>
  request<{ documents: ItemDocument[]; usedBytes: number; quotaBytes: number }>(`/api/enxovais/${encodeURIComponent(enxovalId)}/documents`);
/** Endereço do ZIP com os documentos do enxoval (ou de um ambiente); o navegador baixa direto do servidor. */
export const enxovalDocumentsZipUrl = (enxovalId: string, categoryId?: string) =>
  `/api/enxovais/${encodeURIComponent(enxovalId)}/documents.zip${categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : ""}`;

export const fetchWarrantyReminders = () => request<{ enabled: boolean }>("/api/profile/warranty-reminders");
export const updateWarrantyReminders = (enabled: boolean) =>
  request<{ enabled: boolean }>("/api/profile/warranty-reminders", { method: "PUT", body: JSON.stringify({ enabled }) });

/** Lê o link de um produto de loja (nome, foto, preço, variações) para preencher o formulário. */
export function extractProduct(url: string) {
  return request<ScrapedProductPreview>("/api/products/extract", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export function fetchItemPriceHistory(itemId: string, days = 60) {
  return request<ItemPriceHistory>(
    `/api/items/${encodeURIComponent(itemId)}/price-history?days=${days}`,
  );
}

/** Central de ajuda: envia um problema, uma sugestão ou outro assunto. */
export function sendFeedback(input: FeedbackInput) {
  return request<{ id: string }>("/api/feedback", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export const fetchAdminFeedback = () =>
  request<{ feedback: AdminFeedback[] }>("/api/admin/feedback");

export const updateAdminFeedbackStatus = (id: string, status: FeedbackStatus) =>
  request<AdminFeedback>(`/api/admin/feedback/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });

/** Autocomplete do catálogo mestre: prefixo, apelidos e similaridade. Não usa IA e responde em milissegundos. */
export const searchCatalog = (query: string, signal?: AbortSignal) =>
  request<{ results: CatalogSearchResult[] }>(`/api/catalog/search?q=${encodeURIComponent(query)}&limit=6`, { signal });

/** Revisão da importação: o item do catálogo de cada nome da planilha, na mesma ordem (null quando não conhece). */
export const matchCatalogNames = (names: string[], signal?: AbortSignal) =>
  request<{ results: (CatalogNameMatch | null)[] }>("/api/catalog/match", {
    method: "POST",
    body: JSON.stringify({ names }),
    signal,
  });

export const fetchAdminCatalogOverview = () =>
  request<AdminCatalogOverview>("/api/admin/catalog/overview");

export const fetchAdminCatalogItems = (filter: { status?: AdminCatalogItem["status"]; q?: string }) => {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.q) params.set("q", filter.q);
  return request<{ items: AdminCatalogItem[] }>(`/api/admin/catalog/items?${params}`);
};

export const updateAdminCatalogItem = (
  id: string,
  changes: Partial<Pick<AdminCatalogItem, "name" | "room" | "priority" | "timing" | "leadTimeWeeks" | "priceCategory" | "functionGroup" | "status">>,
) =>
  request<AdminCatalogItem>(`/api/admin/catalog/items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });

export const mergeAdminCatalogItem = (id: string, targetId: string) =>
  request<AdminCatalogItem>(`/api/admin/catalog/items/${encodeURIComponent(id)}/merge`, {
    method: "POST",
    body: JSON.stringify({ targetId }),
  });

export const deleteAdminCatalogItem = (id: string) =>
  request<void>(`/api/admin/catalog/items/${encodeURIComponent(id)}`, { method: "DELETE" });

/** Pede ao Jev (uma consulta) os dados que faltam num item do catálogo. A equipe ainda revisa e aprova. */
export const completeAdminCatalogItem = (id: string) =>
  request<AdminCatalogItem>(`/api/admin/catalog/items/${encodeURIComponent(id)}/complete`, { method: "POST" });

export const deleteAdminCatalogAlias = (key: string) =>
  request<void>(`/api/admin/catalog/aliases/${encodeURIComponent(key)}`, { method: "DELETE" });

/** O servidor tem a chave do Jev? Sem ela, o Nino acompanha o progresso sem oferecer consultas. */
export const fetchAiStatus = () => request<{ enabled: boolean }>("/api/ai/status");

/** Ambiente provável e aviso de compra redundante para um item que ainda está sendo preenchido. */
export const assessItemDraft = (
  input: { enxovalId: string; name: string; classify: boolean },
  signal?: AbortSignal,
) =>
  request<ItemAssessment>("/api/ai/assess-item", {
    method: "POST",
    body: JSON.stringify(input),
    signal,
  });

export const recommendNextItem = (enxovalId: string, categoryId: string) =>
  request<NextItemRecommendation>("/api/ai/recommend", {
    method: "POST",
    body: JSON.stringify({ enxovalId, categoryId }),
  });

/** Urgência dos itens pendentes de um ambiente. O servidor só consulta o Jev para itens que ainda não têm nota guardada. */
export const prioritizeEnvironment = (enxovalId: string, categoryId: string) =>
  request<ItemUrgencyResult>("/api/ai/prioritize", {
    method: "POST",
    body: JSON.stringify({ enxovalId, categoryId }),
  });

export function deleteItem(id: string) {
  return request<void>(`/api/items/${id}`, { method: "DELETE" });
}

export type {
  AuthUser,
  BootstrapData,
  EnxovalCategory,
  EnxovalInvitation,
  EnxovalItem,
  EnxovalMember,
  EnxovalWorkspace,
};

export interface BillingStatus {
  fiscalEnabled?: boolean;
  fiscalNeedsData?: boolean;
  monthlyPrice?: { amount: number; currency: string } | null;
  passPayment?: { amount: number | null; currency: string | null; sessionId: string } | null;
  passNotice?: string | null;
  trialNotice: 'started' | 'ending' | null;
  subscriptionId: string | null;
  accessAllowed: boolean;
  isOwner: boolean;
  trialEndsAt: string | null;
  trialUsed: boolean;
  /** false quando o servidor ainda não tem as chaves da Stripe. */
  available: boolean;
  plan: AccountPlan;
  status: string | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  /** Fim do Passe da Casa Nova em vigor (ISO), ou null. */
  passExpiresAt: string | null;
  /** Já existe cliente na Stripe, então o portal de assinatura pode abrir. */
  canManage: boolean;
}

export function fetchBillingStatus(enxovalId?: string, signal?: AbortSignal) {
  return request<BillingStatus>(`/api/billing/status${enxovalId ? `?enxovalId=${encodeURIComponent(enxovalId)}` : ""}`, { signal });
}
export interface BillingOffer {
  id: PaidPlanId;
  name: string;
  amount: number;
  currency: string;
  paymentMethods?: ('card' | 'pix')[];
}
export interface FiscalBilling {
  enabled: boolean;
  requireAddress: boolean;
  profile: { name: string; document: string; address?: import('../shared/fiscal').FiscalAddress | null };
  invoices: { id: string; status: 'pending' | 'processing' | 'authorized' | 'cancelled' | 'needs_data' | 'rejected' | 'failed';
    environment: 'homologacao' | 'producao'; amountCents: number; currency: string; number: string | null;
    pdfUrl: string | null; xmlUrl: string | null; errorCode: string | null; createdAt: string }[];
}
export const fetchFiscalBilling = () => request<FiscalBilling>('/api/billing/fiscal');
export const updateFiscalProfile = (profile: FiscalBilling['profile']) => request<FiscalBilling['profile']>('/api/billing/fiscal/profile', { method: 'PUT', body: JSON.stringify(profile) });
export function fetchBillingOffers() {
  return request<{ offers: BillingOffer[] }>('/api/billing/plans');
}
export function acknowledgePassNotice(sessionId: string) {
  return request<void>('/api/billing/pass-notice', { method: 'POST', body: JSON.stringify({ sessionId }) });
}
export function formatBillingAmount(price: { amount: number | null; currency: string | null } | null | undefined) {
  return price && typeof price.amount === 'number' && price.currency
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: price.currency }).format(price.amount / 100)
    : 'valor confirmado no checkout';
}
export function acknowledgeTrialNotice(kind: 'started' | 'ending', subscriptionId: string) {
  return request<void>('/api/billing/trial-notice', { method: 'POST', body: JSON.stringify({ kind, subscriptionId }) });
}

/** Devolve o endereço do checkout da Stripe para o plano escolhido. */
export function startCheckout(plan: PaidPlanId, returnTo = window.location.pathname) {
  return request<{ url: string }>("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ plan, returnTo }),
  });
}

/** Devolve o endereço do portal da Stripe (trocar de plano, cartão, faturas, cancelar). */
export function openBillingPortal() {
  return request<{ url: string }>("/api/billing/portal", { method: "POST" });
}

/** Na volta do checkout: lê a assinatura na Stripe sem esperar o webhook. */
export function syncBilling(sessionId?: string, prepareWorkspace = false) {
  return request<{ plan: AccountPlan; status: string | null; accessAllowed: boolean; enxovalId: string | null }>(
    "/api/billing/sync",
    { method: "POST", body: JSON.stringify({ sessionId, prepareWorkspace }) },
  );
}

export function cancelSubscription() {
  return request<{ canceled: boolean }>("/api/billing/cancel", { method: "POST" });
}
