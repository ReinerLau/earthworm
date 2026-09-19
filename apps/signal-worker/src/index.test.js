import { describe, expect, it, vi } from "vitest";

import worker from "./index.js";

describe("course transfer signal worker", () => {
  const env = {
    SIGNAL_ROOMS: { getByName: vi.fn(() => ({ fetch: vi.fn() })) },
  };

  it("exposes a health endpoint", async () => {
    const response = await worker.fetch(new Request("https://signal.example/health"), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: "earthworm-course-transfer" });
  });

  it("rejects malformed room tokens before reaching a Durable Object", async () => {
    const response = await worker.fetch(
      new Request("https://signal.example/signal/not-a-room?role=sender", {
        headers: { Upgrade: "websocket" },
      }),
      env,
    );
    expect(response.status).toBe(404);
    expect(env.SIGNAL_ROOMS.getByName).not.toHaveBeenCalled();
  });

  it("rejects an invalid role", async () => {
    const response = await worker.fetch(
      new Request(`https://signal.example/signal/${"a".repeat(32)}?role=other`, {
        headers: { Upgrade: "websocket" },
      }),
      env,
    );
    expect(response.status).toBe(400);
  });
});
