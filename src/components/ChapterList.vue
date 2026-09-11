<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { Chapter, ChapterStatus } from "../lib/types";

const props = defineProps<{ chapters: Chapter[]; disabled: boolean }>();
const emit = defineEmits<{
  selectAll: [value: boolean];
  moveBefore: [chapter: Chapter, target: Chapter | null];
}>();

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

const numbered = computed(() =>
  props.chapters.some((chapter) => chapter.order !== null),
);

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

const statusLabel = (chapter: Chapter) =>
  chapter.locked ? "khoá" : STATUS_LABELS[chapter.status];

function rowClass(chapter: Chapter): string {
  if (isPicked(chapter)) return "bg-app-accent-soft";
  return picked.value
    ? "cursor-pointer hover:bg-app-accent-soft"
    : "hover:bg-app-hover";
}

/** The thread inks only once a chapter's text is actually in hand. */
function threadClass(chapter: Chapter): string {
  return chapter.status === "done" && !chapter.locked
    ? "border-app-accent/70"
    : "border-app-border-strong/60";
}

function nodeClass(chapter: Chapter): string {
  if (chapter.status === "failed") {
    return "rotate-45 rounded-none border-app-alert bg-app-alert";
  }
  if (chapter.locked) return "border-app-alert bg-app-bg";
  if (chapter.status === "done") return "border-app-accent bg-app-accent";
  if (chapter.status === "fetching") {
    return "border-app-work bg-app-work motion-safe:animate-pulse";
  }
  return "border-app-border-strong bg-app-bg";
}
</script>

<template>
  <div class="flex flex-col">
    <div
      class="flex shrink-0 flex-wrap items-center gap-2 border-b border-app-border px-5 py-3"
    >
      <input
        v-model="filter"
        type="search"
        placeholder="Lọc chương…"
        aria-label="Lọc chương"
        class="field max-w-72 min-w-40 flex-1 py-1.5"
      />
      <button
        type="button"
        class="btn btn-outline btn-sm"
        :disabled="disabled"
        @click="emit('selectAll', true)"
      >
        Chọn tất cả
      </button>
      <button
        type="button"
        class="btn btn-outline btn-sm"
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
      class="flex shrink-0 flex-wrap items-center gap-2 border-b border-app-border bg-app-accent-soft px-5 py-2.5 text-[13px]"
    >
      <span class="min-w-0 flex-1">
        Đang nhấc <strong class="font-medium">{{ titleOf(picked) }}</strong> (vị
        trí {{ positionOf(picked) }}/{{ chapters.length }}). Bấm vào chương bạn
        muốn chèn nó lên trước.
      </span>
      <button type="button" class="btn btn-outline btn-sm" @click="cancelPick">
        Bỏ nhấc (Esc)
      </button>
    </p>

    <ul
      class="thin-scroll max-h-[65vh] overflow-y-auto py-2 pl-5 lg:max-h-none lg:min-h-0 lg:flex-1"
    >
      <li
        v-for="chapter in visible"
        :key="chapter.id"
        class="relative flex items-stretch"
        :class="rowClass(chapter)"
        @click="onRowClick(chapter)"
        @mouseenter="markInsertTarget(chapter)"
        @mouseleave="clearInsertTarget"
      >
        <span
          v-if="insertBeforeId === chapter.id"
          class="pointer-events-none absolute top-0 right-4 left-7 h-0.5 bg-app-accent"
        />

        <span
          class="relative w-7 shrink-0 border-l"
          :class="threadClass(chapter)"
          aria-hidden="true"
        >
          <span
            class="absolute top-1/2 left-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border"
            :class="nodeClass(chapter)"
            :title="statusLabel(chapter)"
          />
        </span>

        <div class="flex min-w-0 flex-1 items-center gap-2.5 py-2 pr-4">
          <input
            v-model="chapter.selected"
            type="checkbox"
            class="size-4 shrink-0"
            :aria-label="`Chọn ${titleOf(chapter)}`"
            :disabled="disabled"
            @click.stop
          />

          <span
            v-if="numbered"
            class="w-8 shrink-0 text-right text-xs tabular-nums text-app-faint"
          >
            {{ chapter.order ?? "" }}
          </span>

          <div
            class="min-w-0 flex-1"
            :class="!chapter.selected && 'opacity-55'"
          >
            <p
              class="flex items-center gap-1.5 font-serif text-sm text-app-text"
              :title="titleOf(chapter)"
            >
              <svg
                v-if="chapter.locked"
                class="size-3.5 shrink-0 text-app-alert"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span class="truncate">{{ titleOf(chapter) }}</span>
            </p>
            <p
              class="truncate text-[11px]"
              :class="chapter.error ? 'text-app-alert' : 'text-app-faint'"
              :title="chapter.error ?? chapter.url"
            >
              {{ chapter.error ?? chapter.url }}
            </p>
          </div>

          <span
            v-if="chapter.wordCount"
            class="hidden shrink-0 text-xs tabular-nums text-app-faint sm:block"
          >
            {{ chapter.wordCount.toLocaleString("vi-VN") }} từ
          </span>

          <button
            type="button"
            class="shrink-0 cursor-pointer rounded-sm p-0.5 text-app-faint hover:bg-app-hover hover:text-app-text disabled:cursor-default disabled:opacity-40"
            :class="isPicked(chapter) && 'text-app-accent'"
            :disabled="disabled"
            :aria-pressed="isPicked(chapter)"
            :aria-label="handleLabel(chapter)"
            :title="handleLabel(chapter)"
            @click.stop="onHandleClick(chapter)"
            @focus="markInsertTarget(chapter)"
            @blur="clearInsertTarget"
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
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="9" cy="6" r="1.4" />
              <circle cx="15" cy="6" r="1.4" />
              <circle cx="9" cy="12" r="1.4" />
              <circle cx="15" cy="12" r="1.4" />
              <circle cx="9" cy="18" r="1.4" />
              <circle cx="15" cy="18" r="1.4" />
            </svg>
          </button>
          <span class="sr-only">{{ statusLabel(chapter) }}</span>
        </div>
      </li>

      <li v-if="picked" class="pt-1 pr-4 pl-7">
        <button
          type="button"
          class="w-full cursor-pointer rounded-sm border border-dashed border-app-border-strong px-3 py-2 text-xs text-app-muted hover:border-app-accent hover:text-app-text"
          @click="insertBefore(null)"
        >
          Chèn xuống cuối danh sách
        </button>
      </li>

      <li v-if="visible.length === 0" class="px-7 py-10 text-sm text-app-faint">
        {{
          chapters.length === 0
            ? "Liên kết này không có chương nào."
            : "Không có chương nào khớp bộ lọc."
        }}
      </li>
    </ul>
  </div>
</template>
