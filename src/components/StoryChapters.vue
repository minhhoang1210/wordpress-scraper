<script setup lang="ts">
import { computed } from "vue";
import ChapterList from "./ChapterList.vue";
import type { StoryScraper } from "../composables/useStoryScraper";

const props = defineProps<{ scraper: StoryScraper }>();

const count = (value: number) => value.toLocaleString("vi-VN");

const storyLine = computed(() => {
  const { meta, chapters, selected } = props.scraper;
  const parts = [];
  if (meta.value?.author) parts.push(meta.value.author);
  parts.push(`${count(chapters.value.length)} chương`);
  parts.push(`đã chọn ${count(selected.value.length)}`);
  return parts.join(", ");
});

const downloadLabel = computed(() => {
  const { phase, selected } = props.scraper;
  if (phase.value === "downloading") return "Đang tải nội dung…";
  if (selected.value.length === 0) return "Chọn chương để tải";
  return `Tải nội dung ${count(selected.value.length)} chương`;
});

const canDownload = computed(
  () => props.scraper.selected.value.length > 0 && !props.scraper.busy.value,
);

const showProgress = computed(
  () => props.scraper.busy.value || props.scraper.progress.value > 0,
);
</script>

<template>
  <section class="flex flex-col">
    <div
      v-if="scraper.meta.value"
      class="relative shrink-0 border-b border-app-border px-5 py-4"
    >
      <h2
        class="font-serif text-xl leading-snug font-medium text-balance text-app-strong"
      >
        {{ scraper.meta.value.title }}
      </h2>
      <p class="mt-1 text-[13px] text-app-muted">{{ storyLine }}</p>

      <div class="mt-3.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="btn btn-accent"
          :disabled="!canDownload"
          @click="scraper.downloadChapters()"
        >
          {{ downloadLabel }}
        </button>
        <button
          v-if="scraper.phase.value === 'downloading'"
          type="button"
          class="btn btn-outline"
          @click="scraper.cancel()"
        >
          Huỷ
        </button>
        <button
          v-if="scraper.failed.value.length > 0 && !scraper.busy.value"
          type="button"
          class="btn btn-outline text-app-alert"
          @click="scraper.retryFailed()"
        >
          Thử lại {{ count(scraper.failed.value.length) }} chương lỗi
        </button>

        <p
          v-if="scraper.statusMessage.value && !scraper.exporting.value"
          class="text-[13px] text-app-muted"
        >
          {{ scraper.statusMessage.value }}
        </p>
        <p
          v-else-if="scraper.downloaded.value.length > 0"
          class="text-[13px] text-app-muted"
        >
          Đã tải {{ count(scraper.downloaded.value.length) }} chương,
          {{ count(scraper.totalWords.value) }} từ
        </p>
      </div>

      <span
        v-if="showProgress"
        class="absolute -bottom-px left-0 h-0.5 bg-app-accent transition-[width] duration-300"
        :style="{ width: `${scraper.progress.value}%` }"
        role="progressbar"
        :aria-valuenow="scraper.progress.value"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="Tiến độ tải chương"
      />
    </div>

    <ChapterList
      v-if="scraper.meta.value"
      :chapters="scraper.chapters.value"
      :disabled="scraper.busy.value"
      class="min-h-0 flex-1"
      @select-all="scraper.selectAll"
      @move-before="scraper.moveChapterBefore"
    />

    <div v-else class="flex flex-1 items-center px-5 py-14 lg:px-10">
      <div class="max-w-lg">
        <p class="font-serif text-[26px] leading-snug text-app-strong">
          {{
            scraper.phase.value === "loading"
              ? "Đang đọc mục lục…"
              : "Dán liên kết truyện để bắt đầu."
          }}
        </p>
        <p class="mt-4 text-sm leading-relaxed text-app-muted">
          {{ scraper.source.urlHint }}
        </p>
        <p class="mt-2 text-sm leading-relaxed text-app-muted">
          Chọn chương cần lấy, tải nội dung, rồi lưu thành EPUB hoặc PDF. Mọi
          thứ chạy trong trình duyệt của bạn.
        </p>
      </div>
    </div>
  </section>
</template>
