<template>
  <section class="py-10">
    <div class="mb-8 flex items-center justify-between">
      <div>
        <p class="text-sm opacity-60">Earthworm 本地课程</p>
        <h1 class="text-2xl font-bold">导入课程包</h1>
      </div>
      <NuxtLink
        class="btn btn-ghost btn-sm"
        to="/course-pack"
        >返回课程包</NuxtLink
      >
    </div>

    <div class="rounded-xl border border-dashed p-8 text-center dark:border-slate-600">
      <input
        ref="fileInput"
        class="file-input file-input-bordered w-full max-w-md"
        type="file"
        accept=".json,application/json"
        :disabled="isImporting"
        @change="handleFileChange"
      />
      <p class="mt-4 text-sm opacity-60">
        选择 Skill 生成的 CoursePackage 文件；也兼容旧版 schema_version/ statements 文件
      </p>
      <p
        v-if="message"
        class="mt-4"
        :class="hasError ? 'text-error' : 'text-success'"
      >
        {{ message }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { definePageMeta, navigateTo } from "#imports";
import { ref } from "vue";

import { upsertCoursePackage } from "~/services/courseRepository";

definePageMeta({ layout: "offline" });

const fileInput = ref<HTMLInputElement>();
const isImporting = ref(false);
const hasError = ref(false);
const message = ref("");

async function handleFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  isImporting.value = true;
  hasError.value = false;
  message.value = "正在校验并保存课程包…";
  try {
    const value: unknown = JSON.parse(await file.text());
    const saved = await upsertCoursePackage(value);
    message.value = `已保存「${saved.title}」，包含 ${saved.courses.length} 门课程`;
    if (fileInput.value) fileInput.value.value = "";
    await navigateTo(`/course-pack/${saved.id}`);
  } catch (error) {
    hasError.value = true;
    message.value = error instanceof Error ? error.message : "课程包导入失败";
  } finally {
    isImporting.value = false;
  }
}
</script>
