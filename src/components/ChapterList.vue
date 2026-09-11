<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { Chapter, ChapterStatus } from "../lib/types";

const props = defineProps<{ chapters: Chapter[]; disabled: boolean }>();
const emit = defineEmits<{
  selectAll: [value: boolean];
  moveBefore: [chapter: Chapter, target: Chapter | null];
  shift: [chapter: Chapter, offset: number];
}>();

const STATUS_STYLES: Record<ChapterStatus, string> = {
  pending:
    "bg-slate-400/20 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300",
  fetching: "bg-amber-500/20 text-amber-700 animate-pulse dark:text-amber-300",
  done: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  failed: "bg-rose-500/20 text-rose-700 dark:text-rose-300",
};

const STATUS_LABELS: Record<ChapterStatus, string> = {
  pending: "chờ",
  fetching: "đang tải",
  done: "xong",
  failed: "lỗi",
};

const titleOf = (chapter: Chapter) => chapter.title ?? chapter.label;
const positionOf = (chapter: Chapter) => props.chapters.indexOf(chapter) + 1;

const filter = ref("");

const visible = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  if (!needle) return props.chapters;
  return props.chapters.filter(
    (chapter) =>
      titleOf(chapter).toLowerCase().includes(needle) ||
      chapter.url.toLowerCase().includes(needle),
  );
});

/**
 * Reordering is pick-up-then-insert rather than drag & drop: a picked chapter
 * stays picked while the reader scrolls or filters, and every step works from
 * the keyboard.
 */
const pickedId = ref<string | null>(null);
const insertBeforeId = ref<string | null>(null);

const picked = computed(
  () => props.chapters.find((chapter) => chapter.id === pickedId.value) ?? null,
);

const isPicked = (chapter: Chapter) => chapter.id === pickedId.value;

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) cancelPick();
  },
);

// Escape has to work even when the reader picked a chapter with the mouse and
// focus sits outside the list.
watch(picked, (chapter) => {
  if (chapter) window.addEventListener("keydown", onGlobalKeydown);
  else window.removeEventListener("keydown", onGlobalKeydown);
});
onBeforeUnmount(() => window.removeEventListener("keydown", onGlobalKeydown));

function onGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") cancelPick();
}

function cancelPick(): void {
  pickedId.value = null;
  insertBeforeId.value = null;
}

function onHandleClick(chapter: Chapter): void {
  if (props.disabled) return;
  if (picked.value && !isPicked(chapter)) return insertBefore(chapter);
  pickedId.value = isPicked(chapter) ? null : chapter.id;
  insertBeforeId.value = null;
}

function onRowClick(chapter: Chapter): void {
  if (!picked.value) return;
  if (isPicked(chapter)) cancelPick();
  else insertBefore(chapter);
}

/** A null target sends the picked chapter to the end of the list. */
function insertBefore(target: Chapter | null): void {
  const chapter = picked.value;
  if (!chapter) return;
  if (!target || target.id !== chapter.id) {
    emit("moveBefore", chapter, target);
  }
  cancelPick();
}

function onHandleArrow(chapter: Chapter, offset: number): void {
  if (!isPicked(chapter) || props.disabled) return;
  emit("shift", chapter, offset);
}

function markInsertTarget(chapter: Chapter): void {
  if (picked.value && !isPicked(chapter)) insertBeforeId.value = chapter.id;
}

function clearInsertTarget(): void {
  insertBeforeId.value = null;
}

function handleLabel(chapter: Chapter): string {
  if (isPicked(chapter)) return `Bỏ nhấc “${titleOf(chapter)}”`;
  if (picked.value) {
    return `Chèn “${titleOf(picked.value)}” vào trước “${titleOf(chapter)}”`;
  }
  return `Nhấc “${titleOf(chapter)}” để đổi thứ tự`;
}

function rowClass(chapter: Chapter): string {
  if (isPicked(chapter)) {
    return "border-indigo-400 bg-indigo-500/10";
  }
  return picked.value
    ? "cursor-pointer border-transparent hover:border-indigo-400"
    : "border-transparent hover:border-app-border";
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

    <p
      v-if="picked"
      role="status"
      aria-live="polite"
      class="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-3 py-2 text-xs text-app-text"
    >
      <span class="min-w-0 flex-1">
        Đang nhấc <strong>{{ titleOf(picked) }}</strong> (vị trí
        {{ positionOf(picked) }}/{{ chapters.length }}) — bấm vào chương muốn
        chèn lên trước, hoặc dùng ↑ ↓ để dịch từng bậc.
      </span>
      <button
        type="button"
        class="shrink-0 rounded-lg border border-app-border-strong px-2 py-1 text-xs text-app-text hover:bg-app-hover"
        @click="cancelPick"
      >
        Bỏ nhấc (Esc)
      </button>
    </p>

    <ul
      class="thin-scroll max-h-96 min-h-24 flex-1 space-y-1 overflow-y-auto pr-1"
    >
      <li
        v-for="chapter in visible"
        :key="chapter.id"
        class="relative flex items-center gap-3 rounded-lg border bg-app-panel-alt px-3 py-2"
        :class="rowClass(chapter)"
        @click="onRowClick(chapter)"
        @mouseenter="markInsertTarget(chapter)"
        @mouseleave="clearInsertTarget"
      >
        <span
          v-if="insertBeforeId === chapter.id"
          class="pointer-events-none absolute top-0 right-2 left-2 h-0.5 rounded-full bg-indigo-400"
        />

        <button
          type="button"
          class="shrink-0 cursor-pointer rounded p-0.5 text-app-faint hover:bg-app-hover hover:text-app-text disabled:cursor-default disabled:opacity-40"
          :class="isPicked(chapter) && 'bg-indigo-500/20 text-indigo-500'"
          :disabled="disabled"
          :aria-pressed="isPicked(chapter)"
          :aria-label="handleLabel(chapter)"
          :title="handleLabel(chapter)"
          @click.stop="onHandleClick(chapter)"
          @focus="markInsertTarget(chapter)"
          @blur="clearInsertTarget"
          @keydown.up.prevent="onHandleArrow(chapter, -1)"
          @keydown.down.prevent="onHandleArrow(chapter, 1)"
        >
          <svg
            v-if="picked && !isPicked(chapter)"
            class="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M5 4h14" />
            <path d="M12 20V9" />
            <path d="M8 12l4-4 4 4" />
          </svg>
          <svg
            v-else
            class="size-4"
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
        </button>

        <input
          v-model="chapter.selected"
          type="checkbox"
          class="size-4 shrink-0 accent-indigo-500"
          :disabled="disabled"
          @click.stop
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm text-app-text" :title="titleOf(chapter)">
            <span
              v-if="chapter.order !== null"
              class="mr-1.5 text-xs text-indigo-500 dark:text-indigo-400"
            >
              #{{ chapter.order }}
            </span>
            <svg
              v-if="chapter.locked"
              class="mr-1 inline size-3.5 -translate-y-px shrink-0 text-app-muted"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-label="Không tải được nội dung chương"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            {{ titleOf(chapter) }}
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
          {{ chapter.locked ? "khoá" : STATUS_LABELS[chapter.status] }}
        </span>
      </li>

      <li v-if="picked">
        <button
          type="button"
          class="w-full cursor-pointer rounded-lg border border-dashed border-app-border-strong px-3 py-2 text-xs text-app-muted hover:border-indigo-400 hover:text-app-text"
          @click="insertBefore(null)"
        >
          Chèn xuống cuối danh sách
        </button>
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
