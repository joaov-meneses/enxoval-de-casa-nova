import { emptyAnswers } from "./plan";
import type { Answers } from "./types";

const STORAGE_KEY = "larume.onboarding.v1";

export interface SavedOnboarding {
  v: 2;
  answers: Answers;
  step: string;
  /** A pessoa chegou ao plano pronto. */
  completed: boolean;
}

export function loadOnboarding(): SavedOnboarding | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedOnboarding;
    const version = (data as { v?: number })?.v;
    if ((version !== 1 && version !== 2) || typeof data.step !== "string" || !data.answers) {
      return null;
    }
    const answers = { ...emptyAnswers, ...data.answers };
    // Na versão 1, cozinha e banheiro eram sempre incluídos e não ficavam na lista.
    if (version === 1 && answers.rooms) {
      answers.rooms = [...new Set(["cozinha", "banheiro", ...answers.rooms])] as typeof answers.rooms;
    }
    return { ...data, v: 2, answers };
  } catch {
    return null;
  }
}

export function saveOnboarding(data: SavedOnboarding) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* Navegação privada pode bloquear o armazenamento; o funil segue em memória. */
  }
}

export function clearOnboarding() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Nada a limpar. */
  }
}

/** Origem do visitante, lida sem perguntar: utm_source ou o site de onde veio. */
export function detectSource() {
  try {
    const utm = new URLSearchParams(window.location.search).get("utm_source");
    if (utm) return utm.slice(0, 60);
    if (document.referrer) {
      const host = new URL(document.referrer).hostname;
      if (host && host !== window.location.hostname) return host.slice(0, 60);
    }
  } catch {
    /* Referrer inválido: sem origem. */
  }
  return "";
}
