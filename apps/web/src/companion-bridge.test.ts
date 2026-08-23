import { describe, expect, it } from "vitest";

import {
  companionAccountState,
  companionLaunchIntent,
  companionStateMessage,
  companionStatusForRoom,
  type CompanionAccountSource,
} from "./companion-bridge";

const room = {
  lifecycleState: "armed" as const,
  programs: [],
};

describe("Porchcast companion bridge", () => {
  it("maps widget destinations to distinct application surfaces", () => {
    expect(companionLaunchIntent("?book=1")).toBe("book");
    expect(companionLaunchIntent("?account=1")).toBe("account");
    expect(companionLaunchIntent("?book=1&account=1")).toBe("account");
    expect(companionLaunchIntent("?pricing=1")).toBeNull();
  });

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
      account: { state: "signed_out", porches: [], recordings: [] },
      noticeKey: null,
    });
    expect(JSON.stringify(message)).not.toMatch(/token|inviteUrl|artifactUrl/i);
  });

  it("bounds signed-in Porch and recording summaries without forwarding paths or credentials", () => {
    const timestamp = "2026-08-23T00:00:00.000Z";
    const roomId = "6e71bb7f-f73a-4b7a-b16f-d1b9cd2a313c";
    const recordingId = "ca342c0d-9f7b-4e79-884c-14873789449f";
    const source = {
      status: "available",
      signedIn: true,
      rooms: [{
        room: {
          id: roomId,
          title: "The Midnight Show",
          hostName: "Jordan",
          settings: {
            maxGuests: 2,
            admissionMode: "host_approval",
            videoPreset: "balanced",
            audioPreset: "voice",
            screenSharePreset: "balanced",
            requestedLayouts: ["horizontal", "vertical"],
          },
          lifecycleState: "ready",
          healthState: "healthy",
          warnings: [],
          recordingAdapter: "server",
          recordingEpoch: timestamp,
          stoppedAt: timestamp,
          currentRecordingId: recordingId,
          programs: [],
          createdAt: timestamp,
          updatedAt: timestamp,
          revision: 7,
        },
        retentionClass: "free",
        mediaExpiresAt: "2026-08-30T00:00:00.000Z",
        mediaDeletedAt: null,
        claimedAt: timestamp,
        openPath: `/?room=${roomId}`,
      }],
      recordingLibrary: {
        allowance: {
          plan: "free",
          includedSeconds: 10_800,
          usedSeconds: 300,
          remainingSeconds: 10_500,
          maxSessionSeconds: 10_800,
          periodStartedAt: timestamp,
          resetsAt: "2026-09-23T00:00:00.000Z",
          activeRecordingId: null,
        },
        recordings: [{
          recording: {
            id: recordingId,
            roomId,
            name: "August 23, 2026",
            lifecycleState: "ready",
            healthState: "healthy",
            warnings: [],
            recordingAdapter: "server",
            recordingEpoch: timestamp,
            stoppedAt: timestamp,
            programs: [],
            createdAt: timestamp,
            updatedAt: timestamp,
            revision: 2,
          },
          roomTitle: "The Midnight Show",
          openPath: `/?room=${roomId}`,
          mediaExpiresAt: "2026-08-30T00:00:00.000Z",
          mediaDeletedAt: null,
          durationSeconds: 300,
        }],
      },
    } satisfies CompanionAccountSource;

    const account = companionAccountState(source);
    expect(account).toEqual({
      state: "ready",
      porches: [{
        id: roomId,
        title: "The Midnight Show",
        lifecycleState: "ready",
        updatedAt: timestamp,
      }],
      recordings: [{
        id: recordingId,
        porchId: roomId,
        name: "August 23, 2026",
        porchTitle: "The Midnight Show",
        lifecycleState: "ready",
        createdAt: timestamp,
        durationSeconds: 300,
      }],
    });
    expect(JSON.stringify(account)).not.toMatch(/token|csrf|openPath|download|mediaExpires/i);
  });
});
