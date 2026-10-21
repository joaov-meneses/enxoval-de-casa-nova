import { lazy, Suspense, useEffect, useState } from "react";
import { fetchBootstrap } from "./api";
import { LandingPage } from "./components/LandingPage";
import { readStoredEnxovalId } from "./enxovais";
import type { AuthUser } from "./types";

const loadApp = () => import("./App.tsx");
const App = lazy(loadApp);

/**
 * A home sem o app inteiro: só descobre se há sessão para trocar os botões por "Acessar meu lar".
 * O pacote do app fica num pedaço separado, baixado quando a pessoa entra em /app (ou adiantado
 * quando o navegador fica ocioso, para quem já tem conta). Quem precisa trocar a senha continua
 * caindo na tela do app, como antes.
 */
export function LandingRoute() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchBootstrap()
      .then((data) => {
        if (mounted) setUser(data.user);
      })
      // Sem sessão (401) ou falha de rede: a home aparece como para visitante.
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1500));
    idle(() => void loadApp());
  }, [user]);

  if (user?.mustChangePassword)
    return (
      <Suspense fallback={null}>
        <App />
      </Suspense>
    );

  // Enquanto a sessão carrega, só quem já abriu um enxoval neste aparelho vê a versão "com conta"
  // (o app limpa essa marca ao sair). Visitantes já começam com "Entrar" e "Começar minha lista".
  return <LandingPage signedIn={Boolean(user)} authLoading={loading && Boolean(readStoredEnxovalId())} />;
}
