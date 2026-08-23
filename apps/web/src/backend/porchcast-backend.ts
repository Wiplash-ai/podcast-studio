import {
  roomBookingSchema,
  type RoomAccess,
  type RoomAdmission,
  type RoomAdmissionMode,
} from "@wiplash/podcast-contracts";

import type { BookRoomInput } from "../room-booking";

export type RoomBooking = ReturnType<typeof roomBookingSchema.parse>;

export interface EnterRoomInput {
  roomId: string;
  roomToken?: string;
  invitationToken?: string;
  admissionToken: string;
  displayName?: string;
}

export interface RequestAdmissionInput {
  roomId: string;
  invitationToken: string;
  admissionToken: string;
  displayName: string;
}

export interface AdmissionStatusInput {
  roomId: string;
  admissionId: string;
  admissionToken: string;
}

export interface LeaveRoomInput {
  roomId: string;
  admissionId: string;
  roomToken: string;
}

export interface AdmissionRequest {
  admission: RoomAdmission;
  admissionToken: string;
}

export type RoomEntry =
  | { kind: "joined"; access: RoomAccess }
  | { kind: "invitation-inactive" }
  | {
    kind: "admission";
    mode: Exclude<RoomAdmissionMode, "invite_link">;
    roomId: string;
    roomTitle: string;
    invitationToken: string;
    admissionToken: string;
    admission: RoomAdmission | null;
  };

/**
 * Deep boundary for opening a Porch. Adapters own transport details, response
 * validation, error semantics, credentials, and idempotency.
 */
export interface PorchcastBackend {
  readonly kind: "cloud" | "demo";
  bookRoom(input: BookRoomInput): Promise<RoomBooking>;
  enterRoom(input: EnterRoomInput): Promise<RoomEntry>;
  requestAdmission(input: RequestAdmissionInput): Promise<AdmissionRequest>;
  getAdmission(input: AdmissionStatusInput): Promise<RoomAdmission>;
  leaveRoom(input: LeaveRoomInput): Promise<void>;
}
