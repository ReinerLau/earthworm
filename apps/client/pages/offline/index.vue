<template>
  <section class="py-12 text-center">
    <p class="text-sm opacity-60">正在打开本机课程…</p>
  </section>
</template>

<script setup lang="ts">
import { definePageMeta, navigateTo } from "#imports";
import { onMounted } from "vue";

definePageMeta({ layout: "offline" });

onMounted(() => navigateTo("/course-pack"));
</script>
