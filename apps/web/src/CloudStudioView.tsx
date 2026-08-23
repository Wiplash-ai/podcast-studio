import {
  roomAdmissionListSchema,
  roomAdmissionSchema,
  roomArtifactListSchema,
  roomChatMessageListSchema,
  roomChatMessageSchema,
  roomChatGifSearchResponseSchema,
  roomRecordingListSchema,
  roomRecordingSchema,
  roomSchema,
  type AccountRecordingAllowance,
  type Room,
  type RoomAccess,
  type RoomAdmission,
  type RoomAdmissionMode,
  type RoomArtifact,
  type RoomChatAttachment,
  type RoomChatGifResult,
  type RoomChatMessage,
  type RoomRecording,
} from "@wiplash/podcast-contracts";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { AdmissionModeSelect, admissionModeOptions } from "./AdmissionModeSelect";
import {
  chatEmojis,
  insertChatEmoji,
  matchingChatEmojis,
  type ChatEmoji,
} from "./chat-composer";
import {
  CloudMediaStage,
  type CloudMediaStageHandle,
  type CloudParticipantViewState,
  type ParticipantViewMode,
} from "./CloudMediaStage";
import type { MediaMetrics } from "./media-transport";
import {
  compositePictureInPictureSupported,
  type PictureInPictureMode,
} from "./picture-in-picture";
import {
  apiUrl,
  appPath,
  extensionDestination,
  invitationUrl,
} from "./public-path";
import {
  artifactDownloadLabel,
  clampFloatingPanelPosition,
  cloudMediaControlLabels,
  cloudProgramStatusCopy,
  groupSourceArtifacts,
  initialCloudMediaControlState,
  nextChatUnreadCount,
  recordingViewLabel,
  roomChatControlLabel,
  shouldCountChatMessage,
  shouldShowInitialArtifactLoading,
  shouldSubmitChatMessage,
  type ArtifactDownloadState,
  type FloatingPanelPosition,
} from "./studio-controls";
import { formatRecordingClock, roomRequestHeaders } from "./studio-utils";
import { StudioIcon } from "./StudioIcon";
import { useTransientMessage } from "./use-transient-message";
import { VDO_ORIGIN, type ImportedVdoRoom } from "./vdo-url";

import "./CloudStudioView.css";

function formatArtifactDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatArtifactSize(sizeBytes: number): string {
  if (sizeBytes < 1_000_000) return `${Math.max(1, Math.round(sizeBytes / 1_000))} KB`;
  return `${(sizeBytes / 1_000_000).toFixed(sizeBytes >= 100_000_000 ? 0 : 1)} MB`;
}

