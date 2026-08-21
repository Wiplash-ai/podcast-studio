import { describe, expect, it } from "vitest";

import {
  pictureInPictureRoomVisibility,
  pictureInPictureTiles,
  selectPictureInPictureAudioSources,
  selectPictureInPictureSources,
  type PictureInPictureSource,
} from "./picture-in-picture";

const sources: Array<PictureInPictureSource<{ id: string }>> = [
  { id: "guest-a", label: "Avery", mirrored: false, role: "guest", stream: { id: "a" } },
  { id: "guest-b", label: "Blake", mirrored: false, role: "guest", stream: { id: "b" } },
  { id: "host", label: "You", mirrored: true, role: "self", stream: { id: "host" } },
];

describe("composite picture-in-picture", () => {
  it("selects everyone, guests, or self without duplicating media sources", () => {
    expect(selectPictureInPictureSources(sources, "everyone").map((source) => source.id))
      .toEqual(["guest-a", "guest-b", "host"]);
    expect(selectPictureInPictureSources(sources, "guests").map((source) => source.id))
      .toEqual(["guest-a", "guest-b"]);
    expect(selectPictureInPictureSources(sources, "self").map((source) => source.id))
      .toEqual(["host"]);
    expect(selectPictureInPictureSources(sources, "everyone")[0]?.stream)
      .toBe(sources[0]?.stream);
  });

  it("routes only existing guest audio to feedback-safe floating modes", () => {
    expect(selectPictureInPictureAudioSources(sources, "everyone").map((source) => source.id))
      .toEqual(["guest-a", "guest-b"]);
    expect(selectPictureInPictureAudioSources(sources, "guests").map((source) => source.id))
      .toEqual(["guest-a", "guest-b"]);
    expect(selectPictureInPictureAudioSources(sources, "self")).toEqual([]);
    expect(selectPictureInPictureAudioSources(sources, "guests")[0]?.stream)
      .toBe(sources[0]?.stream);
  });

  it("keeps exactly the complementary camera feeds in the room", () => {
    expect(pictureInPictureRoomVisibility(null)).toEqual({ guests: true, self: true });
    expect(pictureInPictureRoomVisibility("everyone")).toEqual({ guests: false, self: false });
    expect(pictureInPictureRoomVisibility("guests")).toEqual({ guests: false, self: true });
    expect(pictureInPictureRoomVisibility("self")).toEqual({ guests: true, self: false });
  });

  it("fills the floating window for a solo participant", () => {
    expect(pictureInPictureTiles(1, 960, 540, 12)).toEqual([
      { x: 12, y: 12, width: 936, height: 516 },
    ]);
  });

  it("centers incomplete gallery rows for three through five people", () => {
    const three = pictureInPictureTiles(3, 960, 540, 12);
    expect(three).toHaveLength(3);
    expect(three[2]?.x).toBeGreaterThan(three[0]?.x ?? 0);
    expect(three[2]?.x).toBeLessThan(three[1]?.x ?? 960);

    const five = pictureInPictureTiles(5, 960, 540, 12);
    expect(five).toHaveLength(5);
    expect(five[3]?.x).toBeGreaterThan(five[0]?.x ?? 0);
    expect(five[4]?.x).toBeGreaterThan(five[3]?.x ?? 0);
  });

  it("fits Showrunner and Studio panels into bounded four-column galleries", () => {
    for (const count of [9, 13]) {
      const tiles = pictureInPictureTiles(count, 960, 540, 12);
      expect(tiles).toHaveLength(count);
      expect(tiles.every((tile) => tile.x >= 0 && tile.y >= 0)).toBe(true);
      expect(tiles.every((tile) => tile.x + tile.width <= 960)).toBe(true);
      expect(tiles.every((tile) => tile.y + tile.height <= 540)).toBe(true);
    }
  });

  it("returns no tiles when no selected participant is available", () => {
    expect(pictureInPictureTiles(0)).toEqual([]);
    expect(selectPictureInPictureSources(sources, "guests").every((source) =>
      source.role === "guest",
    )).toBe(true);
  });
});
