import { describe, expect, it } from "vitest";

import { parseVdoRoomUrl } from "./vdo-url";

describe("parseVdoRoomUrl", () => {
  it("accepts a director link and adds wrapper-safe chrome settings", () => {
    const parsed = parseVdoRoomUrl("https://vdo.ninja/?director=StudioRoom&password=secret");
    const url = new URL(parsed.vdoUrl);

    expect(parsed.role).toBe("host");
    expect(parsed.roomName).toBe("StudioRoom");
    expect(url.searchParams.get("password")).toBe("secret");
    expect(url.searchParams.has("hidehome")).toBe(true);
    expect(url.searchParams.has("hideheader")).toBe(true);
    expect(url.searchParams.has("cleandirector")).toBe(true);
  });

  it("accepts a guest room link without granting director controls", () => {
    const parsed = parseVdoRoomUrl("vdo.ninja/?room=GuestRoom");
    const url = new URL(parsed.vdoUrl);

    expect(parsed.role).toBe("guest");
    expect(parsed.roomName).toBe("GuestRoom");
    expect(url.searchParams.has("cleandirector")).toBe(false);
  });

  it("rejects other origins and non-room links", () => {
    expect(() => parseVdoRoomUrl("https://example.com/?room=stolen")).toThrow(
      "Use an HTTPS link from vdo.ninja.",
    );
    expect(() => parseVdoRoomUrl("https://vdo.ninja:444/?room=wrong-origin")).toThrow(
      "Use an HTTPS link from vdo.ninja.",
    );
    expect(() => parseVdoRoomUrl("https://vdo.ninja/")).toThrow(
      "The link needs a room or director parameter.",
    );
  });
});
