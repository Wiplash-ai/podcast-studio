import {
  roomAccessSchema,
  roomAdmissionResponseSchema,
  roomAdmissionSchema,
  roomBookingSchema,
} from "@wiplash/podcast-contracts";

import { apiUrl } from "../public-path";
import type {
  EnterRoomInput,
  PorchcastBackend,
  RoomEntry,
} from "./porchcast-backend";

export interface HttpPorchcastBackendOptions {
  getCsrfToken: () => string | null | undefined;
  fetcher?: typeof fetch;
  createIdempotencyKey?: () => string;
  apiBase?: string;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function responseError(payload: unknown): { code: string; message?: string } {
  const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
  return {
    code: typeof error?.code === "string" ? error.code : "",
    message: typeof error?.message === "string" && error.message.trim()
      ? error.message
      : undefined,
  };
}

function admissionPayload(payload: unknown): JsonRecord | null {
  return isRecord(payload) && isRecord(payload.admission) ? payload.admission : null;
}

function requestHeaders(
  csrfToken: string | null | undefined,
  roomToken = "",
  extra: HeadersInit = {},
): Headers {
  const headers = new Headers(extra);
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  if (roomToken) headers.set("X-Room-Token", roomToken);
  if (csrfToken) headers.set("X-Podcast-Studio-CSRF", csrfToken);
  return headers;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function mapAdmissionEntry(input: EnterRoomInput, payload: unknown, code: string): RoomEntry {
  const admission = admissionPayload(payload);
  const pendingAdmission = code === "room_admission_pending"
    ? roomAdmissionSchema.parse(admission)
    : null;

  return {
    kind: "admission",
    mode: code === "room_verified_account_required" ? "verified_wiplash" : "host_approval",
    roomId: input.roomId,
    roomTitle: typeof admission?.roomTitle === "string"
      ? admission.roomTitle
      : "Private podcast room",
    invitationToken: input.invitationToken ?? input.roomToken ?? "",
    admissionToken: pendingAdmission
      ? input.roomToken ?? input.admissionToken
      : input.admissionToken,
    admission: pendingAdmission,
  };
}

export function createHttpPorchcastBackend(
  options: HttpPorchcastBackendOptions,
): PorchcastBackend {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const createIdempotencyKey = options.createIdempotencyKey
    ?? (() => globalThis.crypto.randomUUID());
  const resolveUrl = (path: string) => options.apiBase === undefined
    ? apiUrl(path)
    : apiUrl(path, options.apiBase);

  return {
    kind: "cloud",

    async bookRoom(input) {
      const response = await fetcher(resolveUrl("/v1/rooms"), {
        method: "POST",
        credentials: "include",
        headers: requestHeaders(options.getCsrfToken(), "", {
          "Idempotency-Key": createIdempotencyKey(),
        }),
        body: JSON.stringify({
          title: input.title,
          hostName: input.hostName,
          settings: {
            maxGuests: input.maxGuests,
            admissionMode: input.admissionMode,
            videoPreset: input.videoPreset,
            audioPreset: input.audioPreset,
            screenSharePreset: input.screenSharePreset,
            requestedLayouts: input.requestedLayouts,
          },
          saveToAccount: input.saveToAccount,
        }),
      });
      const payload = await readJson(response);
      if (!response.ok) {
        throw new Error(responseError(payload).message ?? "The room could not be booked.");
      }
      return roomBookingSchema.parse(payload);
    },

    async enterRoom(input) {
      const response = await fetcher(
        resolveUrl(`/v1/rooms/${encodeURIComponent(input.roomId)}/access`),
        {
          method: "POST",
          credentials: "include",
          headers: requestHeaders(options.getCsrfToken(), input.roomToken),
          body: JSON.stringify(input.roomToken ? {
            token: input.roomToken,
            admissionToken: input.admissionToken,
            displayName: input.displayName,
          } : {}),
        },
      );
      const payload = await readJson(response);
      if (response.ok) {
        return { kind: "joined", access: roomAccessSchema.parse(payload) };
      }

      const failure = responseError(payload);
      if (failure.code === "room_admission_inactive") {
        return { kind: "invitation-inactive" };
      }
      if ([
        "room_admission_required",
        "room_admission_pending",
        "room_verified_account_required",
      ].includes(failure.code)) {
        return mapAdmissionEntry(input, payload, failure.code);
      }
      throw new Error(failure.message ?? "This room could not be opened.");
    },

    async requestAdmission(input) {
      const response = await fetcher(
        resolveUrl(`/v1/rooms/${encodeURIComponent(input.roomId)}/admission-requests`),
        {
          method: "POST",
          credentials: "include",
          headers: requestHeaders(options.getCsrfToken()),
          body: JSON.stringify({
            invitationToken: input.invitationToken,
            admissionToken: input.admissionToken,
            displayName: input.displayName,
          }),
        },
      );
      const payload = await readJson(response);
      if (!response.ok) {
        throw new Error(responseError(payload).message ?? "The host could not be notified.");
      }
      return roomAdmissionResponseSchema.parse(payload);
    },

    async getAdmission(input) {
      const response = await fetcher(resolveUrl(
        `/v1/rooms/${encodeURIComponent(input.roomId)}/admission-requests/${encodeURIComponent(input.admissionId)}/status`,
      ), {
        credentials: "include",
        headers: requestHeaders(options.getCsrfToken(), input.admissionToken),
      });
      const payload = await readJson(response);
      if (!response.ok) {
        throw new Error(responseError(payload).message ?? "The waiting room could not be refreshed.");
      }
      return roomAdmissionResponseSchema.parse(payload).admission;
    },

    async leaveRoom(input) {
      const response = await fetcher(resolveUrl(
        `/v1/rooms/${encodeURIComponent(input.roomId)}/admissions/${encodeURIComponent(input.admissionId)}/leave`,
      ), {
        method: "POST",
        credentials: "include",
        headers: requestHeaders(options.getCsrfToken(), input.roomToken),
      });
      if (!response.ok) {
        const payload = await readJson(response);
        throw new Error(responseError(payload).message ?? "The room could not be left cleanly.");
      }
    },
  };
}
