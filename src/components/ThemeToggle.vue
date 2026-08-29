<script setup lang="ts">
import { useTheme } from "../composables/useTheme";

const { theme, toggle } = useTheme();
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="theme === 'dark'"
    :aria-label="
      theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'
    "
    class="flex shrink-0 cursor-pointer items-center outline-none"
    :title="
      theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'
    "
    @click="toggle"
  >
    <span
      class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200"
      :class="theme === 'dark' ? 'bg-indigo-500' : 'bg-app-border-strong'"
    >
      <span
        class="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-200"
        :class="theme === 'dark' && 'translate-x-5'"
      />
    </span>
  </button>
</template>
