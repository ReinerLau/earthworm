<template>
  <div class="flex w-full flex-col pt-2">
    <div class="my-8 flex items-center justify-between">
      <h2 class="text-2xl font-bold">本机课程包</h2>
      <NuxtLink
        class="btn btn-primary btn-sm"
        to="/import"
        >导入课程包</NuxtLink
      >
    </div>
    <template v-if="isLoading">
      <Loading></Loading>
    </template>
    <template v-else>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <template
          v-for="coursePack in coursePackStore.coursePacks"
          :key="coursePack.id"
        >
          <CoursePackCard :coursePack="coursePack"></CoursePackCard>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { definePageMeta } from "#imports";
import { ref } from "vue";

import CoursePackCard from "~/components/courses/CoursePackCard.vue";
import { useCoursePackStore } from "~/store/coursePack";

definePageMeta({ layout: "offline" });

const coursePackStore = useCoursePackStore();
const isLoading = ref(false);

setup();

async function setup() {
  // 课程包不会更新 所以初始化的时候只拉取一次数据就好了
  isLoading.value = true;
  try {
    await coursePackStore.setupCoursePacks();
  } finally {
    isLoading.value = false;
  }
}
</script>

<style></style>
