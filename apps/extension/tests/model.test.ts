import { describe, expect, it } from "vitest";

import {
  MAX_RECENT_PORCHES,
  destinationUrl,
  normalizeRecentPorches,
  parseCompanionStateMessage,
  porchUrl,
  upsertRecentPorch,
} from "../src/model";

const porchId = "6e71bb7f-f73a-4b7a-b16f-d1b9cd2a313c";

describe("Porchcast extension model", () => {
  it("stores only bounded token-free recent Porch metadata", () => {
    let recents: unknown = [];
    for (let index = 0; index < 14; index += 1) {
      recents = upsertRecentPorch(recents, {
        id: `porch_${String(index).padStart(2, "0")}`,
        title: `Porch ${index}`,
        role: index % 2 ? "guest" : "host",
      }, new Date(Date.UTC(2026, 7, 23, 0, index)).toISOString());
    }
    expect(normalizeRecentPorches(recents)).toHaveLength(MAX_RECENT_PORCHES);
    expect(JSON.stringify(recents)).not.toMatch(/token|invite|artifact|media/i);
  });

  it("deduplicates a returning Porch and moves it to the front", () => {
    const earlier = upsertRecentPorch([], {
      id: porchId,
      title: "First title",
      role: "guest",
    }, "2026-08-23T00:00:00.000Z");
    const next = upsertRecentPorch(earlier, {
      id: porchId,
      title: "Updated title",
      role: "host",
    }, "2026-08-23T01:00:00.000Z");
    expect(next).toEqual([{
      id: porchId,
      title: "Updated title",
      role: "host",
      lastVisitedAt: "2026-08-23T01:00:00.000Z",
    }]);
  });

  it("accepts the safe bridge shape and rejects added capability fields", () => {
    const message = {
      protocol: "porchcast-companion",
      version: 1,
      source: "porchcast-web",
      type: "state",
      payload: {
        revision: 1,
        porch: { id: porchId, title: "Launch", role: "host" },
        status: "live",
        capabilities: { account: true, downloads: false, invite: true },
        noticeKey: null,
      },
    };
    expect(parseCompanionStateMessage(message)?.payload.porch?.title).toBe("Launch");
    expect(parseCompanionStateMessage({
      ...message,
      payload: { ...message.payload, roomToken: "secret" },
    })).toBeNull();
  });

  it("constructs only the known Porchcast destinations", () => {
    expect(porchUrl(porchId)).toBe(`https://labs.wiplash.ai/porchcast/?room=${porchId}`);
    expect(porchUrl("https://evil.example")).toBeNull();
    expect(destinationUrl("app")).toBe("https://labs.wiplash.ai/porchcast/");
    expect(destinationUrl("book")).toBe("https://labs.wiplash.ai/porchcast/?book=1");
    expect(destinationUrl("pricing")).toBe("https://labs.wiplash.ai/porchcast/pricing");
  });
});
