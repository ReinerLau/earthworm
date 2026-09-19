import { describe, expect, it } from "vitest";

import {
  createCoursePackageFromCourse,
  mergeCourseProgress,
  normalizeImportedPackage,
  toCoursePackage,
} from "../courseRepository";

const course = {
  id: "course-1",
  title: "第一课",
  order: 1,
  coursePackId: "pack-1",
  statements: [
    { order: 1, chinese: "你好", english: "Hello", soundmark: "" },
    { order: 2, chinese: "再见", english: "Goodbye", soundmark: "" },
  ],
};

describe("course repository policies", () => {
  it("creates a valid package from a legacy course", () => {
    const packageValue = createCoursePackageFromCourse(course);
    expect(packageValue.id).toBe("pack-1");
    expect(packageValue.courses[0]?.statements[0]?.id).toBe("course-1-statement-1");
  });

  it("keeps progress for unchanged content and resets changed content", () => {
    const previous = {
      coursePackId: "pack-1",
      courseId: "course-1",
      courseHash: "same",
      statementIndex: 1,
      completionCount: 3,
      completedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(
      mergeCourseProgress(previous, createCoursePackageFromCourse(course).courses[0], "same")
        .statementIndex,
    ).toBe(1);
    expect(
      mergeCourseProgress(previous, createCoursePackageFromCourse(course).courses[0], "changed"),
    ).toMatchObject({
      statementIndex: 0,
      completionCount: 0,
      completedAt: undefined,
    });
  });

  it("converts the legacy statements export for existing course files", async () => {
    const packageValue = await normalizeImportedPackage({
      schema_version: 1,
      statements: [{ chinese: "你好", english: "Hello", soundmark: "" }],
    });

    expect(packageValue.format).toBe("earthworm-course-pack");
    expect(packageValue.courses[0]?.statements[0]?.english).toBe("Hello");
    expect(packageValue.id).toMatch(/^pack-[a-f0-9]{16}$/);
  });

  it("removes local progress metadata before transfer", () => {
    const packageValue = toCoursePackage({
      ...createCoursePackageFromCourse(course),
      packageHash: "a".repeat(64),
      importedAt: "2026-01-01T00:00:00.000Z",
      courses: [
        {
          ...createCoursePackageFromCourse(course).courses[0],
          coursePackId: "pack-1",
          statementIndex: 1,
          completionCount: 2,
        },
      ],
    });

    expect(packageValue.courses[0]).not.toHaveProperty("coursePackId");
    expect(packageValue.courses[0]).not.toHaveProperty("statementIndex");
    expect(packageValue).not.toHaveProperty("packageHash");
  });
});
