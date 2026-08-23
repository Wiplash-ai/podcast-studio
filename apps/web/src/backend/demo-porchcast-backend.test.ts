import {
  MAX_ROOM_GUEST_LIMIT,
  roomAccessSchema,
  roomBookingSchema,
} from "@wiplash/podcast-contracts";
import { describe, expect, it, vi } from "vitest";

import type { BookRoomInput } from "../room-booking";
import { demoScenarioIds, type DemoScenario } from "./demo-scenarios";
import {
  DEMO_HOST_TOKEN,
  DEMO_ROOM_ID,
  createDemoPorchcastBackend,
} from "./demo-porchcast-backend";

const bookingInput = {
  title: "Sunday porch",
  hostName: "Morgan",
  maxGuests: 2,
  admissionMode: "host_approval",
  videoPreset: "balanced",
  audioPreset: "studio",
  screenSharePreset: "detail",
  requestedLayouts: ["horizontal", "vertical"],
  saveToAccount: false,
} satisfies BookRoomInput;

const expectedLifecycle: Record<DemoScenario, string> = {
  ready: "ready",
  recording: "recording",
  finalizing: "finalizing",
  "full-room": "armed",
  reconnecting: "recording",
};

describe("DemoPorchcastBackend", () => {
  it("returns identical schema-valid bookings from fresh adapters", async () => {
    const first = await createDemoPorchcastBackend().bookRoom(bookingInput);
    const second = await createDemoPorchcastBackend().bookRoom(bookingInput);

    expect(first).toEqual(second);
    expect(roomBookingSchema.parse(first)).toEqual(first);
    expect(first).toMatchObject({
      room: {
        id: "00000001-0000-4000-8000-000000000002",
        title: bookingInput.title,
        hostName: bookingInput.hostName,
      },
    });
    expect(first.hostToken.length).toBeGreaterThanOrEqual(32);
    expect(first.guestInvitePath).toContain(first.room.id);
  });

  it.each(demoScenarioIds)("materializes the %s lifecycle deterministically", async (scenario) => {
    const booking = await createDemoPorchcastBackend({ scenario }).bookRoom(bookingInput);

    expect(booking.room.lifecycleState).toBe(expectedLifecycle[scenario]);
    expect(booking.room.settings.maxGuests).toBe(
      scenario === "full-room" ? MAX_ROOM_GUEST_LIMIT : bookingInput.maxGuests,
    );
    expect(booking.room.healthState).toBe(scenario === "reconnecting" ? "recovering" : "healthy");
    expect(booking.room.warnings).toHaveLength(scenario === "reconnecting" ? 1 : 0);
  });

  it("enters a booked room as the host with media APIs disabled", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const backend = createDemoPorchcastBackend({ scenario: "recording" });
    const booking = await backend.bookRoom(bookingInput);
    const entry = await backend.enterRoom({
      roomId: booking.room.id,
      admissionToken: "ignored-in-deterministic-demo",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(entry.kind).toBe("joined");
    if (entry.kind !== "joined") throw new Error("Expected the demo host to join");
    expect(roomAccessSchema.parse(entry.access)).toEqual(entry.access);
    expect(entry.access).toMatchObject({
      role: "host",
      participantId: "host",
      participantToken: booking.hostToken,
      mediaTransport: { available: false },
      recorderAvailability: { server: false },
    });
    expect(new URL(entry.access.vdoUrl).hostname).toBe("demo.invalid");

    fetchSpy.mockRestore();
  });

  it("provides a stable default host entry for direct demo links", async () => {
    const backend = createDemoPorchcastBackend({ scenario: "finalizing" });
    const entry = await backend.enterRoom({
      roomId: DEMO_ROOM_ID,
      roomToken: DEMO_HOST_TOKEN,
      admissionToken: "unused-for-the-default-host",
    });

    expect(entry.kind).toBe("joined");
    if (entry.kind !== "joined") throw new Error("Expected the default demo host to join");
    expect(entry.access).toMatchObject({
      role: "host",
      participantId: "host",
      participantToken: DEMO_HOST_TOKEN,
      room: {
        id: DEMO_ROOM_ID,
        lifecycleState: "finalizing",
      },
    });
  });

  it("keeps state per adapter and rejects unknown invitations", async () => {
    const backend = createDemoPorchcastBackend();
    const first = await backend.bookRoom(bookingInput);
    const second = await backend.bookRoom({ ...bookingInput, title: "Second porch" });

    expect(second.room.id).not.toBe(first.room.id);
    expect(await createDemoPorchcastBackend().enterRoom({
      roomId: first.room.id,
      admissionToken: "not-shared-between-adapters",
    })).toEqual({ kind: "invitation-inactive" });
  });

  it("simulates admission and leave without a service", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const backend = createDemoPorchcastBackend();
    const request = await backend.requestAdmission({
      roomId: DEMO_ROOM_ID,
      invitationToken: "demo-invitation",
      admissionToken: "demo-admission-token",
      displayName: "Demo Guest",
    });

    expect(request.admission.status).toBe("pending");
    await expect(backend.getAdmission({
      roomId: DEMO_ROOM_ID,
      admissionId: request.admission.id,
      admissionToken: request.admissionToken,
    })).resolves.toMatchObject({ status: "admitted", revision: 2 });
    await expect(backend.leaveRoom({
      roomId: DEMO_ROOM_ID,
      admissionId: request.admission.id,
      roomToken: request.admissionToken,
    })).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
