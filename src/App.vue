<script setup lang="ts">
import { computed, ref } from "vue";
import SourceTabs from "./components/SourceTabs.vue";
import StoryWorkspace from "./components/StoryWorkspace.vue";
import ThemeToggle from "./components/ThemeToggle.vue";
import { useStoryScraper } from "./composables/useStoryScraper";
import { DEFAULT_SOURCE_ID, STORY_SOURCES, type SourceId } from "./lib/sources";

// One scraper per source, so switching tabs never discards a loaded story.
const scrapers = STORY_SOURCES.map(useStoryScraper);

const activeSourceId = ref<SourceId>(DEFAULT_SOURCE_ID);
const activeScraper = computed(
  () =>
    scrapers.find((scraper) => scraper.source.id === activeSourceId.value) ??
    scrapers[0],
);
</script>

<template>
  <div class="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
    <header class="mb-8 flex items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold text-app-strong sm:text-3xl">
          Trình tải truyện
        </h1>
        <p class="mt-2 max-w-2xl text-sm text-app-muted">
          Chọn nguồn, dán liên kết truyện, rồi tải về bản EPUB hoặc PDF. Mọi
          bước xử lý chạy ngay trong trình duyệt.
        </p>
      </div>
      <ThemeToggle />
    </header>

    <SourceTabs
      :sources="STORY_SOURCES"
      :active="activeSourceId"
      @select="activeSourceId = $event"
    />

    <StoryWorkspace :key="activeSourceId" :scraper="activeScraper" />
  </div>
</template>
