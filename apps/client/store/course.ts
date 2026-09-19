import { defineStore } from "pinia";
import { computed, ref, watchEffect } from "vue";

import type { CoursePack } from "./coursePack";
import { useActiveCourseMap } from "~/composables/courses/activeCourse";
import { getCourse, saveCourseProgress } from "~/services/courseRepository";
import { useStatement } from "./statement";

export interface Statement {
  id: string;
  order: number;
  chinese: string;
  english: string;
  soundmark: string;
}

export interface CourseIdentifier {
  coursePackId: CoursePack["id"];
  courseId: Course["id"];
}

export interface Course {
  id: string;
  title: string;
  order: number;
  statements: Statement[];
  coursePackId: CoursePack["id"];
  completionCount: number;
  statementIndex: number;
}

export const useCourseStore = defineStore("course", () => {
  const currentCourse = ref<Course>();
  const currentStatement = ref<Statement>();
  const isOffline = ref(false);
  const { statementIndex, setupStatement } = useStatement();

  const { updateActiveCourseMap } = useActiveCourseMap();

  watchEffect(() => {
    currentStatement.value = currentCourse.value?.statements[statementIndex.value];
  });

  const words = computed(() => {
    return currentStatement.value?.english.split(" ") || [];
  });

  const totalQuestionsCount = computed(() => {
    return currentCourse.value?.statements.length || 0;
  });

  function toSpecificStatement(index: number) {
    statementIndex.value = index;
  }

  function toPreviousStatement() {
    statementIndex.value = Math.max(0, statementIndex.value - 1);
  }

  function toNextStatement() {
    statementIndex.value = Math.min(statementIndex.value + 1, totalQuestionsCount.value - 1);
  }

  function resetStatementIndex() {
    statementIndex.value = 0;
  }

  function isAllDone() {
    return statementIndex.value >= totalQuestionsCount.value - 1;
  }

  function doAgain() {
    resetStatementIndex();
    updateActiveCourseMap(currentCourse.value?.coursePackId!, currentCourse.value?.id!);
  }

  function checkCorrect(input: string) {
    return input.toLocaleLowerCase() === currentStatement.value?.english.toLocaleLowerCase();
  }

  async function completeCourse() {
    const coursePackId = currentCourse.value?.coursePackId!;
    if (!currentCourse.value) return { nextCourse: undefined };
    await saveCourseProgress(
      coursePackId,
      currentCourse.value.id,
      Math.max(0, currentCourse.value.statements.length - 1),
      true,
    );
    return { nextCourse: undefined };
  }

  async function setup(coursePackId: string, courseId: string) {
    const course = await getCourse(coursePackId, courseId);
    if (!course) throw new Error("本机没有找到这门课程，请先导入课程包");
    isOffline.value = true;
    currentCourse.value = course;
    setupStatement(currentCourse, {
      saveProgress: (index) => saveCourseProgress(coursePackId, courseId, index),
    });
  }

  async function setupOffline(coursePackId: string, courseId: string) {
    return setup(coursePackId, courseId);
  }

  return {
    statementIndex,
    currentCourse,
    currentStatement,
    isOffline,
    words,
    totalQuestionsCount,
    setup,
    setupOffline,
    doAgain,
    isAllDone,
    checkCorrect,
    completeCourse,
    toSpecificStatement,
    toPreviousStatement,
    toNextStatement,
    resetStatementIndex,
  };
});
