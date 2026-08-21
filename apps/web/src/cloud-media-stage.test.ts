import { describe, expect, it } from "vitest";
import type { RoomArtifact } from "@wiplash/podcast-contracts";

import {
  attachMediaStream,
  cloudRoomClass,
  parseParticipantViewPreference,
  parseMediaDevicePreference,
  participantGridClass,
  preferredScreenStream,
  readMediaDevicePreference,
  rememberMediaDevicePreference,
  resolvedParticipantViewMode,
  selectedDeviceName,
  shouldRenderRoomVideo,
  shouldResumeJoinedMedia,
} from "./CloudMediaStage";
import {
  artifactDownloadLabel,
  clampFloatingPanelPosition,
  cloudProgramStatusCopy,
  cloudMediaControlLabels,
  groupSourceArtifacts,
  nextChatUnreadCount,
  recordingViewLabel,
  roomChatControlLabel,
  roomSaveControlState,
  shouldCountChatMessage,
  shouldShowInitialArtifactLoading,
  shouldSubmitChatMessage,
} from "./studio-controls";

describe("Cloud media participant layout", () => {
  it("uses customer-facing names for the internal compositor layouts", () => {
    expect(recordingViewLabel("horizontal")).toBe("Desktop");
    expect(recordingViewLabel("vertical")).toBe("Mobile");
  });

  it("uses the full solo stage while the other participant is absent", () => {
    expect(participantGridClass(false))
      .toBe("participant-grid solo participant-count-1 peer-first");
  });

  it("switches to the paired layout when the other participant connects", () => {
    expect(participantGridClass(true))
      .toBe("participant-grid paired view-equal participant-count-2 peer-first");
  });

  it("supports vertical, focus, peer-only, and swapped local view preferences", () => {
    expect(participantGridClass(true, "stacked", true))
      .toBe("participant-grid paired view-stacked participant-count-2 self-first");
    expect(participantGridClass(true, "focus-peer"))
      .toBe("participant-grid paired view-focus-peer participant-count-2 peer-first");
    expect(participantGridClass(true, "peer-only"))
      .toBe("participant-grid paired view-peer-only participant-count-2 peer-first");
  });

  it("automatically stacks only for portrait-shaped browser windows", () => {
    expect(resolvedParticipantViewMode("auto", false)).toBe("equal");
    expect(resolvedParticipantViewMode("auto", true)).toBe("stacked");
    expect(participantGridClass(true, "auto", false, false))
      .toBe("participant-grid paired view-equal participant-count-2 peer-first");
    expect(participantGridClass(true, "auto", false, true))
      .toBe("participant-grid paired view-stacked participant-count-2 peer-first");
    expect(resolvedParticipantViewMode("focus-peer", true)).toBe("focus-peer");
  });

  it("selects bounded deterministic galleries for two through thirteen people", () => {
    expect(participantGridClass(1)).toContain("participant-count-2");
    expect(participantGridClass(2)).toContain("participant-count-3");
    expect(participantGridClass(3)).toContain("participant-count-4");
    expect(participantGridClass(4)).toContain("participant-count-5");
    expect(participantGridClass(8)).toContain("participant-count-9");
    expect(participantGridClass(12)).toContain("participant-count-13");
    expect(participantGridClass(20)).toContain("participant-count-13");
  });

  it("marks portrait screen-share rooms for the uncropped camera-strip layout", () => {
    expect(cloudRoomClass(true, true)).toBe("cloud-room screen-active portrait-room");
    expect(cloudRoomClass(true, false)).toBe("cloud-room screen-active landscape-room");
    expect(cloudRoomClass(false, true)).toBe("cloud-room portrait-room");
  });

  it("intentionally shows the peer screen when both participants share", () => {
    const local = { id: "local-screen" };
    const remote = { id: "remote-screen" };

    expect(preferredScreenStream(remote, local)).toBe(remote);
    expect(preferredScreenStream(null, local)).toBe(local);
    expect(preferredScreenStream(null, null)).toBeNull();
  });

  it("keeps complementary room video while native Picture in Picture is active", () => {
    expect(shouldRenderRoomVideo(null)).toBe(true);
    expect(shouldRenderRoomVideo("everyone")).toBe(false);
    expect(shouldRenderRoomVideo("guests")).toBe(true);
    expect(shouldRenderRoomVideo("self")).toBe(true);
  });

  it("reattaches the same local stream when the room video remounts after Picture in Picture closes", () => {
    const stream = { id: "stable-local-stream" } as unknown as MediaStream;
    const originalVideo = { srcObject: null } as Pick<HTMLMediaElement, "srcObject">;
    const restoredVideo = { srcObject: null } as Pick<HTMLMediaElement, "srcObject">;

    attachMediaStream(originalVideo, stream);
    attachMediaStream(restoredVideo, stream);

    expect(originalVideo.srcObject).toBe(stream);
    expect(restoredVideo.srcObject).toBe(stream);
  });

  it("fails closed to the automatic view when a stored preference is invalid", () => {
    expect(parseParticipantViewPreference('{"mode":"stacked","selfFirst":true}')).toEqual({
      mode: "stacked",
      selfFirst: true,
    });
    expect(parseParticipantViewPreference('{"mode":"unknown","selfFirst":"yes"}')).toEqual({
      mode: "auto",
      selfFirst: false,
    });
    expect(parseParticipantViewPreference("not-json")).toEqual({
      mode: "auto",
      selfFirst: false,
    });
    expect(parseParticipantViewPreference(null)).toEqual({ mode: "auto", selfFirst: false });
  });

  it("keeps camera and microphone preferences session-only and participant-scoped", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    };

    rememberMediaDevicePreference(storage, "room-a", "host", {
      cameraId: "camera-a",
      cameraEnabled: false,
      joined: true,
      microphoneId: "microphone-a",
      microphoneEnabled: true,
    });

    expect(readMediaDevicePreference(storage, "room-a", "host")).toEqual({
      cameraId: "camera-a",
      cameraEnabled: false,
      joined: true,
      microphoneId: "microphone-a",
      microphoneEnabled: true,
    });
    expect(readMediaDevicePreference(storage, "room-a", "guest")).toBeNull();
    expect(readMediaDevicePreference(storage, "room-b", "host")).toBeNull();
    expect(JSON.stringify([...values.entries()])).not.toMatch(/token|grant|password/i);
  });

  it("rejects malformed or unbounded remembered device choices", () => {
    expect(parseMediaDevicePreference("not-json")).toBeNull();
    expect(parseMediaDevicePreference(JSON.stringify({ cameraId: "camera" }))).toBeNull();
    expect(parseMediaDevicePreference(JSON.stringify({
      cameraId: "x".repeat(513),
      microphoneId: "microphone",
    }))).toBeNull();
    expect(parseMediaDevicePreference(JSON.stringify({ cameraId: "", microphoneId: "" })))
      .toBeNull();
  });

  it("auto-rejoins only after a matching sign-in return from an already joined room", () => {
    const joined = parseMediaDevicePreference(JSON.stringify({
      cameraId: "camera-a",
      cameraEnabled: true,
      joined: true,
      microphoneId: "microphone-a",
      microphoneEnabled: false,
    }));
    const configuredOnly = parseMediaDevicePreference(JSON.stringify({
      cameraId: "camera-a",
      microphoneId: "microphone-a",
    }));

    expect(shouldResumeJoinedMedia(joined, true)).toBe(true);
    expect(shouldResumeJoinedMedia(joined, false)).toBe(false);
    expect(shouldResumeJoinedMedia(configuredOnly, true)).toBe(false);
    expect(shouldResumeJoinedMedia(null, true)).toBe(false);
  });
});

