import { describe, expect, it } from "vitest";

import { parseTransferQr } from "../transferQr";

describe("transfer QR parser", () => {
  const origin = "https://reinerlau.github.io";
  const signal = "https://earthworm-course-transfer.example.workers.dev";
  const room = "a".repeat(32);

  it("parses the hash-router URL generated for the PWA", () => {
    expect(
      parseTransferQr(`${origin}/earthworm/#/receive?signal=${signal}&room=${room}`, origin),
    ).toEqual({
      signalUrl: signal,
      roomToken: room,
    });
  });

  it("rejects another origin and malformed room tokens", () => {
    expect(
      parseTransferQr(`https://example.com/#/receive?signal=${signal}&room=${room}`, origin),
    ).toBeUndefined();
    expect(
      parseTransferQr(`${origin}/#/receive?signal=${signal}&room=bad`, origin),
    ).toBeUndefined();
  });
});
