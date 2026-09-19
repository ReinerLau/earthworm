import { defineStore } from "pinia";
import { computed, ref, watchEffect } from "vue";

import type { CoursePack } from "./coursePack";
import { fetchCompleteCourse, fetchCourse } from "~/api/course";
import { useActiveCourseMap } from "~/composables/courses/activeCourse";
import { getOfflineCourse, saveOfflineProgress } from "~/services/offlineCourse";
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
    if (isOffline.value && currentCourse.value) {
      await saveOfflineProgress(
        currentCourse.value.id,
        Math.max(0, currentCourse.value.statements.length - 1),
        true,
      );
      return { nextCourse: undefined };
    }
    const res = await fetchCompleteCourse(coursePackId, currentCourse.value?.id!);
    return res;
  }

  async function setup(coursePackId: string, courseId: string) {
    isOffline.value = false;
    let course = await fetchCourse(coursePackId, courseId);
    currentCourse.value = course;
    setupStatement(currentCourse);
  }

  async function setupOffline(coursePackId: string, courseId: string) {
    const course = await getOfflineCourse(courseId);
    if (!course || course.coursePackId !== coursePackId) {
      throw new Error("本机没有找到这门课程，请先从电脑发送课程");
    }
    isOffline.value = true;
    currentCourse.value = {
      ...course,
      statements: course.statements.map((statement, index) => ({
        ...statement,
        id: statement.id ?? `${course.id}-${index}`,
      })),
    };
    setupStatement(currentCourse, {
      offline: true,
      saveOfflineProgress: (index) =>
        saveOfflineProgress(course.id, index, index >= Math.max(0, course.statements.length - 1)),
    });
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
