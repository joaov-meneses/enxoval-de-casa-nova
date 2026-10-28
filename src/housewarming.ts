/** Shared API types. Public responses are deliberately smaller than the workspace. */
export type PixKeyType = 'cpf' | 'email' | 'phone' | 'random';
export interface HousewarmingPix {
  key: string;
  keyType: PixKeyType;
  receiverName: string;
  city: string;
}
export interface HousewarmingSettings {
  slug: string;
  title: string;
  message: string;
  eventDate: string | null;
  isPublic: boolean;
  itemIds: string[];
  pix: HousewarmingPix | null;
}
export interface HousewarmingEntry {
  id: string;
  kind: 'reservation' | 'message';
  name: string;
  email: string | null;
  message: string;
  itemId: string | null;
  itemName: string | null;
  itemStatus: string | null;
  cancelledAt: string | null;
  createdAt: string;
  readAt: string | null;
}
export interface HousewarmingManagement {
  list: (Omit<HousewarmingSettings, 'itemIds'> & { id: string }) | null;
  itemIds: string[];
  inbox: HousewarmingEntry[];
  unreadCount: number;
}
export interface PublicHousewarming {
  slug: string;
  title: string;
  message: string;
  eventDate: string | null;
  pix: { key: string; receiverName: string; payload: string } | null;
  items: { id: string; name: string; category: string; availability: 'available' | 'reserved' | 'gifted' }[];
}
