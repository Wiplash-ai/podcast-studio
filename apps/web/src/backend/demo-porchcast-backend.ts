import {
  MAX_ROOM_GUEST_LIMIT,
  roomAccessSchema,
  roomAdmissionSchema,
  roomBookingSchema,
  type Room,
  type RoomAdmission,
} from "@wiplash/podcast-contracts";

import type { BookRoomInput } from "../room-booking";
import type { DemoScenario } from "./demo-scenarios";
import type {
  EnterRoomInput,
  PorchcastBackend,
  RoomBooking,
  RoomEntry,
} from "./porchcast-backend";

const DEMO_CREATED_AT = "2026-08-23T12:00:00.000Z";
const DEMO_RECORDING_AT = "2026-08-23T12:05:00.000Z";
const DEMO_STOPPED_AT = "2026-08-23T12:35:00.000Z";

const defaultBookingInput = {
  title: "Porchcast demo",
  hostName: "Demo Host",
  maxGuests: 2,
  admissionMode: "invite_link",
  videoPreset: "balanced",
  audioPreset: "studio",
  screenSharePreset: "detail",
  requestedLayouts: ["horizontal", "vertical"],
  saveToAccount: false,
} satisfies BookRoomInput;

interface DemoRoomRecord {
  booking: RoomBooking;
}

interface DemoScenarioState {
  lifecycleState: Room["lifecycleState"];
  healthState: Room["healthState"];
  recordingAdapter: Room["recordingAdapter"];
  recordingEpoch: string | null;
  stoppedAt: string | null;
  warnings: Room["warnings"];
}

const scenarioState: Record<DemoScenario, DemoScenarioState> = {
  ready: {
    lifecycleState: "ready",
    healthState: "healthy",
    recordingAdapter: "server",
    recordingEpoch: DEMO_RECORDING_AT,
    stoppedAt: DEMO_STOPPED_AT,
    warnings: [],
  },
  recording: {
    lifecycleState: "recording",
    healthState: "healthy",
    recordingAdapter: "server",
    recordingEpoch: DEMO_RECORDING_AT,
    stoppedAt: null,
    warnings: [],
  },
  finalizing: {
    lifecycleState: "finalizing",
    healthState: "healthy",
    recordingAdapter: "server",
    recordingEpoch: DEMO_RECORDING_AT,
    stoppedAt: DEMO_STOPPED_AT,
    warnings: [],
  },
  "full-room": {
    lifecycleState: "armed",
    healthState: "healthy",
    recordingAdapter: null,
    recordingEpoch: null,
    stoppedAt: null,
    warnings: [],
  },
  reconnecting: {
    lifecycleState: "recording",
    healthState: "recovering",
    recordingAdapter: "server",
    recordingEpoch: DEMO_RECORDING_AT,
    stoppedAt: null,
    warnings: [
      {
        code: "demo_media_reconnecting",
        message: "Demo media is reconnecting.",
        firstObservedAt: "2026-08-23T12:20:00.000Z",
      },
    ],
  },
};

function demoUuid(namespace: number, sequence: number): string {
  const suffix = sequence.toString(16).padStart(12, "0");
  return `${namespace.toString(16).padStart(8, "0")}-0000-4000-8000-${suffix}`;
}

function demoToken(kind: "host" | "guest", sequence: number): string {
  return `demo-${kind}-${sequence.toString().padStart(4, "0")}-${kind.repeat(8)}`;
}

export const DEMO_ROOM_ID = demoUuid(1, 1);
export const DEMO_HOST_TOKEN = demoToken("host", 1);

function demoRoom(
  input: BookRoomInput,
  scenario: DemoScenario,
  sequence: number,
): Room {
  const state = scenarioState[scenario];
  const roomId = demoUuid(1, sequence);
  const hasRecording = state.recordingAdapter !== null;

  return {
    id: roomId,
    title: input.title,
    hostName: input.hostName,
    settings: {
      maxGuests: scenario === "full-room" ? MAX_ROOM_GUEST_LIMIT : input.maxGuests,
      admissionMode: input.admissionMode,
      videoPreset: input.videoPreset,
      audioPreset: input.audioPreset,
      screenSharePreset: input.screenSharePreset,
      requestedLayouts: input.requestedLayouts,
    },
    lifecycleState: state.lifecycleState,
    healthState: state.healthState,
    warnings: state.warnings,
    recordingAdapter: state.recordingAdapter,
    recordingEpoch: state.recordingEpoch,
    stoppedAt: state.stoppedAt,
    currentRecordingId: hasRecording ? demoUuid(2, sequence) : null,
    programs: [],
    createdAt: DEMO_CREATED_AT,
    updatedAt: state.warnings.at(0)?.firstObservedAt ?? state.stoppedAt ?? DEMO_CREATED_AT,
    revision: scenario === "ready" ? 3 : scenario === "recording" ? 1 : 2,
  };
}

