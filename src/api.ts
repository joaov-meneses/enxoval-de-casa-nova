import type {
  AuthUser,
  AdminUser,
  BootstrapData,
  EnxovalCategory,
  EnxovalItem,
  EnxovalMember,
  EnxovalWorkspace,
  ItemStatus,
} from "./types";
import { isItemStatus, normalizeItemStatus } from "./itemStatus";
import type { Answers, PlanPayload } from "./onboarding/types";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

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
    } | null;
    // Rota que o servidor não conhece (404 sem mensagem): em desenvolvimento quase sempre é um servidor que
    // ainda roda o código antigo. A dica some do build de produção, que usa a mensagem genérica.
    const staleServerHint =
      import.meta.env.DEV && !body?.error && response.status === 404
        ? "O servidor não reconheceu esta ação. Se você acabou de atualizar o código, reinicie o servidor (npm run dev)."
        : null;
    throw new ApiError(
      body?.error ??
        staleServerHint ??
        "Não foi possível concluir a operação.",
      response.status,
    );
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

/** `onboarding` vem do funil /comecar: cria a conta já com o primeiro enxoval pronto. */
export function register(
  name: string,
  email: string,
  password: string,
  onboarding?: { enxovalName: string; plan: PlanPayload; profile?: Answers },
) {
  return request<BootstrapData>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password, ...onboarding }),
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
export function updateEnxoval(
  enxovalId: string,
  updates:
    | string
    | Partial<Pick<EnxovalWorkspace["enxoval"], "name" | "discountCents">>,
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

export function inviteMember(enxovalId: string, email: string) {
  return request<EnxovalMember>(`/api/enxovais/${enxovalId}/members`, {
    method: "POST",
    body: JSON.stringify({ email }),
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
}) {
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
    >
  >,
) {
  return request<EnxovalItem>(`/api/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function deleteItem(id: string) {
  return request<void>(`/api/items/${id}`, { method: "DELETE" });
}

export type {
  AuthUser,
  BootstrapData,
  EnxovalCategory,
  EnxovalItem,
  EnxovalMember,
  EnxovalWorkspace,
};
