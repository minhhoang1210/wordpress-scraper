<script setup lang="ts">
import RailSection from "./RailSection.vue";
import type { StoryScraper } from "../composables/useStoryScraper";

defineProps<{ scraper: StoryScraper }>();
</script>

<template>
  <RailSection>
    <form class="flex flex-col gap-2" @submit.prevent="scraper.loadStory()">
      <input
        v-model="scraper.storyUrl.value"
        type="url"
        required
        aria-label="Liên kết truyện"
        :placeholder="scraper.source.urlPlaceholder"
        :disabled="scraper.busy.value"
        class="field"
      />
      <button
        type="submit"
        class="btn btn-accent"
        :disabled="scraper.busy.value || !scraper.storyUrl.value.trim()"
      >
        {{ scraper.phase.value === "loading" ? "Đang tìm…" : "Tìm chương" }}
      </button>
    </form>

    <p class="mt-2 text-xs leading-relaxed text-app-faint">
      {{ scraper.source.urlHint }}
    </p>

    <p
      v-if="scraper.errorText.value"
      role="alert"
      class="mt-3 border-l-2 border-app-alert bg-app-alert-soft px-3 py-2 text-xs leading-relaxed text-app-alert"
    >
      {{ scraper.errorText.value }}
    </p>
  </RailSection>
</template>
