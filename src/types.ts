import type { ItemStatus } from './itemStatus';

export type { ItemStatus };
export type Category = string;
export type EnxovalRole = 'owner' | 'editor';

export interface EnxovalSummary {
  id: string;
  name: string;
  ownerId: string;
  /** Nome de quem é dono. Em enxovais compartilhados (`role: 'editor'`) mostra de quem é a lista. */
  ownerName: string;
  /** `owner`: enxoval da própria pessoa. `editor`: enxoval de outra pessoa, ao qual ela foi convidada. */
  role: EnxovalRole;
  discountCents: number;
}

export interface EnxovalMember {
  id: string;
  name: string;
  email: string;
  role: EnxovalRole;
}

export interface EnxovalInvitation {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

export interface InvitationPreview {
  valid: boolean;
  email?: string;
  enxovalName?: string;
  inviterName?: string;
  /** Já existe conta com o e-mail do convite: é preciso entrar nela, em vez de criar uma senha. */
  accountExists?: boolean;
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
  /** Conta criada por convite: usa só os enxovais de quem convidou e não cria enxovais próprios. */
  isGuest?: boolean;
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
