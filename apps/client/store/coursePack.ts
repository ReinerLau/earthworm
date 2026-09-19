import { defineStore } from "pinia";
import { ref } from "vue";

import type { LocalCoursePack } from "~/services/courseRepository";
import { getCoursePack, listCoursePacks } from "~/services/courseRepository";

export type CoursePack = LocalCoursePack;
export type Course = LocalCoursePack["courses"][number];

export const useCoursePackStore = defineStore("course-pack", () => {
  const coursePacks = ref<LocalCoursePack[]>([]);
  const currentCoursePack = ref<LocalCoursePack>();

  async function setupCoursePacks() {
    coursePacks.value = await listCoursePacks();
  }

  async function setupCoursePack(coursePackId: string) {
    currentCoursePack.value = await getCoursePack(coursePackId);
  }

  async function updateCoursesCompleteCount(coursePackId: string) {
    await setupCoursePack(coursePackId);
  }

  return {
    setupCoursePack,
    setupCoursePacks,
    updateCoursesCompleteCount,
    currentCoursePack,
    coursePacks,
  };
});
