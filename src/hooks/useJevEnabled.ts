import { useEffect, useState } from "react";
import { fetchAiStatus } from "../api";

// Uma consulta por visita: o servidor só liga o Jev se a chave estiver configurada, e isso não muda enquanto a página está aberta.
let status: Promise<boolean> | null = null;

function loadStatus() {
  status ??= fetchAiStatus()
    .then((result) => result.enabled)
    // Falha de rede ou sessão expirada: tenta de novo na próxima vez que alguém perguntar.
    .catch(() => {
      status = null;
      return false;
    });
  return status;
}

/** Verdadeiro quando o servidor tem o Jev ligado. Enquanto não sabe, é falso: a tela nunca mostra ajuda que não existe. */
export function useJevEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    void loadStatus().then((value) => {
      if (active) setEnabled(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return enabled;
}
