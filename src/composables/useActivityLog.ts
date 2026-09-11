import { ref } from "vue";
import type { LogEntry } from "../lib/types";

const MAX_ENTRIES = 500;

export type ActivityLog = ReturnType<typeof useActivityLog>;

export function useActivityLog() {
  const entries = ref<LogEntry[]>([]);
  let nextId = 0;

  function add(level: LogEntry["level"], message: string): void {
    entries.value.push({ id: nextId++, at: Date.now(), level, message });
    if (entries.value.length > MAX_ENTRIES) {
      entries.value.splice(0, entries.value.length - MAX_ENTRIES);
    }
  }

  return {
    entries,
    info: (message: string) => add("info", message),
    warn: (message: string) => add("warn", message),
    error: (message: string) => add("error", message),
    success: (message: string) => add("success", message),
  };
}