describe("Studio control feedback", () => {
  it("labels custom camera and microphone choices without exposing raw device IDs", () => {
    const devices = [
      { deviceId: "private-device-id-a", label: "Studio Camera" },
      { deviceId: "private-device-id-b", label: "" },
    ];

    expect(selectedDeviceName(devices, "private-device-id-a", "Camera")).toBe("Studio Camera");
    expect(selectedDeviceName(devices, "private-device-id-b", "Camera")).toBe("Camera 2");
    expect(selectedDeviceName([], "", "Microphone")).toBe("No microphone found");
  });

  it("labels microphone, camera, and screen controls as explicit actions", () => {
    expect(cloudMediaControlLabels({
      cameraEnabled: true,
      microphoneEnabled: true,
      screenSharing: false,
    })).toEqual({
      camera: "Turn camera off",
      microphone: "Mute",
      screen: "Share screen",
    });
    expect(cloudMediaControlLabels({
      cameraEnabled: false,
      microphoneEnabled: false,
      screenSharing: true,
    })).toEqual({
      camera: "Turn camera on",
      microphone: "Unmute",
      screen: "Stop sharing",
    });
  });

  it("distinguishes a confirmed save from a browser-started download", () => {
    expect(artifactDownloadLabel(true, undefined)).toBe("Saving…");
    expect(artifactDownloadLabel(false, "saved")).toBe("Saved ✓");
    expect(artifactDownloadLabel(false, "started")).toBe("Started ✓");
    expect(artifactDownloadLabel(false, undefined)).toBe("Download");
  });

  it("shows artifact loading only for a room's first fetch", () => {
    expect(shouldShowInitialArtifactLoading(null, "room-a")).toBe(true);
    expect(shouldShowInitialArtifactLoading("room-a", "room-a")).toBe(false);
    expect(shouldShowInitialArtifactLoading("room-a", "room-b")).toBe(true);
  });

  it("shows room saving only to hosts and makes saved ownership explicit", () => {
    expect(roomSaveControlState({ busy: false, hasRoom: false, isHost: false, saved: false, signedIn: false })).toBe("hidden");
    expect(roomSaveControlState({ busy: false, hasRoom: true, isHost: false, saved: false, signedIn: true })).toBe("hidden");
    expect(roomSaveControlState({ busy: false, hasRoom: true, isHost: true, saved: false, signedIn: false })).toBe("sign-in");
    expect(roomSaveControlState({ busy: false, hasRoom: true, isHost: true, saved: false, signedIn: true })).toBe("save");
    expect(roomSaveControlState({ busy: false, hasRoom: true, isHost: true, limitReached: true, saved: false, signedIn: true })).toBe("limit");
    expect(roomSaveControlState({ busy: true, hasRoom: true, isHost: true, saved: false, signedIn: true })).toBe("saving");
    expect(roomSaveControlState({ busy: true, hasRoom: true, isHost: true, saved: true, signedIn: true })).toBe("saved");
  });

  it("presents honest Cloud program progress before files appear", () => {
    expect(cloudProgramStatusCopy("queued").label).toBe("Queued");
    expect(cloudProgramStatusCopy("running")).toEqual({
      label: "Rendering",
      detail: "Building and validating your downloadable MP4.",
    });
    expect(cloudProgramStatusCopy("ready").label).toBe("Ready");
    expect(cloudProgramStatusCopy("failed").detail).toContain("source tracks remain preserved");
    expect(cloudProgramStatusCopy("deferred", "media_lock_busy").label).toBe("Waiting");
    expect(cloudProgramStatusCopy("deferred", "runtime_unavailable")).toEqual({
      label: "Unavailable",
      detail: "The Cloud renderer lost contact. Your source recordings are safe.",
    });
  });

  it("groups recorder fragments as protected source parts instead of generated clips", () => {
    const artifact = (
      participantId: "host" | "guest",
      sourceKind: "camera" | "screen",
      sequence: number,
    ): RoomArtifact => ({
      artifactId: `pa_${String(sequence + (participantId === "host" ? 1 : 10)).padStart(32, "a")}`,
      kind: "isolated",
      participantId,
      sourceKind,
      layout: null,
      sequence,
      fileName: `${participantId}-${sourceKind}-${sequence + 1}.mp4`,
      start: new Date(sequence * 5_000).toISOString(),
      end: new Date((sequence + 1) * 5_000).toISOString(),
      durationMs: 5_000,
      sizeBytes: 1_000,
      sha256: "a".repeat(64),
      downloadPath: `/v1/rooms/342db180-8dbf-4bc7-9fa8-3b0b29084f8d/artifacts/pa_${"a".repeat(32)}`,
    });
    const groups = groupSourceArtifacts([
      artifact("host", "camera", 1),
      artifact("guest", "camera", 0),
      artifact("host", "camera", 0),
    ]);

    expect(groups.map((group) => group.label)).toEqual(["guest camera", "host camera"]);
    expect(groups[1]).toMatchObject({ totalDurationMs: 10_000, totalSizeBytes: 2_000 });
    expect(groups[1]!.artifacts.map((item) => item.sequence)).toEqual([0, 1]);
  });

  it("counts only new unread chat messages and caps the visible count", () => {
    expect(shouldCountChatMessage("guest", "host", false)).toBe(true);
    expect(shouldCountChatMessage("guest", "host", true)).toBe(false);
    expect(shouldCountChatMessage("host", "host", false)).toBe(false);
    expect(nextChatUnreadCount(0)).toBe(1);
    expect(nextChatUnreadCount(98)).toBe(99);
    expect(nextChatUnreadCount(99)).toBe(99);
    expect(roomChatControlLabel(0)).toBe("Room chat");
    expect(roomChatControlLabel(1)).toBe("Room chat, 1 unread message");
    expect(roomChatControlLabel(4)).toBe("Room chat, 4 unread messages");
  });

  it("submits chat on Enter while preserving Shift+Enter and IME composition", () => {
    expect(shouldSubmitChatMessage("Enter", false, false)).toBe(true);
    expect(shouldSubmitChatMessage("Enter", true, false)).toBe(false);
    expect(shouldSubmitChatMessage("Enter", false, true)).toBe(false);
    expect(shouldSubmitChatMessage("a", false, false)).toBe(false);
  });

  it("keeps a dragged Cloud Downloads panel inside its stage", () => {
    expect(clampFloatingPanelPosition(
      { x: -40, y: 900 },
      1_200,
      800,
      500,
      360,
    )).toEqual({ x: 8, y: 432 });
    expect(clampFloatingPanelPosition(
      { x: 212.4, y: 90.6 },
      1_200,
      800,
      500,
      360,
    )).toEqual({ x: 212, y: 91 });
  });
});
