"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { applyThemeChoice, readThemeChoice, type ThemeChoice } from "@/lib/theme";

const THEME_EVENT = "signaldesk-theme";

function serverTheme(): ThemeChoice {
  return "system";
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function ThemeSelect() {
  const theme = useSyncExternalStore(subscribe, readThemeChoice, serverTheme);

  useLayoutEffect(() => {
    applyThemeChoice(readThemeChoice());
  }, []);

  return (
    <div className="inline-flex items-center gap-2">
      <label htmlFor="theme" className="text-sm text-ink-muted">
        Tema
      </label>
      <select
        id="theme"
        value={theme}
        onChange={(event) => {
          const next = event.target.value as ThemeChoice;
          applyThemeChoice(next, true);
          window.dispatchEvent(new Event(THEME_EVENT));
        }}
        className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink"
      >
        <option value="system">Sistema</option>
        <option value="light">Claro</option>
        <option value="dark">Oscuro</option>
      </select>
    </div>
  );
}
