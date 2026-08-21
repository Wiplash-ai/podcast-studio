import {
  mediaGrantRefreshResponseSchema,
  roomConsentResponseSchema,
  type AppendRoomMediaEventRequest,
  type MediaSessionGrant,
  type RoomAccess,
  type RoomParticipantId,
} from "@wiplash/podcast-contracts";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import {
  WhipWhepTransport,
  captureConstraints,
  negotiatedMedia,
  preflightWarning,
  startActiveSpeakerMonitor,
  type MediaMetrics,
} from "./media-transport";
import { consumeAccountSignInRedirect } from "./account";
import {
  CompositePictureInPicture,
  pictureInPictureRoomVisibility,
  type PictureInPictureMode,
  type PictureInPictureSource,
} from "./picture-in-picture";
import { apiUrl, fetchApi } from "./public-path";
import {
  initialCloudMediaControlState,
  type CloudMediaControlState,
} from "./studio-controls";

export interface CloudMediaStageHandle {
  close: () => Promise<void>;
  getLocalStream: () => MediaStream | null;
  requestRecordingKeyFrames: () => Promise<number>;
  setPictureInPictureMode: (mode: PictureInPictureMode | null) => Promise<void>;
  setParticipantViewMode: (mode: ParticipantViewMode) => void;
  swapParticipantPositions: () => void;
  toggleCamera: () => void;
  toggleMicrophone: () => void;
  toggleScreenShare: () => Promise<void>;
}

export type ParticipantViewMode = "auto" | "equal" | "stacked" | "focus-peer" | "peer-only";

export interface CloudParticipantViewState {
  canSwap: boolean;
  mode: ParticipantViewMode;
  resolvedMode: Exclude<ParticipantViewMode, "auto">;
  selfFirst: boolean;
}

interface ParticipantViewPreference {
  mode: ParticipantViewMode;
  selfFirst: boolean;
}

const participantViewStorageKey = "podcast-studio-participant-view-v2";
const participantViewModes = new Set<ParticipantViewMode>([
  "auto",
  "equal",
  "stacked",
  "focus-peer",
  "peer-only",
]);

export function parseParticipantViewPreference(value: string | null): ParticipantViewPreference {
  if (!value) return { mode: "auto", selfFirst: false };
  try {
    const candidate = JSON.parse(value) as Partial<ParticipantViewPreference>;
    return {
      mode: participantViewModes.has(candidate.mode as ParticipantViewMode)
        ? candidate.mode as ParticipantViewMode
        : "auto",
      selfFirst: candidate.selfFirst === true,
    };
  } catch {
    return { mode: "auto", selfFirst: false };
  }
}

export function resolvedParticipantViewMode(
  mode: ParticipantViewMode,
  portrait: boolean,
): Exclude<ParticipantViewMode, "auto"> {
  return mode === "auto" ? (portrait ? "stacked" : "equal") : mode;
}

interface CloudMediaStageProps {
  access: RoomAccess;
  accountCsrfToken: string;
  recordingEpoch: string | null;
  roomToken: string;
  onCancel: () => void;
  onConnectedChange: (connected: boolean) => void;
  onControlStateChange: (state: CloudMediaControlState) => void;
  onError: (message: string) => void;
  onMetrics: (metrics: MediaMetrics | null) => void;
  onPictureInPictureChange: (mode: PictureInPictureMode | null) => void;
  onStateChange: (state: string) => void;
  onViewStateChange: (state: CloudParticipantViewState) => void;
}

export function participantGridClass(
  remoteConnected: boolean | number,
  mode: ParticipantViewMode = "equal",
  selfFirst = false,
  portrait = false,
): string {
  const remoteCount = typeof remoteConnected === "number"
    ? Math.max(0, Math.min(12, remoteConnected))
    : remoteConnected ? 1 : 0;
  const resolvedMode = resolvedParticipantViewMode(mode, portrait);
  return `participant-grid ${remoteCount > 0 ? `paired view-${resolvedMode}` : "solo"} participant-count-${remoteCount + 1} ${selfFirst ? "self-first" : "peer-first"}`;
}

export function cloudRoomClass(screenActive: boolean, portrait: boolean): string {
  return [
    "cloud-room",
    screenActive ? "screen-active" : "",
    portrait ? "portrait-room" : "landscape-room",
  ].filter(Boolean).join(" ");
}

export function preferredScreenStream<T>(remoteScreen: T | null, localScreen: T | null): T | null {
  return remoteScreen ?? localScreen;
}

export function shouldRenderRoomVideo(mode: PictureInPictureMode | null): boolean {
  const visibility = pictureInPictureRoomVisibility(mode);
  return visibility.guests || visibility.self;
}

type MediaDeviceChoice = Pick<MediaDeviceInfo, "deviceId" | "label">;

interface MediaDevicePreference {
  cameraId: string;
  cameraEnabled: boolean;
  joined: boolean;
  microphoneId: string;
  microphoneEnabled: boolean;
}

type MediaDevicePreferenceStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

function mediaDevicePreferenceKey(roomId: string, participantId: RoomParticipantId): string {
  return `podcast-studio:media-devices:${roomId}:${participantId}`;
}

