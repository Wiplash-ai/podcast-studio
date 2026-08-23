import { describe, expect, it } from "vitest";

import porchCastMark from "../public/porchcast-mark.svg?raw";
import porchCastFavicon from "../public/porchcast-favicon.svg?raw";

import {
  apiRequest,
  apiUrl,
  appPagePath,
  appPath,
  extensionDestination,
  invitationUrl,
  publicAppPageFromPath,
} from "./public-path";

describe("public path routing", () => {
  it("keeps API requests same-origin when no deployment prefix is configured", () => {
    expect(apiUrl("/v1/rooms")).toBe("/v1/rooms");
    expect(apiRequest("/v1/media/sources/source/whip")).toBe(
      "/v1/media/sources/source/whip",
    );
  });

  it("prefixes API and media requests for a path deployment", () => {
    expect(apiUrl("/v1/rooms", "/porchcast/")).toBe(
      "/porchcast/v1/rooms",
    );
    expect(apiRequest("/v1/media/sources/source/whep", "/porchcast")).toBe(
      "/porchcast/v1/media/sources/source/whep",
    );
  });

  it("preserves the deployment base while moving an invitation query", () => {
    expect(invitationUrl(
      "/?room=room-id&invite=guest-capability",
      "https://labs.wiplash.ai",
      "/porchcast/",
    )).toBe(
      "https://labs.wiplash.ai/porchcast/?room=room-id&invite=guest-capability",
    );
  });

  it("normalizes a deployment base before attaching application state", () => {
    expect(appPath("?room=room-id", "/porchcast")).toBe(
      "/porchcast/?room=room-id",
    );
    expect(invitationUrl(
      "/?room=room-id&invite=guest-capability",
      "https://labs.wiplash.ai",
      "/porchcast",
    )).toBe(
      "https://labs.wiplash.ai/porchcast/?room=room-id&invite=guest-capability",
    );
  });

  it("rejects accidental relative API paths", () => {
    expect(() => apiUrl("v1/rooms")).toThrow("root-relative");
  });

  it("builds stable public pricing and privacy paths under a deployment prefix", () => {
    expect(appPagePath("home", "/porchcast")).toBe("/porchcast/");
    expect(appPagePath("pricing", "/porchcast/")).toBe("/porchcast/pricing");
    expect(appPagePath("privacy", "/porchcast/")).toBe("/porchcast/privacy");
  });

  it("resolves only known public pages and sends unknown app routes home", () => {
    expect(publicAppPageFromPath("/porchcast/pricing", "/porchcast/")).toBe("pricing");
    expect(publicAppPageFromPath("/porchcast/privacy/", "/porchcast/")).toBe("privacy");
    expect(publicAppPageFromPath("/porchcast/not-a-page", "/porchcast/")).toBe("home");
    expect(publicAppPageFromPath("/pricing", "/")).toBe("pricing");
  });

  it("keeps the extension callout useful until a public store URL is configured", () => {
    expect(extensionDestination("", "/porchcast/")).toBe("/porchcast/#extension");
    expect(extensionDestination("https://store.example/porchcast", "/porchcast/")).toBe(
      "https://store.example/porchcast",
    );
  });
});

describe("Porchcast brand asset", () => {
  it("ships a real vector mark without an embedded raster image", () => {
    for (const asset of [porchCastMark, porchCastFavicon]) {
      expect(asset).toContain("<svg");
      expect(asset).toContain("Porchcast cat");
      expect(asset).not.toMatch(/<image|data:image/i);
    }
  });
});
