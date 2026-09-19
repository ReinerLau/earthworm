import { describe, expect, it } from "vitest";

import { createTransferReceiverUrl } from "../transferReceiverUrl";

describe("createTransferReceiverUrl", () => {
  it("opens the receiver in the current browser app", () => {
    const url = createTransferReceiverUrl({
      appUrl: "https://earthworm.example.test/receive",
      signalUrl: "https://signal.example.workers.dev",
      roomToken: "a".repeat(32),
    });

    expect(url).toBe(
      "https://earthworm.example.test/receive?signal=https%3A%2F%2Fsignal.example.workers.dev&room=" +
        "a".repeat(32),
    );
    expect(url).not.toContain("#/");
  });

  it("preserves an application base path", () => {
    const url = createTransferReceiverUrl({
      appUrl: "https://earthworm.example.test/earthworm/receive",
      signalUrl: "https://signal.example.workers.dev",
      roomToken: "b".repeat(32),
    });

    expect(new URL(url).pathname).toBe("/earthworm/receive");
  });
});
