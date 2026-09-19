import { describe, expect, it } from "vitest";

import type { ReceivedCourse } from "@earthworm/course-transfer";
import { mergeOfflineCourseRecord } from "../offlineCourse";

const received: ReceivedCourse = {
  envelope: {
    protocolVersion: 1,
    kind: "course",
    course: {
      id: "course-1",
      title: "第一课",
      order: 1,
      coursePackId: "pack-1",
      statements: [{ order: 1, chinese: "做", english: "to do", soundmark: "/tə du/" }],
    },
  },
  receipt: { bytes: 100, sha256: "same" },
};

describe("offline course storage policy", () => {
  it("keeps progress when the received content is unchanged", () => {
    const record = mergeOfflineCourseRecord(
      { ...mergeOfflineCourseRecord(undefined, received), statementIndex: 3 },
      received,
    );
    expect(record.statementIndex).toBe(3);
  });

  it("resets progress when course content changes", () => {
    const record = mergeOfflineCourseRecord(
      { ...mergeOfflineCourseRecord(undefined, received), statementIndex: 3 },
      { ...received, receipt: { ...received.receipt, sha256: "changed" } },
    );
    expect(record.statementIndex).toBe(0);
  });
});
