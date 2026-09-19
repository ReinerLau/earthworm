<template>
  <section class="py-16 text-center">
    <div class="mb-6 text-6xl">🪱</div>
    <h1 class="text-4xl font-bold">Earthworm</h1>
    <p class="mx-auto mt-4 max-w-xl opacity-70">
      本地优先的英语教材表达复现工具。课程和学习进度保存在当前设备中。
    </p>
    <div class="mt-8 flex justify-center gap-3">
      <NuxtLink
        class="btn btn-primary"
        to="/course-pack"
        >查看本机课程</NuxtLink
      >
      <NuxtLink
        class="btn btn-outline"
        to="/import"
        >导入课程包</NuxtLink
      >
    </div>
  </section>
</template>

<script setup lang="ts">
import { definePageMeta } from "#imports";

definePageMeta({ layout: "offline" });
</script>
