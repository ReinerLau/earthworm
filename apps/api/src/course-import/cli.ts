import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { parseArgs } from "node:util";

import * as dotenv from "dotenv";

import type { DbType } from "../global/providers/db.provider";
import { endDB, setupDB } from "../common/db";
import { CourseImportResult, importCoursePack, parseEarthwormStatements } from "./course-import";

interface CourseImportCliDependencies {
  readTextFile(filePath: string): Promise<string>;
  connect(): Promise<DbType>;
  disconnect(): Promise<void>;
  write(message: string): void;
}

interface CourseImportPreview {
  mode: "dry-run";
  packTitle: string;
  courseTitle: string;
  statementCount: number;
  firstStatement: { chinese: string; english: string };
  lastStatement: { chinese: string; english: string };
}

const defaultDependencies: CourseImportCliDependencies = {
  readTextFile: async (filePath) => await readFile(filePath, "utf-8"),
  connect: async () => {
    dotenv.config({ path: path.resolve(process.cwd(), ".env") });
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not configured; create apps/api/.env first");
    }
    const db = await setupDB({ logging: false });
    if (!db) {
      throw new Error("database connection is already in use");
    }
    return db;
  },
  disconnect: endDB,
  write: (message) => console.log(message),
};

export async function runCourseImportCli(
  argv: string[],
  dependencies: CourseImportCliDependencies = defaultDependencies,
): Promise<CourseImportPreview | CourseImportResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const { values } = parseArgs({
    args: normalizedArgv,
    options: {
      input: { type: "string" },
      "pack-title": { type: "string" },
      "course-title": { type: "string" },
      description: { type: "string" },
      cover: { type: "string", default: "/logo.png" },
      apply: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  const input = requireOption(values.input, "--input");
  const packTitle = requireOption(values["pack-title"], "--pack-title");
  const courseTitle = requireOption(values["course-title"], "--course-title");
  const description = requireOption(values.description, "--description");
  const cover = requireOption(values.cover, "--cover");

  let rawDocument: unknown;
  try {
    const invocationDirectory = process.env.INIT_CWD ?? process.cwd();
    rawDocument = JSON.parse(
      await dependencies.readTextFile(path.resolve(invocationDirectory, input)),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot read Earthworm statements from ${input}: ${message}`);
  }
  const { statements } = parseEarthwormStatements(rawDocument);

  if (!values.apply) {
    const preview: CourseImportPreview = {
      mode: "dry-run",
      packTitle,
      courseTitle,
      statementCount: statements.length,
      firstStatement: pickPromptAndAnswer(statements[0]),
      lastStatement: pickPromptAndAnswer(statements.at(-1)!),
    };
    dependencies.write(JSON.stringify(preview, null, 2));
    return preview;
  }

  const db = await dependencies.connect();
  try {
    const result = await importCoursePack(db, {
      packTitle,
      courseTitle,
      description,
      cover,
      statements,
    });
    dependencies.write(JSON.stringify({ mode: "applied", ...result }, null, 2));
    return result;
  } finally {
    await dependencies.disconnect();
  }
}

function requireOption(value: string | undefined, option: string): string {
  const result = value?.trim();
  if (!result) {
    throw new Error(`${option} is required`);
  }
  return result;
}

function pickPromptAndAnswer(statement: { chinese: string; english: string }) {
  return { chinese: statement.chinese, english: statement.english };
}

if (require.main === module) {
  runCourseImportCli(process.argv.slice(2)).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`course-import: ${message}`);
    process.exitCode = 1;
  });
}