export function parseMediaDevicePreference(value: string | null): MediaDevicePreference | null {
  if (!value) return null;
  try {
    const candidate = JSON.parse(value) as Partial<MediaDevicePreference>;
    const validDeviceId = (deviceId: unknown): deviceId is string =>
      typeof deviceId === "string" && deviceId.length <= 512;
    if (!validDeviceId(candidate.cameraId) || !validDeviceId(candidate.microphoneId)) return null;
    if (!candidate.cameraId && !candidate.microphoneId) return null;
    return {
      cameraId: candidate.cameraId,
      cameraEnabled: candidate.cameraEnabled !== false,
      joined: candidate.joined === true,
      microphoneId: candidate.microphoneId,
      microphoneEnabled: candidate.microphoneEnabled !== false,
    };
  } catch {
    return null;
  }
}

export function readMediaDevicePreference(
  storage: Pick<MediaDevicePreferenceStorage, "getItem">,
  roomId: string,
  participantId: RoomParticipantId,
): MediaDevicePreference | null {
  try {
    return parseMediaDevicePreference(storage.getItem(
      mediaDevicePreferenceKey(roomId, participantId),
    ));
  } catch {
    return null;
  }
}

export function rememberMediaDevicePreference(
  storage: Pick<MediaDevicePreferenceStorage, "removeItem" | "setItem">,
  roomId: string,
  participantId: RoomParticipantId,
  preference: MediaDevicePreference,
): void {
  try {
    const key = mediaDevicePreferenceKey(roomId, participantId);
    if (!preference.cameraId && !preference.microphoneId) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, JSON.stringify(preference));
  } catch {
    // Device setup remains usable when session storage is unavailable.
  }
}

export function shouldResumeJoinedMedia(
  preference: MediaDevicePreference | null,
  signInRedirectReturned: boolean,
): boolean {
  return Boolean(signInRedirectReturned && preference?.joined);
}

export function selectedDeviceName(
  devices: readonly MediaDeviceChoice[],
  value: string,
  fallback: string,
): string {
  const index = Math.max(0, devices.findIndex((device) => device.deviceId === value));
  const selected = devices[index];
  return selected?.label || (selected ? `${fallback} ${index + 1}` : `No ${fallback.toLowerCase()} found`);
}

