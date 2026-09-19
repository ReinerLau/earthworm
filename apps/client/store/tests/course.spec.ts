import type { Ref } from "vue";

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

import type { Course } from "../course";
import { getCourse } from "~/services/courseRepository";
import { useCourseStore } from "../course";

vi.mock("~/services/courseRepository");
vi.mock("../statement.ts", () => {
  return {
    useStatement: () => {
      const returnObj = {
        setupStatement(course: Ref<Course | undefined>) {
          returnObj.statementIndex.value = course.value?.statementIndex!;
        },
        statementIndex: ref(0),
      };

      return returnObj;
    },
  };
});

const firstCourse: Course = {
  id: "1",
  title: "第一课",
  order: 1,
  coursePackId: "1",
  completionCount: 0,
  statementIndex: 0,
  statements: [
    { id: "1", order: 1, english: "I", chinese: "我", soundmark: "/aɪ/" },
    { id: "2", order: 2, english: "like", chinese: "喜欢", soundmark: "/laɪk/" },
  ],
};

describe("course", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(getCourse).mockResolvedValue(firstCourse);
  });

  it("initializes with a course", async () => {
    const store = useCourseStore();

    await store.setup(firstCourse.coursePackId, firstCourse.id);

    expect(store.currentCourse).toEqual(firstCourse);
    expect(store.statementIndex).toBe(0);
  });

  it("navigates to the next statement", async () => {
    const store = useCourseStore();
    await store.setup(firstCourse.coursePackId, firstCourse.id);

    store.toNextStatement();

    expect(store.statementIndex).toBe(1);
  });

  it("resets statementIndex on doAgain", async () => {
    const store = useCourseStore();
    await store.setup(firstCourse.coursePackId, firstCourse.id);
    store.toNextStatement();

    store.doAgain();

    expect(store.statementIndex).toBe(0);
  });

  it("checks if all statements are done", async () => {
    const store = useCourseStore();
    await store.setup(firstCourse.coursePackId, firstCourse.id);

    expect(store.isAllDone()).toBe(false);
    //在 firstCourse 中只有 2 个 statement
    //所以执行后 就应该是完成的状态
    store.toNextStatement();
    expect(store.isAllDone()).toBe(true);
  });

  it("checks if the answer is correct", async () => {
    const store = useCourseStore();
    await store.setup(firstCourse.coursePackId, firstCourse.id);

    expect(store.checkCorrect("I")).toBe(true);
    expect(store.checkCorrect("i")).toBe(true);
    expect(store.checkCorrect("like")).toBe(false);
  });

  it("the length of the word should be one", async () => {
    const store = useCourseStore();
    await store.setup(firstCourse.coursePackId, firstCourse.id);

    expect(store.words.length).toBe(1);
  });

  it("the count of first course question should be two", async () => {
    const store = useCourseStore();
    await store.setup(firstCourse.coursePackId, firstCourse.id);

    expect(store.totalQuestionsCount).toBe(2);
  });
});
