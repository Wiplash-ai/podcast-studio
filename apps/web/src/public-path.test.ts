import { describe, expect, it } from "vitest";

import {
  apiRequest,
  apiUrl,
  appPagePath,
  appPath,
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
    expect(apiUrl("/v1/rooms", "/podcast-studio/")).toBe(
      "/podcast-studio/v1/rooms",
    );
    expect(apiRequest("/v1/media/sources/source/whep", "/podcast-studio")).toBe(
      "/podcast-studio/v1/media/sources/source/whep",
    );
  });

  it("preserves the deployment base while moving an invitation query", () => {
    expect(invitationUrl(
      "/?room=room-id&invite=guest-capability",
      "https://labs.wiplash.ai",
      "/podcast-studio/",
    )).toBe(
      "https://labs.wiplash.ai/podcast-studio/?room=room-id&invite=guest-capability",
    );
  });

  it("normalizes a deployment base before attaching application state", () => {
    expect(appPath("?room=room-id", "/podcast-studio")).toBe(
      "/podcast-studio/?room=room-id",
    );
    expect(invitationUrl(
      "/?room=room-id&invite=guest-capability",
      "https://labs.wiplash.ai",
      "/podcast-studio",
    )).toBe(
      "https://labs.wiplash.ai/podcast-studio/?room=room-id&invite=guest-capability",
    );
  });

  it("rejects accidental relative API paths", () => {
    expect(() => apiUrl("v1/rooms")).toThrow("root-relative");
  });

  it("builds stable public pricing and privacy paths under a deployment prefix", () => {
    expect(appPagePath("home", "/podcast-studio")).toBe("/podcast-studio/");
    expect(appPagePath("pricing", "/podcast-studio/")).toBe("/podcast-studio/pricing");
    expect(appPagePath("privacy", "/podcast-studio/")).toBe("/podcast-studio/privacy");
  });

  it("resolves only known public pages and sends unknown app routes home", () => {
    expect(publicAppPageFromPath("/podcast-studio/pricing", "/podcast-studio/")).toBe("pricing");
    expect(publicAppPageFromPath("/podcast-studio/privacy/", "/podcast-studio/")).toBe("privacy");
    expect(publicAppPageFromPath("/podcast-studio/not-a-page", "/podcast-studio/")).toBe("home");
    expect(publicAppPageFromPath("/pricing", "/")).toBe("pricing");
  });
});
