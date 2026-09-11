<script setup lang="ts">
import { computed, ref } from "vue";
import SourceTabs from "./components/SourceTabs.vue";
import StoryChapters from "./components/StoryChapters.vue";
import StoryLink from "./components/StoryLink.vue";
import StorySettings from "./components/StorySettings.vue";
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
  <div class="flex min-h-screen flex-col lg:h-screen lg:min-h-0">
    <header
      class="flex h-14 shrink-0 items-center gap-4 border-b border-app-border px-5"
    >
      <div class="flex min-w-0 items-baseline gap-3">
        <h1 class="font-serif text-[17px] font-medium text-app-strong">
          Trình tải truyện
        </h1>
        <p class="hidden truncate text-[13px] text-app-faint sm:block">
          EPUB và PDF từ WordPress hoặc Wattpad
        </p>
      </div>
      <div class="ml-auto">
        <ThemeToggle />
      </div>
    </header>

    <!-- `contents` lets the rail's two halves sit either side of the chapter
         list on a phone, while staying one column on a wide screen. -->
    <main class="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div
        class="thin-scroll contents lg:flex lg:w-84 lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:border-r lg:border-app-border"
      >
        <div class="order-1 bg-app-panel lg:order-none">
          <SourceTabs
            :sources="STORY_SOURCES"
            :active="activeSourceId"
            @select="activeSourceId = $event"
          />
          <StoryLink :key="activeSourceId" :scraper="activeScraper" />
        </div>
        <div class="order-3 bg-app-panel lg:order-none">
          <StorySettings :key="activeSourceId" :scraper="activeScraper" />
        </div>
      </div>

      <StoryChapters
        :key="activeSourceId"
        :scraper="activeScraper"
        class="order-2 min-h-0 min-w-0 flex-1 lg:order-none"
      />
    </main>
  </div>
</template>
