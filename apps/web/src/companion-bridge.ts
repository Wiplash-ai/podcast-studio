import {
  porchcastCompanionStateRequestSchema,
  type AccountRecordingLibrary,
  type AccountRoomSummary,
  type PorchcastCompanionStateMessage,
  type PorchcastCompanionStatus,
  type Room,
  type RoomAccess,
} from "@wiplash/podcast-contracts";

export interface CompanionAccountSource {
  status: "checking" | "available" | "unavailable";
  signedIn: boolean;
  rooms: AccountRoomSummary[];
  recordingLibrary: AccountRecordingLibrary | null;
}

export function companionLaunchIntent(search: string): "account" | "book" | null {
  const query = new URLSearchParams(search);
  if (query.get("account") === "1") return "account";
  if (query.get("book") === "1") return "book";
  return null;
}

const signedOutAccount: PorchcastCompanionStateMessage["payload"]["account"] = {
  state: "signed_out",
  porches: [],
  recordings: [],
};

export function companionAccountState(
  source: CompanionAccountSource | null,
): PorchcastCompanionStateMessage["payload"]["account"] {
  if (!source) return signedOutAccount;
  if (source.status === "checking") return { ...signedOutAccount, state: "checking" };
  if (source.status === "unavailable") return { ...signedOutAccount, state: "unavailable" };
  if (!source.signedIn) return signedOutAccount;
  return {
    state: source.recordingLibrary ? "ready" : "degraded",
    porches: source.rooms.slice(0, 20).map((entry) => ({
      id: entry.room.id,
      title: entry.room.title,
      lifecycleState: entry.room.lifecycleState,
      updatedAt: entry.room.updatedAt,
    })),
    recordings: (source.recordingLibrary?.recordings ?? []).slice(0, 20).map((entry) => ({
      id: entry.recording.id,
      porchId: entry.recording.roomId,
      name: entry.recording.name,
      porchTitle: entry.roomTitle,
      lifecycleState: entry.recording.lifecycleState,
      createdAt: entry.recording.createdAt,
      durationSeconds: entry.durationSeconds,
    })),
  };
}

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
  accountSource: CompanionAccountSource | null = null,
  revision = 0,
): PorchcastCompanionStateMessage {
  const account = companionAccountState(accountSource);
  if (!access) {
    return {
      protocol: "porchcast-companion",
      version: 1,
      source: "porchcast-web",
      type: "state",
      payload: {
        revision,
        porch: null,
        status: "unknown",
        capabilities: { account: true, downloads: false, invite: false },
        account,
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
      revision,
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
      account,
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
