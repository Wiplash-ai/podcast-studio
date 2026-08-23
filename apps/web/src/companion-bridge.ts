import {
  porchcastCompanionStateRequestSchema,
  type PorchcastCompanionStateMessage,
  type PorchcastCompanionStatus,
  type Room,
  type RoomAccess,
} from "@wiplash/podcast-contracts";

export function companionStatusForRoom(
  room: Pick<Room, "lifecycleState" | "programs">,
  recordingActive: boolean,
): PorchcastCompanionStatus {
  if (recordingActive || room.lifecycleState === "recording") return "recording";
  if (
    room.lifecycleState === "finalizing"
    || room.programs.some((program) => ["queued", "running", "deferred"].includes(program.state))
  ) return "rendering";
  if (
    room.lifecycleState === "failed"
    || room.lifecycleState === "cancelled"
    || room.programs.some((program) => program.state === "failed")
  ) return "attention";
  if (
    room.lifecycleState === "ready"
    && (room.programs.length === 0 || room.programs.every((program) => program.state === "ready"))
  ) return "ready";
  return "live";
}

export function companionStateMessage(
  access: RoomAccess | null,
  recordingActive: boolean,
): PorchcastCompanionStateMessage {
  if (!access) {
    return {
      protocol: "porchcast-companion",
      version: 1,
      source: "porchcast-web",
      type: "state",
      payload: {
        revision: 0,
        porch: null,
        status: "unknown",
        capabilities: { account: true, downloads: false, invite: false },
        noticeKey: null,
      },
    };
  }
  const status = companionStatusForRoom(access.room, recordingActive);
  return {
    protocol: "porchcast-companion",
    version: 1,
    source: "porchcast-web",
    type: "state",
    payload: {
      revision: access.room.revision,
      porch: {
        id: access.room.id,
        title: access.room.title,
        role: access.role,
      },
      status,
      capabilities: {
        account: true,
        downloads: access.role === "host" && access.room.currentRecordingId !== null,
        invite: access.role === "host" && access.room.settings.maxGuests > 0,
      },
      noticeKey: status === "ready" && access.room.currentRecordingId
        ? `${access.room.currentRecordingId}:ready`
        : null,
    },
  };
}

export function isCompanionStateRequest(event: MessageEvent<unknown>): boolean {
  return event.source === window
    && event.origin === window.location.origin
    && porchcastCompanionStateRequestSchema.safeParse(event.data).success;
}
