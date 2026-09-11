<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<template>
  <section class="border-b border-app-border px-5 py-4">
    <h2 v-if="title" class="mb-3 text-[13px] font-medium text-app-muted">
      {{ title }}
    </h2>
    <slot />
  </section>
</template>
