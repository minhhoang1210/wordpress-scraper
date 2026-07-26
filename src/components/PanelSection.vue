<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>();
</script>

<template>
  <section
    class="rounded-xl border border-white/10 bg-ink-900/60 p-5 shadow-lg shadow-black/20"
  >
    <header class="mb-4">
      <h2 class="text-sm font-semibold tracking-wide text-slate-100 uppercase">
        {{ title }}
      </h2>
      <p v-if="subtitle" class="mt-1 text-xs text-slate-400">{{ subtitle }}</p>
    </header>
    <slot />
  </section>
</template>
