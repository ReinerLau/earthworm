import type {
  CourseTransferCourse,
  CourseTransferEnvelopeV1,
  ReceivedCourse,
} from "@earthworm/course-transfer";

const DATABASE_NAME = "earthworm-course-transfer";
const DATABASE_VERSION = 1;
const COURSE_STORE = "courses";

export interface OfflineCourseRecord {
  course: CourseTransferCourse;
  contentHash: string;
  receivedAt: string;
  statementIndex: number;
  completedAt?: string;
}

export interface OfflineCourse {
  id: string;
  title: string;
  order: number;
  coursePackId: string;
  statements: CourseTransferCourse["statements"];
  statementIndex: number;
  completionCount: number;
}

export function mergeOfflineCourseRecord(
  previous: OfflineCourseRecord | undefined,
  received: ReceivedCourse,
): OfflineCourseRecord {
  const course = received.envelope.course;
  const sameContent = previous?.contentHash === received.receipt.sha256;
  return {
    course,
    contentHash: received.receipt.sha256,
    receivedAt: new Date().toISOString(),
    statementIndex: sameContent ? previous?.statementIndex ?? 0 : 0,
    completedAt: sameContent ? previous?.completedAt : undefined,
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(COURSE_STORE)) {
        request.result.createObjectStore(COURSE_STORE, { keyPath: "course.id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本机课程数据库"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(COURSE_STORE, mode);
    const request = operation(transaction.objectStore(COURSE_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("本机课程数据库操作失败"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error ?? new Error("本机课程数据库事务失败"));
  });
}

function toCourse(record: OfflineCourseRecord): OfflineCourse {
  return {
    id: record.course.id,
    title: record.course.title,
    order: record.course.order,
    coursePackId: record.course.coursePackId,
    statements: record.course.statements,
    statementIndex: record.statementIndex,
    completionCount: record.completedAt ? 1 : 0,
  };
}

export async function saveReceivedCourse(received: ReceivedCourse): Promise<OfflineCourse> {
  const id = received.envelope.course.id;
  const previous = await withStore<OfflineCourseRecord | undefined>("readonly", (store) =>
    store.get(id),
  );
  const record = mergeOfflineCourseRecord(previous, received);
  await withStore("readwrite", (store) => store.put(record));
  return toCourse(record);
}

export async function getOfflineCourse(courseId: string): Promise<OfflineCourse | undefined> {
  const record = await withStore<OfflineCourseRecord | undefined>("readonly", (store) =>
    store.get(courseId),
  );
  return record ? toCourse(record) : undefined;
}

export async function listOfflineCourses(): Promise<OfflineCourse[]> {
  const records = await withStore<OfflineCourseRecord[]>("readonly", (store) => store.getAll());
  return records
    .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))
    .map(toCourse);
}

export async function saveOfflineProgress(
  courseId: string,
  statementIndex: number,
  completed: boolean,
): Promise<void> {
  const record = await withStore<OfflineCourseRecord | undefined>("readonly", (store) =>
    store.get(courseId),
  );
  if (!record) throw new Error("本机没有找到这门课程");
  record.statementIndex = Math.max(
    0,
    Math.min(statementIndex, record.course.statements.length - 1),
  );
  record.completedAt = completed ? new Date().toISOString() : undefined;
  await withStore("readwrite", (store) => store.put(record));
}

export async function deleteOfflineCourse(courseId: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(courseId));
}

export function envelopeToCourse(envelope: CourseTransferEnvelopeV1): OfflineCourse {
  const course = envelope.course;
  return {
    ...course,
    statementIndex: 0,
    completionCount: 0,
  };
}
