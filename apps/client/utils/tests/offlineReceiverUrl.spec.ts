import { describe, expect, it } from "vitest";

import { createOfflineReceiverUrl, DEFAULT_OFFLINE_PWA_URL } from "../offlineReceiverUrl";

describe("createOfflineReceiverUrl", () => {
  it("uses the public Pages app when no local PWA URL is configured", () => {
    const url = createOfflineReceiverUrl({
      signalUrl: "https://signal.example.workers.dev",
      roomToken: "a".repeat(32),
    });

    expect(url.startsWith(`${DEFAULT_OFFLINE_PWA_URL}/#/offline/receive`)).toBe(true);
    expect(url).not.toContain("localhost");
    expect(url).toContain("signal=https%3A%2F%2Fsignal.example.workers.dev");
  });

  it("allows deployments to override the public Pages URL", () => {
    const url = createOfflineReceiverUrl({
      pwaUrl: "https://pages.example.test/earthworm/",
      signalUrl: "https://signal.example.workers.dev",
      roomToken: "b".repeat(32),
    });

    expect(url.startsWith("https://pages.example.test/earthworm/#/offline/receive")).toBe(true);
  });
});
