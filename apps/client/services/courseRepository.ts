import type {
  CoursePackage,
  CoursePackageCourse,
  CoursePackageStatement,
} from "@earthworm/course-package";
import { hashCoursePackage, parseCoursePackage } from "@earthworm/course-package";

const DATABASE_NAME = "earthworm";
const DATABASE_VERSION = 1;
const COURSE_PACK_STORE = "coursePacks";
const PROGRESS_STORE = "progress";

export interface CourseProgress {
  coursePackId: string;
  courseId: string;
  courseHash: string;
  statementIndex: number;
  completionCount: number;
  completedAt?: string;
  updatedAt: string;
}

export interface LocalCourse extends CoursePackageCourse {
  coursePackId: string;
  statementIndex: number;
  completionCount: number;
}

export interface LocalCoursePack extends Omit<CoursePackage, "courses"> {
  packageHash: string;
  importedAt: string;
  courses: LocalCourse[];
}

export function toCoursePackage(localPack: LocalCoursePack): CoursePackage {
  const { packageHash, importedAt, courses, ...packageValue } = localPack;
  return parseCoursePackage({
    ...packageValue,
    courses: courses.map(({ coursePackId, statementIndex, completionCount, ...course }) => course),
  });
}

interface CoursePackRecord {
  id: string;
  package: CoursePackage;
  packageHash: string;
  importedAt: string;
}

interface StoredProgress extends CourseProgress {
  courseHash: string;
}

export function createCoursePackageFromCourse(course: {
  id: string;
  title: string;
  order: number;
  coursePackId: string;
  statements: Array<{
    id?: string;
    order: number;
    chinese: string;
    english: string;
    soundmark: string;
  }>;
}): CoursePackage {
  return parseCoursePackage({
    format: "earthworm-course-pack",
    version: 1,
    id: course.coursePackId,
    title: course.title,
    description: "",
    courses: [
      {
        id: course.id,
        title: course.title,
        order: course.order,
        statements: course.statements.map((statement, index) => ({
          ...statement,
          id: statement.id || `${course.id}-statement-${index + 1}`,
        })),
      },
    ],
  });
}

export function mergeCourseProgress(
  previous: CourseProgress | undefined,
  course: CoursePackageCourse,
  courseHash: string,
  now = new Date().toISOString(),
): CourseProgress {
  const sameContent = previous?.courseHash === courseHash;
  const lastIndex = Math.max(0, course.statements.length - 1);
  return {
    coursePackId: previous?.coursePackId ?? "",
    courseId: course.id,
    courseHash,
    statementIndex: sameContent ? Math.min(previous?.statementIndex ?? 0, lastIndex) : 0,
    completionCount: sameContent ? previous?.completionCount ?? 0 : 0,
    completedAt: sameContent ? previous?.completedAt : undefined,
    updatedAt: now,
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("本机数据库操作失败"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(COURSE_PACK_STORE)) {
        database.createObjectStore(COURSE_PACK_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(PROGRESS_STORE)) {
        database.createObjectStore(PROGRESS_STORE, {
          keyPath: ["coursePackId", "courseId"],
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本机课程数据库"));
  });
}

async function readCoursePackRecord(packId: string): Promise<CoursePackRecord | undefined> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(COURSE_PACK_STORE, "readonly");
    return await requestResult(transaction.objectStore(COURSE_PACK_STORE).get(packId));
  } finally {
    database.close();
  }
}

async function readProgress(packId: string, courseId: string): Promise<CourseProgress | undefined> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PROGRESS_STORE, "readonly");
    return await requestResult(transaction.objectStore(PROGRESS_STORE).get([packId, courseId]));
  } finally {
    database.close();
  }
}

async function readAllProgress(packId: string): Promise<CourseProgress[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PROGRESS_STORE, "readonly");
    const records = (await requestResult(
      transaction.objectStore(PROGRESS_STORE).getAll(),
    )) as StoredProgress[];
    return records.filter((record) => record.coursePackId === packId);
  } finally {
    database.close();
  }
}

async function readAllCoursePackRecords(): Promise<CoursePackRecord[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(COURSE_PACK_STORE, "readonly");
    return await requestResult(transaction.objectStore(COURSE_PACK_STORE).getAll());
  } finally {
    database.close();
  }
}

