export type Category = string;

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
  checked: boolean;
  link: string;
  description: string;
  sortOrder: number;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface BootstrapData {
  user: AuthUser;
  categories: EnxovalCategory[];
  items: EnxovalItem[];
}