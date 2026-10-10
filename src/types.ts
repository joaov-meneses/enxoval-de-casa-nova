import type { ItemStatus } from './itemStatus';

export type { ItemStatus };
export type Category = string;
export type EnxovalRole = 'owner' | 'editor';

export interface EnxovalSummary {
  id: string;
  name: string;
  ownerId: string;
  role: EnxovalRole;
  discountCents: number;
}

export interface EnxovalMember {
  id: string;
  name: string;
  email: string;
  role: EnxovalRole;
}

export interface EnxovalCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface EnxovalItem {
  id: string;
  name: string;
  categoryId: string;
  category: Category;
  /** Derivado de `status`: verdadeiro quando o item já foi conquistado (comprei, ganhei ou já tenho). */
  checked: boolean;
  status: ItemStatus;
  link: string;
  description: string;
  /** Valor do item. A quantidade é só informativa e não multiplica o preço. */
  priceCents: number | null;
  /** Quantas unidades o item tem (1 a 999), para não repetir o mesmo item na lista. */
  quantity: number;
  /** Desconto ou cashback já abatido do preço (0 quando não há ou quando o item foi ganho). */
  discountCents: number;
  sortOrder: number;
  updatedAt: string;
  createdAt?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  mustChangePassword?: boolean;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  mustChangePassword: boolean;
  passwordResetExpiresAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  workspaceCount: number;
}

export interface EnxovalWorkspace {
  enxoval: EnxovalSummary;
  members: EnxovalMember[];
  categories: EnxovalCategory[];
  items: EnxovalItem[];
}

export interface BootstrapData {
  user: AuthUser;
  enxovais: EnxovalSummary[];
  activeEnxoval: EnxovalSummary | null;
  members: EnxovalMember[];
  categories: EnxovalCategory[];
  items: EnxovalItem[];
}
