import type { AuthUser, BootstrapData, EnxovalCategory, EnxovalItem } from './types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new ApiError(body?.error ?? 'Não foi possível concluir a operação.', response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function fetchBootstrap() {
  return request<BootstrapData>('/api/bootstrap');
}

export function login(email: string, password: string) {
  return request<BootstrapData>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export function register(name: string, email: string, password: string) {
  return request<BootstrapData>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password })
  });
}

export function logout() {
  return request<void>('/api/auth/logout', { method: 'POST' });
}

export function createItem(input: { name: string; categoryId?: string; categoryName?: string }) {
  return request<{ item: EnxovalItem; category: EnxovalCategory }>('/api/items', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

export function updateItem(id: string, updates: Partial<Pick<EnxovalItem, 'name' | 'checked' | 'link' | 'description' | 'categoryId'>>) {
  return request<EnxovalItem>(`/api/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  });
}

export type { AuthUser, BootstrapData, EnxovalCategory, EnxovalItem };