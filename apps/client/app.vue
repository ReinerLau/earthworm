<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
import { onMounted } from "vue";

import { useDarkMode } from "~/composables/darkMode";

const { initDarkMode } = useDarkMode();

onMounted(() => {
  initDarkMode();
});
</script>

<style>
#jfToolbar,
.mod-json {
  display: none !important;
}
</style>
