import { describe, expect, it } from "vitest";

import {
  getQuestionInputStyle,
  getQuestionTextWidth,
  getWordWidth,
  QUESTION_INPUT_MIN_FONT_SIZE_REM,
} from "../questionInputHelper";

describe("getWordWidth", () => {
  it("should return the correct width for a single letter", () => {
    expect(getWordWidth("i")).toBe(1.5); // 0.5 (width of 'i') + 1 (padding)
    expect(getWordWidth("w")).toBe(2.5); // 1.5 (width of 'w') + 1 (padding)
  });

  it("should return the correct width for a word", () => {
    expect(getWordWidth("hi")).toBe(2.6); // 1.1 (width of 'h') + 0.5 (width of 'i') + 1 (padding)
    expect(getWordWidth("wow")).toBe(5.1); // 1.5 (width of 'w') * 2 + 1.1 (width of 'o') + 1 (padding)
  });

  it("should handle uppercase letters", () => {
    expect(getWordWidth("I")).toBe(1.5); // 0.5 (width of 'I') + 1 (padding)
    expect(getWordWidth("WOW")).toBe(5.1); // 1.5 (width of 'W') * 2 + 1.1 (width of 'O') + 1 (padding)
  });

  it("should handle non-letter characters", () => {
    expect(getWordWidth("123")).toBe(4); // 1 (width of each character) * 3 + 1 (padding)
    expect(getWordWidth("!@#")).toBe(4); // 1 (width of each character) * 3 + 1 (padding)
  });

  it("should return the correct width for a long string with various characters", () => {
    const longString =
      "This is a long string with various characters, including letters, numbers, and symbols! 1234567890";
    expect(getWordWidth(longString)).toBe(91.3);
  });
});

describe("question input layout", () => {
  it("includes the spaces between words when estimating the sentence width", () => {
    expect(getQuestionTextWidth(["short", "sentence"])).toBeCloseTo(15);
  });

  it("reduces the fluid font size for longer sentences while keeping one minimum", () => {
    const shortSentenceStyle = getQuestionInputStyle(["short"]);
    const longSentenceStyle = getQuestionInputStyle([
      "This",
      "is",
      "a",
      "sentence",
      "that",
      "needs",
      "more",
      "room",
    ]);

    const shortFluidSize = Number(
      shortSentenceStyle["--question-fluid-font-size"].replace("cqw", ""),
    );
    const longFluidSize = Number(
      longSentenceStyle["--question-fluid-font-size"].replace("cqw", ""),
    );

    expect(shortFluidSize).toBeGreaterThan(longFluidSize);
    expect(shortSentenceStyle["--question-min-font-size"]).toBe(
      `${QUESTION_INPUT_MIN_FONT_SIZE_REM}rem`,
    );
    expect(longSentenceStyle["--question-min-font-size"]).toBe(
      `${QUESTION_INPUT_MIN_FONT_SIZE_REM}rem`,
    );
  });
});
