import type {
  AuthUser,
  AdminUser,
  BootstrapData,
  EnxovalCategory,
  EnxovalItem,
  EnxovalMember,
  EnxovalWorkspace,
} from "./types";
import { demoRequest, isDemoMode } from "./demo";
import type { Answers, PlanPayload } from "./onboarding/types";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (isDemoMode()) return demoRequest<T>(path, options);
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
    throw new ApiError(
      body?.error ?? "Não foi possível concluir a operação.",
      response.status,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
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
    method: "POST", body: JSON.stringify({ password, confirmation }),
  });
}

export const adminSession = () => request<{ login: string }>("/api/admin/session");
export const adminLogin = (login: string, password: string) => request<{ login: string }>("/api/admin/login", {
  method: "POST", body: JSON.stringify({ login, password }),
});
export const adminLogout = () => request<void>("/api/admin/logout", { method: "POST" });
export const fetchAdminUsers = () => request<{ users: AdminUser[] }>("/api/admin/users");
export const resetUserPassword = (id: string) => request<{ temporaryPassword: string; expiresAt: string }>(`/api/admin/users/${encodeURIComponent(id)}/reset-password`, { method: "POST" });
export const setUserActive = (id: string, isActive: boolean) => request<void>(`/api/admin/users/${encodeURIComponent(id)}/status`, {
  method: "PATCH", body: JSON.stringify({ isActive }),
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
      "name" | "checked" | "link" | "description" | "priceCents" | "categoryId"
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
