"use client";

import {
  normalizeBasketballConfig,
  normalizeBasketballDisplay,
  type BasketballDisplayConfig,
  type BasketballMatchConfig,
} from "@/lib/basketball";

const STORAGE_KEY = "basketball-control-saved-preferences";

export interface SavedBasketballPreferences {
  config: BasketballMatchConfig;
  display: BasketballDisplayConfig;
}

/**
 * Preferência do OPERADOR (por navegador, via localStorage), não da sessão — usada só na
 * hora de criar uma sessão nova, pra já nascer configurada do jeito que ele sempre usa
 * (ex: sem cronômetro de 24s, tema preto/vermelho). Passa por normalize* pra tolerar uma
 * versão antiga salva antes de campos novos existirem.
 */
export function readSavedPreferences(): SavedBasketballPreferences | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SavedBasketballPreferences>;
    return {
      config: normalizeBasketballConfig(parsed.config as BasketballMatchConfig),
      display: normalizeBasketballDisplay(parsed.display as BasketballDisplayConfig),
    };
  } catch {
    return null;
  }
}

export function saveBasketballPreferences(config: BasketballMatchConfig, display: BasketballDisplayConfig) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ config, display }));
  } catch {
    // Ignora navegadores com localStorage bloqueado (modo privado etc.)
  }
}

export function clearSavedBasketballPreferences() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignora navegadores com localStorage bloqueado (modo privado etc.)
  }
}
