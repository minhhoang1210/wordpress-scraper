<script setup lang="ts">
import { useTheme } from "../composables/useTheme";

const { theme, toggle } = useTheme();
</script>

<template>
  <button
    type="button"
    :aria-label="
      theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'
    "
    :title="
      theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'
    "
    class="flex size-8 cursor-pointer items-center justify-center rounded-sm text-app-muted transition-colors hover:bg-app-hover hover:text-app-text"
    @click="toggle"
  >
    <svg
      v-if="theme === 'dark'"
      class="size-4.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"
      />
    </svg>
    <svg
      v-else
      class="size-4.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </svg>
  </button>
</template>
