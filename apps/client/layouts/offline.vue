<template>
  <main
    class="min-h-screen w-full min-w-0 overflow-x-hidden bg-white px-5 py-6 text-slate-700 dark:bg-theme-dark dark:text-slate-200"
  >
    <div class="w-full min-w-0">
      <slot />
    </div>
    <footer class="mt-8 w-full text-center text-xs opacity-50">
      <span :title="buildVersion">版本 {{ shortBuildVersion }}</span>
    </footer>
  </main>
</template>

<script setup lang="ts">
import { useRuntimeConfig } from "nuxt/app";
import { computed } from "vue";

const buildVersion = String(useRuntimeConfig().public.buildVersion || "dev");
const shortBuildVersion = computed(() =>
  buildVersion === "dev" ? "dev" : buildVersion.slice(0, 7),
);
</script>
