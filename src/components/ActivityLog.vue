<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import type { LogEntry } from "../lib/types";

const props = defineProps<{ entries: LogEntry[] }>();
const pane = ref<HTMLElement | null>(null);

watch(
  () => props.entries.length,
  async () => {
    await nextTick();
    if (pane.value) pane.value.scrollTop = pane.value.scrollHeight;
  },
);

const LEVEL_STYLES: Record<LogEntry["level"], string> = {
  info: "text-app-muted",
  warn: "text-amber-600 dark:text-amber-300",
  error: "text-rose-600 dark:text-rose-300",
  success: "text-emerald-600 dark:text-emerald-300",
};

const time = (at: number) => new Date(at).toLocaleTimeString("vi-VN");
</script>

<template>
  <div
    ref="pane"
    class="thin-scroll h-40 overflow-y-auto rounded-lg border border-app-border bg-app-panel-alt p-3 font-mono text-xs leading-relaxed"
  >
    <p v-if="entries.length === 0" class="text-app-faint">
      Chưa có hoạt động nào.
    </p>
    <p
      v-for="entry in entries"
      :key="entry.id"
      :class="LEVEL_STYLES[entry.level]"
    >
      <span class="text-app-faint">{{ time(entry.at) }}</span>
      {{ entry.message }}
    </p>
  </div>
</template>