function courseHashInput(course: CoursePackageCourse): CoursePackage {
  return {
    format: "earthworm-course-pack",
    version: 1,
    id: course.id,
    title: course.title,
    description: "",
    courses: [course],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function hashImportValue(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The first lexical-chunks exporter produced `{schema_version, statements}`.
 * Keep accepting it so existing generated files can be imported without a
 * manual conversion step; new files should use CoursePackage V1 directly.
 */
export async function normalizeImportedPackage(value: unknown): Promise<CoursePackage> {
  if (
    isRecord(value) &&
    value.schema_version === 1 &&
    Array.isArray(value.statements) &&
    value.statements.every(
      (statement) =>
        isRecord(statement) &&
        typeof statement.chinese === "string" &&
        typeof statement.english === "string" &&
        typeof statement.soundmark === "string",
    )
  ) {
    const suffix = (await hashImportValue(value)).slice(0, 16);
    return createCoursePackageFromCourse({
      id: `course-${suffix}`,
      title: "导入课程",
      order: 1,
      coursePackId: `pack-${suffix}`,
      statements: value.statements.map((statement, index) => ({
        id: `statement-${index + 1}`,
        order: index + 1,
        chinese: statement.chinese as string,
        english: statement.english as string,
        soundmark: statement.soundmark as string,
      })),
    });
  }

  return parseCoursePackage(value);
}

async function hashCourse(course: CoursePackageCourse): Promise<string> {
  return hashCoursePackage(courseHashInput(course));
}

function toLocalCourse(
  pack: CoursePackage,
  course: CoursePackageCourse,
  progress: CourseProgress | undefined,
): LocalCourse {
  return {
    ...course,
    coursePackId: pack.id,
    statementIndex: progress?.statementIndex ?? 0,
    completionCount: progress?.completionCount ?? 0,
  };
}

async function toLocalPack(record: CoursePackRecord): Promise<LocalCoursePack> {
  const progress = await readAllProgress(record.id);
  const progressByCourse = new Map(progress.map((item) => [item.courseId, item]));
  return {
    ...record.package,
    packageHash: record.packageHash,
    importedAt: record.importedAt,
    courses: record.package.courses.map((course) =>
      toLocalCourse(record.package, course, progressByCourse.get(course.id)),
    ),
  };
}

export async function upsertCoursePackage(
  value: unknown,
  packageHash?: string,
): Promise<LocalCoursePack> {
  const coursePackage = await normalizeImportedPackage(value);
  const digest = packageHash ?? (await hashCoursePackage(coursePackage));
  const previous = await readCoursePackRecord(coursePackage.id);
  const previousProgress = await readAllProgress(coursePackage.id);
  const previousByCourse = new Map(previousProgress.map((item) => [item.courseId, item]));
  const now = new Date().toISOString();
  const courseProgress = await Promise.all(
    coursePackage.courses.map(async (course) => {
      const courseHash = await hashCourse(course);
      const progress = mergeCourseProgress(
        previousByCourse.get(course.id),
        course,
        courseHash,
        now,
      );
      progress.coursePackId = coursePackage.id;
      return progress;
    }),
  );

  const database = await openDatabase();
  try {
    const transaction = database.transaction([COURSE_PACK_STORE, PROGRESS_STORE], "readwrite");
    transaction.objectStore(COURSE_PACK_STORE).put({
      id: coursePackage.id,
      package: coursePackage,
      packageHash: digest,
      importedAt: previous?.importedAt ?? now,
    } satisfies CoursePackRecord);
    const currentCourseIds = new Set(coursePackage.courses.map((course) => course.id));
    const progressStore = transaction.objectStore(PROGRESS_STORE);
    for (const progress of previousProgress) {
      if (!currentCourseIds.has(progress.courseId)) {
        progressStore.delete([progress.coursePackId, progress.courseId]);
      }
    }
    for (const progress of courseProgress) {
      progressStore.put(progress);
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("保存课程包失败"));
      transaction.onabort = () => reject(transaction.error ?? new Error("保存课程包事务已回滚"));
    });
  } finally {
    database.close();
  }

  return getCoursePack(coursePackage.id) as Promise<LocalCoursePack>;
}

export async function getCoursePack(packId: string): Promise<LocalCoursePack | undefined> {
  const record = await readCoursePackRecord(packId);
  return record ? toLocalPack(record) : undefined;
}

export async function listCoursePacks(): Promise<LocalCoursePack[]> {
  const records = await readAllCoursePackRecords();
  const packs = await Promise.all(records.map(toLocalPack));
  return packs.sort((left, right) => right.importedAt.localeCompare(left.importedAt));
}

export async function getCourse(
  packId: string,
  courseId: string,
): Promise<LocalCourse | undefined> {
  const pack = await getCoursePack(packId);
  return pack?.courses.find((course) => course.id === courseId);
}

export async function saveCourseProgress(
  packId: string,
  courseId: string,
  statementIndex: number,
  completed = false,
): Promise<void> {
  const pack = await getCoursePack(packId);
  const course = pack?.courses.find((item) => item.id === courseId);
  if (!course) throw new Error("本机没有找到这门课程");

  const previous = await readProgress(packId, courseId);
  const courseHash = previous?.courseHash ?? (await hashCourse(course));
  const now = new Date().toISOString();
  const database = await openDatabase();
  try {
    const transaction = database.transaction(PROGRESS_STORE, "readwrite");
    transaction.objectStore(PROGRESS_STORE).put({
      coursePackId: packId,
      courseId,
      courseHash,
      statementIndex: Math.max(0, Math.min(statementIndex, course.statements.length - 1)),
      completionCount: (previous?.completionCount ?? 0) + (completed ? 1 : 0),
      completedAt: completed ? now : previous?.completedAt,
      updatedAt: now,
    } satisfies StoredProgress);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("保存学习进度失败"));
      transaction.onabort = () => reject(transaction.error ?? new Error("学习进度事务已回滚"));
    });
  } finally {
    database.close();
  }
}

export async function deleteCoursePack(packId: string): Promise<void> {
  const records = await readAllProgress(packId);
  const database = await openDatabase();
  try {
    const transaction = database.transaction([COURSE_PACK_STORE, PROGRESS_STORE], "readwrite");
    transaction.objectStore(COURSE_PACK_STORE).delete(packId);
    const progressStore = transaction.objectStore(PROGRESS_STORE);
    for (const record of records) {
      if (record.coursePackId === packId) {
        progressStore.delete([record.coursePackId, record.courseId]);
      }
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("删除课程包失败"));
      transaction.onabort = () => reject(transaction.error ?? new Error("删除课程包事务已回滚"));
    });
  } finally {
    database.close();
  }
}

export type { CoursePackageCourse, CoursePackageStatement };
