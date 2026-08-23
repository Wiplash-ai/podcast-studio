import { describe, expect, it } from "vitest";

import { companionStateMessage, companionStatusForRoom } from "./companion-bridge";

const room = {
  lifecycleState: "armed" as const,
  programs: [],
};

describe("Porchcast companion bridge", () => {
  it("maps recording and program transitions honestly", () => {
    expect(companionStatusForRoom(room, false)).toBe("live");
    expect(companionStatusForRoom(room, true)).toBe("recording");
    expect(companionStatusForRoom({
      lifecycleState: "finalizing",
      programs: [],
    }, false)).toBe("rendering");
    expect(companionStatusForRoom({
      lifecycleState: "ready",
      programs: [{ layout: "horizontal", state: "ready", attempt: 1, deferredReason: null, updatedAt: "2026-08-23T00:00:00.000Z", error: null }],
    }, false)).toBe("ready");
    expect(companionStatusForRoom({
      lifecycleState: "ready",
      programs: [{ layout: "vertical", state: "failed", attempt: 1, deferredReason: null, updatedAt: "2026-08-23T00:00:00.000Z", error: null }],
    }, false)).toBe("attention");
  });

  it("publishes an empty state without room or account credentials", () => {
    const message = companionStateMessage(null, false);
    expect(message.payload).toEqual({
      revision: 0,
      porch: null,
      status: "unknown",
      capabilities: { account: true, downloads: false, invite: false },
      noticeKey: null,
    });
    expect(JSON.stringify(message)).not.toMatch(/token|inviteUrl|artifactUrl/i);
  });
});
