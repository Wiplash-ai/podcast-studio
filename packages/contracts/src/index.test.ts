import { describe, expect, it } from "vitest";

import {
  FREE_ROOM_GUEST_LIMIT,
  MAX_ROOM_GUEST_LIMIT,
  STUDIO_ROOM_GUEST_LIMIT,
  accountSnapshotSchema,
  mediaSessionGrantSchema,
  porchcastCompanionStateMessageSchema,
  porchcastCompanionStateRequestSchema,
  roomArtifactSchema,
  roomChatMessageSchema,
} from "./index.js";

const roomId = "6e71bb7f-f73a-4b7a-b16f-d1b9cd2a313c";
const cameraId = `ps_${"a".repeat(32)}`;
const screenId = `ps_${"b".repeat(32)}`;

function endpoint(sourceId: string, operation: "whip" | "whep") {
  return {
    sourceId,
    url: `/v1/media/sources/${sourceId}/${operation}`,
    token: "t".repeat(32),
  };
}

describe("browser-safe Porchcast contracts", () => {
  it("publishes the bounded browser room capacities", () => {
    expect(FREE_ROOM_GUEST_LIMIT).toBe(2);
    expect(STUDIO_ROOM_GUEST_LIMIT).toBe(12);
    expect(MAX_ROOM_GUEST_LIMIT).toBe(12);
  });

  it("accepts an anonymous account snapshot without inventing credentials", () => {
    expect(accountSnapshotSchema.parse({
      account: null,
      capabilities: {
        signInAvailable: true,
        roomLibrary: false,
        retentionDays: 1,
        roomLimit: 1,
        guestSeatLimit: 2,
      },
    }).account).toBeNull();
  });

  it("keeps publish and recording-bootstrap identities stable", () => {
    const publish = {
      participantId: "host" as const,
      displayName: "Host",
      camera: endpoint(cameraId, "whip"),
      screen: endpoint(screenId, "whip"),
    };
    const recordingBootstrap = {
      ...publish,
      camera: endpoint(cameraId, "whep"),
      screen: endpoint(screenId, "whep"),
    };
    const grant = {
      transport: "whip_whep" as const,
      roomId,
      participantId: "host" as const,
      publish,
      recordingBootstrap,
      subscribe: [],
      expiresAt: "2026-08-22T00:00:00.000Z",
    };

    expect(mediaSessionGrantSchema.safeParse(grant).success).toBe(true);
    expect(mediaSessionGrantSchema.safeParse({
      ...grant,
      recordingBootstrap: {
        ...recordingBootstrap,
        camera: endpoint(`ps_${"c".repeat(32)}`, "whep"),
      },
    }).success).toBe(false);
  });

  it("rejects empty chat messages and artifact path traversal", () => {
    expect(roomChatMessageSchema.safeParse({
      id: "342db180-8dbf-4bc7-9fa8-3b0b29084f8d",
      roomId,
      sequence: 1,
      participantId: "host",
      displayName: "Host",
      body: "   ",
      attachment: null,
      sentAt: "2026-08-21T22:00:00.000Z",
    }).success).toBe(false);

    expect(roomArtifactSchema.safeParse({
      artifactId: `pa_${"d".repeat(32)}`,
      kind: "program",
      participantId: null,
      sourceKind: null,
      layout: "horizontal",
      sequence: null,
      fileName: "../recording.mp4",
      start: "2026-08-21T22:00:00.000Z",
      end: "2026-08-21T22:00:01.000Z",
      durationMs: 1_000,
      sizeBytes: 1,
      sha256: "e".repeat(64),
      downloadPath: `/v1/rooms/${roomId}/artifacts/pa_${"d".repeat(32)}`,
    }).success).toBe(false);
  });

  it("exposes only bounded, token-free Porchcast companion state", () => {
    const message = {
      protocol: "porchcast-companion" as const,
      version: 1 as const,
      source: "porchcast-web" as const,
      type: "state" as const,
      payload: {
        revision: 4,
        porch: { id: roomId, title: "Release notes", role: "host" as const },
        status: "recording" as const,
        capabilities: { account: true, downloads: true, invite: true },
        account: {
          state: "ready" as const,
          porches: [{
            id: roomId,
            title: "Release notes",
            lifecycleState: "ready" as const,
            updatedAt: "2026-08-23T00:00:00.000Z",
          }],
          recordings: [{
            id: "ca342c0d-9f7b-4e79-884c-14873789449f",
            porchId: roomId,
            name: "August 23, 2026",
            porchTitle: "Release notes",
            lifecycleState: "ready" as const,
            createdAt: "2026-08-23T00:00:00.000Z",
            durationSeconds: 3_600,
          }],
        },
        noticeKey: null,
      },
    };
    expect(porchcastCompanionStateMessageSchema.safeParse(message).success).toBe(true);
    expect(porchcastCompanionStateMessageSchema.safeParse({
      ...message,
      payload: {
        ...message.payload,
        porch: { ...message.payload.porch, invitationToken: "secret" },
      },
    }).success).toBe(false);
    expect(porchcastCompanionStateMessageSchema.safeParse({
      ...message,
      payload: { ...message.payload, artifactUrl: "https://example.invalid/file.mp4" },
    }).success).toBe(false);
    expect(porchcastCompanionStateMessageSchema.safeParse({
      ...message,
      payload: {
        ...message.payload,
        account: { ...message.payload.account, accessToken: "secret" },
      },
    }).success).toBe(false);
  });

  it("accepts only the versioned companion state request", () => {
    expect(porchcastCompanionStateRequestSchema.safeParse({
      protocol: "porchcast-companion",
      version: 1,
      source: "porchcast-extension",
      type: "state_request",
    }).success).toBe(true);
    expect(porchcastCompanionStateRequestSchema.safeParse({
      protocol: "porchcast-companion",
      version: 1,
      source: "porchcast-extension",
      type: "state_request",
      roomToken: "secret",
    }).success).toBe(false);
  });
});
