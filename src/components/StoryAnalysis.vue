<script setup lang="ts">
import { computed } from "vue";
import { BATCH_CHARS } from "../lib/ai";
import type { CharacterNote, RelationshipNote } from "../lib/ai";
import type { StoryScraper } from "../composables/useStoryScraper";

const props = defineProps<{
  scraper: StoryScraper;
  view: "summary" | "characters";
}>();

const analysis = computed(() => props.scraper.analysis);
const digest = computed(() => analysis.value.digest.value);
const chapters = computed(() => props.scraper.downloaded.value);
const maxScope = computed(() => chapters.value.length);

const scopeValue = computed({
  get: () => analysis.value.scope.value || maxScope.value,
  set: (value: number) => {
    analysis.value.scope.value = Math.min(
      Math.max(Math.round(value) || 1, 1),
      maxScope.value,
    );
  },
});

// Word counts are already in hand; parsing every chapter body just to size the
// job would cost more than the estimate is worth.
const estimatedCalls = computed(() => {
  const words = chapters.value
    .slice(0, scopeValue.value)
    .reduce((total, chapter) => total + (chapter.wordCount ?? 0), 0);
  return Math.ceil((words * 6) / BATCH_CHARS) + 1;
});

const paragraphs = computed(() =>
  (digest.value?.summary ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean),
);

const normalize = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, " ");

const relationIndex = computed(() => {
  const index = new Map<string, RelationshipNote[]>();
  for (const relationship of digest.value?.relationships ?? []) {
    const key = normalize(relationship.from);
    const bucket = index.get(key);
    if (bucket) bucket.push(relationship);
    else index.set(key, [relationship]);
  }
  return index;
});

function relationsOf(character: CharacterNote): RelationshipNote[] {
  const keys = [character.name, ...character.aliases].map(normalize);
  return [...new Set(keys)].flatMap(
    (key) => relationIndex.value.get(key) ?? [],
  );
}

const savedLine = computed(() => {
  const { savedChapterCount, savedAt } = analysis.value;
  const when = savedAt.value
    ? new Date(savedAt.value).toLocaleString("vi-VN")
    : "";
  return `Đọc từ ${savedChapterCount.value} chương${when ? `, lúc ${when}` : ""}`;
});

function start(): void {
  const meta = props.scraper.meta.value;
  if (meta) analysis.value.run(meta, chapters.value);
}
</script>

