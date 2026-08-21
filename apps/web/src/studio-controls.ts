export interface CloudMediaControlState {
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  screenSharing: boolean;
}

export const initialCloudMediaControlState: CloudMediaControlState = {
  cameraEnabled: false,
  microphoneEnabled: false,
  screenSharing: false,
};

export function cloudMediaControlLabels(state: CloudMediaControlState) {
  return {
    camera: state.cameraEnabled ? "Turn camera off" : "Turn camera on",
    microphone: state.microphoneEnabled ? "Mute" : "Unmute",
    screen: state.screenSharing ? "Stop sharing" : "Share screen",
  };
}

export type ArtifactDownloadState = "saved" | "started";
export type RoomSaveState = "hidden" | "sign-in" | "save" | "saving" | "saved" | "limit";

export type CloudProgramState = "queued" | "running" | "deferred" | "ready" | "failed";

export function recordingViewLabel(layout: "horizontal" | "vertical"): "Desktop" | "Mobile" {
  return layout === "horizontal" ? "Desktop" : "Mobile";
}

export interface SourceArtifactGroup {
  artifacts: RoomArtifact[];
  key: string;
  label: string;
  totalDurationMs: number;
  totalSizeBytes: number;
}

export interface FloatingPanelPosition {
  x: number;
  y: number;
}

export function shouldShowInitialArtifactLoading(
  loadedRoomId: string | null,
  currentRoomId: string,
): boolean {
  return loadedRoomId !== currentRoomId;
}

export function roomSaveControlState({
  busy,
  hasRoom,
  isHost,
  limitReached = false,
  saved,
  signedIn,
}: {
  busy: boolean;
  hasRoom: boolean;
  isHost: boolean;
  limitReached?: boolean;
  saved: boolean;
  signedIn: boolean;
}): RoomSaveState {
  if (!hasRoom || !isHost) return "hidden";
  if (saved) return "saved";
  if (!signedIn) return "sign-in";
  if (limitReached) return "limit";
  return busy ? "saving" : "save";
}

export function artifactDownloadLabel(
  active: boolean,
  state: ArtifactDownloadState | undefined,
): string {
  if (active) return "Saving…";
  if (state === "saved") return "Saved ✓";
  if (state === "started") return "Started ✓";
  return "Download";
}

export function cloudProgramStatusCopy(
  state: CloudProgramState,
  deferredReason: ProgramDeferredReason | null = null,
): {
  detail: string;
  label: string;
} {
  switch (state) {
    case "queued":
      return {
        label: "Queued",
        detail: "Waiting for its turn in the Cloud renderer.",
      };
    case "running":
      return {
        label: "Rendering",
        detail: "Building and validating your downloadable MP4.",
      };
    case "deferred":
      if (deferredReason === "runtime_unavailable") {
        return {
          label: "Unavailable",
          detail: "The Cloud renderer lost contact. Your source recordings are safe.",
        };
      }
      if (deferredReason === "compositor_interrupted") {
        return {
          label: "Resuming",
          detail: "The Cloud renderer is recovering an interrupted render.",
        };
      }
      if (deferredReason && deferredReason !== "media_lock_busy") {
        return {
          label: "Needs review",
          detail: "This view needs source or timeline review before rendering.",
        };
      }
      return {
        label: "Waiting",
        detail: "The renderer is busy; your isolated source tracks are safe.",
      };
    case "ready":
      return {
        label: "Ready",
        detail: "Validated and available to download below.",
      };
    case "failed":
      return {
        label: "Needs review",
        detail: "This view needs review; isolated source tracks remain preserved.",
      };
  }
}

export function groupSourceArtifacts(artifacts: readonly RoomArtifact[]): SourceArtifactGroup[] {
  const groups = new Map<string, SourceArtifactGroup>();
  for (const artifact of artifacts) {
    if (artifact.kind !== "isolated" || !artifact.participantId || !artifact.sourceKind) continue;
    const key = `${artifact.participantId}:${artifact.sourceKind}`;
    const current = groups.get(key) ?? {
      artifacts: [],
      key,
      label: `${artifact.participantId} ${artifact.sourceKind}`,
      totalDurationMs: 0,
      totalSizeBytes: 0,
    };
    current.artifacts.push(artifact);
    current.totalDurationMs += artifact.durationMs;
    current.totalSizeBytes += artifact.sizeBytes;
    groups.set(key, current);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      artifacts: group.artifacts.sort((left, right) =>
        (left.sequence ?? 0) - (right.sequence ?? 0)),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function nextChatUnreadCount(current: number): number {
  return Math.min(99, Math.max(0, current) + 1);
}

export function shouldCountChatMessage(
  senderRole: string,
  currentRole: string,
  chatOpen: boolean,
): boolean {
  return senderRole !== currentRole && !chatOpen;
}

export function roomChatControlLabel(unreadCount: number): string {
  if (unreadCount <= 0) return "Room chat";
  return `Room chat, ${unreadCount} unread ${unreadCount === 1 ? "message" : "messages"}`;
}

export function shouldSubmitChatMessage(
  key: string,
  shiftKey: boolean,
  isComposing: boolean,
): boolean {
  return key === "Enter" && !shiftKey && !isComposing;
}

export function clampFloatingPanelPosition(
  position: FloatingPanelPosition,
  containerWidth: number,
  containerHeight: number,
  panelWidth: number,
  panelHeight: number,
  margin = 8,
): FloatingPanelPosition {
  const maxX = Math.max(margin, containerWidth - panelWidth - margin);
  const maxY = Math.max(margin, containerHeight - panelHeight - margin);
  return {
    x: Math.min(maxX, Math.max(margin, Math.round(position.x))),
    y: Math.min(maxY, Math.max(margin, Math.round(position.y))),
  };
}
import type {
  ProgramDeferredReason,
  RoomArtifact,
} from "@wiplash/podcast-contracts";
