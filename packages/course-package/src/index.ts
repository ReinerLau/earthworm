import { z } from "zod";

export const COURSE_PACKAGE_FORMAT = "earthworm-course-pack" as const;
export const COURSE_PACKAGE_VERSION = 1 as const;

const statementSchema = z
  .object({
    id: z.string().min(1),
    order: z.number().int().nonnegative(),
    chinese: z.string().min(1),
    english: z.string().min(1),
    soundmark: z.string(),
  })
  .strict();

const courseSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    order: z.number().int().nonnegative(),
    statements: z.array(statementSchema).min(1),
  })
  .strict();

export const coursePackageSchema = z
  .object({
    format: z.literal(COURSE_PACKAGE_FORMAT),
    version: z.literal(COURSE_PACKAGE_VERSION),
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string(),
    cover: z.string().optional(),
    courses: z.array(courseSchema).min(1),
  })
  .strict();

export type CoursePackage = z.infer<typeof coursePackageSchema>;
export type CoursePackageCourse = CoursePackage["courses"][number];
export type CoursePackageStatement = CoursePackageCourse["statements"][number];

export function parseCoursePackage(value: unknown): CoursePackage {
  return coursePackageSchema.parse(value);
}

export function createCoursePackage(
  value: Omit<CoursePackage, "format" | "version">,
): CoursePackage {
  return coursePackageSchema.parse({
    format: COURSE_PACKAGE_FORMAT,
    version: COURSE_PACKAGE_VERSION,
    ...value,
  });
}

/**
 * JSON.stringify preserves object insertion order, but sorting the top-level
 * and nested collections makes the hash independent from input ordering.
 */
export function canonicalizeCoursePackage(coursePackage: CoursePackage): string {
  const normalized = {
    format: coursePackage.format,
    version: coursePackage.version,
    id: coursePackage.id,
    title: coursePackage.title,
    description: coursePackage.description,
    ...(coursePackage.cover ? { cover: coursePackage.cover } : {}),
    courses: [...coursePackage.courses]
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map((course) => ({
        id: course.id,
        title: course.title,
        order: course.order,
        statements: [...course.statements]
          .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
          .map((statement) => ({
            id: statement.id,
            order: statement.order,
            chinese: statement.chinese,
            english: statement.english,
            soundmark: statement.soundmark,
          })),
      })),
  };
  return JSON.stringify(normalized);
}

export async function hashCoursePackage(coursePackage: CoursePackage): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalizeCoursePackage(coursePackage));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function coursePackageToTransferCourse(coursePackage: CoursePackage): CoursePackageCourse {
  const [course] = coursePackage.courses;
  if (!course) throw new Error("课程包至少需要包含一门课程");
  return course;
}
