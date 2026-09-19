import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCoursePack, listCoursePacks } from "~/services/courseRepository";
import { useCoursePackStore } from "../coursePack";

vi.mock("~/services/courseRepository");

describe("course pack store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should ", async () => {
    const firstCourse = {
      id: "course-1",
      title: "第一课",
      order: 1,
      coursePackId: "pack-1",
      completionCount: 0,
      statementIndex: 0,
      statements: [{ id: "statement-1", order: 1, english: "I", chinese: "我", soundmark: "" }],
    };

    const secondCourse = {
      ...firstCourse,
      id: "course-2",
      title: "第二课",
    };

    const coursePack = {
      format: "earthworm-course-pack" as const,
      version: 1 as const,
      id: "pack-1",
      title: "课程包1",
      description: "这是一个课程包",
      packageHash: "a".repeat(64),
      importedAt: "2026-01-01T00:00:00.000Z",
      courses: [firstCourse, secondCourse],
    };
    vi.mocked(listCoursePacks).mockResolvedValue([coursePack]);
    vi.mocked(getCoursePack).mockResolvedValue(coursePack);

    const coursePackStore = useCoursePackStore();

    await coursePackStore.setupCoursePacks();
    await coursePackStore.setupCoursePack(coursePack.id);

    expect(coursePackStore.coursePacks).toHaveLength(1);
    expect(coursePackStore.currentCoursePack?.courses[0].completionCount).toBe(0);
    expect(coursePackStore.currentCoursePack?.courses[1].completionCount).toBe(0);
  });
});
