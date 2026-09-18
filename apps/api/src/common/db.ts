import { Logger } from "@nestjs/common";
import { DefaultLogger, LogWriter } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as postgres from "postgres";

import { schemas } from "@earthworm/schema";

let connection: postgres.Sql;

async function createConnection() {
  return postgres(process.env.DATABASE_URL ?? "");
}

export async function endDB() {
  if (connection) {
    await connection.end();
    connection = null;
  }
}

export async function setupDB(options: { logging?: boolean } = {}) {
  if (connection) return;

  const logger = new Logger("DB");

  class CustomDbLogWriter implements LogWriter {
    write(message: string) {
      logger.verbose(message);
    }
  }

  connection = await createConnection();

  return drizzle(connection, {
    schema: schemas,
    logger:
      options.logging === false ? false : new DefaultLogger({ writer: new CustomDbLogWriter() }),
  });
}
