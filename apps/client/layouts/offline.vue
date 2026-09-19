<template>
  <main
    class="min-h-screen bg-white px-5 py-6 text-slate-700 dark:bg-theme-dark dark:text-slate-200"
  >
    <div class="mx-auto w-full max-w-2xl">
      <slot />
    </div>
    <footer class="mx-auto mt-8 w-full max-w-2xl text-center text-xs opacity-50">
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
