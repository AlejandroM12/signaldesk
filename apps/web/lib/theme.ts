export const THEME_STORAGE_KEY = "signaldesk-theme";

export type ThemeChoice = "system" | "light" | "dark";

export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=document.documentElement;if(t==="dark"){d.classList.add("dark");d.classList.remove("light");}else if(t==="light"){d.classList.add("light");d.classList.remove("dark");}}catch(e){}})();`;

export function readThemeChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") {
      return value;
    }
  } catch {
    return "system";
  }

  return "system";
}

export function applyThemeChoice(theme: ThemeChoice, persist = false): void {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (theme === "light" || theme === "dark") {
    root.classList.add(theme);
  }
  if (!persist) {
    return;
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The visible theme still changes when storage is unavailable.
  }
}
