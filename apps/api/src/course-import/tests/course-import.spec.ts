import { Test } from "@nestjs/testing";
import { asc, count, sql } from "drizzle-orm";

import { course, coursePack, statement } from "@earthworm/schema";
import { cleanDB, testImportModules } from "../../../test/helper/utils";
import { endDB } from "../../common/db";
import { DB, DbType } from "../../global/providers/db.provider";
import {
  CourseImportValidationError,
  importCoursePack,
  parseEarthwormStatements,
} from "../course-import";

describe("course import", () => {
  let db: DbType;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: testImportModules }).compile();
    db = moduleRef.get<DbType>(DB);
  });

  beforeEach(async () => {
    await cleanDB(db);
  });

  afterAll(async () => {
    await cleanDB(db);
    await endDB();
  });

  it("strictly parses Earthworm statement documents", () => {
    expect(
      parseEarthwormStatements({
        schema_version: 1,
        statements: [{ chinese: " 聆听 ", english: " Listening ", soundmark: "" }],
      }),
    ).toEqual({
      schema_version: 1,
      statements: [{ chinese: "聆听", english: "Listening", soundmark: "" }],
    });

    expect(() =>
      parseEarthwormStatements({
        schema_version: 1,
        statements: [{ chinese: "聆听", english: "Listening", soundmark: "", extra: true }],
      }),
    ).toThrow(CourseImportValidationError);
    expect(() =>
      parseEarthwormStatements({
        schema_version: 1,
        statements: [{ chinese: "聆听", english: "Listening", soundmark: "" }],
        extra: true,
      }),
    ).toThrow(CourseImportValidationError);
    expect(() =>
      parseEarthwormStatements({
        schema_version: 1,
        statements: [{ chinese: " ", english: "Listening", soundmark: "" }],
      }),
    ).toThrow("must be a non-empty string");
    expect(() =>
      parseEarthwormStatements({
        schema_version: 1,
        statements: [{ chinese: "聆听", english: " ", soundmark: "" }],
      }),
    ).toThrow("must be a non-empty string");
  });

  it("creates one ordered course and all statements in a transaction", async () => {
    const result = await importCoursePack(db, request());

    const packs = await db.select().from(coursePack);
    const courses = await db.select().from(course);
    const statements = await db.select().from(statement).orderBy(asc(statement.order));

    expect(result).toEqual({
      coursePackId: packs[0].id,
      courseId: courses[0].id,
      coursePackOrder: 1,
      statementCount: 2,
    });
    expect(packs[0]).toMatchObject({
      title: "鸟鸣与心理健康",
      order: 1,
      isFree: true,
      cover: "/logo.png",
    });
    expect(courses[0]).toMatchObject({
      title: "全文训练",
      order: 1,
      coursePackId: packs[0].id,
    });
    expect(statements).toMatchObject([
      { order: 1, chinese: "聆听", english: "Listening", soundmark: "" },
      {
        order: 2,
        chinese: "聆听鸟儿歌唱。",
        english: "Listening to birds singing.",
        soundmark: "",
      },
    ]);
  });

  it("always creates a new course pack", async () => {
    await importCoursePack(db, request());
    await importCoursePack(db, request());

    const packs = await db.select().from(coursePack).orderBy(asc(coursePack.order));
    expect(packs).toHaveLength(2);
    expect(packs.map((item) => item.order)).toEqual([1, 2]);
  });

  it("rolls back the course pack when statement insertion fails", async () => {
    await db.execute(sql`
      CREATE FUNCTION fail_course_import() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced statement failure';
      END;
      $$ LANGUAGE plpgsql
    `);
    await db.execute(sql`
      CREATE TRIGGER fail_course_import
      BEFORE INSERT ON statements
      FOR EACH STATEMENT EXECUTE FUNCTION fail_course_import()
    `);

    try {
      await expect(importCoursePack(db, request())).rejects.toThrow("forced statement failure");

      const [packCount] = await db.select({ value: count() }).from(coursePack);
      const [courseCount] = await db.select({ value: count() }).from(course);
      expect(packCount.value).toBe(0);
      expect(courseCount.value).toBe(0);
    } finally {
      await db.execute(sql`DROP TRIGGER fail_course_import ON statements`);
      await db.execute(sql`DROP FUNCTION fail_course_import()`);
    }
  });
});

function request() {
  return {
    packTitle: "鸟鸣与心理健康",
    courseTitle: "全文训练",
    description: "渐进学习单元",
    cover: "/logo.png",
    statements: [
      { chinese: "聆听", english: "Listening", soundmark: "" },
      {
        chinese: "聆听鸟儿歌唱。",
        english: "Listening to birds singing.",
        soundmark: "",
      },
    ],
  };
}
