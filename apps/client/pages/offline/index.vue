<template>
  <section>
    <div class="mb-8 flex items-center justify-between">
      <div>
        <p class="text-sm opacity-60">Earthworm 离线课程</p>
        <h1 class="text-2xl font-bold">本机课程</h1>
      </div>
      <NuxtLink
        class="btn btn-primary btn-sm"
        to="/"
      >
        在线版
      </NuxtLink>
    </div>

    <div
      v-if="isLoading"
      class="py-12 text-center opacity-60"
    >
      正在读取本机课程…
    </div>
    <div
      v-else-if="courses.length === 0"
      class="rounded-xl border border-dashed p-8 text-center"
    >
      <p class="text-lg">还没有保存的课程</p>
      <p class="mt-2 text-sm opacity-60">在电脑端打开课程，点击“发送到 iPhone”，然后扫描二维码。</p>
    </div>
    <div
      v-else
      class="grid gap-3"
    >
      <article
        v-for="course in courses"
        :key="course.id"
        class="rounded-xl border p-4 shadow-sm dark:border-slate-600"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="font-semibold">{{ course.title }}</h2>
            <p class="mt-1 text-sm opacity-60">{{ course.statements.length }} 个句子</p>
          </div>
          <span
            v-if="course.completionCount"
            class="badge badge-success badge-outline"
          >
            已完成
          </span>
        </div>
        <div class="mt-4 flex gap-2">
          <NuxtLink
            class="btn btn-primary btn-sm"
            :to="`/game/${course.coursePackId}/${course.id}?offline=1`"
          >
            {{ course.completionCount ? "重新练习" : "开始练习" }}
          </NuxtLink>
          <button
            class="btn btn-ghost btn-sm"
            @click="removeCourse(course.id)"
          >
            删除
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { definePageMeta } from "#imports";
import { onMounted, ref } from "vue";

import type { OfflineCourse } from "~/services/offlineCourse";
import { deleteOfflineCourse, listOfflineCourses } from "~/services/offlineCourse";

definePageMeta({ layout: "offline" });

const courses = ref<OfflineCourse[]>([]);
const isLoading = ref(true);

async function refresh() {
  courses.value = await listOfflineCourses();
}

async function removeCourse(courseId: string) {
  await deleteOfflineCourse(courseId);
  await refresh();
}

onMounted(async () => {
  try {
    await refresh();
  } finally {
    isLoading.value = false;
  }
});
</script>