function DeviceSelect({
  devices,
  icon,
  label,
  labelId,
  onChange,
  onOpenChange,
  open,
  value,
}: {
  devices: readonly MediaDeviceChoice[];
  icon: "camera" | "microphone";
  label: string;
  labelId: string;
  onChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  value: string;
}) {
  const selectedName = selectedDeviceName(devices, value, label);
  return (
    <div
      className={`preflight-device-select ${open ? "open" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onOpenChange(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onOpenChange(false);
          event.currentTarget.querySelector<HTMLButtonElement>(".preflight-device-trigger")?.focus();
        }
      }}
    >
      <span id={labelId}>{label}</span>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={`${labelId} ${labelId}-value`}
        className="preflight-device-trigger"
        disabled={devices.length === 0}
        onClick={() => onOpenChange(!open)}
        type="button"
      >
        {icon === "camera" ? (
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7.5h10.5A1.5 1.5 0 0 1 16 9v6a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 15V9A1.5 1.5 0 0 1 4 7.5Z" /><path d="m16 10 5-2.5v9L16 14" /></svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24"><rect height="11" rx="4" width="7" x="8.5" y="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" /></svg>
        )}
        <span id={`${labelId}-value`}>{selectedName}</span>
        <svg aria-hidden="true" className="preflight-device-chevron" viewBox="0 0 20 20"><path d="m5.5 7.5 4.5 4.5 4.5-4.5" /></svg>
      </button>
      {open ? (
        <div aria-labelledby={labelId} className="preflight-device-menu" role="listbox">
          {devices.map((device, index) => {
            const name = device.label || `${label} ${index + 1}`;
            const selected = device.deviceId === value;
            return (
              <button
                aria-selected={selected}
                className={selected ? "active" : ""}
                key={device.deviceId}
                onClick={() => {
                  onChange(device.deviceId);
                  onOpenChange(false);
                }}
                role="option"
                type="button"
              >
                <span><strong>{name}</strong><small>{selected ? "Selected" : `Use this ${label.toLowerCase()}`}</small></span>
                <i aria-hidden="true" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function attachMediaStream(
  element: Pick<HTMLMediaElement, "srcObject"> | null,
  stream: MediaStream | null,
): void {
  if (element && element.srcObject !== stream) element.srcObject = stream;
}

interface RemoteParticipantState {
  camera: MediaStream | null;
  displayName: string;
  participantId: RoomParticipantId;
  screen: MediaStream | null;
}

function RemoteParticipantTile({ participant }: { participant: RemoteParticipantState }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => attachMediaStream(videoRef.current, participant.camera), [participant.camera]);
  return (
    <figure className="participant-tile remote-participant">
      {participant.camera ? (
        <video autoPlay playsInline ref={videoRef} />
      ) : (
        <div className="waiting-participant"><i /><strong>Waiting for {participant.displayName}</strong><span>The feed appears automatically when they join.</span></div>
      )}
      <figcaption>{participant.displayName.toUpperCase()}</figcaption>
    </figure>
  );
}

function SharedScreenTile({
  label,
  muted,
  stream,
}: {
  label: string;
  muted: boolean;
  stream: MediaStream;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => attachMediaStream(videoRef.current, stream), [stream]);
  return (
    <div className="shared-screen-tile">
      <video autoPlay muted={muted} playsInline ref={videoRef} />
      <span>{label}</span>
    </div>
  );
}

export const CloudMediaStage = forwardRef<CloudMediaStageHandle, CloudMediaStageProps>(
  function CloudMediaStage({
    access,
    accountCsrfToken,
    recordingEpoch,
    roomToken,
    onCancel,
    onConnectedChange,
    onControlStateChange,
    onError,
    onMetrics,
    onPictureInPictureChange,
    onStateChange,
    onViewStateChange,
  }, ref) {
    const initialDevicePreferenceRef = useRef(readMediaDevicePreference(
      window.sessionStorage,
      access.room.id,
      access.participantId,
    ));
    const [cameraId, setCameraId] = useState(
      initialDevicePreferenceRef.current?.cameraId ?? "",
    );
    const [microphoneId, setMicrophoneId] = useState(
      initialDevicePreferenceRef.current?.microphoneId ?? "",
    );
    const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
    const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
    const [deviceMenu, setDeviceMenu] = useState<"camera" | "microphone" | null>(null);
    const [consented, setConsented] = useState(false);
    const [preflightBusy, setPreflightBusy] = useState(false);
    const [joining, setJoining] = useState(false);
    const [connected, setConnected] = useState(false);
    const [publishFailed, setPublishFailed] = useState(false);
    const initialView = parseParticipantViewPreference(localStorage.getItem(participantViewStorageKey));
    const [viewMode, setViewMode] = useState<ParticipantViewMode>(initialView.mode);
    const [selfFirst, setSelfFirst] = useState(initialView.selfFirst);
    const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipantState[]>([]);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [pictureInPictureMode, setPictureInPictureMode] = useState<PictureInPictureMode | null>(null);
    const [controlState, setControlState] = useState<CloudMediaControlState>(
      initialCloudMediaControlState,
    );
    const [warning, setWarning] = useState<string | null>(null);
    const transportRef = useRef<WhipWhepTransport | null>(null);
    const pictureInPictureRef = useRef<CompositePictureInPicture | null>(null);
    const activeSpeakerStopRef = useRef<(() => void) | null>(null);
    const eventQueueRef = useRef<Promise<void>>(Promise.resolve());
    const sourceStateRef = useRef(new Map<"camera" | "screen", boolean>());
    const screenStartedRef = useRef(false);
    const faultStateRef = useRef(new Map<"camera" | "screen", string>());
    const grantStateRef = useRef<"healthy" | "degraded" | "failed">("healthy");
    const recordingBootstrapEpochRef = useRef<string | null>(null);
    const localRef = useRef<MediaStream | null>(null);
    const screenRef = useRef<MediaStream | null>(null);
    const remoteParticipantsRef = useRef<RemoteParticipantState[]>([]);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const signInResumeCheckedRef = useRef(false);
    const joinedPreferenceRef = useRef(initialDevicePreferenceRef.current?.joined ?? false);
    const cameraEnabledPreferenceRef = useRef(
      initialDevicePreferenceRef.current?.cameraEnabled ?? true,
    );
    const microphoneEnabledPreferenceRef = useRef(
      initialDevicePreferenceRef.current?.microphoneEnabled ?? true,
    );
    const attachLocalVideoRef = useCallback((element: HTMLVideoElement | null) => {
      localVideoRef.current = element;
      attachMediaStream(element, localRef.current);
    }, []);

    function persistDevicePreference(
      overrides: Partial<MediaDevicePreference> = {},
    ): void {
      const next = {
        cameraId,
        cameraEnabled: cameraEnabledPreferenceRef.current,
        joined: joinedPreferenceRef.current,
        microphoneId,
        microphoneEnabled: microphoneEnabledPreferenceRef.current,
        ...overrides,
      };
      joinedPreferenceRef.current = next.joined;
      cameraEnabledPreferenceRef.current = next.cameraEnabled;
      microphoneEnabledPreferenceRef.current = next.microphoneEnabled;
      rememberMediaDevicePreference(
        window.sessionStorage,
        access.room.id,
        access.participantId,
        next,
      );
    }

    useEffect(
      () => attachMediaStream(localVideoRef.current, localStream),
      [connected, localStream],
    );

    useEffect(() => {
      remoteParticipantsRef.current = remoteParticipants;
    }, [remoteParticipants]);

    useEffect(() => {
      const controller = new CompositePictureInPicture(
        () => {
          const sources: PictureInPictureSource[] = remoteParticipantsRef.current
            .filter((participant) => participant.camera !== null)
            .map((participant) => ({
              id: participant.participantId,
              label: participant.displayName,
              mirrored: false,
              role: "guest",
              stream: participant.camera!,
            }));
          if (localRef.current) {
            sources.push({
              id: access.participantId,
              label: "You",
              mirrored: true,
              role: "self",
              stream: localRef.current,
            });
          }
          return sources;
        },
        (mode) => {
          setPictureInPictureMode(mode);
          onPictureInPictureChange(mode);
        },
      );
      controller.prepare();
      pictureInPictureRef.current = controller;
      return () => {
        if (pictureInPictureRef.current === controller) pictureInPictureRef.current = null;
        void controller.destroy();
      };
    }, [access.participantId, onPictureInPictureChange]);

    useEffect(() => {
      if (signInResumeCheckedRef.current) return;
      signInResumeCheckedRef.current = true;
      const resumeRequested = consumeAccountSignInRedirect(
        window.sessionStorage,
        window.location.href,
      );
      if (!shouldResumeJoinedMedia(initialDevicePreferenceRef.current, resumeRequested)) return;
      void resumeJoinedConversation(initialDevicePreferenceRef.current!);
    }, []);

    useEffect(() => {
      if (
        !connected
        || !recordingEpoch
        || recordingBootstrapEpochRef.current === recordingEpoch
        || !transportRef.current
      ) return;
      recordingBootstrapEpochRef.current = recordingEpoch;
      void transportRef.current.requestRecordingKeyFrames().then((count) => {
        if (count === 0) {
          onStateChange("Recording started; Cloud media is still requesting a clean video frame");
        }
      });
    }, [connected, onStateChange, recordingEpoch]);

    useEffect(() => onControlStateChange(controlState), [controlState, onControlStateChange]);

    useEffect(() => {
      localStorage.setItem(participantViewStorageKey, JSON.stringify({
        mode: viewMode,
        selfFirst,
      }));
    }, [selfFirst, viewMode]);

    useEffect(() => {
      const updateOrientation = () => setPortrait(window.innerHeight > window.innerWidth);
      window.addEventListener("resize", updateOrientation);
      return () => window.removeEventListener("resize", updateOrientation);
    }, []);

    useEffect(() => {
      const resolvedMode = resolvedParticipantViewMode(viewMode, portrait);
      const remoteCount = remoteParticipants.filter((participant) => participant.camera).length;
      onViewStateChange({
        canSwap: remoteCount > 0
          && resolvedMode !== "focus-peer"
          && resolvedMode !== "peer-only",
        mode: viewMode,
        resolvedMode,
        selfFirst,
      });
    }, [onViewStateChange, portrait, remoteParticipants, selfFirst, viewMode]);

    function queueMediaEvent(input: AppendRoomMediaEventRequest): void {
      const idempotency = crypto.randomUUID();
      const send = async () => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const response = await fetch(
              apiUrl(`/v1/rooms/${access.room.id}/media-events`),
              {
                method: "POST",
                credentials: "include",
                headers: {
                  "Content-Type": "application/json",
                  "Idempotency-Key": idempotency,
                  ...(roomToken ? { "X-Room-Token": roomToken } : {}),
                  ...(accountCsrfToken ? { "X-Podcast-Studio-CSRF": accountCsrfToken } : {}),
                },
                body: JSON.stringify(input),
              },
            );
            if (response.ok) return;
            if (response.status < 500) return;
          } catch {
            // A bounded retry preserves ordering without interrupting the live conversation.
          }
          await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
        }
      };
      eventQueueRef.current = eventQueueRef.current.then(send, send);
    }

    function reportSourceState(kind: "camera" | "screen", next: boolean): void {
      if (sourceStateRef.current.get(kind) === next) return;
      sourceStateRef.current.set(kind, next);
      if (next) faultStateRef.current.delete(kind);
      queueMediaEvent({
        type: next ? "source_connected" : "source_disconnected",
        sourceKind: kind,
        faultCode: null,
      });
    }

    function reportFault(
      kind: "camera" | "screen",
      faultCode: NonNullable<AppendRoomMediaEventRequest["faultCode"]>,
    ): void {
      if (faultStateRef.current.get(kind) === faultCode) return;
      faultStateRef.current.set(kind, faultCode);
      queueMediaEvent({ type: "fault", sourceKind: kind, faultCode });
    }

    function reportScreenStarted(next: boolean): void {
      if (screenStartedRef.current === next) return;
      screenStartedRef.current = next;
      queueMediaEvent({
        type: next ? "screen_started" : "screen_stopped",
        sourceKind: "screen",
        faultCode: null,
      });
    }
    useEffect(() => {
      if (!connected) return;
      const timer = window.setInterval(() => {
        void transportRef.current?.synchronizePeers();
      }, 4_000);
      return () => window.clearInterval(timer);
    }, [connected]);

    async function refreshDevices(stream: MediaStream) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const nextCameras = devices.filter((device) => device.kind === "videoinput");
      const nextMicrophones = devices.filter((device) => device.kind === "audioinput");
      setCameras(nextCameras);
      setMicrophones(nextMicrophones);
      const videoDevice = stream.getVideoTracks()[0]?.getSettings().deviceId;
      const audioDevice = stream.getAudioTracks()[0]?.getSettings().deviceId;
      const nextCameraId = videoDevice || cameraId || nextCameras[0]?.deviceId || "";
      const nextMicrophoneId = audioDevice || microphoneId || nextMicrophones[0]?.deviceId || "";
      setCameraId(nextCameraId);
      setMicrophoneId(nextMicrophoneId);
      rememberMediaDevicePreference(
        window.sessionStorage,
        access.room.id,
        access.participantId,
        {
          cameraId: nextCameraId,
          cameraEnabled: cameraEnabledPreferenceRef.current,
          joined: joinedPreferenceRef.current,
          microphoneId: nextMicrophoneId,
          microphoneEnabled: microphoneEnabledPreferenceRef.current,
        },
      );
    }

    async function captureSelected(useSelection: boolean): Promise<MediaStream> {
      const next = await navigator.mediaDevices.getUserMedia(captureConstraints(
        access.room.settings.videoPreset,
        access.room.settings.audioPreset,
        useSelection ? cameraId : undefined,
        useSelection ? microphoneId : undefined,
      ));
      const videoTrack = next.getVideoTracks()[0];
      if (videoTrack) videoTrack.contentHint = "motion";
      localRef.current?.getTracks().forEach((track) => track.stop());
      localRef.current = next;
      setLocalStream(next);
      setControlState((current) => ({
        ...current,
        cameraEnabled: next.getVideoTracks().some((track) => track.enabled),
        microphoneEnabled: next.getAudioTracks().some((track) => track.enabled),
      }));
      const metrics = negotiatedMedia(next);
      onMetrics(metrics);
      setWarning(preflightWarning(metrics));
      await refreshDevices(next);
      return next;
    }

    async function prepareDevices(preferRemembered = false): Promise<MediaStream | null> {
      setPreflightBusy(true);
      onStateChange("Requesting camera and microphone access");
      try {
        let stream: MediaStream;
        try {
          stream = await captureSelected(preferRemembered && Boolean(cameraId || microphoneId));
        } catch (reason) {
          if (!preferRemembered || (!cameraId && !microphoneId)) throw reason;
          stream = await captureSelected(false);
        }
        onStateChange("Devices ready — confirm consent to join");
        return stream;
      } catch (reason) {
        onError(reason instanceof Error ? reason.message : "Camera and microphone could not be opened.");
        onStateChange("Device setup needs attention");
        return null;
      } finally {
        setPreflightBusy(false);
      }
    }

    async function selectedStream(): Promise<MediaStream> {
      const current = localRef.current;
      const currentCamera = current?.getVideoTracks()[0]?.getSettings().deviceId;
      const currentMicrophone = current?.getAudioTracks()[0]?.getSettings().deviceId;
      if (
        current
        && (!cameraId || cameraId === currentCamera)
        && (!microphoneId || microphoneId === currentMicrophone)
      ) return current;
      return captureSelected(true);
    }

    async function consentForMedia(): Promise<MediaSessionGrant> {
      const response = await fetch(apiUrl(`/v1/rooms/${access.room.id}/consents`), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          ...(roomToken ? { "X-Room-Token": roomToken } : {}),
          ...(accountCsrfToken ? { "X-Podcast-Studio-CSRF": accountCsrfToken } : {}),
        },
        body: JSON.stringify({ accepted: true }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          (payload as { error?: { message?: string } }).error?.message
            ?? "Cloud media consent could not be recorded.",
        );
      }
      return roomConsentResponseSchema.parse(payload).mediaGrant;
    }

    async function refreshMediaGrant(): Promise<MediaSessionGrant> {
      const response = await fetch(
        apiUrl(`/v1/rooms/${access.room.id}/media-grants/refresh`),
        {
          method: "POST",
          credentials: "include",
          headers: {
            ...(roomToken ? { "X-Room-Token": roomToken } : {}),
            ...(accountCsrfToken ? { "X-Podcast-Studio-CSRF": accountCsrfToken } : {}),
          },
        },
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          (payload as { error?: { message?: string } }).error?.message
            ?? "Cloud media capabilities could not be renewed.",
        );
      }
      return mediaGrantRefreshResponseSchema.parse(payload).mediaGrant;
    }

    async function joinConversation(
      preparedStream?: MediaStream,
      resumeConsent = false,
    ): Promise<boolean> {
      if (!localRef.current || (!consented && !resumeConsent)) return false;
      setJoining(true);
      onStateChange("Recording consent saved — connecting Cloud media");
      try {
        const stream = preparedStream ?? await selectedStream();
        const grant = await consentForMedia();
        const transport = new WhipWhepTransport(
          grant,
          access.room.settings.videoPreset,
          {
            refreshGrant: refreshMediaGrant,
            onGrantState: (state, detail) => {
              const previous = grantStateRef.current;
              grantStateRef.current = state;
              if (state === "degraded") {
                onStateChange("Cloud media renewal is delayed — active media remains connected");
              } else if (state === "failed") {
                onStateChange(detail);
                onError(detail);
              } else if (previous !== "healthy") {
                onStateChange("Cloud media authorization restored");
              }
            },
            onMetrics: (metrics) => onMetrics(metrics),
            onPeerRoster: (peers) => {
              setRemoteParticipants((current) => peers.map((peer) => {
                const existing = current.find((candidate) =>
                  candidate.participantId === peer.participantId,
                );
                return {
                  participantId: peer.participantId,
                  displayName: peer.displayName,
                  camera: existing?.camera ?? null,
                  screen: existing?.screen ?? null,
                };
              }));
            },
            onRemoteStream: (kind, nextStream, displayName, participantId) => {
              setRemoteParticipants((current) => {
                const existing = current.find((candidate) =>
                  candidate.participantId === participantId,
                );
                const next = {
                  participantId,
                  displayName,
                  camera: kind === "camera" ? nextStream : existing?.camera ?? null,
                  screen: kind === "screen" ? nextStream : existing?.screen ?? null,
                };
                return existing
                  ? current.map((candidate) =>
                    candidate.participantId === participantId ? next : candidate,
                  )
                  : [...current, next];
              });
            },
            onState: (kind, state, detail) => {
              if (kind === "publish") {
                if (state === "connected") {
                  setPublishFailed(false);
                  onConnectedChange(true);
                  reportSourceState("camera", true);
                }
                if (state === "recovering" || state === "failed") {
                  onConnectedChange(false);
                  if (state === "failed") setPublishFailed(true);
                  reportSourceState("camera", false);
                  reportFault(
                    "camera",
                    state === "recovering" ? "connection_recovering" : "connection_failed",
                  );
                }
              }
              if (kind === "screen") {
                if (state === "connected") {
                  reportSourceState("screen", true);
                  reportScreenStarted(true);
                }
                if (state === "idle") {
                  reportScreenStarted(false);
                  reportSourceState("screen", false);
                }
                if (state === "recovering" || state === "failed") {
                  reportScreenStarted(false);
                  reportSourceState("screen", false);
                  reportFault(
                    "screen",
                    state === "recovering" ? "connection_recovering" : "connection_failed",
                  );
                }
              }
              if (kind === "peer" && (state === "connected" || state === "waiting")) {
                onStateChange(detail ?? (state === "connected"
                  ? "The other participant connected"
                  : "Waiting for the other participant to rejoin"));
              } else if (state === "recovering" || state === "failed") {
                onStateChange(detail ?? "Cloud media is reconnecting");
              }
            },
          },
          { fetch: fetchApi },
        );
        transportRef.current = transport;
        await transport.connect(stream);
        activeSpeakerStopRef.current = startActiveSpeakerMonitor(stream, () => {
          queueMediaEvent({
            type: "active_speaker_changed",
            sourceKind: "camera",
            faultCode: null,
          });
        });
        const degradation = preflightWarning(negotiatedMedia(stream));
        if (degradation) reportFault("camera", "negotiated_media_degraded");
        for (const track of stream.getTracks()) {
          track.addEventListener("ended", () => {
            reportSourceState("camera", false);
            reportFault("camera", "track_ended");
          }, { once: true });
        }
        setConnected(true);
        onConnectedChange(true);
        persistDevicePreference({
          cameraEnabled: stream.getVideoTracks().some((track) => track.enabled),
          joined: true,
          microphoneEnabled: stream.getAudioTracks().some((track) => track.enabled),
        });
        onStateChange("Cloud media connected — waiting for the other participant");
        return true;
      } catch (reason) {
        onError(reason instanceof Error ? reason.message : "Cloud media could not connect.");
        onStateChange("Cloud media needs attention");
        return false;
      } finally {
        setJoining(false);
      }
    }

    async function resumeJoinedConversation(preference: MediaDevicePreference) {
      onStateChange("Returning you to the room with your saved devices");
      const stream = await prepareDevices(true);
      if (!stream) return;
      stream.getVideoTracks().forEach((track) => {
        track.enabled = preference.cameraEnabled;
      });
      stream.getAudioTracks().forEach((track) => {
        track.enabled = preference.microphoneEnabled;
      });
      setControlState((current) => ({
        ...current,
        cameraEnabled: preference.cameraEnabled,
        microphoneEnabled: preference.microphoneEnabled,
      }));
      setConsented(true);
      onStateChange("Devices restored — reconnecting to the room");
      await joinConversation(stream, true);
    }

    async function toggleScreenShare() {
      if (!connected || !transportRef.current) return;
      if (screenRef.current) {
        await transportRef.current.stopScreen();
        screenRef.current.getTracks().forEach((track) => track.stop());
        screenRef.current = null;
        setScreenStream(null);
        setControlState((current) => ({ ...current, screenSharing: false }));
        onStateChange("Screen sharing stopped");
        return;
      }
      const next = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: access.room.settings.screenSharePreset === "detail" ? 1920 : 1280 },
          height: { ideal: access.room.settings.screenSharePreset === "detail" ? 1080 : 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: true,
      });
      const track = next.getVideoTracks()[0];
      if (!track) throw new Error("No screen was selected.");
      track.contentHint = "detail";
      screenRef.current = next;
      setScreenStream(next);
      setControlState((current) => ({ ...current, screenSharing: true }));
      track.addEventListener("ended", () => {
        if (!screenRef.current) return;
        reportFault("screen", "track_ended");
        void toggleScreenShare().catch(() => undefined);
      }, { once: true });
      try {
        await transportRef.current.publishScreen(next);
      } catch (reason) {
        next.getTracks().forEach((candidate) => candidate.stop());
        if (screenRef.current === next) screenRef.current = null;
        setScreenStream(null);
        setControlState((current) => ({ ...current, screenSharing: false }));
        throw reason;
      }
      onStateChange("Screen share connected to the conversation");
    }

    function retryCloudMedia() {
      setPublishFailed(false);
      onStateChange("Retrying Cloud media with the existing camera and microphone");
      transportRef.current?.retryCamera();
    }

    async function close() {
      persistDevicePreference({ joined: false });
      setConnected(false);
      onConnectedChange(false);
      await pictureInPictureRef.current?.close();
      activeSpeakerStopRef.current?.();
      activeSpeakerStopRef.current = null;
      screenRef.current?.getTracks().forEach((track) => track.stop());
      screenRef.current = null;
      setScreenStream(null);
      await transportRef.current?.close();
      transportRef.current = null;
      localRef.current?.getTracks().forEach((track) => track.stop());
      localRef.current = null;
      setLocalStream(null);
      setControlState(initialCloudMediaControlState);
      setRemoteParticipants([]);
    }

    useImperativeHandle(ref, () => ({
      close,
      getLocalStream: () => localRef.current,
      requestRecordingKeyFrames: () =>
        transportRef.current?.requestRecordingKeyFrames() ?? Promise.resolve(0),
      setPictureInPictureMode: async (mode) => {
        if (mode) await pictureInPictureRef.current?.open(mode);
        else await pictureInPictureRef.current?.close();
      },
      setParticipantViewMode: setViewMode,
      swapParticipantPositions: () => setSelfFirst((current) => !current),
      toggleCamera: () => {
        const track = localRef.current?.getVideoTracks()[0];
        if (track) {
          track.enabled = !track.enabled;
          persistDevicePreference({ cameraEnabled: track.enabled });
          setControlState((current) => ({ ...current, cameraEnabled: track.enabled }));
        }
      },
      toggleMicrophone: () => {
        const track = localRef.current?.getAudioTracks()[0];
        if (track) {
          track.enabled = !track.enabled;
          persistDevicePreference({ microphoneEnabled: track.enabled });
          setControlState((current) => ({ ...current, microphoneEnabled: track.enabled }));
        }
      },
      toggleScreenShare,
    }));

    useEffect(() => () => {
      activeSpeakerStopRef.current?.();
      screenRef.current?.getTracks().forEach((track) => track.stop());
      localRef.current?.getTracks().forEach((track) => track.stop());
      void transportRef.current?.close();
    }, []);

    if (!connected) {
      const videoProfile = access.room.settings.videoPreset === "data_saver"
        ? "Basic"
        : access.room.settings.videoPreset === "high_fidelity" ? "High" : "Balanced";
      return (
        <section
          className={`cloud-preflight ${localStream ? "devices-ready" : "devices-pending"}`}
          aria-label="Camera and microphone setup"
        >
          <div className="preflight-shell">
            <header className="preflight-heading">
              <div>
                <span className="panel-kicker">READY ROOM</span>
                <h2>Look and sound your best.</h2>
                <p>Choose your devices once. The same feed powers the conversation and Cloud recording.</p>
              </div>
              <div className="preflight-privacy">
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3 5.5 5.6v5.8c0 4.2 2.5 7.7 6.5 9.6 4-1.9 6.5-5.4 6.5-9.6V5.6L12 3Z" /><path d="m9.1 12.2 1.8 1.8 4.2-4.3" /></svg>
                <span><strong>Private preview</strong><small>Nothing is sent until you join.</small></span>
              </div>
            </header>
            <div className="preflight-grid">
              <div className="preflight-preview-panel">
                <div className="preflight-camera">
                  {localStream ? (
                    <video autoPlay muted playsInline ref={localVideoRef} />
                  ) : (
                    <div className="camera-placeholder">
                      <span className="camera-placeholder-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24"><path d="M4 7.5h10.5A1.5 1.5 0 0 1 16 9v6a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 15V9A1.5 1.5 0 0 1 4 7.5Z" /><path d="m16 10 5-2.5v9L16 14" /></svg>
                      </span>
                      <strong>Your preview will appear here</strong>
                      <span>Camera access stays local until you join.</span>
                    </div>
                  )}
                  <span className={`preview-status ${localStream ? "ready" : ""}`}>
                    <i aria-hidden="true" />{localStream ? "Camera ready" : "Preview off"}
                  </span>
                </div>
                <footer className="preflight-preview-footer">
                  <span>
                    <svg aria-hidden="true" viewBox="0 0 24 24"><rect height="11" rx="4" width="7" x="8.5" y="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" /></svg>
                    {localStream ? "Microphone connected" : "Microphone not selected"}
                  </span>
                  <span>{videoProfile} video</span>
                </footer>
              </div>
              <aside className="preflight-controls">
                <div className="preflight-controls-heading">
                  <span>{localStream ? "DEVICES READY" : "DEVICE SETUP"}</span>
                  <h3>{localStream ? "Choose what the room uses" : "Start with your camera and microphone"}</h3>
                  <p>{localStream
                    ? "You can change either device before joining without creating another publisher."
                    : "Your browser will ask for permission once, then show a private preview."}</p>
                </div>
                {!localStream ? (
                  <>
                    <div className="preflight-actions preflight-actions-pending">
                      <button className="preflight-cancel-button" onClick={onCancel} type="button">Cancel</button>
                      <button
                        className="prepare-media-button"
                        disabled={preflightBusy}
                        onClick={() => void prepareDevices()}
                        type="button"
                      >
                        <span className="preflight-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7.5h10.5A1.5 1.5 0 0 1 16 9v6a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 15V9A1.5 1.5 0 0 1 4 7.5Z" /><path d="m16 10 5-2.5v9L16 14" /></svg></span>
                        <span className="preflight-action-copy"><strong>{preflightBusy ? "Opening your devices…" : "Use camera & microphone"}</strong><small>{preflightBusy ? "Approve the browser permission prompt." : "One private preview. One room publication."}</small></span>
                        <span className="preflight-action-arrow" aria-hidden="true">→</span>
                      </button>
                    </div>
                    <div className="preflight-assurances" aria-label="Device setup details">
                      <span><i aria-hidden="true" />No separate recorder capture</span>
                      <span><i aria-hidden="true" />Change devices before joining</span>
                      <span><i aria-hidden="true" />Cloud recording stays host-controlled</span>
                    </div>
                  </>
                ) : (
                  <>
                    <DeviceSelect
                      devices={cameras}
                      icon="camera"
                      label="Camera"
                      labelId="preflight-camera-label"
                      onChange={(nextCameraId) => {
                        setCameraId(nextCameraId);
                        rememberMediaDevicePreference(
                          window.sessionStorage,
                          access.room.id,
                          access.participantId,
                          {
                            cameraId: nextCameraId,
                            cameraEnabled: cameraEnabledPreferenceRef.current,
                            joined: joinedPreferenceRef.current,
                            microphoneId,
                            microphoneEnabled: microphoneEnabledPreferenceRef.current,
                          },
                        );
                      }}
                      onOpenChange={(open) => setDeviceMenu(open ? "camera" : null)}
                      open={deviceMenu === "camera"}
                      value={cameraId}
                    />
                    <DeviceSelect
                      devices={microphones}
                      icon="microphone"
                      label="Microphone"
                      labelId="preflight-microphone-label"
                      onChange={(nextMicrophoneId) => {
                        setMicrophoneId(nextMicrophoneId);
                        rememberMediaDevicePreference(
                          window.sessionStorage,
                          access.room.id,
                          access.participantId,
                          {
                            cameraId,
                            cameraEnabled: cameraEnabledPreferenceRef.current,
                            joined: joinedPreferenceRef.current,
                            microphoneId: nextMicrophoneId,
                            microphoneEnabled: microphoneEnabledPreferenceRef.current,
                          },
                        );
                      }}
                      onOpenChange={(open) => setDeviceMenu(open ? "microphone" : null)}
                      open={deviceMenu === "microphone"}
                      value={microphoneId}
                    />
                    {warning ? <p className="preflight-warning">{warning}</p> : null}
                    <label className="consent-check">
                      <input
                        checked={consented}
                        onChange={(event) => setConsented(event.target.checked)}
                        type="checkbox"
                      />
                      <span><strong>Allow this room to use my media</strong><small>I consent to this session using my camera, microphone, and any screen I choose to share for the conversation and recording workflow.</small></span>
                    </label>
                    <div className="preflight-actions">
                      <button className="preflight-cancel-button" onClick={onCancel} type="button">Cancel</button>
                      <button
                        className="join-media-button"
                        disabled={!consented || joining}
                        onClick={() => void joinConversation()}
                        type="button"
                      ><span>{joining ? "Joining the room…" : "Join the conversation"}</span><span aria-hidden="true">→</span></button>
                    </div>
                  </>
                )}
              </aside>
            </div>
          </div>
        </section>
      );
    }

    // When both participants share, prioritize the peer screen for conversation.
    // The local screen remains published once and available to the Cloud recorder.
    const connectedRemotes = remoteParticipants.filter((participant) => participant.camera);
    const remoteScreenParticipant = remoteParticipants.find((participant) => participant.screen);
    const activeScreen = preferredScreenStream(remoteScreenParticipant?.screen ?? null, screenStream);
    const visibleRemotes = connectedRemotes.length > 0
      ? connectedRemotes
      : remoteParticipants.slice(0, 1);
    const roomVisibility = pictureInPictureRoomVisibility(pictureInPictureMode);
    const roomRemotes = roomVisibility.guests ? visibleRemotes : [];
    const visibleCameraCount = roomRemotes.length + (roomVisibility.self ? 1 : 0);
    const roomViewMode = roomVisibility.guests ? viewMode : "equal";
    return (
      <section className={[
        cloudRoomClass(Boolean(activeScreen), portrait),
        pictureInPictureMode ? "picture-in-picture-active" : "",
        visibleCameraCount === 0 ? "camera-grid-hidden" : "",
      ].filter(Boolean).join(" ")}>
        {publishFailed ? (
          <div className="media-reconnect-notice" role="alert">
            <div>
              <strong>Cloud media is disconnected.</strong>
              <span>Your selected camera and microphone are still available.</span>
            </div>
            <button onClick={retryCloudMedia} type="button">Reconnect Cloud media</button>
          </div>
        ) : null}
        {activeScreen ? <SharedScreenTile
          label={activeScreen === screenStream
            ? "YOUR SCREEN"
            : `${remoteScreenParticipant?.displayName.toUpperCase() ?? "GUEST"} · SCREEN`}
          muted={activeScreen === screenStream}
          stream={activeScreen}
        /> : null}
        {visibleCameraCount > 0 ? <div className={participantGridClass(
          Math.max(0, visibleCameraCount - 1),
          roomViewMode,
          selfFirst,
          portrait,
        )}>
          {roomRemotes.map((participant) => (
            <RemoteParticipantTile key={participant.participantId} participant={participant} />
          ))}
          {roomVisibility.self ? <figure className="participant-tile local-participant">
            <video autoPlay muted playsInline ref={attachLocalVideoRef} />
            <figcaption>YOU · {access.role.toUpperCase()}</figcaption>
          </figure> : null}
        </div> : !activeScreen ? <div className="picture-in-picture-stage-placeholder">
          <svg aria-hidden="true" viewBox="0 0 24 24"><rect height="16" rx="2.5" width="20" x="2" y="4" /><rect height="6" rx="1.2" width="8" x="11" y="11" /></svg>
          <strong>Floating view is active</strong>
          <span>Everyone is in Picture in Picture. Close the floating window to bring camera feeds back here.</span>
        </div> : null}
      </section>
    );
  },
);
