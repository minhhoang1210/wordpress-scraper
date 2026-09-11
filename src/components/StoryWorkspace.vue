<script setup lang="ts">
import { computed } from "vue";
import ActivityLog from "./ActivityLog.vue";
import ChapterList from "./ChapterList.vue";
import PanelSection from "./PanelSection.vue";
import type { StoryScraper } from "../composables/useStoryScraper";

const props = defineProps<{ scraper: StoryScraper }>();

const credentialField = computed(() => props.scraper.source.credentialField);
const canDownload = computed(
  () => props.scraper.selected.value.length > 0 && !props.scraper.busy.value,
);
</script>

<template>
  <PanelSection
    title="1 · Nguồn truyện"
    :subtitle="scraper.source.urlHint"
    class="mb-5"
  >
    <form
      class="flex flex-col gap-3 sm:flex-row"
      @submit.prevent="scraper.loadStory()"
    >
      <input
        v-model="scraper.storyUrl.value"
        type="url"
        required
        :placeholder="scraper.source.urlPlaceholder"
        class="flex-1 rounded-lg border border-app-border bg-app-panel-alt px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
        :disabled="scraper.busy.value"
      />
      <button
        type="submit"
        class="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-40"
        :disabled="scraper.busy.value || !scraper.storyUrl.value.trim()"
      >
        {{ scraper.phase.value === "loading" ? "Đang tải…" : "Tìm chương" }}
      </button>
    </form>

    <div
      class="mt-4 flex flex-col gap-3 border-t border-app-border pt-4 text-sm text-app-muted"
    >
      <label class="flex items-center gap-2">
        <input
          v-model="scraper.settings.stripImages"
          type="checkbox"
          class="size-4 accent-indigo-500"
        />
        Bỏ hình ảnh (kể cả ảnh bìa)
      </label>

      <div v-if="credentialField" class="flex flex-col gap-1.5">
        <div class="flex items-center gap-2">
          <label for="credential" class="shrink-0">
            {{ credentialField.label }}
          </label>
          <input
            id="credential"
            v-model="scraper.credential.value"
            type="text"
            autocomplete="off"
            :placeholder="credentialField.placeholder"
            aria-describedby="credential-hint"
            class="min-w-0 flex-1 rounded-lg border border-app-border bg-app-panel-alt px-3 py-1.5 text-sm outline-none focus:border-indigo-400"
          />
        </div>
        <p id="credential-hint" class="text-xs text-app-faint">
          {{ credentialField.hint }}
        </p>
      </div>
    </div>
  </PanelSection>

  <p
    v-if="scraper.errorText.value"
    class="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200"
  >
    {{ scraper.errorText.value }}
  </p>

  <PanelSection
    v-if="scraper.meta.value"
    title="2 · Danh sách chương"
    :subtitle="`${scraper.meta.value.title} — tìm thấy ${scraper.chapters.value.length} chương, đã chọn ${scraper.selected.value.length}`"
    class="mb-5"
  >
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-40"
        :disabled="!canDownload"
        @click="scraper.downloadChapters()"
      >
        Tải {{ scraper.selected.value.length }} chương
      </button>
      <button
        v-if="scraper.phase.value === 'downloading'"
        type="button"
        class="rounded-lg border border-app-border-strong px-4 py-2 text-sm text-app-text hover:bg-app-hover"
        @click="scraper.cancel()"
      >
        Huỷ
      </button>
      <button
        v-if="scraper.failed.value.length > 0 && !scraper.busy.value"
        type="button"
        class="rounded-lg border border-amber-400/40 px-4 py-2 text-sm text-amber-700 hover:bg-amber-400/10 dark:text-amber-200"
        @click="scraper.retryFailed()"
      >
        Thử lại {{ scraper.failed.value.length }} chương lỗi
      </button>
      <span
        v-if="scraper.downloaded.value.length > 0"
        class="text-xs text-app-muted"
      >
        Đã tải {{ scraper.downloaded.value.length }} chương ·
        {{ scraper.totalWords.value.toLocaleString("vi-VN") }} từ
      </span>
    </div>

    <div v-if="scraper.busy.value || scraper.progress.value > 0" class="mb-4">
      <div class="h-1.5 overflow-hidden rounded-full bg-app-track">
        <div
          class="h-full rounded-full bg-indigo-500 transition-[width] duration-300"
          :style="{ width: `${scraper.progress.value}%` }"
        />
      </div>
      <p class="mt-1.5 text-xs text-app-faint">
        {{
          scraper.statusMessage.value || `${scraper.progress.value}% hoàn tất`
        }}
      </p>
    </div>

    <ChapterList
      :chapters="scraper.chapters.value"
      :disabled="scraper.busy.value"
      @select-all="scraper.selectAll"
      @move-before="scraper.moveChapterBefore"
      @shift="scraper.shiftChapter"
    />
  </PanelSection>

  <PanelSection
    v-if="scraper.downloaded.value.length > 0"
    title="3 · Tải xuống"
    subtitle="EPUB hoặc PDF được tạo từ nội dung đã trích xuất."
    class="mb-5"
  >
    <div class="flex flex-wrap items-end gap-4">
      <button
        type="button"
        class="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-400 disabled:opacity-40"
        :disabled="!scraper.canExport.value"
        @click="scraper.exportEpub()"
      >
        {{ scraper.exporting.value === "epub" ? "Đang tạo…" : "Tải EPUB" }}
      </button>
      <button
        type="button"
        class="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-400 disabled:opacity-40"
        :disabled="!scraper.canExport.value"
        @click="scraper.exportPdf()"
      >
        {{ scraper.exporting.value === "pdf" ? "Đang tạo…" : "Tải PDF" }}
      </button>

      <label class="text-xs text-app-muted">
        Khổ giấy
        <select
          v-model="scraper.pdfSettings.pageSize"
          class="mt-1 block rounded-lg border border-app-border bg-app-panel-alt px-3 py-2 text-sm text-app-text"
        >
          <option value="a5">A5</option>
          <option value="a4">A4</option>
          <option value="letter">Letter</option>
        </select>
      </label>
      <label class="text-xs text-app-muted">
        Cỡ chữ
        <input
          v-model.number="scraper.pdfSettings.fontSize"
          type="number"
          min="8"
          max="18"
          class="mt-1 block w-20 rounded-lg border border-app-border bg-app-panel-alt px-3 py-2 text-sm"
        />
      </label>
    </div>

    <p v-if="scraper.statusMessage.value" class="mt-3 text-xs text-app-muted">
      {{ scraper.statusMessage.value }}
    </p>
    <p class="mt-3 text-xs text-app-faint">
      Cả hai bản mở đầu bằng phần giới thiệu, sau đó tới từng chương. Bìa EPUB
      lấy theo thứ tự: ảnh bìa do nguồn công bố, rồi ảnh đầu tiên tải được trong
      truyện, cuối cùng là bìa tự vẽ từ tên truyện. Chương không tải được nội
      dung sẽ có liên kết tới trang gốc thay cho nội dung.
    </p>
  </PanelSection>

  <PanelSection title="Log">
    <ActivityLog :entries="scraper.logs.value" />
  </PanelSection>
</template>
