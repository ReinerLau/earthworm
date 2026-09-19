import { describe, expect, it } from "vitest";

import {
  canonicalizeCoursePackage,
  createCoursePackage,
  hashCoursePackage,
  parseCoursePackage,
} from "./index";

const packageValue = createCoursePackage({
  id: "pack-1",
  title: "示例课程包",
  description: "用于测试",
  courses: [
    {
      id: "course-1",
      title: "第一课",
      order: 1,
      statements: [
        { id: "statement-1", order: 1, chinese: "你好", english: "Hello", soundmark: "" },
      ],
    },
  ],
});

describe("course package", () => {
  it("parses only the versioned package format", () => {
    expect(parseCoursePackage(packageValue)).toEqual(packageValue);
    expect(() => parseCoursePackage({ id: "invalid" })).toThrow();
  });

  it("canonicalizes collection order before hashing", async () => {
    const reordered = createCoursePackage({
      ...packageValue,
      courses: [...packageValue.courses].reverse(),
    });
    expect(canonicalizeCoursePackage(packageValue)).toBe(canonicalizeCoursePackage(reordered));
    expect(await hashCoursePackage(packageValue)).toBe(await hashCoursePackage(reordered));
  });

  it("rejects packages without stable statement ids", () => {
    expect(() =>
      parseCoursePackage({
        ...packageValue,
        courses: [
          {
            ...packageValue.courses[0],
            statements: [{ ...packageValue.courses[0].statements[0], id: "" }],
          },
        ],
      }),
    ).toThrow();
  });
});
