import { describe, expect, it } from "vitest";

import {
  chatEmojiTokenAtCursor,
  chatEmojis,
  insertChatEmoji,
  matchingChatEmojis,
} from "./chat-composer";

describe("room chat emoji composition", () => {
  it("finds a standard colon shortcode only at the active cursor", () => {
    expect(chatEmojiTokenAtCursor("That is :thi", 12)).toEqual({
      end: 12,
      query: "thi",
      start: 8,
    });
    expect(chatEmojiTokenAtCursor("https://example.test", 20)).toBeNull();
    expect(chatEmojiTokenAtCursor("Earlier :joy now", 16)).toBeNull();
  });

  it("matches names and familiar keywords deterministically", () => {
    expect(matchingChatEmojis(":hea", 4).map((entry) => entry.name))
      .toEqual(["heart_eyes", "headphones", "heart", "heart_hands"]);
    expect(matchingChatEmojis("nice :pod", 9).map((entry) => entry.name))
      .toEqual(["studio_microphone"]);
    expect(matchingChatEmojis(":", 1)).toEqual(chatEmojis.slice(0, 8));
  });

  it("replaces a shortcode or inserts a toolbar emoji at the cursor", () => {
    expect(insertChatEmoji("Great :fir", 10, chatEmojis.find((entry) => entry.name === "fire")!))
      .toEqual({ cursor: 9, value: "Great 🔥 " });
    expect(insertChatEmoji("Ready now", 5, chatEmojis.find((entry) => entry.name === "check")!))
      .toEqual({ cursor: 6, value: "Ready✅ now" });
  });
});
