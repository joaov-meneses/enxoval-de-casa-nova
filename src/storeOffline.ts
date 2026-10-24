/**
 * Modo loja com sinal ruim (Fase 11.6): o último retrato do enxoval fica no IndexedDB deste aparelho e as alterações
 * feitas sem conexão entram numa fila, enviada quando a rede volta. Conflito: vale a última alteração, como no app.
 * Sem IndexedDB (aba privada, navegador antigo), tudo segue funcionando só online.
 */
import type { EnxovalCategory, EnxovalItem, EnxovalSummary, ItemExtrasInput } from "./types";
import type { ItemStatus } from "./itemStatus";

const DB_NAME = "casamia-loja";
const DB_VERSION = 1;

export interface StoreSnapshot {
  enxovalId: string;
  enxoval: EnxovalSummary;
  items: EnxovalItem[];
  categories: EnxovalCategory[];
  savedAt: number;
}

export type QueuedUpdates = { status?: ItemStatus; checked?: boolean; priceCents?: number | null; discountCents?: number } & ItemExtrasInput;

export interface QueuedChange {
  id?: number;
  enxovalId: string;
  itemId: string;
  updates: QueuedUpdates;
  queuedAt: number;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "enxovalId" });
        if (!db.objectStoreNames.contains("queue")) {
          const queue = db.createObjectStore("queue", { keyPath: "id", autoIncrement: true });
          queue.createIndex("enxovalId", "enxovalId");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(store: "snapshots" | "queue", mode: IDBTransactionMode, action: (objects: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(store, mode);
      const request = action(transaction.objectStore(store));
      transaction.oncomplete = () => {
        db.close();
        resolve(request.result);
      };
      transaction.onerror = transaction.onabort = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function saveStoreSnapshot(snapshot: Omit<StoreSnapshot, "savedAt">) {
  await run("snapshots", "readwrite", (objects) => objects.put({ ...snapshot, savedAt: Date.now() }));
}

export async function loadStoreSnapshot(enxovalId: string) {
  return (await run<StoreSnapshot | undefined>("snapshots", "readonly", (objects) => objects.get(enxovalId))) ?? null;
}

/** O retrato mais recente, para abrir o modo loja sem conexão quando a URL não diz o enxoval. */
export async function latestStoreSnapshot() {
  const all = (await run<StoreSnapshot[]>("snapshots", "readonly", (objects) => objects.getAll())) ?? [];
  return all.sort((a, b) => b.savedAt - a.savedAt)[0] ?? null;
}

export async function queueChange(change: Omit<QueuedChange, "id" | "queuedAt">) {
  const id = await run("queue", "readwrite", (objects) => objects.add({ ...change, queuedAt: Date.now() }));
  return id !== null;
}

export async function pendingChanges(enxovalId: string) {
  const all = (await run<QueuedChange[]>("queue", "readonly", (objects) => objects.index("enxovalId").getAll(enxovalId))) ?? [];
  return all.sort((a, b) => a.queuedAt - b.queuedAt);
}

/** Aplica as alterações da fila sobre os itens (para a tela mostrar o que já foi riscado offline). */
export function applyPending<T extends EnxovalItem>(items: T[], changes: QueuedChange[]): T[] {
  if (changes.length === 0) return items;
  const byItem = new Map<string, QueuedUpdates>();
  for (const change of changes) byItem.set(change.itemId, { ...byItem.get(change.itemId), ...change.updates });
  return items.map((item) => {
    const updates = byItem.get(item.id);
    if (!updates) return item;
    const status = updates.status ?? item.status;
    return { ...item, ...updates, status, checked: status !== "researching" } as T;
  });
}

/**
 * Envia a fila na ordem em que foi feita. Para no primeiro erro de rede (a próxima tentativa recomeça dali); um item
 * que o servidor recusa (apagado, sem acesso) sai da fila para não travar as outras alterações.
 */
export async function flushChanges(
  enxovalId: string,
  send: (itemId: string, updates: QueuedUpdates) => Promise<EnxovalItem>,
) {
  const changes = await pendingChanges(enxovalId);
  const saved: EnxovalItem[] = [];
  let failed = 0;
  for (const change of changes) {
    try {
      saved.push(await send(change.itemId, change.updates));
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === undefined || status === 0 || status >= 500) break;
      failed += 1;
    }
    await run("queue", "readwrite", (objects) => objects.delete(change.id!));
  }
  return { sent: saved.length, failed, saved, remaining: (await pendingChanges(enxovalId)).length };
}
