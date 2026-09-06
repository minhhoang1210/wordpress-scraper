import { computed, ref } from "vue";

export type Theme = "light" | "dark";

const STORAGE_KEY = "ws-theme";

/**
 * Stored choice wins, otherwise the OS preference decides. Mirrors the inline
 * <head> script in index.html so the first paint already uses the right theme.
 */
function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage can be unavailable (private mode, disabled cookies).
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function useTheme() {
  const theme = ref<Theme>(initialTheme());
  const isDark = computed(() => theme.value === "dark");

  function apply(value: Theme) {
    document.documentElement.classList.toggle("dark", value === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Persisting is best-effort; the toggle still works for this visit.
    }
  }

  apply(theme.value);

  function toggle() {
    theme.value = theme.value === "dark" ? "light" : "dark";
    apply(theme.value);
  }

  return { theme, isDark, toggle };
}
