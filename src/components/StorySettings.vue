<script setup lang="ts">
import { computed, ref } from "vue";
import ActivityLog from "./ActivityLog.vue";
import MetadataDialog from "./MetadataDialog.vue";
import RailSection from "./RailSection.vue";
import type { StoryScraper } from "../composables/useStoryScraper";

const props = defineProps<{ scraper: StoryScraper }>();

const credentialField = computed(() => props.scraper.source.credentialField);
const hasBook = computed(() => props.scraper.downloaded.value.length > 0);
const metadataOpen = ref(false);
</script>

<template>
  <RailSection title="Tuỳ chọn">
    <label class="flex cursor-pointer items-start gap-2.5 text-sm">
      <input
        v-model="scraper.settings.stripImages"
        type="checkbox"
        class="mt-0.5 size-4 shrink-0"
      />
      <span>Không tải hình ảnh (kể cả ảnh bìa)</span>
    </label>

    <div v-if="credentialField" class="mt-4">
      <label for="credential" class="mb-1.5 block text-sm">
        {{ credentialField.label }}
      </label>
      <input
        id="credential"
        v-model="scraper.credential.value"
        type="text"
        autocomplete="off"
        aria-describedby="credential-hint"
        :placeholder="credentialField.placeholder"
        class="field"
      />
      <p
        id="credential-hint"
        class="mt-1.5 text-xs leading-relaxed text-app-faint"
      >
        {{ credentialField.hint }}
      </p>
    </div>
  </RailSection>

  <RailSection title="Lưu thành sách">
    <button
      type="button"
      class="btn btn-outline mb-2 w-full"
      :disabled="!scraper.meta.value"
      @click="metadataOpen = true"
    >
      Sửa thông tin sách
    </button>

    <div class="flex gap-2">
      <button
        type="button"
        class="btn btn-outline flex-1"
        :disabled="!scraper.canExport.value"
        @click="scraper.exportEpub()"
      >
        {{ scraper.exporting.value === "epub" ? "Đang tạo…" : "Lưu EPUB" }}
      </button>
      <button
        type="button"
        class="btn btn-outline flex-1"
        :disabled="!scraper.canExport.value"
        @click="scraper.exportPdf()"
      >
        {{ scraper.exporting.value === "pdf" ? "Đang tạo…" : "Lưu PDF" }}
      </button>
    </div>

    <div class="mt-3 flex items-end gap-3">
      <label class="min-w-0 flex-1 text-xs text-app-muted">
        Khổ giấy
        <select v-model="scraper.pdfSettings.pageSize" class="field mt-1">
          <option value="a5">A5</option>
          <option value="a4">A4</option>
          <option value="letter">Letter</option>
        </select>
      </label>
      <label class="w-20 shrink-0 text-xs text-app-muted">
        Cỡ chữ
        <input
          v-model.number="scraper.pdfSettings.fontSize"
          type="number"
          min="8"
          max="18"
          class="field mt-1"
        />
      </label>
    </div>

    <p
      v-if="scraper.exporting.value && scraper.statusMessage.value"
      class="mt-3 text-xs leading-relaxed text-app-muted"
    >
      {{ scraper.statusMessage.value }}
    </p>
    <p v-else-if="!hasBook" class="mt-3 text-xs leading-relaxed text-app-faint">
      Tải nội dung chương xong thì lưu được file. Khổ giấy và cỡ chữ chỉ áp dụng
      cho PDF.
    </p>
    <p v-else class="mt-3 text-xs leading-relaxed text-app-faint">
      Sách mở đầu bằng phần giới thiệu rồi tới từng chương. Chương nào không tải
      được thì thay bằng liên kết tới trang gốc.
    </p>
  </RailSection>

  <RailSection title="Nhật ký">
    <ActivityLog :entries="scraper.logs.value" />
  </RailSection>

  <MetadataDialog v-model:open="metadataOpen" :scraper="scraper" />
</template>
