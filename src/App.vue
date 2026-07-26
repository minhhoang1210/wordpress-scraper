<script setup lang="ts">
import { computed } from "vue";
import PanelSection from "./components/PanelSection.vue";
import ChapterList from "./components/ChapterList.vue";
import ActivityLog from "./components/ActivityLog.vue";
import { useScraper } from "./composables/useScraper";

const s = useScraper();

const busy = computed(
  () => s.phase.value === "indexing" || s.phase.value === "scraping",
);
const canScrape = computed(() => s.selected.value.length > 0 && !busy.value);
</script>

<template>
  <div class="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
    <header class="mb-8">
      <h1 class="text-2xl font-semibold text-white sm:text-3xl">
        Trình tải truyện WordPress
      </h1>
      <p class="mt-2 max-w-2xl text-sm text-slate-400">
        Dán liên kết trang mục lục của một truyện trên WordPress. Công cụ sẽ đi
        theo từng liên kết chương, trích xuất mỗi trang rồi đóng gói thành EPUB
        hoặc PDF.
      </p>
    </header>

    <!-- Bước 1: nguồn -->
    <PanelSection
      title="1 · Trang mục lục"
      subtitle="Liên kết chương được nhận diện qua các từ khoá: chuong, chap, chapter, phien-ngoai, ngoai-truyen, vi-thanh."
      class="mb-5"
    >
      <form
        class="flex flex-col gap-3 sm:flex-row"
        @submit.prevent="s.loadIndex()"
      >
        <input
          v-model="s.indexUrl.value"
          type="url"
          required
          placeholder="https://ten-mien.wordpress.com/ten-truyen/"
          class="flex-1 rounded-lg border border-white/10 bg-ink-950 px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
          :disabled="busy"
        />
        <button
          type="submit"
          class="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-40"
          :disabled="busy || !s.indexUrl.value.trim()"
        >
          {{ s.phase.value === "indexing" ? "Đang tải…" : "Tìm chương" }}
        </button>
      </form>

      <label
        class="mt-4 flex items-center gap-2 border-t border-white/5 pt-4 text-sm text-slate-300"
      >
        <input
          v-model="s.options.stripImages"
          type="checkbox"
          class="size-4 accent-indigo-500"
        />
        Bỏ hình ảnh
      </label>
    </PanelSection>

    <p
      v-if="s.errorMessage.value"
      class="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
    >
      {{ s.errorMessage.value }}
    </p>

    <!-- Bước 2: chương -->
    <PanelSection
      v-if="s.meta.value"
      title="2 · Danh sách chương"
      :subtitle="`${s.meta.value.title} — tìm thấy ${s.chapters.value.length} chương, đã chọn ${s.selected.value.length}`"
      class="mb-5"
    >
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-40"
          :disabled="!canScrape"
          @click="s.scrapeChapters()"
        >
          Tải {{ s.selected.value.length }} chương
        </button>
        <button
          v-if="s.phase.value === 'scraping'"
          type="button"
          class="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
          @click="s.cancel()"
        >
          Huỷ
        </button>
        <button
          v-if="s.failed.value.length > 0 && !busy"
          type="button"
          class="rounded-lg border border-amber-400/40 px-4 py-2 text-sm text-amber-200 hover:bg-amber-400/10"
          @click="s.retryFailed()"
        >
          Thử lại {{ s.failed.value.length }} chương lỗi
        </button>
        <span v-if="s.fetched.value.length > 0" class="text-xs text-slate-400">
          Đã tải {{ s.fetched.value.length }} chương ·
          {{ s.totalWords.value.toLocaleString("vi-VN") }} từ
        </span>
      </div>

      <div v-if="busy || s.progress.value > 0" class="mb-4">
        <div class="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            class="h-full rounded-full bg-indigo-500 transition-[width] duration-300"
            :style="{ width: `${s.progress.value}%` }"
          />
        </div>
        <p class="mt-1.5 text-xs text-slate-500">
          {{ s.busyMessage.value || `${s.progress.value}% hoàn tất` }}
        </p>
      </div>

      <ChapterList
        :chapters="s.chapters.value"
        :disabled="busy"
        @select-all="s.selectAll"
      />
    </PanelSection>

    <!-- Bước 3: tải xuống -->
    <PanelSection
      v-if="s.fetched.value.length > 0"
      title="3 · Tải xuống"
      subtitle="EPUB hoặc PDF được tạo từ nội dung đã trích xuất."
      class="mb-5"
    >
      <div class="flex flex-wrap items-end gap-4">
        <button
          type="button"
          class="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-400 disabled:opacity-40"
          :disabled="!s.canExport.value"
          @click="s.exportEpub()"
        >
          {{ s.exporting.value === "epub" ? "Đang tạo…" : "Tải EPUB" }}
        </button>
        <button
          type="button"
          class="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-sky-400 disabled:opacity-40"
          :disabled="!s.canExport.value"
          @click="s.exportPdf()"
        >
          {{ s.exporting.value === "pdf" ? "Đang tạo…" : "Tải PDF" }}
        </button>

        <label class="text-xs text-slate-400">
          Khổ giấy
          <select
            v-model="s.pdfOptions.pageSize"
            class="mt-1 block rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm text-slate-200"
          >
            <option value="a5">A5</option>
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
          </select>
        </label>
        <label class="text-xs text-slate-400">
          Cỡ chữ
          <input
            v-model.number="s.pdfOptions.fontSize"
            type="number"
            min="8"
            max="18"
            class="mt-1 block w-20 rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <p v-if="s.busyMessage.value" class="mt-3 text-xs text-slate-400">
        {{ s.busyMessage.value }}
      </p>
      <p class="mt-3 text-xs text-slate-500">
        Cả hai bản đều mở đầu bằng nội dung trang mục lục, sau đó tới từng
        chương.
      </p>
    </PanelSection>

    <PanelSection title="Log">
      <ActivityLog :entries="s.logs.value" />
    </PanelSection>
  </div>
</template>
