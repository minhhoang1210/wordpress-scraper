<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Chapter, ChapterStatus } from '../lib/types'

const props = defineProps<{ chapters: Chapter[]; disabled: boolean }>()
const emit = defineEmits<{ selectAll: [value: boolean] }>()

const filter = ref('')

const visible = computed(() => {
  const needle = filter.value.trim().toLowerCase()
  if (!needle) return props.chapters
  return props.chapters.filter(
    (chapter) =>
      (chapter.title ?? chapter.linkText).toLowerCase().includes(needle) ||
      chapter.url.toLowerCase().includes(needle),
  )
})

const STATUS_STYLES: Record<ChapterStatus, string> = {
  pending: 'bg-slate-700/60 text-slate-300',
  fetching: 'bg-amber-500/20 text-amber-300 animate-pulse',
  done: 'bg-emerald-500/20 text-emerald-300',
  failed: 'bg-rose-500/20 text-rose-300',
  skipped: 'bg-slate-700/40 text-slate-500',
}

const STATUS_LABELS: Record<ChapterStatus, string> = {
  pending: 'chờ',
  fetching: 'đang tải',
  done: 'xong',
  failed: 'lỗi',
  skipped: 'bỏ qua',
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <input
        v-model="filter"
        type="search"
        placeholder="Lọc chương…"
        class="min-w-40 flex-1 rounded-lg border border-white/10 bg-ink-950 px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
      />
      <button
        type="button"
        class="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-40"
        :disabled="disabled"
        @click="emit('selectAll', true)"
      >
        Chọn tất cả
      </button>
      <button
        type="button"
        class="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-40"
        :disabled="disabled"
        @click="emit('selectAll', false)"
      >
        Bỏ chọn
      </button>
    </div>

    <ul class="thin-scroll max-h-96 min-h-24 flex-1 space-y-1 overflow-y-auto pr-1">
      <li
        v-for="chapter in visible"
        :key="chapter.id"
        class="flex items-center gap-3 rounded-lg border border-transparent bg-ink-950/60 px-3 py-2 hover:border-white/10"
      >
        <input
          v-model="chapter.selected"
          type="checkbox"
          class="size-4 shrink-0 accent-indigo-500"
          :disabled="disabled"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm text-slate-200" :title="chapter.title ?? chapter.linkText">
            <span v-if="chapter.order !== null" class="mr-1.5 text-xs text-indigo-400">
              #{{ chapter.order }}
            </span>
            {{ chapter.title ?? chapter.linkText }}
          </p>
          <p class="truncate text-xs text-slate-500" :title="chapter.url">
            {{ chapter.error ?? chapter.url }}
          </p>
        </div>
        <span
          v-if="chapter.wordCount"
          class="shrink-0 text-xs tabular-nums text-slate-500"
        >
          {{ chapter.wordCount.toLocaleString('vi-VN') }} từ
        </span>
        <span
          class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase"
          :class="STATUS_STYLES[chapter.status]"
        >
          {{ STATUS_LABELS[chapter.status] }}
        </span>
      </li>
      <li v-if="visible.length === 0" class="px-3 py-6 text-center text-sm text-slate-500">
        Không có chương nào.
      </li>
    </ul>
  </div>
</template>
