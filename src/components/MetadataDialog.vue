<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { StoryScraper } from "../composables/useStoryScraper";
import { formatBytes, htmlToPlainText, textToParagraphs } from "../lib/text";

const props = defineProps<{ scraper: StoryScraper }>();
const open = defineModel<boolean>("open", { default: false });

const MAX_COVER_BYTES = 5 * 1024 * 1024;

const LANGUAGES = [
  { code: "vi", label: "Tiếng Việt" },
  { code: "en", label: "Tiếng Anh" },
  { code: "zh", label: "Tiếng Trung" },
  { code: "ko", label: "Tiếng Hàn" },
  { code: "ja", label: "Tiếng Nhật" },
  { code: "th", label: "Tiếng Thái" },
];

const dialog = ref<HTMLDialogElement | null>(null);
const description = ref("");
const coverError = ref("");

const meta = computed(() => props.scraper.meta.value);
const coverSrc = computed(
  () => meta.value?.coverDataUrl || meta.value?.coverUrl || "",
);

const seriesIndex = computed({
  get: () => meta.value?.seriesIndex ?? "",
  set: (value: string | number) => {
    if (!meta.value) return;
    const parsed =
      typeof value === "number" ? value : Number.parseFloat(value as string);
    meta.value.seriesIndex =
      Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  },
});

watch(open, (isOpen) => {
  const element = dialog.value;
  if (!element) return;

  if (isOpen) {
    seedDescription();
    coverError.value = "";
    if (!element.open) element.showModal();
  } else if (element.open) {
    element.close();
  }
});

function seedDescription(): void {
  description.value = htmlToPlainText(meta.value?.descriptionHtml ?? "");
}

// Writing back once on close avoids a lossy html round trip on every keystroke.
function onClose(): void {
  if (meta.value) {
    meta.value.descriptionHtml = textToParagraphs(description.value);
  }
  open.value = false;
}

function restore(): void {
  props.scraper.restoreMeta();
  seedDescription();
  coverError.value = "";
}

function useSourceCover(): void {
  if (meta.value) meta.value.coverDataUrl = undefined;
}

async function onCoverChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !meta.value) return;

  coverError.value = "";
  if (!file.type.startsWith("image/")) {
    coverError.value = "Tệp này không phải ảnh.";
    return;
  }
  if (file.size > MAX_COVER_BYTES) {
    coverError.value = `Ảnh nặng ${formatBytes(file.size)}, tối đa ${formatBytes(MAX_COVER_BYTES)}.`;
    return;
  }

  try {
    meta.value.coverDataUrl = await readDataUrl(file);
  } catch {
    coverError.value = "Không đọc được tệp ảnh này.";
  }
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-[min(46rem,92vw)] rounded-sm border border-app-border bg-app-panel p-0 text-app-text backdrop:bg-black/45"
    aria-labelledby="metadata-heading"
    @close="onClose"
    @cancel.prevent="onClose"
  >
    <form v-if="meta" method="dialog" class="flex flex-col">
      <div class="border-b border-app-border px-5 py-4">
        <h2
          id="metadata-heading"
          class="font-serif text-lg font-medium text-app-strong"
        >
          Thông tin sách
        </h2>
        <p class="mt-1 text-[13px] text-app-muted">
          Những gì sửa ở đây đi thẳng vào file EPUB và PDF.
        </p>
      </div>

      <div class="flex flex-col gap-5 px-5 py-5 sm:flex-row">
        <div class="shrink-0 sm:w-36">
          <div
            class="flex aspect-[2/3] w-28 items-center justify-center overflow-hidden rounded-sm border border-app-border bg-app-panel-alt sm:w-36"
          >
            <img
              v-if="coverSrc"
              :src="coverSrc"
              alt="Ảnh bìa"
              class="h-full w-full object-cover"
            />
            <span v-else class="px-2 text-center text-xs text-app-faint">
              Chưa có bìa, sách sẽ dùng bìa tự vẽ
            </span>
          </div>

          <label
            class="btn btn-outline btn-sm mt-2 w-28 cursor-pointer sm:w-36"
            role="button"
          >
            Chọn ảnh
            <input
              type="file"
              accept="image/*"
              class="sr-only"
              @change="onCoverChange"
            />
          </label>
          <button
            v-if="meta.coverDataUrl"
            type="button"
            class="mt-1.5 w-28 text-xs text-app-muted underline underline-offset-2 hover:text-app-text sm:w-36"
            @click="useSourceCover"
          >
            Dùng lại bìa gốc
          </button>
          <p v-if="coverError" class="mt-1.5 text-xs text-app-alert">
            {{ coverError }}
          </p>
        </div>

        <div class="flex min-w-0 flex-1 flex-col gap-3.5">
          <label class="block text-[13px] text-app-muted">
            Tên truyện
            <input v-model="meta.title" type="text" class="field mt-1" />
          </label>

          <label class="block text-[13px] text-app-muted">
            Tác giả
            <input v-model="meta.author" type="text" class="field mt-1" />
          </label>

          <div class="flex gap-3">
            <label class="min-w-0 flex-1 text-[13px] text-app-muted">
              Ngôn ngữ
              <input
                v-model="meta.language"
                type="text"
                list="language-codes"
                class="field mt-1"
              />
              <datalist id="language-codes">
                <option
                  v-for="language in LANGUAGES"
                  :key="language.code"
                  :value="language.code"
                >
                  {{ language.label }}
                </option>
              </datalist>
            </label>
          </div>

          <div class="flex gap-3">
            <label class="min-w-0 flex-1 text-[13px] text-app-muted">
              Bộ truyện
              <input
                v-model="meta.series"
                type="text"
                placeholder="để trống nếu truyện lẻ"
                class="field mt-1"
              />
            </label>
            <label class="w-20 shrink-0 text-[13px] text-app-muted">
              Tập
              <input
                v-model="seriesIndex"
                type="number"
                min="1"
                step="1"
                class="field mt-1"
              />
            </label>
          </div>

          <label class="block text-[13px] text-app-muted">
            Giới thiệu
            <textarea
              v-model="description"
              rows="5"
              class="field thin-scroll mt-1 resize-y leading-relaxed"
            />
          </label>
        </div>
      </div>

      <div
        class="flex flex-wrap items-center gap-3 border-t border-app-border px-5 py-3.5"
      >
        <button type="button" class="btn btn-outline btn-sm" @click="restore">
          Khôi phục thông tin gốc
        </button>
        <button type="submit" class="btn btn-accent ml-auto">Xong</button>
      </div>
    </form>
  </dialog>
</template>
