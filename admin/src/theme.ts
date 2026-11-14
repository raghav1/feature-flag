// Light or dark, following the system unless the user picks one. Stored per browser; tokens live in styles.css
// (:root for light, :root[data-theme="dark"] for dark).

export type ThemePreference = "system" | "light" | "dark";
export type Theme = "light" | "dark";

const STORAGE_KEY = "feature-flags-theme";

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): Theme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

/** The header button cycles system → light → dark → system. */
export function nextPreference(preference: ThemePreference): ThemePreference {
  return preference === "system" ? "light" : preference === "light" ? "dark" : "system";
}

function readStored(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system"; // storage blocked (private mode, policies): fall back to the system setting
  }
}

const media = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
let preference: ThemePreference = typeof window !== "undefined" ? readStored() : "system";
const listeners = new Set<() => void>();

/** Sets data-theme on <html>. Called once before React renders, so there's no flash of the wrong theme. */
export function applyTheme() {
  document.documentElement.dataset.theme = resolveTheme(preference, media?.matches ?? false);
  document.documentElement.style.colorScheme = document.documentElement.dataset.theme;
  listeners.forEach((listener) => listener());
}

media?.addEventListener("change", () => {
  if (preference === "system") applyTheme();
});

export function setPreference(next: ThemePreference) {
  preference = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // not persisted; still applies for this page
  }
  applyTheme();
}

/** For useSyncExternalStore. */
export const themeStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getPreference: () => preference,
};
