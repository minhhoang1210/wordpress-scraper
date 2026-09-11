<script setup lang="ts">
import type { SourceId, StorySource } from "../lib/sources";

defineProps<{ sources: readonly StorySource[]; active: SourceId }>();
const emit = defineEmits<{ select: [id: SourceId] }>();
</script>

<template>
  <div
    role="tablist"
    aria-label="Nguồn truyện"
    class="flex shrink-0 border-b border-app-border"
  >
    <button
      v-for="source in sources"
      :key="source.id"
      type="button"
      role="tab"
      :aria-selected="source.id === active"
      class="flex-1 cursor-pointer border-b-2 px-4 py-3 text-sm transition-colors"
      :class="
        source.id === active
          ? 'border-app-accent font-medium text-app-strong'
          : 'border-transparent text-app-muted hover:text-app-text'
      "
      @click="emit('select', source.id)"
    >
      {{ source.name }}
    </button>
  </div>
</template>
