import type {
  AuthUser,
  AdminUser,
  BootstrapData,
  EnxovalCategory,
  EnxovalInvitation,
  EnxovalItem,
  EnxovalMember,
  EnxovalWorkspace,
  InvitationPreview,
  AdminCatalogItem,
  AdminCatalogMetrics,
  CatalogSuggestion,
  ItemAssessment,
  ItemPriceHistory,
  ItemStatus,
  ItemTrackingInput,
  ItemUrgencyResult,
  NextItemRecommendation,
  ScrapedProductPreview,
} from "./types";
import { isItemStatus, normalizeItemStatus } from "./itemStatus";
import type { Answers, PlanPayload } from "./onboarding/types";
import type { AdminFeedback, FeedbackInput, FeedbackStatus } from "./feedback";
import { isLimitCode, type LimitCode } from "./plans";

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
    )
      return { ...obj, status: normalizeItemStatus(obj) };
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key, withItemStatus(value)]),
    );
  }
  return data;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
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
        "Não foi possível concluir a operação.",
      response.status,
      body?.code,
    );
    if (isLimitCode(body?.code))
      window.dispatchEvent(
        new CustomEvent<LimitReachedDetail>(LIMIT_REACHED_EVENT, {
          detail: { code: body.code, message: error.message },
        }),
      );
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return withItemStatus(await response.json()) as T;
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
export function register(email: string, password: string) {
  return request<BootstrapData>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
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

export function fetchEnxoval(enxovalId: string) {
  return request<EnxovalWorkspace>(`/api/enxovais/${enxovalId}`);
}

export function createEnxoval(name: string, useDefaultTemplate: boolean) {
  return request<EnxovalWorkspace>("/api/enxovais", {
    method: "POST",
    body: JSON.stringify({ name, useDefaultTemplate }),
  });
}

/** Passo final do funil /comecar: cria o primeiro enxoval já com o plano gerado e as respostas. */
export function createEnxovalFromOnboarding(
  enxovalName: string,
  plan: PlanPayload,
  profile: Answers,
  userName: string,
) {
  return request<EnxovalWorkspace>("/api/enxovais", {
    method: "POST",
    body: JSON.stringify({ name: enxovalName, plan, profile, userName }),
  });
}
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
    body: JSON.stringify({ token, ...account }),
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
    ItemTrackingInput,
) {
  return request<EnxovalItem>(`/api/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

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

/** O servidor tem a chave do Jev? Sem ela, a ajuda do Nino não aparece. */
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

/** Autocomplete do catálogo compartilhado: responde do banco, sem consultar o Jev. */
export const searchCatalog = (query: string, signal?: AbortSignal) =>
  request<{ results: CatalogSuggestion[] }>(`/api/catalog/search?q=${encodeURIComponent(query)}`, { signal });

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

export const fetchAdminCatalog = () =>
  request<{ metrics: AdminCatalogMetrics; pending: AdminCatalogItem[] }>("/api/admin/catalog");

export const approveAdminCatalogItem = (
  id: string,
  patch: { canonicalName?: string; room?: string | null; priority?: "essential" | "optional" },
) =>
  request<{ item: AdminCatalogItem }>(`/api/admin/catalog/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

export const mergeAdminCatalogItem = (id: string, targetId: string) =>
  request<void>(`/api/admin/catalog/${encodeURIComponent(id)}/merge`, {
    method: "POST",
    body: JSON.stringify({ targetId }),
  });

export const completeAdminCatalogItem = (id: string) =>
  request<{ inference: { room: string | null; priority: string | null } }>(
    `/api/admin/catalog/${encodeURIComponent(id)}/complete`,
    { method: "POST" },
  );
