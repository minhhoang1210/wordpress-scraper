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
  warn: "text-app-work",
  error: "text-app-alert",
  success: "text-app-accent",
};

const time = (at: number) => new Date(at).toLocaleTimeString("vi-VN");
</script>

<template>
  <div
    ref="pane"
    class="thin-scroll h-36 overflow-y-auto rounded-sm bg-app-panel-alt px-3 py-2.5 text-[11px] leading-relaxed"
  >
    <p v-if="entries.length === 0" class="text-app-faint">
      Chưa có hoạt động nào.
    </p>
    <p
      v-for="entry in entries"
      :key="entry.id"
      class="flex gap-2"
      :class="LEVEL_STYLES[entry.level]"
    >
      <span class="shrink-0 tabular-nums text-app-faint">{{
        time(entry.at)
      }}</span>
      <span class="min-w-0">{{ entry.message }}</span>
    </p>
  </div>
</template>
