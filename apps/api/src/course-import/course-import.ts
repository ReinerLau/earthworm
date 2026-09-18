import { max } from "drizzle-orm";

import { course, coursePack, statement } from "@earthworm/schema";
import type { DbType } from "../global/providers/db.provider";

export const EARTHWORM_STATEMENTS_SCHEMA_VERSION = 1;

export interface EarthwormStatement {
  chinese: string;
  english: string;
  soundmark: string;
}

export interface EarthwormStatementsDocument {
  schema_version: typeof EARTHWORM_STATEMENTS_SCHEMA_VERSION;
  statements: EarthwormStatement[];
}

export interface CourseImportRequest {
  packTitle: string;
  courseTitle: string;
  description: string;
  cover: string;
  statements: EarthwormStatement[];
}

export interface CourseImportResult {
  coursePackId: string;
  courseId: string;
  coursePackOrder: number;
  statementCount: number;
}

export class CourseImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CourseImportValidationError";
  }
}

export function parseEarthwormStatements(payload: unknown): EarthwormStatementsDocument {
  const document = requireObject(payload, "document");
  requireExactKeys(document, ["schema_version", "statements"], "document");

  if (document.schema_version !== EARTHWORM_STATEMENTS_SCHEMA_VERSION) {
    throw new CourseImportValidationError(
      `document.schema_version must be ${EARTHWORM_STATEMENTS_SCHEMA_VERSION}`,
    );
  }
  if (!Array.isArray(document.statements) || document.statements.length === 0) {
    throw new CourseImportValidationError("document.statements must be a non-empty array");
  }

  const statements = document.statements.map((value, index) => {
    const location = `document.statements[${index}]`;
    const item = requireObject(value, location);
    requireExactKeys(item, ["chinese", "english", "soundmark"], location);

    return {
      chinese: requireNonEmptyString(item.chinese, `${location}.chinese`),
      english: requireNonEmptyString(item.english, `${location}.english`),
      soundmark: requireString(item.soundmark, `${location}.soundmark`).trim(),
    };
  });

  return {
    schema_version: EARTHWORM_STATEMENTS_SCHEMA_VERSION,
    statements,
  };
}

export async function importCoursePack(
  db: DbType,
  request: CourseImportRequest,
): Promise<CourseImportResult> {
  const validated = validateImportRequest(request);

  return await db.transaction(async (tx) => {
    const [orderResult] = await tx.select({ maxOrder: max(coursePack.order) }).from(coursePack);
    const coursePackOrder = (orderResult.maxOrder ?? 0) + 1;

    const [coursePackEntity] = await tx
      .insert(coursePack)
      .values({
        order: coursePackOrder,
        title: validated.packTitle,
        description: validated.description,
        isFree: true,
        cover: validated.cover,
      })
      .returning({ id: coursePack.id });

    const [courseEntity] = await tx
      .insert(course)
      .values({
        title: validated.courseTitle,
        order: 1,
        coursePackId: coursePackEntity.id,
      })
      .returning({ id: course.id });

    await tx.insert(statement).values(
      validated.statements.map((item, index) => ({
        ...item,
        order: index + 1,
        courseId: courseEntity.id,
      })),
    );

    return {
      coursePackId: coursePackEntity.id,
      courseId: courseEntity.id,
      coursePackOrder,
      statementCount: validated.statements.length,
    };
  });
}

function validateImportRequest(request: CourseImportRequest): CourseImportRequest {
  const packTitle = requireNonEmptyString(request.packTitle, "packTitle");
  const courseTitle = requireNonEmptyString(request.courseTitle, "courseTitle");
  if (courseTitle.length > 256) {
    throw new CourseImportValidationError("courseTitle must contain at most 256 characters");
  }
  const description = requireNonEmptyString(request.description, "description");
  const cover = requireNonEmptyString(request.cover, "cover");
  const statements = parseEarthwormStatements({
    schema_version: EARTHWORM_STATEMENTS_SCHEMA_VERSION,
    statements: request.statements,
  }).statements;

  return { packTitle, courseTitle, description, cover, statements };
}

function requireObject(value: unknown, location: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CourseImportValidationError(`${location} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  expectedKeys: string[],
  location: string,
) {
  const actualKeys = Object.keys(value);
  const missing = expectedKeys.filter((key) => !actualKeys.includes(key));
  const unknown = actualKeys.filter((key) => !expectedKeys.includes(key));
  if (missing.length > 0) {
    throw new CourseImportValidationError(`${location} is missing keys: ${missing.join(", ")}`);
  }
  if (unknown.length > 0) {
    throw new CourseImportValidationError(`${location} has unknown keys: ${unknown.join(", ")}`);
  }
}

function requireString(value: unknown, location: string): string {
  if (typeof value !== "string") {
    throw new CourseImportValidationError(`${location} must be a string`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, location: string): string {
  const result = requireString(value, location).trim();
  if (!result) {
    throw new CourseImportValidationError(`${location} must be a non-empty string`);
  }
  return result;
}