function RoomChatAttachmentView({
  accountCsrfToken,
  attachment,
  roomToken,
}: {
  accountCsrfToken: string;
  attachment: RoomChatAttachment;
  roomToken: string;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void fetch(apiUrl(attachment.downloadPath), {
      credentials: "include",
      headers: roomRequestHeaders(roomToken, accountCsrfToken),
    }).then(async (response) => {
      if (!response.ok) throw new Error("Shared file unavailable");
      objectUrl = URL.createObjectURL(await response.blob());
      if (active) {
        setSource(objectUrl);
      } else {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accountCsrfToken, attachment.downloadPath, roomToken]);

  if (failed) return <div className="chat-attachment-state">This shared file is unavailable.</div>;
  if (!source) return <div className="chat-attachment-state"><i />Preparing {attachment.kind}…</div>;
  return (
    <figure className={`chat-attachment chat-attachment-${attachment.kind}`}>
      {attachment.kind === "image" || attachment.kind === "gif"
        ? <img alt={attachment.fileName} loading="lazy" src={source} />
        : attachment.kind === "audio"
          ? <audio controls preload="metadata" src={source} />
          : <video controls playsInline preload="metadata" src={source} />}
      <figcaption>
        <span><strong>{attachment.fileName}</strong><small>{formatArtifactSize(attachment.sizeBytes)}{attachment.provider === "tenor" ? " · Via Tenor" : ""}</small></span>
        <a download={attachment.fileName} href={source} title={`Download ${attachment.fileName}`}>↓</a>
      </figcaption>
    </figure>
  );
}

function formatRecordingSession(recording: RoomRecording): string {
  const timestamp = recording.recordingEpoch ?? recording.createdAt;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return recording.name;
  return date.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
export function CloudStudioView({
  access,
  accountCsrfToken,
  accountRecordingAllowance,
  canReissueInvitation,
  guestInvitePath,
  invitationBusy,
  signedIn,
  roomToken,
  importedRoom,
  onLeaveRoom,
  onRecordingChange,
  onRecordingQuotaRequired,
  onReissueInvitation,
  onRoomUpdate,
  onSignInRequired,
}: {
  access: RoomAccess | null;
  accountCsrfToken: string;
  accountRecordingAllowance: AccountRecordingAllowance | null;
  canReissueInvitation: boolean;
  guestInvitePath: string | null;
  invitationBusy: boolean;
  signedIn: boolean;
  roomToken: string;
  importedRoom: ImportedVdoRoom | null;
  onLeaveRoom: () => Promise<void> | void;
  onRecordingChange: (recording: boolean) => void;
  onRecordingQuotaRequired: () => void;
  onReissueInvitation: () => Promise<string>;
  onRoomUpdate: (room: Room) => void;
  onSignInRequired: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const cloudMediaRef = useRef<CloudMediaStageHandle>(null);
  const stageFrameRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const pictureInPictureMenuRef = useRef<HTMLDivElement>(null);
  const downloadsPanelRef = useRef<HTMLElement>(null);
  const browserRecorderRef = useRef<MediaRecorder | null>(null);
  const browserChunksRef = useRef<Blob[]>([]);
  const finalizationRunRef = useRef(0);
  const chatOpenRef = useRef(false);
  const chatComposerRef = useRef<HTMLFormElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);
  const knownChatMessageIdsRef = useRef(new Set<string>());
  const downloadsAutoOpenedKeyRef = useRef<string | null>(null);
  const artifactsLoadedRoomRef = useRef<string | null>(null);
  const downloadsDragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startPanelX: number;
    startPanelY: number;
  } | null>(null);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [cloudMediaConnected, setCloudMediaConnected] = useState(false);
  const [mediaMetrics, setMediaMetrics] = useState<MediaMetrics | null>(null);
  const [participantState, setParticipantState] = useState("Waiting for studio setup");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [pictureInPictureMenuOpen, setPictureInPictureMenuOpen] = useState(false);
  const [pictureInPictureMode, setPictureInPictureMode] = useState<PictureInPictureMode | null>(null);
  const [participantViewState, setParticipantViewState] = useState<CloudParticipantViewState>({
    canSwap: false,
    mode: "auto",
    resolvedMode: "equal",
    selfFirst: false,
  });
  const [chatOpen, setChatOpen] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatUploadBusy, setChatUploadBusy] = useState(false);
  const [chatCursor, setChatCursor] = useState(0);
  const [chatEmojiIndex, setChatEmojiIndex] = useState(0);
  const [chatEmojiPickerOpen, setChatEmojiPickerOpen] = useState(false);
  const [chatGifOpen, setChatGifOpen] = useState(false);
  const [chatGifQuery, setChatGifQuery] = useState("");
  const [chatGifResults, setChatGifResults] = useState<RoomChatGifResult[]>([]);
  const [chatGifBusy, setChatGifBusy] = useState(false);
  const [chatGifError, setChatGifError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRotationConfirm, setInviteRotationConfirm] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [admissions, setAdmissions] = useState<RoomAdmission[]>([]);
  const [admissionBusyId, setAdmissionBusyId] = useState<string | null>(null);
  const [admissionPolicyBusy, setAdmissionPolicyBusy] = useState(false);
  const [recordMenuOpen, setRecordMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hangingUp, setHangingUp] = useState(false);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [downloadsDragging, setDownloadsDragging] = useState(false);
  const [downloadsPosition, setDownloadsPosition] = useState<FloatingPanelPosition | null>(null);
  const [recordings, setRecordings] = useState<RoomRecording[]>([]);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<RoomArtifact[]>([]);
  const [artifactsBusy, setArtifactsBusy] = useState(false);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [downloadingArtifactId, setDownloadingArtifactId] = useState<string | null>(null);
  const [artifactDownloadStates, setArtifactDownloadStates] = useState<Record<string, ArtifactDownloadState>>({});
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [cloudMediaControlState, setCloudMediaControlState] = useState(initialCloudMediaControlState);
  const [error, setError] = useTransientMessage();
  const [now, setNow] = useState(Date.now());
  const [importedRecording, setImportedRecording] = useState(false);
  const [importedRecordingEpoch, setImportedRecordingEpoch] = useState<string | null>(null);
  const room = access?.room ?? null;
  const chatEmojiSuggestions = useMemo(
    () => matchingChatEmojis(chatDraft, chatCursor),
    [chatCursor, chatDraft],
  );
  const title = room?.title ?? importedRoom?.roomName ?? "Imported room";
  const role = access?.role ?? importedRoom?.role ?? "guest";
  const isHost = role === "host";
  const recording = room ? room.lifecycleState === "recording" : importedRecording;
  const recordingQuotaExhausted = accountRecordingAllowance?.plan === "free"
    && accountRecordingAllowance.remainingSeconds === 0;
  const recordingEpoch = room?.recordingEpoch ?? importedRecordingEpoch;
  const mediaUrl = access?.vdoUrl ?? importedRoom?.vdoUrl ?? "";
  const usesCloudMedia = Boolean(access?.mediaTransport.available);
  const pictureInPictureSupported = usesCloudMedia && compositePictureInPictureSupported();
  const usesServerRecorder = usesCloudMedia && Boolean(access?.recorderAvailability.server);
  const cloudControlLabels = cloudMediaControlLabels(cloudMediaControlState);
  const cloudRecordings = recordings.filter((candidate) =>
    candidate.recordingAdapter === "server",
  );
  const selectedRecording = cloudRecordings.find((candidate) =>
    candidate.id === selectedRecordingId,
  ) ?? cloudRecordings[0] ?? null;
  const programFingerprint = selectedRecording?.programs
    .map((program) => `${program.layout}:${program.state}:${program.attempt}:${program.updatedAt}`)
    .join("|") ?? "";
  const cloudProgramsPreparing = selectedRecording?.programs.some((program) =>
    ["queued", "running"].includes(program.state)
    || (program.state === "deferred"
      && ["media_lock_busy", "compositor_interrupted"].includes(program.deferredReason ?? ""))) ?? false;
  const cloudProgramNeedsReview = selectedRecording?.programs.some((program) =>
    program.state === "failed"
    || (program.state === "deferred" && !["media_lock_busy", "compositor_interrupted"]
      .includes(program.deferredReason ?? ""))) ?? false;
  const programArtifacts = artifacts.filter((artifact) => artifact.kind === "program");
  const sourceArtifactGroups = groupSourceArtifacts(artifacts);
  const sourceArtifactCount = sourceArtifactGroups.reduce(
    (total, group) => total + group.artifacts.length,
    0,
  );
  const cloudDownloadsStatus = selectedRecording?.lifecycleState === "finalizing"
    ? "finalizing"
    : cloudProgramsPreparing
    ? "preparing"
    : cloudProgramNeedsReview || artifactError
      ? "attention"
      : artifactsBusy
        ? "loading"
        : artifacts.length > 0
          ? "ready"
          : "empty";
  const cloudDownloadsLabel = cloudDownloadsStatus === "finalizing"
    ? "Recording is safely finalizing in the Cloud"
    : cloudDownloadsStatus === "preparing"
    ? "Recording downloads, programs are rendering"
    : cloudDownloadsStatus === "loading"
      ? "Recording downloads are loading"
      : cloudDownloadsStatus === "ready"
        ? programArtifacts.length > 0
          ? `Recording downloads, ${programArtifacts.length} finished ${programArtifacts.length === 1 ? "video" : "videos"} ready`
          : `Recording downloads, ${sourceArtifactCount} recovery ${sourceArtifactCount === 1 ? "part" : "parts"} safe`
        : cloudDownloadsStatus === "attention"
          ? "Recording downloads need attention"
          : "Recording downloads";
  const downloadsPositioned = downloadsPosition !== null;

  useEffect(() => {
    if (usesCloudMedia) {
      setMediaLoaded(true);
      setParticipantState("Choose devices and confirm consent to join");
    }
  }, [usesCloudMedia]);

  useEffect(() => {
    knownChatMessageIdsRef.current.clear();
    chatOpenRef.current = false;
    downloadsAutoOpenedKeyRef.current = null;
    artifactsLoadedRoomRef.current = null;
    downloadsDragRef.current = null;
    setChatMessages([]);
    setChatUnreadCount(0);
    setChatOpen(false);
    setChatExpanded(false);
    setChatEmojiPickerOpen(false);
    setChatGifOpen(false);
    setChatGifResults([]);
    setChatGifError(null);
    setPictureInPictureMenuOpen(false);
    setPictureInPictureMode(null);
    setDownloadsOpen(false);
    setDownloadsPosition(null);
    setDownloadsDragging(false);
    setRecordings([]);
    setSelectedRecordingId(null);
  }, [room?.id]);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
    if (chatOpen) setChatUnreadCount(0);
  }, [chatOpen]);

  useEffect(() => {
    if (!viewMenuOpen) return;
    function dismissViewMenu(event: PointerEvent) {
      if (event.target instanceof Node && !viewMenuRef.current?.contains(event.target)) {
        setViewMenuOpen(false);
      }
    }
    function dismissViewMenuWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") setViewMenuOpen(false);
    }
    document.addEventListener("pointerdown", dismissViewMenu);
    document.addEventListener("keydown", dismissViewMenuWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", dismissViewMenu);
      document.removeEventListener("keydown", dismissViewMenuWithKeyboard);
    };
  }, [viewMenuOpen]);

  useEffect(() => {
    if (!pictureInPictureMenuOpen) return;
    function dismissPictureInPictureMenu(event: PointerEvent) {
      if (
        event.target instanceof Node
        && !pictureInPictureMenuRef.current?.contains(event.target)
      ) {
        setPictureInPictureMenuOpen(false);
      }
    }
    function dismissPictureInPictureMenuWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") setPictureInPictureMenuOpen(false);
    }
    document.addEventListener("pointerdown", dismissPictureInPictureMenu);
    document.addEventListener("keydown", dismissPictureInPictureMenuWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", dismissPictureInPictureMenu);
      document.removeEventListener("keydown", dismissPictureInPictureMenuWithKeyboard);
    };
  }, [pictureInPictureMenuOpen]);

  useEffect(() => {
    if (!downloadsOpen || !downloadsPositioned) return;
    function constrainDownloadsPanel() {
      const panel = downloadsPanelRef.current;
      const stage = stageFrameRef.current;
      if (!panel || !stage) return;
      setDownloadsPosition((current) => {
        if (!current) return current;
        const next = clampFloatingPanelPosition(
          current,
          stage.clientWidth,
          stage.clientHeight,
          panel.offsetWidth,
          panel.offsetHeight,
        );
        return next.x === current.x && next.y === current.y ? current : next;
      });
    }
    const animationFrame = window.requestAnimationFrame(constrainDownloadsPanel);
    const observer = new ResizeObserver(constrainDownloadsPanel);
    if (stageFrameRef.current) observer.observe(stageFrameRef.current);
    if (downloadsPanelRef.current) observer.observe(downloadsPanelRef.current);
    window.addEventListener("resize", constrainDownloadsPanel);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener("resize", constrainDownloadsPanel);
    };
  }, [downloadsOpen, downloadsPositioned]);

  useEffect(() => {
    if (!room) return;
    const controller = new AbortController();
    void (async () => {
      let reconnectAttempt = 0;
      while (!controller.signal.aborted) {
        try {
          const response = await fetch(apiUrl(`/v1/rooms/${room.id}/events`), {
            credentials: "include",
            headers: roomRequestHeaders(roomToken, accountCsrfToken),
            signal: controller.signal,
          });
          if (!response.ok || !response.body) throw new Error("Room status is unavailable.");
          const recovered = reconnectAttempt > 0;
          reconnectAttempt = 0;
          if (recovered) setParticipantState("Room status connection restored");
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!controller.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) throw new Error("Room status stream closed.");
            buffer += decoder.decode(value, { stream: true });
            const messages = buffer.split("\n\n");
            buffer = messages.pop() ?? "";
            for (const message of messages) {
              const eventName = message.split("\n")
                .find((line) => line.startsWith("event: "))
                ?.slice(7);
              const data = message.split("\n")
                .filter((line) => line.startsWith("data: "))
                .map((line) => line.slice(6))
                .join("\n");
              if (!data) continue;
              if (eventName === "room") onRoomUpdate(roomSchema.parse(JSON.parse(data)));
              if (eventName === "recording") {
                const next = roomRecordingSchema.parse(JSON.parse(data));
                setRecordings((current) => [
                  next,
                  ...current.filter((recording) => recording.id !== next.id),
                ].sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
                if (next.recordingAdapter === "server" && [
                  "finalizing",
                  "ready",
                  "failed",
                ].includes(next.lifecycleState)) setSelectedRecordingId(next.id);
              }
              if (eventName === "chat") {
                const next = roomChatMessageSchema.parse(JSON.parse(data));
                if (!knownChatMessageIdsRef.current.has(next.id)) {
                  knownChatMessageIdsRef.current.add(next.id);
                  setChatMessages((current) => [...current, next]
                    .sort((left, right) => left.sequence - right.sequence));
                  if (shouldCountChatMessage(
                    next.participantId,
                    access?.participantId ?? role,
                    chatOpenRef.current,
                  )) {
                    setChatUnreadCount(nextChatUnreadCount);
                  }
                }
              }
            }
          }
        } catch {
          if (controller.signal.aborted) break;
          setParticipantState("Room status connection interrupted — reconnecting");
          const delay = Math.min(8_000, 500 * (2 ** Math.min(reconnectAttempt, 4)));
          reconnectAttempt += 1;
          await new Promise((resolve) => window.setTimeout(resolve, delay));
        }
      }
    })();
    return () => controller.abort();
  }, [access?.participantId, accountCsrfToken, room?.id, roomToken, role]);

  useEffect(() => {
    if (!room || role !== "guest" || !access?.admissionId) return;
    const controller = new AbortController();
    const heartbeat = () => void fetch(apiUrl(
      `/v1/rooms/${room.id}/admissions/${access.admissionId}/heartbeat`,
    ), {
      method: "POST",
      credentials: "include",
      headers: roomRequestHeaders(roomToken, accountCsrfToken),
      signal: controller.signal,
    }).catch(() => undefined);
    heartbeat();
    const timer = window.setInterval(heartbeat, 30_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [access?.admissionId, accountCsrfToken, role, room?.id, roomToken]);

  useEffect(() => {
    if (!room || !isHost || room.settings.maxGuests === 0) {
      setAdmissions([]);
      return;
    }
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(apiUrl(`/v1/rooms/${room.id}/admission-requests`), {
          credentials: "include",
          headers: roomRequestHeaders(roomToken, accountCsrfToken),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("The guest lobby is unavailable.");
        const payload: unknown = await response.json();
        if (!controller.signal.aborted) {
          setAdmissions(roomAdmissionListSchema.parse(payload).admissions);
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "The guest lobby is unavailable.");
        }
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 3_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [accountCsrfToken, isHost, room?.id, room?.settings.maxGuests, roomToken]);

  useEffect(() => {
    if (!room) return;
    const controller = new AbortController();
    void fetch(apiUrl(`/v1/rooms/${room.id}/chat-messages`), {
      credentials: "include",
      headers: roomRequestHeaders(roomToken, accountCsrfToken),
      signal: controller.signal,
    }).then(async (response) => {
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error("Room chat is unavailable.");
      if (!controller.signal.aborted) {
        const messages = roomChatMessageListSchema.parse(payload).messages;
        messages.forEach((message) => knownChatMessageIdsRef.current.add(message.id));
        setChatMessages((current) => {
          const merged = new Map(current.map((message) => [message.id, message]));
          messages.forEach((message) => merged.set(message.id, message));
          return [...merged.values()].sort((left, right) => left.sequence - right.sequence);
        });
      }
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "Room chat is unavailable.");
      }
    });
    return () => controller.abort();
  }, [accountCsrfToken, room?.id, roomToken]);

  useEffect(() => {
    if (!room || !isHost) return;
    const controller = new AbortController();
    void fetch(apiUrl(`/v1/rooms/${room.id}/recordings`), {
      credentials: "include",
      headers: roomRequestHeaders(roomToken, accountCsrfToken),
      signal: controller.signal,
    }).then(async (response) => {
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error("Recording history is unavailable.");
      if (controller.signal.aborted) return;
      const next = roomRecordingListSchema.parse(payload).recordings;
      setRecordings(next);
      setSelectedRecordingId((selected) => {
        const selectedStillExists = next.some((recording) => recording.id === selected);
        const latestCloud = next.find((recording) => recording.recordingAdapter === "server");
        const currentCloud = next.find((recording) =>
          recording.id === room.currentRecordingId
          && recording.recordingAdapter === "server"
        );
        return currentCloud?.id ?? (selectedStillExists ? selected : latestCloud?.id ?? null);
      });
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : "Recording history is unavailable.");
      }
    });
    return () => controller.abort();
  }, [accountCsrfToken, isHost, room?.currentRecordingId, room?.id, room?.revision, roomToken]);

  useEffect(() => {
    if (room?.lifecycleState !== "ready" || room.programs.length === 0) return;
    if (room.programs.every((program) => program.state === "ready")) {
      setParticipantState("Cloud recording ready — isolated sources and programs verified");
    } else if (room.programs.some((program) => program.state === "queued" || program.state === "running")) {
      setParticipantState("Isolated sources verified — Cloud programs are being prepared");
    } else if (room.programs.some((program) => program.state === "deferred")) {
      setParticipantState("Isolated sources verified — Cloud programs are waiting for the compositor");
    } else if (room.programs.some((program) => program.state === "failed")) {
      setParticipantState("Isolated sources verified — a Cloud program needs review");
    }
  }, [room?.lifecycleState, room?.programs]);

  useEffect(() => {
    if (
      !room
      || !isHost
      || !selectedRecording
    ) return;
    const controller = new AbortController();
    const autoOpenKey = `${room.id}:${selectedRecording.id}`;
    if (downloadsAutoOpenedKeyRef.current !== autoOpenKey) {
      downloadsAutoOpenedKeyRef.current = autoOpenKey;
      setArtifacts([]);
      setArtifactDownloadStates({});
      setDownloadNotice(null);
      setDownloadsPosition(null);
      setDownloadsOpen(true);
    }
    if (!["ready", "failed"].includes(selectedRecording.lifecycleState)) {
      setArtifacts([]);
      setArtifactError(null);
      setArtifactsBusy(false);
      return;
    }
    const showInitialLoading = shouldShowInitialArtifactLoading(
      artifactsLoadedRoomRef.current,
      selectedRecording.id,
    );
    if (showInitialLoading) setArtifactsBusy(true);
    setArtifactError(null);
    void fetch(apiUrl(`/v1/rooms/${room.id}/recordings/${selectedRecording.id}/artifacts`), {
      credentials: "include",
      headers: roomRequestHeaders(roomToken, accountCsrfToken),
      signal: controller.signal,
    }).then(async (response) => {
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          (payload as { error?: { message?: string } }).error?.message
            ?? "Cloud downloads are not available yet.",
        );
      }
      if (controller.signal.aborted) return;
      setArtifacts(roomArtifactListSchema.parse(payload).artifacts);
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      setArtifactError(reason instanceof Error ? reason.message : "Cloud downloads could not be loaded.");
    }).finally(() => {
      if (!controller.signal.aborted) {
        artifactsLoadedRoomRef.current = selectedRecording.id;
        setArtifactsBusy(false);
      }
    });
    return () => controller.abort();
  }, [accountCsrfToken, isHost, programFingerprint, room?.id, roomToken, selectedRecording?.id]);

  useEffect(() => {
    function receiveVdoMessage(event: MessageEvent<unknown>) {
      if (event.origin !== VDO_ORIGIN || event.source !== iframeRef.current?.contentWindow) return;
      if (!event.data || typeof event.data !== "object") return;
      const action = "action" in event.data ? String(event.data.action) : "";
      if (action === "guest-connected") setParticipantState("A guest connected");
      if (action === "guest-disconnected") setParticipantState("A guest disconnected");
      if (action === "view-connection") setParticipantState("Media connection active");
    }
    window.addEventListener("message", receiveVdoMessage);
    return () => window.removeEventListener("message", receiveVdoMessage);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [recording]);

  useEffect(() => {
    onRecordingChange(recording);
  }, [onRecordingChange, recording]);

  useEffect(() => () => {
    finalizationRunRef.current += 1;
  }, []);

  function postToVdo(message: Record<string, unknown>) {
    iframeRef.current?.contentWindow?.postMessage(message, VDO_ORIGIN);
  }

  function rememberChatMessage(next: RoomChatMessage) {
    if (knownChatMessageIdsRef.current.has(next.id)) return;
    knownChatMessageIdsRef.current.add(next.id);
    setChatMessages((current) => [...current, next]
      .sort((left, right) => left.sequence - right.sequence));
  }

  async function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = chatDraft.trim();
    if (!room || !body || chatBusy) return;
    setChatBusy(true);
    try {
      const response = await fetch(apiUrl(`/v1/rooms/${room.id}/chat-messages`), {
        method: "POST",
        credentials: "include",
        headers: roomRequestHeaders(roomToken, accountCsrfToken, {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        }),
        body: JSON.stringify({ body }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error((payload as { error?: { message?: string } }).error?.message ?? "Your message could not be sent.");
      }
      const next = roomChatMessageSchema.parse(payload);
      rememberChatMessage(next);
      setChatDraft("");
      setChatCursor(0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your message could not be sent.");
    } finally {
      setChatBusy(false);
    }
  }

  function applyChatEmoji(emoji: ChatEmoji) {
    const insertion = insertChatEmoji(chatDraft, chatCursor, emoji);
    setChatDraft(insertion.value);
    setChatCursor(insertion.cursor);
    setChatEmojiIndex(0);
    setChatEmojiPickerOpen(false);
    window.requestAnimationFrame(() => {
      chatTextareaRef.current?.focus();
      chatTextareaRef.current?.setSelectionRange(insertion.cursor, insertion.cursor);
    });
  }

  async function uploadChatAttachment(file: File) {
    if (!room || chatUploadBusy) return;
    if (!file.type || file.size <= 0 || file.size > 25 * 1_024 * 1_024) {
      setError("Choose a supported image, audio file, or video file up to 25 MB.");
      return;
    }
    setChatUploadBusy(true);
    setChatGifError(null);
    try {
      const response = await fetch(apiUrl(`/v1/rooms/${room.id}/chat-attachments`), {
        method: "POST",
        body: file,
        credentials: "include",
        headers: roomRequestHeaders(roomToken, accountCsrfToken, {
          "Content-Type": file.type,
          "Idempotency-Key": crypto.randomUUID(),
          "X-File-Name": encodeURIComponent(file.name),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error((payload as { error?: { message?: string } }).error?.message
          ?? "That file could not be shared.");
      }
      rememberChatMessage(roomChatMessageSchema.parse(payload));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That file could not be shared.");
    } finally {
      setChatUploadBusy(false);
    }
  }

  async function searchChatGifs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = chatGifQuery.trim();
    if (!room || !query || chatGifBusy) return;
    setChatGifBusy(true);
    setChatGifError(null);
    try {
      const response = await fetch(apiUrl(
        `/v1/rooms/${room.id}/chat-gifs/search?q=${encodeURIComponent(query)}`,
      ), {
        credentials: "include",
        headers: roomRequestHeaders(roomToken, accountCsrfToken),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error((payload as { error?: { message?: string } }).error?.message
          ?? "GIF search could not be reached.");
      }
      setChatGifResults(roomChatGifSearchResponseSchema.parse(payload).results);
    } catch (reason) {
      setChatGifResults([]);
      setChatGifError(reason instanceof Error ? reason.message : "GIF search could not be reached.");
    } finally {
      setChatGifBusy(false);
    }
  }

  async function shareChatGif(gif: RoomChatGifResult) {
    if (!room || chatGifBusy) return;
    setChatGifBusy(true);
    setChatGifError(null);
    try {
      const response = await fetch(apiUrl(`/v1/rooms/${room.id}/chat-gifs`), {
        method: "POST",
        credentials: "include",
        headers: roomRequestHeaders(roomToken, accountCsrfToken, {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        }),
        body: JSON.stringify({ id: gif.id, query: chatGifQuery.trim() }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error((payload as { error?: { message?: string } }).error?.message
          ?? "That GIF could not be shared.");
      }
      rememberChatMessage(roomChatMessageSchema.parse(payload));
      setChatGifOpen(false);
      setChatGifResults([]);
    } catch (reason) {
      setChatGifError(reason instanceof Error ? reason.message : "That GIF could not be shared.");
    } finally {
      setChatGifBusy(false);
    }
  }

  function handleChatKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (!event.nativeEvent.isComposing && chatEmojiSuggestions.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setChatEmojiIndex((current) => {
          const direction = event.key === "ArrowDown" ? 1 : -1;
          return (current + direction + chatEmojiSuggestions.length) % chatEmojiSuggestions.length;
        });
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault();
        applyChatEmoji(chatEmojiSuggestions[chatEmojiIndex] ?? chatEmojiSuggestions[0]!);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setChatCursor(-1);
        return;
      }
    }
    if (!shouldSubmitChatMessage(event.key, event.shiftKey, event.nativeEvent.isComposing)) return;
    event.preventDefault();
    if (!chatBusy && chatDraft.trim()) event.currentTarget.form?.requestSubmit();
  }

  function closeChat() {
    chatOpenRef.current = false;
    setChatOpen(false);
    setChatEmojiPickerOpen(false);
    setChatGifOpen(false);
  }

  function toggleChat() {
    const next = !chatOpenRef.current;
    chatOpenRef.current = next;
    setChatOpen(next);
    if (next) setChatUnreadCount(0);
  }

  function startDownloadsDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || window.innerWidth <= 760) return;
    if (event.target instanceof Element && event.target.closest("button, a, input")) return;
    const panel = downloadsPanelRef.current;
    const stage = stageFrameRef.current;
    if (!panel || !stage) return;
    const panelBounds = panel.getBoundingClientRect();
    const stageBounds = stage.getBoundingClientRect();
    downloadsDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPanelX: panelBounds.left - stageBounds.left,
      startPanelY: panelBounds.top - stageBounds.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDownloadsDragging(true);
    event.preventDefault();
  }

  function moveDownloadsPanel(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = downloadsDragRef.current;
    const panel = downloadsPanelRef.current;
    const stage = stageFrameRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !panel || !stage) return;
    setDownloadsPosition(clampFloatingPanelPosition(
      {
        x: drag.startPanelX + event.clientX - drag.startClientX,
        y: drag.startPanelY + event.clientY - drag.startClientY,
      },
      stage.clientWidth,
      stage.clientHeight,
      panel.offsetWidth,
      panel.offsetHeight,
    ));
  }

  function stopDownloadsDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (downloadsDragRef.current?.pointerId !== event.pointerId) return;
    downloadsDragRef.current = null;
    setDownloadsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function copyInviteLink() {
    if (!guestInvitePath) return;
    await navigator.clipboard.writeText(invitationUrl(guestInvitePath));
    setInviteCopied(true);
    window.setTimeout(() => setInviteCopied(false), 1_800);
  }

  async function replaceInviteLink() {
    try {
      await onReissueInvitation();
      setInviteRotationConfirm(false);
      setInviteCopied(false);
    } catch (reason) {
      setError(reason instanceof Error
        ? reason.message
        : "A fresh guest invitation could not be created.");
    }
  }

  async function decideAdmission(admissionId: string, decision: "admit" | "deny") {
    if (!room || admissionBusyId) return;
    setAdmissionBusyId(admissionId);
    setError(null);
    try {
      const response = await fetch(apiUrl(
        `/v1/rooms/${room.id}/admission-requests/${admissionId}/decision`,
      ), {
        method: "POST",
        credentials: "include",
        headers: roomRequestHeaders(roomToken, accountCsrfToken, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ decision }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error((payload as { error?: { message?: string } }).error?.message
          ?? "The guest request could not be updated.");
      }
      const next = roomAdmissionSchema.parse(payload);
      setAdmissions((current) => current.map((candidate) =>
        candidate.id === admissionId ? next : candidate,
      ));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The guest request could not be updated.");
    } finally {
      setAdmissionBusyId(null);
    }
  }

  async function changeAdmissionPolicy(admissionMode: RoomAdmissionMode) {
    if (!room || admissionPolicyBusy || room.settings.admissionMode === admissionMode) return;
    setAdmissionPolicyBusy(true);
    setError(null);
    try {
      const response = await fetch(apiUrl(`/v1/rooms/${room.id}/admission-policy`), {
        method: "PATCH",
        credentials: "include",
        headers: roomRequestHeaders(roomToken, accountCsrfToken, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ admissionMode }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error((payload as { error?: { message?: string } }).error?.message
          ?? "The room access setting could not be changed.");
      }
      onRoomUpdate(roomSchema.parse(payload));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The room access setting could not be changed.");
    } finally {
      setAdmissionPolicyBusy(false);
    }
  }

  async function leaveRoom() {
    if (hangingUp) return;
    if (recording) {
      setError("Stop & save the recording before hanging up so the Cloud recorder can finalize it safely.");
      return;
    }
    setHangingUp(true);
    try {
      try {
        if (usesCloudMedia) {
          await cloudMediaRef.current?.close();
        } else {
          postToVdo({ close: true });
        }
      } finally {
        await onLeaveRoom();
      }
    } finally {
      setHangingUp(false);
    }
  }

  async function downloadCloudArtifact(artifact: RoomArtifact) {
    if (downloadingArtifactId) return;
    setDownloadingArtifactId(artifact.artifactId);
    setArtifactError(null);
    setDownloadNotice(null);
    setArtifactDownloadStates((current) => {
      const next = { ...current };
      delete next[artifact.artifactId];
      return next;
    });
    try {
      type DownloadWritable = WritableStream<Uint8Array> & { abort?: () => Promise<void> };
      type DownloadHandle = { createWritable: () => Promise<DownloadWritable> };
      const savePicker = (window as unknown as {
        showSaveFilePicker?: (options: { suggestedName: string }) => Promise<DownloadHandle>;
      }).showSaveFilePicker;
      let writable: DownloadWritable | null = null;
      if (savePicker) {
        try {
          const handle = await savePicker({ suggestedName: artifact.fileName });
          writable = await handle.createWritable();
        } catch (reason) {
          if (reason instanceof DOMException && reason.name === "AbortError") return;
          throw reason;
        }
      }
      const response = await fetch(apiUrl(artifact.downloadPath), {
        credentials: "include",
        headers: roomRequestHeaders(roomToken, accountCsrfToken),
      });
      if (!response.ok) {
        await writable?.abort?.();
        const payload = await response.json().catch(() => null) as {
          error?: { message?: string };
        } | null;
        throw new Error(payload?.error?.message ?? "This Cloud recording could not be downloaded.");
      }
      if (writable && response.body) {
        await response.body.pipeTo(writable);
        setArtifactDownloadStates((current) => ({
          ...current,
          [artifact.artifactId]: "saved",
        }));
        setDownloadNotice(`${artifact.fileName} was saved.`);
      } else {
        const blob = await response.blob();
        if (blob.size !== artifact.sizeBytes) {
          throw new Error("The downloaded file did not match its finalized size.");
        }
        const objectUrl = URL.createObjectURL(blob);
        const download = document.createElement("a");
        download.href = objectUrl;
        download.download = artifact.fileName;
        download.click();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
        setArtifactDownloadStates((current) => ({
          ...current,
          [artifact.artifactId]: "started",
        }));
        setDownloadNotice(`Download started for ${artifact.fileName}.`);
      }
    } catch (reason) {
      setArtifactError(reason instanceof Error ? reason.message : "This Cloud recording could not be downloaded.");
    } finally {
      setDownloadingArtifactId(null);
    }
  }

  async function command(
    path: "arm" | "start" | "stop" | "finalize",
    body?: unknown,
  ): Promise<Room> {
    if (!room) throw new Error("This imported room is not connected to the recorder API.");
    const headers: Record<string, string> = {
      ...roomRequestHeaders(roomToken, accountCsrfToken),
      "Idempotency-Key": crypto.randomUUID(),
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(apiUrl(`/v1/rooms/${room.id}/${path}`), {
      method: "POST",
      credentials: "include",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(
        (payload as { error?: { message?: string } }).error?.message ?? "The room command failed.",
      );
    }
    return roomSchema.parse(payload);
  }

  async function reconcileCloudRecording(recordingId: string) {
    const run = ++finalizationRunRef.current;
    try {
      if (!room) return;
      const response = await fetch(apiUrl(
        `/v1/rooms/${room.id}/recordings/${recordingId}/finalize`,
      ), {
        method: "POST",
        credentials: "include",
        headers: roomRequestHeaders(roomToken, accountCsrfToken, {
          "Idempotency-Key": crypto.randomUUID(),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error((payload as { error?: { message?: string } }).error?.message
          ?? "Cloud finalization could not be acknowledged.");
      }
      if (finalizationRunRef.current !== run) return;
      roomSchema.parse(payload);
      setParticipantState("Recording stopped — Cloud finalization continues safely in the background");
    } catch (reason) {
      if (finalizationRunRef.current !== run) return;
      setParticipantState("Recording stopped — Cloud finalization continues in the background");
      setError(`${reason instanceof Error ? reason.message : "Cloud finalization was interrupted."} The server will keep retrying without this page.`);
    }
  }

  function startBrowserRecording(stream: MediaStream) {
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    const mimeType = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    browserChunksRef.current = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) browserChunksRef.current.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      const blob = new Blob(browserChunksRef.current, { type: recorder.mimeType });
      browserChunksRef.current = [];
      if (!blob.size) return;
      const download = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      download.href = objectUrl;
      download.download = `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "podcast"}-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
      download.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    });
    recorder.start(5_000);
    browserRecorderRef.current = recorder;
  }

  function stopBrowserRecording() {
    const recorder = browserRecorderRef.current;
    browserRecorderRef.current = null;
    if (recorder?.state !== "inactive") recorder?.stop();
  }

  async function toggleRecording() {
    if (!isHost) return;
    setBusy(true);
    setError(null);
    try {
      if (!room) {
        if (importedRecording) {
          postToVdo({ record: false });
          setImportedRecording(false);
          setParticipantState("Recording stopped — the browser is saving the file");
        } else {
          const epoch = new Date().toISOString();
          postToVdo({ record: true });
          setImportedRecordingEpoch(epoch);
          setImportedRecording(true);
          setNow(Date.now());
          setParticipantState("Browser recording in progress");
        }
        return;
      }

      let current = room;
      if (["created", "finalizing", "ready", "failed", "cancelled"].includes(current.lifecycleState)) {
        current = await command("arm");
        onRoomUpdate(current);
      }
      if (current.lifecycleState === "armed") {
        const recording = await command("start", {
          adapter: usesServerRecorder ? "server" : usesCloudMedia ? "browser_local" : "vdo_local",
        });
        if (usesCloudMedia && !usesServerRecorder) {
          const stream = cloudMediaRef.current?.getLocalStream();
          if (!stream) throw new Error("Choose camera and microphone before recording.");
          startBrowserRecording(stream);
        } else if (!usesCloudMedia) {
          postToVdo({ record: true });
        }
        onRoomUpdate(recording);
        setNow(Date.now());
        setParticipantState(usesServerRecorder
          ? "Cloud recorder acknowledged — recording isolated sources"
          : "Browser recording in progress");
      } else if (current.lifecycleState === "recording") {
        if (usesCloudMedia) {
          if (!usesServerRecorder) stopBrowserRecording();
        } else postToVdo({ record: false });
        const stopped = await command("stop");
        onRoomUpdate(stopped);
        setParticipantState(usesServerRecorder
          ? "Cloud recording stopped — isolated sources are finalizing"
          : "Recording stopped — the browser is saving the file");
        if (usesServerRecorder && stopped.currentRecordingId) {
          void reconcileCloudRecording(stopped.currentRecordingId);
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The recording command failed.");
    } finally {
      setBusy(false);
    }
  }

  const canRecord = signedIn && mediaLoaded && isHost && (
    !room || ["created", "armed", "recording", "finalizing", "ready", "failed", "cancelled"].includes(room.lifecycleState)
  ) && (recording || !usesCloudMedia || (cloudMediaConnected && usesServerRecorder));
  const hasCloudRecording = Boolean(
    room
    && isHost
    && cloudRecordings.length > 0,
  );
  const pendingAdmissions = admissions.filter((admission) => admission.status === "pending");

  return (
    <main className="studio-main">
      {error ? <div className="studio-error" role="alert">{error}<button onClick={() => setError(null)}>×</button></div> : null}
      <section className="studio-header">
        <div>
          <p className="eyebrow">Rooms / {isHost ? "Host" : "Guest"}</p>
          <h1>{title}</h1>
        </div>
        <a
          className="extension-callout"
          href={extensionDestination()}
          rel="noreferrer"
          target="_blank"
        >
          <img alt="" src={`${appPath()}porchcast-mark.svg`} />
          <span><strong>Get the browser companion</strong><small>Porch shortcuts + recording-ready alerts</small></span>
          <i aria-hidden="true">&#8599;</i>
        </a>
      </section>

      <section className={`studio-workspace ${chatOpen ? "chat-open" : ""} ${chatExpanded ? "chat-expanded" : ""}`}>
        {chatOpen && room ? (
          <aside className="room-chat" aria-label="Room chat">
            <header>
              <div><span className="panel-kicker">ROOM CHAT</span><h2>Conversation</h2></div>
              <div className="chat-header-actions">
                <button
                  aria-label={chatExpanded ? "Use compact chat" : "Expand chat"}
                  aria-pressed={chatExpanded}
                  onClick={() => setChatExpanded((current) => !current)}
                  title={chatExpanded ? "Use compact chat" : "Expand chat"}
                  type="button"
                ><svg aria-hidden="true" viewBox="0 0 24 24"><path d={chatExpanded ? "M9 4v5H4M15 20v-5h5M4 9l5-5M20 15l-5 5" : "M9 4H4v5M15 20h5v-5M4 4l5 5M20 20l-5-5"} /></svg></button>
                <button aria-label="Close chat" onClick={closeChat} title="Close chat" type="button">×</button>
              </div>
            </header>
            <div className="chat-thread" aria-live="polite">
              {chatMessages.length === 0 ? <div className="chat-empty"><StudioIcon name="chat" /><strong>No messages yet</strong><span>Say hello without interrupting the recording.</span></div> : null}
              {chatMessages.map((message) => <article className={message.participantId === role ? "mine" : ""} key={message.id}>
                <div><strong>{message.displayName}</strong><time>{new Date(message.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div>
                {message.body ? <p>{message.body}</p> : null}
                {message.attachment ? <RoomChatAttachmentView accountCsrfToken={accountCsrfToken} attachment={message.attachment} roomToken={roomToken} /> : null}
              </article>)}
            </div>
            {chatGifOpen ? <section className="chat-gif-panel" aria-label="GIF search">
              <form onSubmit={(event) => void searchChatGifs(event)}>
                <input aria-label="Search Tenor GIFs" maxLength={50} onChange={(event) => setChatGifQuery(event.target.value)} placeholder="Search Tenor" type="search" value={chatGifQuery} />
                <button disabled={chatGifBusy || !chatGifQuery.trim()} type="submit">{chatGifBusy ? "…" : "Search"}</button>
              </form>
              {chatGifError ? <p role="status">{chatGifError}</p> : null}
              {chatGifResults.length > 0 ? <div className="chat-gif-results">{chatGifResults.map((gif) => <button aria-label={`Share ${gif.title || "GIF"}`} disabled={chatGifBusy} key={gif.id} onClick={() => void shareChatGif(gif)} type="button"><img alt="" height={gif.height} loading="lazy" referrerPolicy="no-referrer" src={gif.previewUrl} width={gif.width} /></button>)}</div> : null}
              <small>Powered by Tenor</small>
            </section> : null}
            <form className="chat-compose" onSubmit={(event) => void sendChatMessage(event)} ref={chatComposerRef}>
              {chatEmojiSuggestions.length > 0 && !chatEmojiPickerOpen ? <div className="chat-emoji-suggestions" role="listbox">
                {chatEmojiSuggestions.map((emoji, index) => <button
                  aria-selected={chatEmojiIndex === index}
                  className={chatEmojiIndex === index ? "active" : ""}
                  key={emoji.name}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applyChatEmoji(emoji)}
                  role="option"
                  type="button"
                ><span>{emoji.emoji}</span><strong>:{emoji.name}:</strong></button>)}
              </div> : null}
              {chatEmojiPickerOpen ? <div className="chat-emoji-picker" aria-label="Emoji" role="listbox">
                {chatEmojis.map((emoji) => <button aria-label={emoji.name.replaceAll("_", " ")} key={emoji.name} onClick={() => applyChatEmoji(emoji)} title={`:${emoji.name}:`} type="button">{emoji.emoji}</button>)}
              </div> : null}
              <input
                accept="image/jpeg,image/png,image/gif,image/webp,audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/webm,video/mp4,video/webm"
                aria-hidden="true"
                className="chat-file-input"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadChatAttachment(file);
                  event.target.value = "";
                }}
                ref={chatFileInputRef}
                tabIndex={-1}
                type="file"
              />
              <div className="chat-compose-toolbar">
                <button aria-expanded={chatEmojiPickerOpen} aria-label="Choose emoji" className={chatEmojiPickerOpen ? "active" : ""} onClick={() => { setChatEmojiPickerOpen((current) => !current); setChatGifOpen(false); }} title="Emoji" type="button">☺</button>
                <button aria-expanded={chatGifOpen} aria-label="Search GIFs" className={chatGifOpen ? "active" : ""} onClick={() => { setChatGifOpen((current) => !current); setChatEmojiPickerOpen(false); }} title="GIFs" type="button"><span>GIF</span></button>
                <button aria-label="Share an image, audio file, or video" disabled={chatUploadBusy} onClick={() => chatFileInputRef.current?.click()} title="Share media" type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 12 5.8-5.8a3.5 3.5 0 0 1 5 5L11 20a6 6 0 0 1-8.5-8.5l9-9" /></svg></button>
                {chatUploadBusy ? <span className="chat-upload-state">Uploading…</span> : <span className="chat-compose-hint">Enter to send · Shift+Enter for a line</span>}
              </div>
              <div className="chat-compose-entry">
                <textarea
                  aria-label="Chat message"
                  maxLength={1_000}
                  onChange={(event) => {
                    setChatDraft(event.target.value);
                    setChatCursor(event.target.selectionStart);
                    setChatEmojiIndex(0);
                  }}
                  onClick={(event) => setChatCursor(event.currentTarget.selectionStart)}
                  onKeyDown={handleChatKeyDown}
                  onKeyUp={(event) => setChatCursor(event.currentTarget.selectionStart)}
                  placeholder="Message the room…"
                  ref={chatTextareaRef}
                  rows={2}
                  value={chatDraft}
                />
                <button className="chat-send" disabled={chatBusy || !chatDraft.trim()} type="submit" aria-label="Send message"><span aria-hidden="true">↑</span></button>
              </div>
            </form>
          </aside>
        ) : null}
        <div className="stage-column">
          <div className="stage-frame" ref={stageFrameRef}>
            <div className="stage-meta">
              <span>LIVE ROOM</span>
              <span
                className={recording ? "recording" : "standby"}
                data-tooltip={recording ? "Cloud recording is in progress." : "You are in the room, but recording has not started."}
                tabIndex={0}
              ><i />{recording ? "REC" : "STANDBY"}</span>
              <time>{formatRecordingClock(recordingEpoch, room?.stoppedAt ?? null, recording, now)}</time>
            </div>
            {isHost && pendingAdmissions.length > 0 ? (
              <section className="admission-lobby" aria-label="Guests waiting to join">
                <header><span>{pendingAdmissions.length}</span><div><strong>Waiting to join</strong><small>Camera and microphone are still off</small></div></header>
                {pendingAdmissions.map((admission) => (
                  <div className="admission-lobby-request" key={admission.id}>
                    <span>{admission.displayName.slice(0, 1).toUpperCase()}</span>
                    <div><strong>{admission.displayName}</strong><small>{admission.verified ? "Verified Wiplash user" : "Guest invitation"}</small></div>
                    <button disabled={Boolean(admissionBusyId)} onClick={() => void decideAdmission(admission.id, "deny")} type="button">Deny</button>
                    <button className="admit" disabled={Boolean(admissionBusyId)} onClick={() => void decideAdmission(admission.id, "admit")} type="button">Admit</button>
                  </div>
                ))}
              </section>
            ) : null}
            {usesCloudMedia && access ? (
              <CloudMediaStage
                accountCsrfToken={accountCsrfToken}
                access={access}
                onCancel={() => void leaveRoom()}
                onConnectedChange={setCloudMediaConnected}
                onControlStateChange={setCloudMediaControlState}
                onError={setError}
                onMetrics={setMediaMetrics}
                onPictureInPictureChange={setPictureInPictureMode}
                onStateChange={setParticipantState}
                onViewStateChange={setParticipantViewState}
                ref={cloudMediaRef}
                recordingEpoch={recordingEpoch}
                roomToken={roomToken}
              />
            ) : (
              <iframe
                allow="camera *; microphone *; fullscreen *; display-capture *; autoplay *; screen-wake-lock *"
                allowFullScreen
                onLoad={() => {
                  setMediaLoaded(true);
                  setParticipantState("Studio loaded — complete device setup");
                }}
                ref={iframeRef}
                referrerPolicy="no-referrer"
                src={mediaUrl}
                title={`${title} media room`}
              />
            )}
            <div className="studio-state-toast" aria-live="polite">
              <i aria-hidden="true" />
              <span>{participantState}</span>
            </div>
            <div className="stage-controls-overlay">
              <div className="studio-controls" aria-label="Studio controls">
                <button
                  aria-label={usesCloudMedia ? cloudControlLabels.microphone : "Toggle microphone"}
                  aria-pressed={usesCloudMedia ? !cloudMediaControlState.microphoneEnabled : undefined}
                  className={usesCloudMedia && !cloudMediaControlState.microphoneEnabled ? "control-off" : undefined}
                  data-tooltip={usesCloudMedia ? cloudControlLabels.microphone : "Microphone"}
                  disabled={usesCloudMedia && !cloudMediaConnected}
                  onClick={() => usesCloudMedia ? cloudMediaRef.current?.toggleMicrophone() : postToVdo({ mic: "toggle" })}
                  type="button"
                ><StudioIcon name="microphone" /><span className="sr-only">{usesCloudMedia ? cloudControlLabels.microphone : "Microphone"}</span></button>
                <button
                  aria-label={usesCloudMedia ? cloudControlLabels.camera : "Toggle camera"}
                  aria-pressed={usesCloudMedia ? !cloudMediaControlState.cameraEnabled : undefined}
                  className={usesCloudMedia && !cloudMediaControlState.cameraEnabled ? "control-off" : undefined}
                  data-tooltip={usesCloudMedia ? cloudControlLabels.camera : "Camera"}
                  disabled={usesCloudMedia && !cloudMediaConnected}
                  onClick={() => usesCloudMedia ? cloudMediaRef.current?.toggleCamera() : postToVdo({ camera: "toggle" })}
                  type="button"
                ><StudioIcon name="camera" /><span className="sr-only">{usesCloudMedia ? cloudControlLabels.camera : "Camera"}</span></button>
                <button
                  aria-label={usesCloudMedia ? cloudControlLabels.screen : "Toggle screen share"}
                  aria-pressed={usesCloudMedia ? cloudMediaControlState.screenSharing : undefined}
                  className={usesCloudMedia && cloudMediaControlState.screenSharing ? "control-active" : undefined}
                  data-tooltip={usesCloudMedia ? cloudControlLabels.screen : "Share screen"}
                  disabled={usesCloudMedia && !cloudMediaConnected}
                  onClick={() => {
                    if (usesCloudMedia) {
                      void cloudMediaRef.current?.toggleScreenShare().catch((reason: unknown) => {
                        setError(reason instanceof Error ? reason.message : "Screen sharing could not start.");
                      });
                    } else postToVdo({ action: "togglescreenshare" });
                  }}
                  type="button"
                ><StudioIcon name="screen" /><span className="sr-only">{usesCloudMedia ? cloudControlLabels.screen : "Share screen"}</span></button>
                {usesCloudMedia ? <div className="control-popover-anchor" ref={pictureInPictureMenuRef}>
                  <button
                    aria-expanded={pictureInPictureMenuOpen}
                    aria-label={pictureInPictureMode ? "Picture-in-picture options, floating view open" : "Picture-in-picture options"}
                    className={pictureInPictureMode || pictureInPictureMenuOpen ? "control-active" : undefined}
                    data-tooltip={pictureInPictureSupported ? pictureInPictureMode ? "Floating view is open" : "Picture in picture" : "Picture in picture is not supported by this browser"}
                    disabled={!cloudMediaConnected || !pictureInPictureSupported}
                    onClick={() => setPictureInPictureMenuOpen((current) => !current)}
                    type="button"
                  ><StudioIcon name="picture-in-picture" /><span className="sr-only">Picture in picture</span></button>
                  {pictureInPictureMenuOpen ? <div className="picture-in-picture-menu control-popover" role="menu">
                    <div><span>FLOATING VIEW</span><strong>{pictureInPictureMode ? "Open on your desktop" : "Choose who to see"}</strong></div>
                    <p className="picture-in-picture-caption-note">Guest audio follows Everyone and Guests only, so Chrome Live Caption can hear the conversation. Your microphone stays out to prevent echo.</p>
                    {([
                      ["everyone", "Everyone", "Guests and your camera"],
                      ["guests", "Guests only", "Keep the focus on the conversation"],
                      ["self", "Just me", "A private floating self monitor"],
                    ] as Array<[PictureInPictureMode, string, string]>).map(([mode, label, detail]) => <button
                      aria-checked={pictureInPictureMode === mode}
                      className={pictureInPictureMode === mode ? "active" : ""}
                      key={mode}
                      onClick={() => {
                        setPictureInPictureMenuOpen(false);
                        void cloudMediaRef.current?.setPictureInPictureMode(mode).catch((reason: unknown) => {
                          setError(reason instanceof Error ? reason.message : "Picture in picture could not open.");
                        });
                      }}
                      role="menuitemradio"
                      type="button"
                    ><span><strong>{label}</strong><small>{detail}</small></span><i /></button>)}
                    {pictureInPictureMode ? <button
                      className="picture-in-picture-close"
                      onClick={() => {
                        setPictureInPictureMenuOpen(false);
                        void cloudMediaRef.current?.setPictureInPictureMode(null);
                      }}
                      type="button"
                    ><span><strong>Close floating view</strong><small>Keep the room running here</small></span></button> : null}
                  </div> : null}
                </div> : null}
                {room ? <button
                  aria-expanded={chatOpen}
                  aria-label={roomChatControlLabel(chatUnreadCount)}
                  className={[chatOpen ? "control-active" : "", chatUnreadCount > 0 ? "has-unread" : ""].filter(Boolean).join(" ") || undefined}
                  data-count={chatUnreadCount || undefined}
                  data-tooltip={chatUnreadCount > 0 ? `${chatUnreadCount} unread ${chatUnreadCount === 1 ? "message" : "messages"}` : "Room chat"}
                  onClick={toggleChat}
                  type="button"
                ><StudioIcon name="chat" /><span className="sr-only">Room chat</span></button> : null}
                {usesCloudMedia ? <div className="control-popover-anchor" ref={viewMenuRef}>
                  <button
                    aria-expanded={viewMenuOpen}
                    aria-label="View settings"
                    className={viewMenuOpen ? "control-active" : undefined}
                    data-tooltip="View settings"
                    onClick={() => setViewMenuOpen((current) => !current)}
                    type="button"
                  ><StudioIcon name="layout" /><span className="sr-only">View settings</span></button>
                  {viewMenuOpen ? <div className="view-menu control-popover" role="menu">
                    <div><span>YOUR VIEW</span><strong>{participantViewState.mode === "auto" ? `Auto · ${participantViewState.resolvedMode}` : participantViewState.mode.replace("-", " ")}</strong></div>
                    {([
                      ["auto", "Automatic", "Follows window shape"],
                      ["equal", "Equal", "Side by side"],
                      ["stacked", "Stacked", "Best for portrait displays"],
                      ["focus-peer", "Focus guest", "Small self view"],
                      ["peer-only", "Guest only", "Hide your own feed"],
                    ] as Array<[ParticipantViewMode, string, string]>).map(([mode, label, detail]) => <button
                      aria-checked={participantViewState.mode === mode}
                      className={participantViewState.mode === mode ? "active" : ""}
                      key={mode}
                      onClick={() => {
                        cloudMediaRef.current?.setParticipantViewMode(mode);
                        setViewMenuOpen(false);
                      }}
                      role="menuitemradio"
                      type="button"
                    ><span><strong>{label}</strong><small>{detail}</small></span><i /></button>)}
                    <button disabled={!participantViewState.canSwap} onClick={() => cloudMediaRef.current?.swapParticipantPositions()} type="button"><span><strong>Swap positions</strong><small>Move your tile to the other side</small></span></button>
                  </div> : null}
                </div> : null}
                {isHost && room && room.settings.maxGuests > 0 && (guestInvitePath || canReissueInvitation) ? <div className="control-popover-anchor">
                  <button
                    aria-expanded={inviteOpen}
                    aria-label="Invite guest"
                    className={inviteOpen ? "control-active" : undefined}
                    data-tooltip="Invite guest"
                    onClick={() => setInviteOpen((current) => !current)}
                    type="button"
                  ><StudioIcon name="invite" /><span className="sr-only">Invite guest</span></button>
                  {inviteOpen ? <div className="invite-popover control-popover">
                    <span className="panel-kicker">PRIVATE INVITATION</span>
                    <strong>{guestInvitePath ? "Bring your guest in" : "Create a fresh guest link"}</strong>
                    <p>{guestInvitePath
                      ? "Anyone with this scoped link joins this room as the guest."
                      : "This room was reopened from your account. A fresh link replaces any earlier guest invitation."}</p>
                    {guestInvitePath ? <>
                      <input aria-label="Guest invitation link" readOnly value={invitationUrl(guestInvitePath)} />
                      <button onClick={() => void copyInviteLink()} type="button">{inviteCopied ? "Copied" : "Copy invite link"}</button>
                    </> : null}
                    {canReissueInvitation ? inviteRotationConfirm ? <div className="invite-rotation-confirm" role="alert">
                      <p>The previous guest link will stop working. Continue?</p>
                      <div><button disabled={invitationBusy} onClick={() => setInviteRotationConfirm(false)} type="button">Keep current link</button><button disabled={invitationBusy || recording} onClick={() => void replaceInviteLink()} type="button">{invitationBusy ? "Replacing…" : "Replace link"}</button></div>
                    </div> : <button className="invite-replace-link" disabled={invitationBusy || recording} onClick={() => setInviteRotationConfirm(true)} type="button">{guestInvitePath ? "Replace this link" : "Create fresh invite"}</button> : null}
                  </div> : null}
                </div> : null}
                <button
                  aria-expanded={settingsOpen}
                  aria-label="Room information"
                  data-tooltip="Room information"
                  onClick={() => setSettingsOpen((current) => !current)}
                  type="button"
                ><StudioIcon name="info" /><span className="sr-only">Room information</span></button>
                {hasCloudRecording ? (
                  <button
                    aria-expanded={downloadsOpen}
                    aria-label={cloudDownloadsLabel}
                    className={["cloud-download-control", downloadsOpen ? "control-active" : "", !downloadsOpen && cloudDownloadsStatus === "ready" ? "control-ready" : ""].filter(Boolean).join(" ")}
                    data-count={cloudDownloadsStatus === "ready" ? artifacts.length || undefined : undefined}
                    data-status={cloudDownloadsStatus}
                    data-tooltip={cloudDownloadsLabel}
                    onClick={() => setDownloadsOpen((current) => !current)}
                    type="button"
                  ><StudioIcon name="download" /><span className="sr-only">Recording downloads</span></button>
                ) : null}
                <button
                  aria-label={hangingUp ? "Leaving room" : "Hang up"}
                  className="hangup-control"
                  data-tooltip={hangingUp ? "Leaving room" : "Hang up"}
                  disabled={hangingUp}
                  onClick={() => void leaveRoom()}
                  type="button"
                ><StudioIcon name="hangup" /><span className="sr-only">{hangingUp ? "Leaving room" : "Hang up"}</span></button>
              </div>
              {isHost ? (
                <div className={`record-control ${!recording && signedIn && !recordingQuotaExhausted ? "record-control-split" : ""}`}>
                  <button
                    className={`record-button ${recording ? "stop" : recordingQuotaExhausted ? "quota-used" : ""}`}
                    data-tooltip={!signedIn
                      ? "Sign in with Wiplash to record in the Cloud"
                      : recordingQuotaExhausted
                        ? "Monthly Cloud recording time used"
                        : undefined}
                    disabled={signedIn ? (!recordingQuotaExhausted && !canRecord) || busy : busy}
                    onClick={() => {
                      setRecordMenuOpen(false);
                      if (!signedIn) onSignInRequired();
                      else if (recordingQuotaExhausted) onRecordingQuotaRequired();
                      else void toggleRecording();
                    }}
                    type="button"
                  >
                    <span aria-hidden="true" className="record-status-dot" />
                    {busy ? "Working…" : recording ? "Stop & save" : recordingQuotaExhausted ? "Recording time used" : signedIn ? "Record" : "Sign in to record"}
                  </button>
                  {!recording && signedIn && !recordingQuotaExhausted ? (
                    <button
                      aria-expanded={recordMenuOpen}
                      aria-label="Choose recording destination"
                      className="record-menu-toggle"
                      data-tooltip="Recording destination"
                      onClick={() => setRecordMenuOpen((current) => !current)}
                      type="button"
                    ><svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" /></svg></button>
                  ) : null}
                  {recordMenuOpen ? (
                    <div className="record-menu" role="menu">
                      <button className="active" onClick={() => setRecordMenuOpen(false)} role="menuitem" type="button">
                        <span>Cloud</span><small>Full room · selected</small>
                      </button>
                      <button disabled role="menuitem" type="button">
                        <span>Browser</span><small>Coming soon</small>
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="guest-note"><strong>Guest view</strong><span>The host controls recording.</span></div>
              )}
            </div>
          </div>
          {settingsOpen ? (
            <section className="studio-settings-panel" aria-label="Room information">
              <div className="settings-panel-heading">
                <div><span className="panel-kicker">ROOM INFORMATION</span><h2>{title}</h2></div>
                <button onClick={() => setSettingsOpen(false)} type="button" aria-label="Close room information">×</button>
              </div>
              <dl>
                <div><dt>Access</dt><dd>{role}</dd></div>
                <div><dt>Guests</dt><dd>{room ? (room.settings.maxGuests === 0 ? "Solo" : room.settings.maxGuests) : "—"}</dd></div>
                <div><dt>Entry</dt><dd>{room ? admissionModeOptions.find((option) => option.id === room.settings.admissionMode)?.name : "from link"}</dd></div>
                <div><dt>Video</dt><dd>{room ? room.settings.videoPreset.replace("_", " ") : "from link"}</dd></div>
                <div><dt>Audio</dt><dd>{room ? room.settings.audioPreset : "from link"}</dd></div>
                <div><dt>Screen share</dt><dd>{room ? room.settings.screenSharePreset : "from link"}</dd></div>
                <div><dt>Recording</dt><dd>{usesServerRecorder ? "Cloud" : "unavailable"}</dd></div>
                {usesCloudMedia ? <div><dt>Your view</dt><dd>{participantViewState.mode === "auto" ? `Auto · ${participantViewState.resolvedMode}` : participantViewState.mode.replace("-", " ")}</dd></div> : null}
              </dl>
              {room && isHost && room.settings.maxGuests > 0 ? <div className="settings-admission-policy">
                <span className="panel-kicker">WHO CAN JOIN?</span>
                <AdmissionModeSelect
                  onChange={(mode) => void changeAdmissionPolicy(mode)}
                  value={room.settings.admissionMode}
                />
                {admissionPolicyBusy ? <small>Updating room access…</small> : null}
              </div> : null}
              {usesCloudMedia && mediaMetrics ? (
                <dl className="media-metrics">
                  <div><dt>Actual video</dt><dd>{mediaMetrics.width ?? "—"}×{mediaMetrics.height ?? "—"}</dd></div>
                  <div><dt>Frame rate</dt><dd>{mediaMetrics.framesPerSecond === null ? "—" : `${Math.round(mediaMetrics.framesPerSecond)} fps`}</dd></div>
                  <div><dt>Bitrate</dt><dd>{mediaMetrics.bitrateKbps === null ? "measuring" : `${mediaMetrics.bitrateKbps} kbps`}</dd></div>
                  <div><dt>Round trip</dt><dd>{mediaMetrics.roundTripMs === null ? "measuring" : `${mediaMetrics.roundTripMs} ms`}</dd></div>
                </dl>
              ) : null}
              <p>{room
                ? "Signal quality stays attached to this room. Hosts can change who is allowed to join without changing the recording setup."
                : "This room inherits its media settings from the imported link. Open a different URL to change them."}</p>
            </section>
          ) : null}
          {downloadsOpen && hasCloudRecording ? (
            <section
              aria-label="Cloud recording downloads"
              className={`cloud-downloads-panel ${downloadsPositioned ? "positioned" : ""} ${downloadsDragging ? "dragging" : ""}`}
              ref={downloadsPanelRef}
              style={downloadsPosition ? {
                "--downloads-panel-x": `${downloadsPosition.x}px`,
                "--downloads-panel-y": `${downloadsPosition.y}px`,
              } as CSSProperties : undefined}
            >
              <div
                className="downloads-panel-heading"
                onPointerCancel={stopDownloadsDrag}
                onPointerDown={startDownloadsDrag}
                onPointerMove={moveDownloadsPanel}
                onPointerUp={stopDownloadsDrag}
              >
                <div>
                  <span className="panel-kicker">CLOUD DOWNLOADS</span>
                  <h2>{selectedRecording?.lifecycleState === "finalizing"
                    ? "Safely finalizing in Cloud"
                    : selectedRecording?.lifecycleState === "failed"
                    ? "Preserved source files"
                    : cloudProgramsPreparing
                      ? "Preparing recording files"
                      : "Finalized recording files"}</h2>
                  {selectedRecording ? <p className="recording-session-date">{formatRecordingSession(selectedRecording)}</p> : null}
                </div>
                <div className="downloads-panel-actions">
                  <span aria-label="Drag Cloud downloads" className="downloads-drag-cue" data-tooltip="Drag panel" tabIndex={0}>
                    <svg aria-hidden="true" viewBox="0 0 18 18">
                      <circle cx="6" cy="4" r="1.4" /><circle cx="12" cy="4" r="1.4" />
                      <circle cx="6" cy="9" r="1.4" /><circle cx="12" cy="9" r="1.4" />
                      <circle cx="6" cy="14" r="1.4" /><circle cx="12" cy="14" r="1.4" />
                    </svg>
                  </span>
                  <button
                    aria-label="Close Cloud downloads"
                    onClick={() => setDownloadsOpen(false)}
                    type="button"
                  >×</button>
                </div>
              </div>
              {cloudRecordings.length > 1 ? (
                <div className="recording-session-picker" aria-label="Recording sessions">
                  <span>Recording session</span>
                  <div>
                    {cloudRecordings.map((candidate) => (
                      <button
                        aria-pressed={candidate.id === selectedRecording?.id}
                        className={candidate.id === selectedRecording?.id ? "active" : undefined}
                        key={candidate.id}
                        onClick={() => {
                          setSelectedRecordingId(candidate.id);
                          setArtifacts([]);
                          setArtifactDownloadStates({});
                          setDownloadNotice(null);
                          artifactsLoadedRoomRef.current = null;
                        }}
                        type="button"
                      >{formatRecordingSession(candidate)}{candidate.lifecycleState === "finalizing" ? " · Finalizing" : ""}</button>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedRecording?.programs.length ? (
                <div className="program-progress" aria-label="Cloud recording view progress" aria-live="polite">
                  <div className="program-progress-heading">
                    <span>{cloudProgramsPreparing ? "Preparing your views" : cloudProgramNeedsReview ? "Recording view status" : "Views ready"}</span>
                    <strong>{selectedRecording.programs.filter((program) => program.state === "ready").length}/{selectedRecording.programs.length} ready</strong>
                  </div>
                  <div className="program-output-grid">
                    {selectedRecording.programs.map((program) => {
                      const status = cloudProgramStatusCopy(program.state, program.deferredReason);
                      return (
                        <article className={`program-output-card ${program.state}`} data-state={program.state} key={program.layout}>
                          <span className={`program-format-glyph ${program.layout}`} aria-hidden="true"><i /></span>
                          <div>
                            <strong>{recordingViewLabel(program.layout)} view</strong>
                            <small>{status.detail}</small>
                          </div>
                          <em className="program-state"><i aria-hidden="true" />{status.label}</em>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <p className={selectedRecording?.lifecycleState === "failed" ? "download-recovery-note" : "download-ready-note"}>
                {selectedRecording?.lifecycleState === "finalizing"
                  ? "You can close this panel, leave the room, or begin another recording. Finalization continues on the server and the finished files will stay attached to this recording session."
                  : selectedRecording?.lifecycleState === "failed"
                  ? "Final QA found damaged media. Only source fragments that passed full decode are available here; no damaged fragment is presented as ready."
                  : "Validated files appear below as each Cloud output finishes. Isolated camera files remain the canonical source."}
              </p>
              <p className="download-persistence-note">Close this panel anytime. Your files stay available from the purple Downloads control in this room.</p>
              {artifactError ? <p className="download-error" role="alert">{artifactError}</p> : null}
              {downloadNotice ? (
                <p aria-live="polite" className="download-success" role="status">
                  {downloadNotice}
                </p>
              ) : null}
              {artifactsBusy ? <p className="downloads-empty">Loading finalized files…</p> : null}
              {selectedRecording?.lifecycleState === "finalizing" ? (
                <p className="downloads-empty">Checking cameras, audio, timing, and recording views…</p>
              ) : !artifactsBusy && artifacts.length === 0 ? (
                <p className="downloads-empty">No validated recording files are available.</p>
              ) : null}
              {programArtifacts.length > 0 ? (
                <ul className="artifact-list">
                  {programArtifacts.map((artifact) => (
                    <li key={artifact.artifactId}>
                      <div>
                        <strong>{recordingViewLabel(artifact.layout!)} view</strong>
                        <span>{formatArtifactDuration(artifact.durationMs)} · {formatArtifactSize(artifact.sizeBytes)} · SHA {artifact.sha256.slice(0, 10)}</span>
                      </div>
                      <button
                        disabled={downloadingArtifactId !== null}
                        onClick={() => void downloadCloudArtifact(artifact)}
                        type="button"
                      >{artifactDownloadLabel(
                        downloadingArtifactId === artifact.artifactId,
                        artifactDownloadStates[artifact.artifactId],
                      )}</button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {sourceArtifactGroups.length > 0 ? (
                <details className="source-recordings">
                  <summary>
                    <span><strong>Source recordings</strong><small>{sourceArtifactCount} secure recovery {sourceArtifactCount === 1 ? "part" : "parts"}</small></span>
                    <i aria-hidden="true" />
                  </summary>
                  <p>
                    Porchcast saves cameras and screens in short parts so a disconnect cannot destroy the entire recording. These are editing and recovery sources—not generated clips.
                  </p>
                  {sourceArtifactGroups.map((group) => (
                    <section className="source-recording-group" key={group.key}>
                      <header>
                        <strong>{group.label}</strong>
                        <span>{group.artifacts.length} {group.artifacts.length === 1 ? "part" : "parts"} · {formatArtifactSize(group.totalSizeBytes)}</span>
                      </header>
                      <ul className="artifact-list source-artifact-list">
                        {group.artifacts.map((artifact) => (
                          <li key={artifact.artifactId}>
                            <div>
                              <strong>Part {(artifact.sequence ?? 0) + 1}</strong>
                              <span>{formatArtifactDuration(artifact.durationMs)} · {formatArtifactSize(artifact.sizeBytes)} · SHA {artifact.sha256.slice(0, 10)}</span>
                            </div>
                            <button
                              disabled={downloadingArtifactId !== null}
                              onClick={() => void downloadCloudArtifact(artifact)}
                              type="button"
                            >{artifactDownloadLabel(
                              downloadingArtifactId === artifact.artifactId,
                              artifactDownloadStates[artifact.artifactId],
                            )}</button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </details>
              ) : null}
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
