import { describe, expect, it, vi } from "vitest";

import type { BookRoomInput } from "../room-booking";
import { createHttpPorchcastBackend } from "./http-porchcast-backend";

const roomId = "342db180-8dbf-4bc7-9fa8-3b0b29084f8d";
const admissionId = "9f394f30-43cc-4dce-babf-8dfba0529967";
const hostToken = "h".repeat(43);
const guestToken = "g".repeat(43);
const admissionToken = "a".repeat(43);

const room = {
  id: roomId,
  title: "Weekly show",
  hostName: "Podcast Host",
  settings: {
    maxGuests: 2,
    admissionMode: "host_approval",
    videoPreset: "balanced",
    audioPreset: "voice",
    screenSharePreset: "detail",
    requestedLayouts: ["horizontal", "vertical"],
  },
  lifecycleState: "created",
  healthState: "healthy",
  warnings: [],
  recordingAdapter: null,
  recordingEpoch: null,
  stoppedAt: null,
  currentRecordingId: null,
  programs: [],
  createdAt: "2026-08-23T12:00:00.000Z",
  updatedAt: "2026-08-23T12:00:00.000Z",
  revision: 0,
};

const booking = {
  room,
  hostToken,
  guestInvitePath: `/?room=${roomId}&invite=${guestToken}`,
};

const access = {
  room,
  role: "host",
  participantId: "host",
  participantToken: hostToken,
  vdoUrl: "https://vdo.example.test/?room=weekly",
  mediaTransport: {
    available: true,
    kind: "whip_whep",
    requiresConsent: true,
  },
  recorderAvailability: {
    local: true,
    server: true,
  },
};

const bookInput: BookRoomInput = {
  title: "Weekly show",
  hostName: "Podcast Host",
  maxGuests: 2,
  admissionMode: "host_approval",
  videoPreset: "balanced",
  audioPreset: "voice",
  screenSharePreset: "detail",
  requestedLayouts: ["horizontal", "vertical"],
  saveToAccount: true,
};

function backend(fetcher: typeof fetch, csrfToken = "csrf-token") {
  return createHttpPorchcastBackend({
    apiBase: "https://api.example.test/porchcast",
    fetcher,
    getCsrfToken: () => csrfToken,
    createIdempotencyKey: () => "00000000-0000-4000-8000-000000000001",
  });
}

