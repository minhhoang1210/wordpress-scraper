<script setup lang="ts">
import { computed, ref } from "vue";
import type { Chapter, ChapterStatus } from "../lib/types";

const props = defineProps<{ chapters: Chapter[]; disabled: boolean }>();
const emit = defineEmits<{
  selectAll: [value: boolean];
  reorder: [chapter: Chapter, toIndex: number];
}>();

const filter = ref("");

const visible = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  if (!needle) return props.chapters;
  return props.chapters.filter(
    (chapter) =>
      (chapter.title ?? chapter.linkText).toLowerCase().includes(needle) ||
      chapter.url.toLowerCase().includes(needle),
  );
});

const STATUS_STYLES: Record<ChapterStatus, string> = {
  pending:
    "bg-slate-400/20 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300",
  fetching: "bg-amber-500/20 text-amber-700 animate-pulse dark:text-amber-300",
  done: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  failed: "bg-rose-500/20 text-rose-700 dark:text-rose-300",
  skipped:
    "bg-slate-400/20 text-slate-500 dark:bg-slate-700/40 dark:text-slate-500",
};

const STATUS_LABELS: Record<ChapterStatus, string> = {
  pending: "chờ",
  fetching: "đang tải",
  done: "xong",
  failed: "lỗi",
  skipped: "bỏ qua",
};

// Drag & drop reordering: the visible list may be filtered, so drop targets are
// mapped back to positions in the full chapter list before emitting.
const draggingId = ref<string | null>(null);
const dropIndex = ref<number | null>(null);

const globalIndex = computed(() => {
  const map = new Map<string, number>();
  props.chapters.forEach((chapter, index) => map.set(chapter.id, index));
  return map;
});

function onDragStart(chapter: Chapter, event: DragEvent) {
  if (props.disabled) {
    event.preventDefault();
    return;
  }
  draggingId.value = chapter.id;
  event.dataTransfer?.setData("text/plain", chapter.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function onDragEnd() {
  draggingId.value = null;
  dropIndex.value = null;
}

function onDragOver(chapter: Chapter, event: DragEvent) {
  if (!draggingId.value || draggingId.value === chapter.id) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  dropIndex.value = globalIndex.value.get(chapter.id) ?? null;
}

function onDrop(chapter: Chapter, event: DragEvent) {
  event.preventDefault();
  event.stopPropagation();
  const target = globalIndex.value.get(chapter.id);
  const dragged = props.chapters.find((c) => c.id === draggingId.value);
  if (dragged && target !== undefined) emit("reorder", dragged, target);
  onDragEnd();
}

function onDropEnd(event: DragEvent) {
  // Dropping past the last visible row moves the chapter to the very end.
  const dragged = props.chapters.find((c) => c.id === draggingId.value);
  if (
    dragged &&
    dropIndex.value !== null &&
    dropIndex.value === props.chapters.length - 1
  ) {
    event.preventDefault();
    emit("reorder", dragged, props.chapters.length - 1);
  }
  onDragEnd();
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <input
        v-model="filter"
        type="search"
        placeholder="Lọc chương…"
        class="min-w-40 flex-1 rounded-lg border border-app-border bg-app-panel-alt px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
      />
      <button
        type="button"
        class="rounded-lg border border-app-border px-3 py-1.5 text-xs text-app-text hover:bg-app-hover disabled:opacity-40"
        :disabled="disabled"
        @click="emit('selectAll', true)"
      >
        Chọn tất cả
      </button>
      <button
        type="button"
        class="rounded-lg border border-app-border px-3 py-1.5 text-xs text-app-text hover:bg-app-hover disabled:opacity-40"
        :disabled="disabled"
        @click="emit('selectAll', false)"
      >
        Bỏ chọn
      </button>
    </div>

    <ul
      class="thin-scroll max-h-96 min-h-24 flex-1 space-y-1 overflow-y-auto pr-1"
      @dragover.prevent
      @drop="onDropEnd"
    >
      <li
        v-for="chapter in visible"
        :key="chapter.id"
        draggable="true"
        class="flex cursor-grab items-center gap-3 rounded-lg border border-transparent bg-app-panel-alt px-3 py-2 hover:border-app-border"
        :class="[
          draggingId === chapter.id && 'opacity-40',
          dropIndex === globalIndex.get(chapter.id) &&
            draggingId !== chapter.id &&
            'border-indigo-400',
        ]"
        @dragstart="onDragStart(chapter, $event)"
        @dragend="onDragEnd"
        @dragover="onDragOver(chapter, $event)"
        @drop="onDrop(chapter, $event)"
      >
        <svg
          class="size-4 shrink-0 cursor-grab text-app-faint"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="9" cy="6" r="1" />
          <circle cx="15" cy="6" r="1" />
          <circle cx="9" cy="12" r="1" />
          <circle cx="15" cy="12" r="1" />
          <circle cx="9" cy="18" r="1" />
          <circle cx="15" cy="18" r="1" />
        </svg>
        <input
          v-model="chapter.selected"
          type="checkbox"
          class="size-4 shrink-0 accent-indigo-500"
          :disabled="disabled"
        />
        <div class="min-w-0 flex-1">
          <p
            class="truncate text-sm text-app-text"
            :title="chapter.title ?? chapter.linkText"
          >
            <span
              v-if="chapter.order !== null"
              class="mr-1.5 text-xs text-indigo-500 dark:text-indigo-400"
            >
              #{{ chapter.order }}
            </span>
            <svg
              v-if="chapter.protected"
              class="mr-1 inline size-3.5 -translate-y-px shrink-0 text-app-muted"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-label="Chương yêu cầu mật khẩu"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            {{ chapter.title ?? chapter.linkText }}
          </p>
          <p class="truncate text-xs text-app-faint" :title="chapter.url">
            {{ chapter.error ?? chapter.url }}
          </p>
        </div>
        <span
          v-if="chapter.wordCount"
          class="shrink-0 text-xs tabular-nums text-app-faint"
        >
          {{ chapter.wordCount.toLocaleString("vi-VN") }} từ
        </span>
        <span
          class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase"
          :class="STATUS_STYLES[chapter.status]"
        >
          {{ chapter.protected ? "khoá" : STATUS_LABELS[chapter.status] }}
        </span>
      </li>
      <li
        v-if="visible.length === 0"
        class="px-3 py-6 text-center text-sm text-app-faint"
      >
        Không có chương nào.
      </li>
    </ul>
  </div>
</template>
