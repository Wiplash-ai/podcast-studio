import { describe, expect, it, vi } from "vitest";

import { DEMO_HOST_TOKEN, DEMO_ROOM_ID } from "./demo-porchcast-backend";
import { createWebRuntime } from "./web-runtime";

const options = {
  getCsrfToken: () => "",
  fetcher: vi.fn<typeof fetch>(),
};

describe("createWebRuntime", () => {
  it("uses the Cloud adapter by default", () => {
    const runtime = createWebRuntime({
      ...options,
      configuredMode: "cloud",
      url: "https://labs.wiplash.ai/",
    });

    expect(runtime.mode).toBe("cloud");
    expect(runtime.backend.kind).toBe("cloud");
    expect(runtime.demoScenario).toBeNull();
    expect(runtime.initialRoom).toBeNull();
    expect(runtime.publicPagePath("pricing", "?intent=recording"))
      .toBe("/pricing?intent=recording");
    expect(runtime.roomPath(DEMO_ROOM_ID)).toBe(`/?room=${DEMO_ROOM_ID}`);
  });

  it("opens an explicit deterministic demo without a room parameter", () => {
    const runtime = createWebRuntime({
      ...options,
      configuredMode: "cloud",
      url: "https://labs.wiplash.ai/?demo=full-room",
    });

    expect(runtime.mode).toBe("demo");
    expect(runtime.backend.kind).toBe("demo");
    expect(runtime.demoScenario).toBe("full-room");
    expect(runtime.initialRoom).toEqual({
      roomId: DEMO_ROOM_ID,
      roomToken: DEMO_HOST_TOKEN,
    });
    expect(runtime.roomPath(DEMO_ROOM_ID))
      .toBe(`/?room=${DEMO_ROOM_ID}&demo=full-room`);
    expect(runtime.publicPagePath("pricing", "?intent=recording"))
      .toBe("/pricing?intent=recording&demo=full-room");
    expect(runtime.publicPagePath("home"))
      .toBe("/?demo=full-room&surface=marketing");
  });

  it("round-trips an explicit demo marketing home without auto-opening the studio", () => {
    const runtime = createWebRuntime({
      ...options,
      url: "https://labs.wiplash.ai/?demo=ready",
    });
    const marketingHome = runtime.publicPagePath("home");
    const reloaded = createWebRuntime({
      ...options,
      url: `https://labs.wiplash.ai${marketingHome}`,
    });

    expect(marketingHome).toBe("/?demo=ready&surface=marketing");
    expect(reloaded.mode).toBe("demo");
    expect(reloaded.initialRoom).toBeNull();
  });

  it("does not auto-open when a demo room is already in the URL", () => {
    const runtime = createWebRuntime({
      ...options,
      url: `https://labs.wiplash.ai/?room=${DEMO_ROOM_ID}&demo=recording`,
    });

    expect(runtime.mode).toBe("demo");
    expect(runtime.initialRoom).toBeNull();
  });

  it("does not auto-open a demo over a public marketing route", () => {
    const runtime = createWebRuntime({
      ...options,
      url: "https://labs.wiplash.ai/pricing?demo=ready",
    });

    expect(runtime.mode).toBe("demo");
    expect(runtime.initialRoom).toBeNull();
  });

  it("supports a configured demo while allowing an explicit Cloud override", () => {
    const demo = createWebRuntime({
      ...options,
      configuredMode: "demo",
      configuredDemoScenario: "reconnecting",
      url: "https://labs.wiplash.ai/",
    });
    const cloud = createWebRuntime({
      ...options,
      configuredMode: "demo",
      configuredDemoScenario: "reconnecting",
      url: "https://labs.wiplash.ai/?runtime=cloud",
    });

    expect(demo.demoScenario).toBe("reconnecting");
    expect(cloud.mode).toBe("cloud");
  });

  it("falls back to Cloud for an invalid demo query", () => {
    const runtime = createWebRuntime({
      ...options,
      configuredMode: "cloud",
      url: "https://labs.wiplash.ai/?demo=unknown",
    });

    expect(runtime.mode).toBe("cloud");
  });
});