describe("HTTP Porchcast backend", () => {
  it("books through credentialed JSON transport with current CSRF and idempotency", async () => {
    const getCsrfToken = vi.fn()
      .mockReturnValueOnce("first-csrf")
      .mockReturnValueOnce("second-csrf");
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(booking))
      .mockResolvedValueOnce(Response.json(booking));
    const cloud = createHttpPorchcastBackend({
      apiBase: "https://api.example.test/porchcast/",
      fetcher,
      getCsrfToken,
      createIdempotencyKey: () => "00000000-0000-4000-8000-000000000001",
    });

    expect(await cloud.bookRoom(bookInput)).toEqual(booking);
    await cloud.bookRoom(bookInput);

    const [url, request] = fetcher.mock.calls[0]!;
    const firstHeaders = new Headers(request?.headers);
    const secondHeaders = new Headers(fetcher.mock.calls[1]![1]?.headers);
    expect(url).toBe("https://api.example.test/porchcast/v1/rooms");
    expect(request?.method).toBe("POST");
    expect(request?.credentials).toBe("include");
    expect(firstHeaders.get("accept")).toBe("application/json");
    expect(firstHeaders.get("content-type")).toBe("application/json");
    expect(firstHeaders.get("x-podcast-studio-csrf")).toBe("first-csrf");
    expect(secondHeaders.get("x-podcast-studio-csrf")).toBe("second-csrf");
    expect(firstHeaders.get("idempotency-key"))
      .toBe("00000000-0000-4000-8000-000000000001");
    expect(JSON.parse(String(request?.body))).toEqual({
      title: "Weekly show",
      hostName: "Podcast Host",
      settings: {
        maxGuests: 2,
        admissionMode: "host_approval",
        videoPreset: "balanced",
        audioPreset: "voice",
        screenSharePreset: "detail",
        requestedLayouts: ["horizontal", "vertical"],
      },
      saveToAccount: true,
    });
  });

  it("opens a room with the room capability and parses access", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(access));
    const cloud = backend(fetcher);

    const entry = await cloud.enterRoom({
      roomId,
      roomToken: hostToken,
      admissionToken,
      displayName: "Podcast Host",
    });

    expect(entry).toEqual({ kind: "joined", access });
    const [url, request] = fetcher.mock.calls[0]!;
    const headers = new Headers(request?.headers);
    expect(url).toBe(`https://api.example.test/porchcast/v1/rooms/${roomId}/access`);
    expect(request?.credentials).toBe("include");
    expect(headers.get("x-room-token")).toBe(hostToken);
    expect(headers.get("x-podcast-studio-csrf")).toBe("csrf-token");
    expect(JSON.parse(String(request?.body))).toEqual({
      token: hostToken,
      admissionToken,
      displayName: "Podcast Host",
    });
  });

  it("maps required, verified-account, and pending admission responses", async () => {
    const pendingAdmission = {
      id: admissionId,
      roomId,
      status: "pending",
      displayName: "Guest",
      verified: false,
      requestedAt: "2026-08-23T12:00:00.000Z",
      decidedAt: null,
      admittedAt: null,
      lastSeenAt: "2026-08-23T12:00:01.000Z",
      leaseExpiresAt: "2026-08-23T12:05:00.000Z",
      revision: 1,
      roomTitle: "Weekly show",
    };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({
        error: { code: "room_admission_required" },
        admission: { roomTitle: "Green room" },
      }, { status: 403 }))
      .mockResolvedValueOnce(Response.json({
        error: { code: "room_verified_account_required" },
      }, { status: 403 }))
      .mockResolvedValueOnce(Response.json({
        error: { code: "room_admission_pending" },
        admission: pendingAdmission,
      }, { status: 409 }));
    const cloud = backend(fetcher);
    const input = { roomId, roomToken: guestToken, admissionToken, displayName: "Guest" };

    await expect(cloud.enterRoom(input)).resolves.toMatchObject({
      kind: "admission",
      mode: "host_approval",
      roomTitle: "Green room",
      invitationToken: guestToken,
      admissionToken,
      admission: null,
    });
    await expect(cloud.enterRoom(input)).resolves.toMatchObject({
      kind: "admission",
      mode: "verified_wiplash",
      roomTitle: "Private podcast room",
    });
    await expect(cloud.enterRoom(input)).resolves.toMatchObject({
      kind: "admission",
      mode: "host_approval",
      roomTitle: "Weekly show",
      admissionToken: guestToken,
      admission: {
        id: admissionId,
        status: "pending",
      },
    });
  });

  it("turns an inactive invitation into a retryable room-entry result", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      error: {
        code: "room_admission_inactive",
        message: "This invitation is no longer active.",
      },
    }, { status: 410 }));

    await expect(backend(fetcher).enterRoom({
      roomId,
      roomToken: guestToken,
      admissionToken,
    })).resolves.toEqual({ kind: "invitation-inactive" });
  });

  it("keeps the original invitation separate from a resumed admission credential", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      error: { code: "room_admission_required" },
      admission: { roomTitle: "Green room" },
    }, { status: 403 }));

    await expect(backend(fetcher).enterRoom({
      roomId,
      roomToken: admissionToken,
      invitationToken: guestToken,
      admissionToken,
    })).resolves.toMatchObject({
      kind: "admission",
      invitationToken: guestToken,
      admissionToken,
    });
  });

  it("preserves server errors and supplies operation-specific fallbacks", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: { message: "Room limit reached." } }, {
        status: 403,
      }))
      .mockResolvedValueOnce(new Response("not-json", { status: 500 }));
    const cloud = backend(fetcher);

    await expect(cloud.bookRoom(bookInput)).rejects.toThrow("Room limit reached.");
    await expect(cloud.enterRoom({ roomId, admissionToken })).rejects.toThrow(
      "This room could not be opened.",
    );
  });

  it("rejects malformed successful access and pending-admission payloads", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ ...access, mediaTransport: { available: true } }))
      .mockResolvedValueOnce(Response.json({
        error: { code: "room_admission_pending" },
        admission: { roomTitle: "Incomplete" },
      }, { status: 409 }));
    const cloud = backend(fetcher);

    await expect(cloud.enterRoom({ roomId, admissionToken })).rejects.toThrow();
    await expect(cloud.enterRoom({ roomId, roomToken: guestToken, admissionToken }))
      .rejects.toThrow();
  });

  it("owns the admission request, polling, and leave lifecycle", async () => {
    const pending = {
      id: admissionId,
      roomId,
      status: "pending",
      displayName: "Guest",
      verified: false,
      requestedAt: "2026-08-23T12:00:00.000Z",
      decidedAt: null,
      admittedAt: null,
      lastSeenAt: "2026-08-23T12:00:01.000Z",
      leaseExpiresAt: "2026-08-23T12:05:00.000Z",
      revision: 1,
    };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ admission: pending, admissionToken }))
      .mockResolvedValueOnce(Response.json({
        admission: {
          ...pending,
          status: "admitted",
          decidedAt: "2026-08-23T12:00:02.000Z",
          admittedAt: "2026-08-23T12:00:02.000Z",
          revision: 2,
        },
        admissionToken,
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const cloud = backend(fetcher);

    await expect(cloud.requestAdmission({
      roomId,
      invitationToken: guestToken,
      admissionToken,
      displayName: "Guest",
    })).resolves.toMatchObject({ admission: { status: "pending" }, admissionToken });
    await expect(cloud.getAdmission({
      roomId,
      admissionId,
      admissionToken,
    })).resolves.toMatchObject({ status: "admitted", revision: 2 });
    await expect(cloud.leaveRoom({
      roomId,
      admissionId,
      roomToken: admissionToken,
    })).resolves.toBeUndefined();

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      `https://api.example.test/porchcast/v1/rooms/${roomId}/admission-requests`,
      `https://api.example.test/porchcast/v1/rooms/${roomId}/admission-requests/${admissionId}/status`,
      `https://api.example.test/porchcast/v1/rooms/${roomId}/admissions/${admissionId}/leave`,
    ]);
    expect(new Headers(fetcher.mock.calls[1]![1]?.headers).get("x-room-token"))
      .toBe(admissionToken);
    expect(new Headers(fetcher.mock.calls[2]![1]?.headers).get("x-room-token"))
      .toBe(admissionToken);
  });
});
