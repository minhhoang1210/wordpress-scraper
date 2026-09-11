<script setup lang="ts">
import type { SourceId, StorySource } from "../lib/sources";

defineProps<{ sources: readonly StorySource[]; active: SourceId }>();
const emit = defineEmits<{ select: [id: SourceId] }>();
</script>

<template>
  <div
    role="tablist"
    aria-label="Nguồn truyện"
    class="mb-5 flex gap-1 rounded-xl border border-app-border bg-app-panel p-1 shadow-lg shadow-app-shadow"
  >
    <button
      v-for="source in sources"
      :key="source.id"
      type="button"
      role="tab"
      :aria-selected="source.id === active"
      class="flex-1 cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition"
      :class="
        source.id === active
          ? 'bg-indigo-500 text-white'
          : 'text-app-muted hover:bg-app-hover hover:text-app-text'
      "
      @click="emit('select', source.id)"
    >
      {{ source.name }}
    </button>
  </div>
</template>
