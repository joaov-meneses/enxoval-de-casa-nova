// Modo loja aberto sem conexão: usa o último retrato do enxoval salvo neste aparelho. Quando a rede volta, recarrega o
// app normal, que envia a fila de alterações.
import { useEffect, useState, type ReactNode } from "react";
import type { AppRoute } from "../appRoute";
import { latestStoreSnapshot, loadStoreSnapshot, type StoreSnapshot } from "../storeOffline";
import StoreRoute from "./StoreRoute";

export default function OfflineStore({ route, fallback }: { route: AppRoute; fallback: ReactNode }) {
  const [snapshot, setSnapshot] = useState<StoreSnapshot | null | undefined>(undefined);
  const [categoryId, setCategoryId] = useState(route.categoryId);

  useEffect(() => {
    let alive = true;
    (route.enxovalId ? loadStoreSnapshot(route.enxovalId) : latestStoreSnapshot()).then((saved) => alive && setSnapshot(saved));
    const reload = () => window.location.reload();
    window.addEventListener("online", reload);
    return () => {
      alive = false;
      window.removeEventListener("online", reload);
    };
  }, [route.enxovalId]);

  if (snapshot === undefined) return null;
  if (!snapshot) return <>{fallback}</>;
  return (
    <main className="workspace-app store-offline-shell">
      <StoreRoute
        offlineOnly
        enxoval={snapshot.enxoval}
        items={snapshot.items}
        categories={snapshot.categories}
        categoryId={categoryId}
        onCategory={setCategoryId}
        onExit={() => window.location.assign("/app")}
        onSaved={() => undefined}
      />
    </main>
  );
}
