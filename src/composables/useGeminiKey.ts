import { ref, watch } from "vue";

const STORAGE_KEY = "ws-gemini-key";

function initialKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    // localStorage can be unavailable (private mode, disabled cookies).
    return "";
  }
}

// Shared across every source tab: the key belongs to the reader, not to a story.
const apiKey = ref(initialKey());

watch(apiKey, (value) => {
  try {
    if (value.trim()) localStorage.setItem(STORAGE_KEY, value.trim());
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Persisting is best-effort; the key still works for this visit.
  }
});

export function useGeminiKey() {
  return { apiKey };
}