/**
 * Deterministic local adapter for UI work. It owns no network, device-media,
 * storage, or timer APIs; each instance starts from the same in-memory state.
 */
export class DemoPorchcastBackend implements PorchcastBackend {
  readonly kind = "demo" as const;
  readonly scenario: DemoScenario;

  readonly #rooms = new Map<string, DemoRoomRecord>();
  readonly #admissions = new Map<string, RoomAdmission>();
  #nextRoomSequence = 2;
  #nextAdmissionSequence = 1;

  constructor(scenario: DemoScenario = "ready") {
    this.scenario = scenario;
    this.#storeRoom(defaultBookingInput, 1);
  }

  async bookRoom(input: BookRoomInput): Promise<RoomBooking> {
    const sequence = this.#nextRoomSequence;
    this.#nextRoomSequence += 1;

    return this.#storeRoom(input, sequence);
  }

  #storeRoom(input: BookRoomInput, sequence: number): RoomBooking {
    const room = demoRoom(input, this.scenario, sequence);
    const hostToken = demoToken("host", sequence);
    const guestToken = demoToken("guest", sequence);
    const booking = roomBookingSchema.parse({
      room,
      hostToken,
      guestInvitePath: `/?room=${room.id}&invite=${guestToken}`,
    });

    this.#rooms.set(room.id, { booking });
    return roomBookingSchema.parse(booking);
  }

  async enterRoom(input: EnterRoomInput): Promise<RoomEntry> {
    const record = this.#rooms.get(input.roomId);
    if (!record) return { kind: "invitation-inactive" };

    const access = roomAccessSchema.parse({
      room: record.booking.room,
      role: "host",
      participantId: "host",
      participantToken: record.booking.hostToken,
      vdoUrl: `https://demo.invalid/rooms/${record.booking.room.id}`,
      mediaTransport: {
        available: false,
        kind: "whip_whep",
        requiresConsent: true,
      },
      recorderAvailability: {
        local: true,
        server: false,
      },
    });

    return { kind: "joined", access };
  }

  async requestAdmission(input: Parameters<PorchcastBackend["requestAdmission"]>[0]) {
    if (!this.#rooms.has(input.roomId)) throw new Error("This demo room is unavailable.");
    const admission = roomAdmissionSchema.parse({
      id: demoUuid(3, this.#nextAdmissionSequence),
      roomId: input.roomId,
      status: "pending",
      displayName: input.displayName,
      verified: false,
      requestedAt: DEMO_CREATED_AT,
      decidedAt: null,
      admittedAt: null,
      lastSeenAt: DEMO_CREATED_AT,
      leaseExpiresAt: "2026-08-23T12:10:00.000Z",
      revision: 1,
    });
    this.#nextAdmissionSequence += 1;
    this.#admissions.set(admission.id, admission);
    return { admission, admissionToken: input.admissionToken };
  }

  async getAdmission(input: Parameters<PorchcastBackend["getAdmission"]>[0]) {
    const current = this.#admissions.get(input.admissionId);
    if (!current || current.roomId !== input.roomId) {
      throw new Error("This demo admission is unavailable.");
    }
    const admitted = roomAdmissionSchema.parse({
      ...current,
      status: "admitted",
      decidedAt: DEMO_CREATED_AT,
      admittedAt: DEMO_CREATED_AT,
      revision: current.revision + 1,
    });
    this.#admissions.set(admitted.id, admitted);
    return admitted;
  }

  async leaveRoom(input: Parameters<PorchcastBackend["leaveRoom"]>[0]) {
    const current = this.#admissions.get(input.admissionId);
    if (current?.roomId === input.roomId) {
      this.#admissions.set(current.id, roomAdmissionSchema.parse({
        ...current,
        status: "left",
        revision: current.revision + 1,
      }));
    }
  }
}

export interface DemoPorchcastBackendOptions {
  scenario?: DemoScenario;
}

export function createDemoPorchcastBackend({
  scenario = "ready",
}: DemoPorchcastBackendOptions = {}): DemoPorchcastBackend {
  return new DemoPorchcastBackend(scenario);
}