<template>
  <div class="thin-scroll overflow-y-auto">
    <div class="max-w-3xl px-5 py-6 lg:px-8">
      <template v-if="!analysis.ready.value">
        <p class="font-serif text-xl leading-snug text-app-strong">
          Cần khoá Gemini để đọc tóm tắt.
        </p>
        <p class="mt-3 text-sm leading-relaxed text-app-muted">
          Dán khoá API vào mục Tóm tắt truyện bằng Gemini ở cột bên trái.
        </p>
      </template>

      <template v-else-if="maxScope === 0">
        <p class="font-serif text-xl leading-snug text-app-strong">
          Chưa có nội dung để đọc.
        </p>
        <p class="mt-3 text-sm leading-relaxed text-app-muted">
          Sang tab Chương, tải nội dung chương xong rồi quay lại đây.
        </p>
      </template>

      <template v-else>
        <div v-if="analysis.running.value">
          <p class="font-serif text-xl leading-snug text-app-strong">
            Đang đọc truyện…
          </p>
          <div class="mt-4 h-0.5 w-full max-w-md bg-app-border">
            <div
              class="h-full bg-app-accent transition-[width] duration-300"
              :style="{ width: `${analysis.progress.value}%` }"
              role="progressbar"
              :aria-valuenow="analysis.progress.value"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-label="Tiến độ tóm tắt"
            />
          </div>
          <p class="mt-2 text-[13px] text-app-muted">
            {{
              analysis.statusMessage.value ||
              `${analysis.progress.value}% hoàn tất`
            }}
          </p>
          <button
            type="button"
            class="btn btn-outline mt-4"
            @click="analysis.cancel()"
          >
            Huỷ
          </button>
        </div>

        <div v-else-if="analysis.phase.value === 'error'">
          <p class="font-serif text-xl leading-snug text-app-strong">
            Không tóm tắt được.
          </p>
          <p
            class="mt-3 border-l-2 border-app-alert bg-app-alert-soft px-3 py-2 text-[13px] leading-relaxed text-app-alert"
          >
            {{ analysis.errorText.value }}
          </p>
          <button type="button" class="btn btn-accent mt-4" @click="start">
            Thử lại
          </button>
        </div>

        <div v-else-if="!digest">
          <p class="font-serif text-xl leading-snug text-app-strong">
            Đọc truyện và dựng tóm tắt.
          </p>
          <p class="mt-3 text-sm leading-relaxed text-app-muted">
            Gemini đọc lần lượt từng phần rồi gộp lại thành mạch truyện, danh
            sách nhân vật và quan hệ giữa họ. Lần này tốn khoảng
            {{ estimatedCalls }} lượt gọi.
          </p>

          <label
            class="mt-5 flex flex-wrap items-center gap-2 text-sm text-app-muted"
          >
            Đọc
            <input
              v-model.number="scopeValue"
              type="number"
              min="1"
              :max="maxScope"
              class="field w-20 py-1.5"
            />
            chương đầu trong {{ maxScope }} chương đã tải.
          </label>
          <p class="mt-1.5 text-xs leading-relaxed text-app-faint">
            Tóm tắt cả bộ là lộ hết nội dung. Dừng ở chương bạn đang đọc thì an
            toàn hơn.
          </p>

          <button type="button" class="btn btn-accent mt-5" @click="start">
            Đọc tóm tắt
          </button>
        </div>

        <template v-if="digest && !analysis.running.value">
          <div
            class="mb-6 flex flex-wrap items-center gap-3 border-b border-app-border pb-4"
          >
            <p class="text-[13px] text-app-muted">{{ savedLine }}</p>
            <button
              type="button"
              class="btn btn-outline btn-sm ml-auto"
              @click="start"
            >
              Đọc lại
            </button>
          </div>

          <template v-if="view === 'summary'">
            <article class="max-w-[68ch]">
              <p
                v-for="(paragraph, index) in paragraphs"
                :key="index"
                class="mt-4 font-serif text-[15px] leading-[1.75] first:mt-0"
              >
                {{ paragraph }}
              </p>
            </article>

            <section v-if="digest.arcs.length > 0" class="mt-10">
              <h3 class="text-[13px] font-medium text-app-muted">
                Các phần trong truyện
              </h3>
              <ol class="mt-3">
                <li
                  v-for="(arc, index) in digest.arcs"
                  :key="index"
                  class="border-t border-app-border py-3.5"
                >
                  <div class="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <h4
                      class="font-serif text-[15px] font-medium text-app-strong"
                    >
                      {{ arc.title }}
                    </h4>
                    <span class="text-xs tabular-nums text-app-faint">
                      chương {{ arc.fromChapter }} tới {{ arc.toChapter }}
                    </span>
                  </div>
                  <p
                    class="mt-1.5 max-w-[68ch] text-[13px] leading-relaxed text-app-muted"
                  >
                    {{ arc.summary }}
                  </p>
                </li>
              </ol>
            </section>
          </template>

          <ul v-else>
            <li
              v-for="character in digest.characters"
              :key="character.name"
              class="border-t border-app-border py-4"
            >
              <div class="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h3 class="font-serif text-[15px] font-medium text-app-strong">
                  {{ character.name }}
                </h3>
                <span v-if="character.role" class="text-xs text-app-muted">
                  {{ character.role }}
                </span>
                <span
                  v-if="character.firstChapter > 0"
                  class="text-xs tabular-nums text-app-faint"
                >
                  từ chương {{ character.firstChapter }}
                </span>
              </div>

              <p
                v-if="character.aliases.length > 0"
                class="mt-1 text-xs leading-relaxed text-app-faint"
              >
                Còn gọi: {{ character.aliases.join(", ") }}
              </p>

              <p
                v-if="character.description"
                class="mt-2 max-w-[68ch] text-[13px] leading-relaxed"
              >
                {{ character.description }}
              </p>

              <ul
                v-if="relationsOf(character).length > 0"
                class="mt-2.5 border-l border-app-border pl-3"
              >
                <li
                  v-for="(relation, index) in relationsOf(character)"
                  :key="index"
                  class="text-[13px] leading-relaxed text-app-muted"
                >
                  {{ relation.kind }}
                  <span class="text-app-text">{{ relation.to }}</span>
                  <span v-if="relation.note" class="text-app-faint">
                    ({{ relation.note }})
                  </span>
                </li>
              </ul>
            </li>
          </ul>
        </template>
      </template>
    </div>
  </div>
</template>
