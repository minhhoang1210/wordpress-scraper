<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { LogEntry } from '../lib/types'

const props = defineProps<{ entries: LogEntry[] }>()
const pane = ref<HTMLElement | null>(null)

watch(
  () => props.entries.length,
  async () => {
    await nextTick()
    if (pane.value) pane.value.scrollTop = pane.value.scrollHeight
  },
)

const LEVEL_STYLES: Record<LogEntry['level'], string> = {
  info: 'text-slate-400',
  warn: 'text-amber-300',
  error: 'text-rose-300',
  success: 'text-emerald-300',
}

const time = (at: number) => new Date(at).toLocaleTimeString('vi-VN')
</script>

<template>
  <div
    ref="pane"
    class="thin-scroll h-40 overflow-y-auto rounded-lg border border-white/10 bg-ink-950 p-3 font-mono text-xs leading-relaxed"
  >
    <p v-if="entries.length === 0" class="text-slate-600">Chưa có hoạt động nào.</p>
    <p v-for="entry in entries" :key="entry.id" :class="LEVEL_STYLES[entry.level]">
      <span class="text-slate-600">{{ time(entry.at) }}</span>
      {{ entry.message }}
    </p>
  </div>
</template>
