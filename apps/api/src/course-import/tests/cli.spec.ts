import type { DbType } from "../../global/providers/db.provider";
import { runCourseImportCli } from "../cli";

describe("course import CLI", () => {
  it("previews a valid import without connecting to the database", async () => {
    const connect = jest.fn<Promise<DbType>, []>();
    const write = jest.fn();

    const result = await runCourseImportCli(
      [
        "--",
        "--input",
        "statements.json",
        "--pack-title",
        "鸟鸣与心理健康",
        "--course-title",
        "全文训练",
        "--description",
        "渐进学习单元",
      ],
      {
        readTextFile: async () =>
          JSON.stringify({
            schema_version: 1,
            statements: [
              { chinese: "聆听", english: "Listening", soundmark: "" },
              {
                chinese: "聆听鸟儿歌唱。",
                english: "Listening to birds singing.",
                soundmark: "",
              },
            ],
          }),
        connect,
        disconnect: jest.fn(),
        write,
      },
    );

    expect(connect).not.toHaveBeenCalled();
    expect(result).toEqual({
      mode: "dry-run",
      packTitle: "鸟鸣与心理健康",
      courseTitle: "全文训练",
      statementCount: 2,
      firstStatement: { chinese: "聆听", english: "Listening" },
      lastStatement: {
        chinese: "聆听鸟儿歌唱。",
        english: "Listening to birds singing.",
      },
    });
    expect(write).toHaveBeenCalledTimes(1);
  });
});
