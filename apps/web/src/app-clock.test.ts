import { describe, expect, it } from "vitest";

import {
  formatClock,
  formatRecordingClock,
} from "./studio-utils";
import { bookingStepCanContinue } from "./BookingView";
import { randomDisplayName } from "./participant-name";

describe("recording status clock", () => {
  it("derives a stable nonnegative timer from the authoritative recording epoch", () => {
    const epoch = "2026-08-14T12:00:00.000Z";

    expect(formatClock(epoch, Date.parse("2026-08-14T13:02:03.999Z"))).toBe("01:02:03");
    expect(formatClock(epoch, Date.parse("2026-08-14T11:59:00.000Z"))).toBe("00:00:00");
    expect(formatClock(null, Date.parse("2026-08-14T13:02:03.999Z"))).toBe("00:00:00");
  });

  it("freezes a completed recording at its authoritative stop time after reload", () => {
    expect(formatRecordingClock(
      "2026-08-14T12:00:00.000Z",
      "2026-08-14T12:00:12.900Z",
      false,
      Date.parse("2026-08-14T13:00:00.000Z"),
    )).toBe("00:00:12");
    expect(formatRecordingClock(
      "2026-08-14T12:00:00.000Z",
      "2026-08-14T12:00:12.900Z",
      true,
      Date.parse("2026-08-14T12:00:20.000Z"),
    )).toBe("00:00:20");
  });
});

describe("booking wizard progression", () => {
  it("requires the room and host names before leaving the details step", () => {
    expect(bookingStepCanContinue(0, "", "Jordan")).toBe(false);
    expect(bookingStepCanContinue(0, "Episode one", " ")).toBe(false);
    expect(bookingStepCanContinue(0, "Episode one", "Jordan")).toBe(true);
  });

  it("does not revalidate details on later progressive-disclosure steps", () => {
    expect(bookingStepCanContinue(1, "", "")).toBe(true);
    expect(bookingStepCanContinue(2, "", "")).toBe(true);
  });

  it("prefills a friendly generated display name without personal data", () => {
    expect(randomDisplayName(() => 0)).toBe("Bright Creator");
    expect(randomDisplayName(() => 0.999)).toBe("Midnight Wave");
  });
});
