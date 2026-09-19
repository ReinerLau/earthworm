import { describe, expect, it } from "vitest";

import {
  assembleChunks,
  COURSE_TRANSFER_CHUNK_SIZE,
  COURSE_TRANSFER_MAX_BYTES,
  courseTransferEnvelopeSchema,
  createCourseEnvelope,
  decodeChunk,
  encodeChunk,
} from "./index";

describe("course transfer protocol", () => {
  it("round trips a binary chunk", () => {
    const body = new Uint8Array([1, 2, 3]);
    expect(decodeChunk(encodeChunk(4, body))).toEqual({ index: 4, body });
  });

  it("keeps the protocol limits explicit", () => {
    expect(COURSE_TRANSFER_CHUNK_SIZE).toBe(16 * 1024);
    expect(COURSE_TRANSFER_MAX_BYTES).toBe(5 * 1024 * 1024);
  });

  it("rejects malformed envelopes", () => {
    expect(() => courseTransferEnvelopeSchema.parse({ kind: "course" })).toThrow();
  });

  it("accepts a validated content hash on the transport envelope", () => {
    const envelope = createCourseEnvelope({
      id: "course-1",
      title: "Demo",
      order: 0,
      coursePackId: "pack-1",
      statements: [{ order: 0, chinese: "你好", english: "Hello", soundmark: "həˈləʊ" }],
    });
    expect(
      courseTransferEnvelopeSchema.parse({
        ...envelope,
        contentHash: "a".repeat(64),
      }).contentHash,
    ).toBe("a".repeat(64));
  });

  it("rejects missing and oversized chunks", () => {
    expect(() => assembleChunks(new Map([[0, new Uint8Array([1])]]), 2, 2)).toThrow(
      "课程数据块不完整",
    );
    expect(() => assembleChunks(new Map([[0, new Uint8Array([1, 2])]]), 1, 1)).toThrow(
      "接收数据超过声明大小",
    );
  });
});
