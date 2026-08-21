import type {
  AudioPreset,
  MediaEndpoint,
  MediaSessionGrant,
  RoomParticipantId,
  VideoPreset,
} from "@wiplash/podcast-contracts";
import { mediaSessionGrantSchema } from "@wiplash/podcast-contracts";

export type MediaConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "waiting"
  | "recovering"
  | "failed";

export interface MediaMetrics {
  bitrateKbps: number | null;
  framesPerSecond: number | null;
  height: number | null;
  packetLoss: number | null;
  roundTripMs: number | null;
  width: number | null;
}

export interface MediaTransportCallbacks {
  onGrantState?: (
    state: "healthy" | "degraded" | "failed",
    detail: string,
  ) => void;
  onMetrics?: (metrics: MediaMetrics) => void;
  onPeerRoster?: (peers: Array<{
    displayName: string;
    participantId: RoomParticipantId;
  }>) => void;
  onRemoteStream?: (
    kind: "camera" | "screen",
    stream: MediaStream | null,
    displayName: string,
    participantId: RoomParticipantId,
  ) => void;
  onState?: (
    kind: "publish" | "peer" | "screen",
    state: MediaConnectionState,
    detail?: string,
  ) => void;
  refreshGrant?: () => Promise<MediaSessionGrant>;
}

interface ActiveSpeakerHysteresisOptions {
  attackMs?: number;
  attackThreshold?: number;
  releaseMs?: number;
  releaseThreshold?: number;
}

export class ActiveSpeakerHysteresis {
  readonly #attackMs: number;
  readonly #attackThreshold: number;
  readonly #releaseMs: number;
  readonly #releaseThreshold: number;
  #active = false;
  #candidateSince: number | null = null;
  #quietSince: number | null = null;

  constructor({
    attackMs = 350,
    attackThreshold = 0.045,
    releaseMs = 800,
    releaseThreshold = 0.025,
  }: ActiveSpeakerHysteresisOptions = {}) {
    this.#attackMs = attackMs;
    this.#attackThreshold = attackThreshold;
    this.#releaseMs = releaseMs;
    this.#releaseThreshold = releaseThreshold;
  }

  sample(level: number, now: number): boolean {
    if (!this.#active) {
      if (level < this.#attackThreshold) {
        this.#candidateSince = null;
        return false;
      }
      this.#candidateSince ??= now;
      if (now - this.#candidateSince < this.#attackMs) return false;
      this.#active = true;
      this.#candidateSince = null;
      this.#quietSince = null;
      return true;
    }

    if (level > this.#releaseThreshold) {
      this.#quietSince = null;
      return false;
    }
    this.#quietSince ??= now;
    if (now - this.#quietSince >= this.#releaseMs) {
      this.#active = false;
      this.#quietSince = null;
    }
    return false;
  }
}

export function startActiveSpeakerMonitor(
  stream: MediaStream,
  onActive: () => void,
): () => void {
  const audioTrack = stream.getAudioTracks()[0];
  if (!audioTrack) return () => undefined;
  const context = new AudioContext();
  const source = context.createMediaStreamSource(new MediaStream([audioTrack]));
  const analyser = context.createAnalyser();
  analyser.fftSize = 1_024;
  analyser.smoothingTimeConstant = 0.2;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const hysteresis = new ActiveSpeakerHysteresis();
  let frame = 0;
  let stopped = false;
  const sample = (now: number) => {
    if (stopped) return;
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    if (hysteresis.sample(rms, now)) onActive();
    frame = window.requestAnimationFrame(sample);
  };
  frame = window.requestAnimationFrame(sample);
  return () => {
    if (stopped) return;
    stopped = true;
    window.cancelAnimationFrame(frame);
    source.disconnect();
    analyser.disconnect();
    void context.close();
  };
}

interface MediaSession {
  endpoint: MediaEndpoint;
  etag: string | null;
  peerConnection: RTCPeerConnection;
  released?: boolean;
  resource: string | null;
}

interface KeyFrameSetParameterOptions {
  encodingOptions: Array<{ keyFrame: true }>;
}

type KeyFrameCapableSender = RTCRtpSender & {
  setParameters: (
    parameters: RTCRtpSendParameters,
    options?: KeyFrameSetParameterOptions,
  ) => Promise<void>;
};

interface TransportEnvironment {
  clearInterval: (timer: number) => void;
  clearTimeout: (timer: number) => void;
  createPeerConnection: () => RTCPeerConnection;
  fetch: typeof fetch;
  now: () => number;
  random: () => number;
  recordingBootstrapHoldMs: number;
  setInterval: (callback: () => void, delay: number) => number;
  setTimeout: (callback: () => void, delay: number) => number;
}

const profiles: Record<VideoPreset, {
  frameRate: number;
  height: number;
  maxBitrate: number;
  width: number;
}> = {
  data_saver: { width: 640, height: 360, frameRate: 24, maxBitrate: 1_500_000 },
  balanced: { width: 1280, height: 720, frameRate: 30, maxBitrate: 3_000_000 },
  high_fidelity: { width: 1920, height: 1080, frameRate: 30, maxBitrate: 5_000_000 },
};

const MAX_PUBLISH_RECONNECT_ATTEMPTS = 8;
const MAX_GRANT_REFRESH_ATTEMPTS = 5;
const GRANT_REFRESH_LEAD_MS = 5 * 60 * 1_000;
const MAX_SUBSCRIBER_BACKOFF_ATTEMPT = 8;
export const REMOTE_VIDEO_STALL_GRACE_MS = 3_000;

export class MediaGrantRefreshError extends Error {
  constructor(
    message: string,
    readonly terminal: boolean,
  ) {
    super(message);
    this.name = "MediaGrantRefreshError";
  }
}

export function grantRefreshDelayMs(expiresAt: string, now: number): number {
  const remaining = Date.parse(expiresAt) - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return 0;
  const lead = Math.min(GRANT_REFRESH_LEAD_MS, Math.max(1_000, Math.floor(remaining / 2)));
  return Math.max(0, remaining - lead);
}

function grantEndpoints(grant: MediaSessionGrant): MediaEndpoint[] {
  return [
    grant.publish.camera,
    grant.publish.screen,
    grant.recordingBootstrap.camera,
    grant.recordingBootstrap.screen,
    ...grant.subscribe.flatMap((peer) => [peer.camera, peer.screen]),
  ];
}

function grantIdentity(grant: MediaSessionGrant) {
  const endpointIdentity = (endpoint: MediaEndpoint) => ({
    sourceId: endpoint.sourceId,
    url: endpoint.url,
  });
  return {
    roomId: grant.roomId,
    participantId: grant.participantId,
    publish: {
      participantId: grant.publish.participantId,
      camera: endpointIdentity(grant.publish.camera),
      screen: endpointIdentity(grant.publish.screen),
    },
    recordingBootstrap: {
      participantId: grant.recordingBootstrap.participantId,
      camera: endpointIdentity(grant.recordingBootstrap.camera),
      screen: endpointIdentity(grant.recordingBootstrap.screen),
    },
    subscribe: grant.subscribe.map((peer) => ({
      participantId: peer.participantId,
      camera: endpointIdentity(peer.camera),
      screen: endpointIdentity(peer.screen),
    })),
  };
}

function endpointIdentity(endpoint: Pick<MediaEndpoint, "sourceId" | "url">): string {
  return `${endpoint.sourceId}:${endpoint.url}`;
}

export function acceptRefreshedMediaGrant(
  current: MediaSessionGrant,
  candidate: unknown,
  now: number,
): MediaSessionGrant {
  let next: MediaSessionGrant;
  try {
    next = mediaSessionGrantSchema.parse(candidate);
  } catch {
    throw new MediaGrantRefreshError("Cloud media returned an invalid capability renewal.", true);
  }
  const currentIdentity = grantIdentity(current);
  const nextIdentity = grantIdentity(next);
  const currentPeers = new Map(currentIdentity.subscribe.map((peer) => [peer.participantId, peer]));
  const nextPeers = new Map(nextIdentity.subscribe.map((peer) => [peer.participantId, peer]));
  const ownIdentityChanged = currentIdentity.roomId !== nextIdentity.roomId
    || currentIdentity.participantId !== nextIdentity.participantId
    || currentIdentity.publish.participantId !== nextIdentity.publish.participantId
    || currentIdentity.recordingBootstrap.participantId
      !== nextIdentity.recordingBootstrap.participantId
    || endpointIdentity(current.publish.camera) !== endpointIdentity(next.publish.camera)
    || endpointIdentity(current.publish.screen) !== endpointIdentity(next.publish.screen)
    || endpointIdentity(current.recordingBootstrap.camera)
      !== endpointIdentity(next.recordingBootstrap.camera)
    || endpointIdentity(current.recordingBootstrap.screen)
      !== endpointIdentity(next.recordingBootstrap.screen);
  const existingPeerChanged = [...currentPeers].some(([participantId, peer]) => {
    const candidatePeer = nextPeers.get(participantId);
    return candidatePeer && (
      endpointIdentity(peer.camera) !== endpointIdentity(candidatePeer.camera)
      || endpointIdentity(peer.screen) !== endpointIdentity(candidatePeer.screen)
    );
  });
  if (ownIdentityChanged || existingPeerChanged) {
    throw new MediaGrantRefreshError(
      "Cloud media rejected a capability renewal with a different room or source identity.",
      true,
    );
  }
  if (grantEndpoints(next).some((endpoint) => endpoint.url.includes("?") || endpoint.url.includes("#"))) {
    throw new MediaGrantRefreshError("Cloud media capabilities cannot appear in URLs.", true);
  }
  if (Date.parse(next.expiresAt) <= now || Date.parse(next.expiresAt) <= Date.parse(current.expiresAt)) {
    throw new MediaGrantRefreshError("Cloud media returned a stale capability renewal.", false);
  }
  return next;
}

export function reconnectBackoffMs(
  attempt: number,
  random = Math.random,
): number {
  const base = Math.min(8_000, 500 * (2 ** Math.max(0, attempt)));
  return Math.min(8_000, Math.round(base * (0.75 + random() * 0.5)));
}

export function subscriberBackoffMs(
  kind: "camera" | "screen",
  attempt: number,
  random = Math.random,
): number {
  const initial = kind === "screen" ? 1_500 : 750;
  const maximum = kind === "screen" ? 30_000 : 8_000;
  const base = Math.min(maximum, initial * (2 ** Math.max(0, attempt)));
  return Math.min(maximum, Math.round(base * (0.75 + random() * 0.5)));
}

export function captureConstraints(
  videoPreset: VideoPreset,
  audioPreset: AudioPreset,
  cameraId?: string,
  microphoneId?: string,
): MediaStreamConstraints {
  const profile = profiles[videoPreset];
  const cleanup = audioPreset === "voice";
  return {
    video: {
      deviceId: cameraId ? { exact: cameraId } : undefined,
      width: { ideal: profile.width },
      height: { ideal: profile.height },
      frameRate: { ideal: profile.frameRate, max: profile.frameRate },
    },
    audio: {
      deviceId: microphoneId ? { exact: microphoneId } : undefined,
      autoGainControl: cleanup,
      channelCount: audioPreset === "studio" ? 2 : 1,
      echoCancellation: cleanup,
      noiseSuppression: cleanup,
    },
  };
}

export function negotiatedMedia(stream: MediaStream): MediaMetrics {
  const settings = stream.getVideoTracks()[0]?.getSettings();
  return {
    bitrateKbps: null,
    framesPerSecond: settings?.frameRate ?? null,
    height: settings?.height ?? null,
    packetLoss: null,
    roundTripMs: null,
    width: settings?.width ?? null,
  };
}

export function preflightWarning(metrics: MediaMetrics): string | null {
  if (
    metrics.width !== null
    && metrics.height !== null
    && (metrics.width < 1280 || metrics.height < 720)
  ) {
    return `Camera negotiated ${metrics.width}×${metrics.height}; 1280×720 is recommended.`;
  }
  if (metrics.framesPerSecond !== null && metrics.framesPerSecond < 25) {
    return `Camera negotiated ${Math.round(metrics.framesPerSecond)} fps; 25 fps or higher is recommended.`;
  }
  return null;
}

function waitForIceGathering(peerConnection: RTCPeerConnection): Promise<void> {
  if (peerConnection.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      peerConnection.removeEventListener("icegatheringstatechange", onState);
      reject(new Error("Media connection timed out while gathering network candidates."));
    }, 12_000);
    const onState = () => {
      if (peerConnection.iceGatheringState !== "complete") return;
      window.clearTimeout(timeout);
      peerConnection.removeEventListener("icegatheringstatechange", onState);
      resolve();
    };
    peerConnection.addEventListener("icegatheringstatechange", onState);
  });
}

function preferCodec(transceiver: RTCRtpTransceiver, kind: "audio" | "video") {
  if (typeof RTCRtpSender === "undefined") return;
  const capabilities = RTCRtpSender.getCapabilities?.(kind);
  if (!capabilities || !transceiver.setCodecPreferences) return;
  const preferredMime = kind === "video" ? "video/h264" : "audio/opus";
  const preferred = capabilities.codecs.filter(
    (codec) => codec.mimeType.toLowerCase() === preferredMime,
  );
  if (!preferred.length) return;
  transceiver.setCodecPreferences([
    ...preferred,
    ...capabilities.codecs.filter(
      (codec) => codec.mimeType.toLowerCase() !== preferredMime,
    ),
  ]);
}

async function applySenderLimits(
  peerConnection: RTCPeerConnection,
  maxBitrate: number,
  frameRate: number,
) {
  await Promise.all(peerConnection.getSenders().map(async (sender) => {
    if (!sender.track) return;
    const parameters = sender.getParameters();
    if (!parameters.encodings?.length) parameters.encodings = [{}];
    parameters.encodings[0]!.maxBitrate = sender.track.kind === "video"
      ? maxBitrate
      : 128_000;
    if (sender.track.kind === "video") {
      parameters.encodings[0]!.maxFramerate = frameRate;
      // Talking-head podcasts benefit more from a stable, readable image than
      // from preserving every frame when a participant's upload becomes tight.
      parameters.degradationPreference = "maintain-resolution";
    }
    await sender.setParameters(parameters);
  }));
}

async function requestVideoKeyFrames(peerConnection: RTCPeerConnection): Promise<number> {
  const videoSenders = peerConnection.getSenders().filter((sender) =>
    sender.track?.kind === "video" && sender.track.readyState === "live",
  );
  const results = await Promise.allSettled(videoSenders.map(async (sender) => {
    const parameters = sender.getParameters();
    if (!parameters.encodings?.length) parameters.encodings = [{}];
    await (sender as KeyFrameCapableSender).setParameters(parameters, {
      encodingOptions: parameters.encodings.map(() => ({ keyFrame: true })),
    });
  }));
  return results.filter((result) => result.status === "fulfilled").length;
}

async function releaseSession(
  session: MediaSession,
  request: typeof fetch,
): Promise<void> {
  if (session.released) return;
  session.released = true;
  session.peerConnection.close();
  if (!session.resource) return;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.endpoint.token}`,
    "X-Media-Resource": session.resource,
  };
  if (session.etag) headers["If-Match"] = session.etag;
  try {
    await request(session.endpoint.url, { method: "DELETE", headers });
  } catch {
    // The capability expires quickly and MediaMTX also cleans closed sessions.
  }
}

export class WhipWhepTransport {
  readonly #callbacks: MediaTransportCallbacks;
  readonly #environment: TransportEnvironment;
  #grant: MediaSessionGrant;
  #grantRefreshAttempts = 0;
  #grantRefreshInFlight = false;
  #grantRefreshTerminal = false;
  #grantRefreshTimer: number | null = null;
  readonly #profile: (typeof profiles)[VideoPreset];
  readonly #publishers = new Map<string, MediaSession>();
  readonly #publisherAttempts = new Map<string, number>();
  readonly #publisherConnecting = new Set<string>();
  readonly #publisherDisabled = new Set<string>();
  readonly #publisherRetryTimers = new Map<string, number>();
  readonly #recordingBootstrapConnecting = new Set<string>();
  readonly #recordingBootstrapPendingConnections = new Map<string, RTCPeerConnection>();
  readonly #recordingBootstrapResolvers = new Map<string, () => void>();
  readonly #recordingBootstrapSessions = new Map<string, MediaSession>();
  readonly #recordingBootstrapTimers = new Map<string, number>();
  #recordingBootstrapEnabled = false;
  readonly #subscribers = new Map<string, MediaSession>();
  readonly #subscriberAttempts = new Map<string, number>();
  readonly #subscriberConnecting = new Set<string>();
  readonly #subscriberPendingConnections = new Map<string, RTCPeerConnection>();
  readonly #subscriberHealthTimers = new Map<string, number>();
  readonly #subscriberRetryTimers = new Map<string, number>();
  #closed = false;
  #localStream: MediaStream | null = null;
  #metricsTimer: number | null = null;
  #lastBytes = 0;
  #lastTimestamp = 0;

  constructor(
    grant: MediaSessionGrant,
    videoPreset: VideoPreset,
    callbacks: MediaTransportCallbacks = {},
    environment: Partial<TransportEnvironment> = {},
  ) {
    this.#grant = mediaSessionGrantSchema.parse(grant);
    this.#profile = profiles[videoPreset];
    this.#callbacks = callbacks;
    this.#environment = {
      clearInterval: environment.clearInterval ?? ((timer) => window.clearInterval(timer)),
      clearTimeout: environment.clearTimeout ?? ((timer) => window.clearTimeout(timer)),
      createPeerConnection: environment.createPeerConnection
        ?? (() => new RTCPeerConnection({ bundlePolicy: "max-bundle" })),
      fetch: environment.fetch ?? ((input, init) => window.fetch(input, init)),
      now: environment.now ?? Date.now,
      random: environment.random ?? Math.random,
      recordingBootstrapHoldMs: environment.recordingBootstrapHoldMs ?? 1_500,
      setInterval: environment.setInterval
        ?? ((callback, delay) => window.setInterval(callback, delay)),
      setTimeout: environment.setTimeout
        ?? ((callback, delay) => window.setTimeout(callback, delay)),
    };
    this.#scheduleGrantRefresh();
  }

  async connect(localStream: MediaStream): Promise<void> {
    if (this.#closed) throw new Error("The media transport is closed.");
    this.#localStream = localStream;
    this.#callbacks.onState?.("publish", "connecting", "Publishing camera and microphone");
    const published = await this.#publish(this.#grant.publish.camera, localStream, "publish");
    if (!published) return;
    this.#callbacks.onState?.("publish", "connected", "Camera and microphone published");
    this.#startMetrics();
    this.#emitPeerRoster();

    for (const peer of this.#grant.subscribe) {
      void this.#subscribeWithRetry(peer.camera.sourceId, "camera", peer.displayName);
      void this.#subscribeWithRetry(peer.screen.sourceId, "screen", peer.displayName);
    }
  }

  async synchronizePeers(): Promise<void> {
    await this.#refreshGrant();
  }

  async publishScreen(stream: MediaStream): Promise<void> {
    this.#callbacks.onState?.("screen", "connecting", "Publishing shared screen");
    if (await this.#publish(this.#grant.publish.screen, stream, "screen")) {
      this.#callbacks.onState?.("screen", "connected", "Screen share published");
    }
  }

  async requestRecordingKeyFrames(): Promise<number> {
    if (this.#closed) return 0;
    this.#recordingBootstrapEnabled = true;
    const results = await Promise.all([...this.#publishers.values()].map((session) =>
      this.#requestCleanRecordingFrame(session),
    ));
    return results.reduce<number>((total, count) => total + count, 0);
  }

  async stopScreen(): Promise<void> {
    this.#publisherDisabled.add(this.#grant.publish.screen.sourceId);
    this.#cancelPublisherRetry(this.#grant.publish.screen.sourceId);
    this.#cancelRecordingBootstrap(this.#grant.publish.screen.sourceId);
    const session = this.#publishers.get(this.#grant.publish.screen.sourceId);
    if (session) {
      this.#publishers.delete(this.#grant.publish.screen.sourceId);
      await releaseSession(session, this.#environment.fetch);
    }
    this.#callbacks.onState?.("screen", "idle", "Screen share stopped");
  }

  retryCamera(): void {
    const endpoint = this.#grant.publish.camera;
    const stream = this.#localStream;
    if (
      this.#closed
      || !stream
      || this.#publishers.has(endpoint.sourceId)
      || this.#publisherConnecting.has(endpoint.sourceId)
      || !stream.getTracks().some((track) => track.readyState === "live")
    ) return;
    this.#publisherDisabled.delete(endpoint.sourceId);
    this.#cancelPublisherRetry(endpoint.sourceId);
    this.#callbacks.onState?.("publish", "recovering", "Cloud media is reconnecting");
    this.#schedulePublisherReconnect(endpoint.sourceId, stream, "publish");
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#metricsTimer !== null) this.#environment.clearInterval(this.#metricsTimer);
    this.#metricsTimer = null;
    if (this.#grantRefreshTimer !== null) {
      this.#environment.clearTimeout(this.#grantRefreshTimer);
      this.#grantRefreshTimer = null;
    }
    for (const timer of this.#publisherRetryTimers.values()) this.#environment.clearTimeout(timer);
    this.#publisherRetryTimers.clear();
    for (const timer of this.#recordingBootstrapTimers.values()) {
      this.#environment.clearTimeout(timer);
    }
    this.#recordingBootstrapTimers.clear();
    for (const resolve of this.#recordingBootstrapResolvers.values()) resolve();
    this.#recordingBootstrapResolvers.clear();
    for (const peerConnection of this.#recordingBootstrapPendingConnections.values()) {
      peerConnection.close();
    }
    this.#recordingBootstrapPendingConnections.clear();
    for (const timer of this.#subscriberRetryTimers.values()) this.#environment.clearTimeout(timer);
    this.#subscriberRetryTimers.clear();
    for (const timer of this.#subscriberHealthTimers.values()) this.#environment.clearTimeout(timer);
    this.#subscriberHealthTimers.clear();
    for (const peerConnection of this.#subscriberPendingConnections.values()) {
      peerConnection.close();
    }
    this.#subscriberPendingConnections.clear();
    const sessions = [
      ...this.#publishers.values(),
      ...this.#recordingBootstrapSessions.values(),
      ...this.#subscribers.values(),
    ];
    this.#publishers.clear();
    this.#recordingBootstrapSessions.clear();
    this.#subscribers.clear();
    await Promise.all(sessions.map((session) =>
      releaseSession(session, this.#environment.fetch),
    ));
    this.#localStream?.getTracks().forEach((track) => track.stop());
    this.#localStream = null;
  }

  #scheduleGrantRefresh(delay = grantRefreshDelayMs(
    this.#grant.expiresAt,
    this.#environment.now(),
  )): void {
    if (this.#closed || this.#grantRefreshTerminal || !this.#callbacks.refreshGrant) return;
    if (this.#grantRefreshTimer !== null) {
      this.#environment.clearTimeout(this.#grantRefreshTimer);
    }
    this.#grantRefreshTimer = this.#environment.setTimeout(() => {
      this.#grantRefreshTimer = null;
      void this.#refreshGrant();
    }, Math.max(0, delay));
  }

  #scheduleGrantExpiryFailure(): void {
    const remaining = Math.max(0, Date.parse(this.#grant.expiresAt) - this.#environment.now());
    if (this.#grantRefreshTimer !== null) this.#environment.clearTimeout(this.#grantRefreshTimer);
    this.#grantRefreshTimer = this.#environment.setTimeout(() => {
      this.#grantRefreshTimer = null;
      if (this.#closed) return;
      this.#callbacks.onGrantState?.(
        "failed",
        "Cloud media capabilities expired; active media may continue but reconnect cannot authenticate.",
      );
    }, remaining);
  }

  async #refreshGrant(): Promise<void> {
    if (
      this.#closed
      || this.#grantRefreshInFlight
      || this.#grantRefreshTerminal
      || !this.#callbacks.refreshGrant
    ) return;
    this.#grantRefreshInFlight = true;
    try {
      const candidate = await this.#callbacks.refreshGrant();
      if (this.#closed) return;
      const previous = this.#grant;
      const next = acceptRefreshedMediaGrant(
        this.#grant,
        candidate,
        this.#environment.now(),
      );
      this.#grant = next;
      await this.#reconcilePeerSubscriptions(previous, next);
      this.#grantRefreshAttempts = 0;
      this.#callbacks.onGrantState?.("healthy", "Cloud media capabilities renewed.");
      this.#scheduleGrantRefresh();
    } catch (reason) {
      if (this.#closed) return;
      const terminal = reason instanceof MediaGrantRefreshError && reason.terminal;
      if (terminal) {
        this.#grantRefreshTerminal = true;
        this.#callbacks.onGrantState?.(
          "failed",
          reason instanceof Error ? reason.message : "Cloud media capability renewal was rejected.",
        );
        return;
      }
      this.#grantRefreshAttempts += 1;
      const remaining = Date.parse(this.#grant.expiresAt) - this.#environment.now();
      if (remaining <= 0) {
        this.#callbacks.onGrantState?.(
          "failed",
          "Cloud media capabilities expired before they could be renewed.",
        );
        return;
      }
      this.#callbacks.onGrantState?.(
        "degraded",
        "Cloud media capability renewal is delayed; active media remains connected.",
      );
      if (this.#grantRefreshAttempts >= MAX_GRANT_REFRESH_ATTEMPTS) {
        this.#scheduleGrantExpiryFailure();
      } else {
        this.#scheduleGrantRefresh(Math.min(
          remaining,
          reconnectBackoffMs(this.#grantRefreshAttempts - 1, this.#environment.random),
        ));
      }
    } finally {
      this.#grantRefreshInFlight = false;
    }
  }

  async #publish(
    endpoint: MediaEndpoint,
    stream: MediaStream,
    stateKind: "publish" | "screen",
  ): Promise<boolean> {
    this.#publisherDisabled.delete(endpoint.sourceId);
    this.#cancelPublisherRetry(endpoint.sourceId);
    this.#publisherAttempts.set(endpoint.sourceId, 0);
    return this.#establishPublisher(endpoint, stream, stateKind);
  }

  async #establishPublisher(
    endpoint: MediaEndpoint,
    stream: MediaStream,
    stateKind: "publish" | "screen",
  ): Promise<boolean> {
    if (this.#closed || this.#publisherConnecting.has(endpoint.sourceId)) return false;
    this.#publisherConnecting.add(endpoint.sourceId);
    const peerConnection = this.#environment.createPeerConnection();
    peerConnection.addEventListener("connectionstatechange", () => {
      const state = peerConnection.connectionState;
      if (state === "failed" || state === "disconnected") {
        const current = this.#publishers.get(endpoint.sourceId);
        if (current?.peerConnection === peerConnection) {
          void this.#recoverPublisher(endpoint, stream, stateKind, current);
        }
      }
      if (state === "connected") {
        this.#publisherAttempts.set(endpoint.sourceId, 0);
        this.#callbacks.onState?.(stateKind, "connected", "Cloud media acknowledged");
      }
    });
    for (const track of stream.getTracks()) {
      const transceiver = peerConnection.addTransceiver(track, {
        direction: "sendonly",
        streams: [stream],
      });
      preferCodec(transceiver, track.kind as "audio" | "video");
    }

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await waitForIceGathering(peerConnection);
    let response: Response;
    try {
      response = await this.#environment.fetch(endpoint.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${endpoint.token}`,
          "Content-Type": "application/sdp",
        },
        body: peerConnection.localDescription?.sdp,
      });
    } catch {
      peerConnection.close();
      this.#publisherConnecting.delete(endpoint.sourceId);
      throw new Error("Cloud media could not be reached.");
    }
    if (!response.ok) {
      peerConnection.close();
      this.#publisherConnecting.delete(endpoint.sourceId);
      throw new Error(`Cloud media rejected the publication (HTTP ${response.status}).`);
    }
    const session = {
      endpoint,
      etag: response.headers.get("ETag"),
      peerConnection,
      resource: response.headers.get("X-Media-Resource"),
    };
    try {
      await peerConnection.setRemoteDescription({ type: "answer", sdp: await response.text() });
      await applySenderLimits(
        peerConnection,
        stateKind === "screen"
          ? Math.max(this.#profile.maxBitrate, 5_000_000)
          : this.#profile.maxBitrate,
        stateKind === "screen" ? 30 : this.#profile.frameRate,
      );
      if (this.#closed || this.#publisherDisabled.has(endpoint.sourceId)) {
        await releaseSession(session, this.#environment.fetch);
        this.#publisherConnecting.delete(endpoint.sourceId);
        return false;
      }
      this.#publishers.set(endpoint.sourceId, session);
      this.#publisherConnecting.delete(endpoint.sourceId);
      if (this.#recordingBootstrapEnabled) {
        void this.#requestCleanRecordingFrame(session);
      }
      return true;
    } catch (reason) {
      await releaseSession(session, this.#environment.fetch);
      this.#publisherConnecting.delete(endpoint.sourceId);
      throw reason;
    }
  }

  async #recoverPublisher(
    endpoint: MediaEndpoint,
    stream: MediaStream,
    stateKind: "publish" | "screen",
    session: MediaSession,
  ): Promise<void> {
    if (this.#closed || this.#publishers.get(endpoint.sourceId) !== session) return;
    this.#publishers.delete(endpoint.sourceId);
    this.#callbacks.onState?.(stateKind, "recovering", "Cloud media is reconnecting");
    await releaseSession(session, this.#environment.fetch);
    this.#schedulePublisherReconnect(endpoint.sourceId, stream, stateKind);
  }

  #schedulePublisherReconnect(
    sourceId: string,
    stream: MediaStream,
    stateKind: "publish" | "screen",
  ): void {
    if (
      this.#closed
      || this.#publisherDisabled.has(sourceId)
      || this.#publisherConnecting.has(sourceId)
      || this.#publisherRetryTimers.has(sourceId)
    ) return;
    if (!stream.getTracks().some((track) => track.readyState === "live")) {
      this.#callbacks.onState?.(stateKind, "failed", "The captured media track ended");
      return;
    }
    const attempt = this.#publisherAttempts.get(sourceId) ?? 0;
    if (attempt >= MAX_PUBLISH_RECONNECT_ATTEMPTS) {
      this.#callbacks.onState?.(stateKind, "failed", "Cloud media could not reconnect");
      return;
    }
    this.#publisherAttempts.set(sourceId, attempt + 1);
    const timer = this.#environment.setTimeout(() => {
      this.#publisherRetryTimers.delete(sourceId);
      const endpoint = this.#publishEndpoint(sourceId);
      if (!endpoint) {
        this.#callbacks.onState?.(stateKind, "failed", "Cloud media source identity changed");
        return;
      }
      void this.#establishPublisher(endpoint, stream, stateKind)
        .catch(() => this.#schedulePublisherReconnect(sourceId, stream, stateKind));
    }, reconnectBackoffMs(attempt, this.#environment.random));
    this.#publisherRetryTimers.set(sourceId, timer);
  }

  #publishEndpoint(sourceId: string): MediaEndpoint | null {
    return [this.#grant.publish.camera, this.#grant.publish.screen]
      .find((endpoint) => endpoint.sourceId === sourceId) ?? null;
  }

  #recordingBootstrapEndpoint(sourceId: string): MediaEndpoint | null {
    return [
      this.#grant.recordingBootstrap.camera,
      this.#grant.recordingBootstrap.screen,
    ].find((endpoint) => endpoint.sourceId === sourceId) ?? null;
  }

  async #requestCleanRecordingFrame(session: MediaSession): Promise<number> {
    const [senderRequests, bootstrapped] = await Promise.all([
      requestVideoKeyFrames(session.peerConnection),
      this.#bootstrapRecordingSource(session.endpoint.sourceId),
    ]);
    return senderRequests > 0 || bootstrapped ? 1 : 0;
  }

  async #bootstrapRecordingSource(sourceId: string): Promise<boolean> {
    if (
      this.#closed
      || this.#recordingBootstrapConnecting.has(sourceId)
      || this.#recordingBootstrapSessions.has(sourceId)
      || !this.#publishers.has(sourceId)
    ) return false;
    const endpoint = this.#recordingBootstrapEndpoint(sourceId);
    if (!endpoint) return false;

    this.#recordingBootstrapConnecting.add(sourceId);
    const peerConnection = this.#environment.createPeerConnection();
    this.#recordingBootstrapPendingConnections.set(sourceId, peerConnection);
    let session: MediaSession | null = null;
    try {
      peerConnection.addTransceiver("video", { direction: "recvonly" });
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await waitForIceGathering(peerConnection);
      const response = await this.#environment.fetch(endpoint.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${endpoint.token}`,
          "Content-Type": "application/sdp",
        },
        body: peerConnection.localDescription?.sdp,
      });
      if (!response.ok) return false;
      session = {
        endpoint,
        etag: response.headers.get("ETag"),
        peerConnection,
        resource: response.headers.get("X-Media-Resource"),
      };
      await peerConnection.setRemoteDescription({ type: "answer", sdp: await response.text() });
      if (this.#recordingBootstrapPendingConnections.get(sourceId) === peerConnection) {
        this.#recordingBootstrapPendingConnections.delete(sourceId);
      }
      if (this.#closed || !this.#publishers.has(sourceId)) {
        await releaseSession(session, this.#environment.fetch);
        return false;
      }
      this.#recordingBootstrapSessions.set(sourceId, session);
      await this.#holdRecordingBootstrap(sourceId);
      return true;
    } catch {
      return false;
    } finally {
      if (this.#recordingBootstrapPendingConnections.get(sourceId) === peerConnection) {
        this.#recordingBootstrapPendingConnections.delete(sourceId);
      }
      this.#recordingBootstrapConnecting.delete(sourceId);
      const active = this.#recordingBootstrapSessions.get(sourceId);
      if (active && active === session) {
        this.#recordingBootstrapSessions.delete(sourceId);
        await releaseSession(active, this.#environment.fetch);
      } else if (session) {
        await releaseSession(session, this.#environment.fetch);
      } else if (!session) {
        peerConnection.close();
      }
    }
  }

  async #holdRecordingBootstrap(sourceId: string): Promise<void> {
    if (this.#closed || this.#environment.recordingBootstrapHoldMs <= 0) return;
    await new Promise<void>((resolve) => {
      const finish = () => {
        this.#recordingBootstrapTimers.delete(sourceId);
        this.#recordingBootstrapResolvers.delete(sourceId);
        resolve();
      };
      this.#recordingBootstrapResolvers.set(sourceId, finish);
      this.#recordingBootstrapTimers.set(sourceId, this.#environment.setTimeout(
        finish,
        this.#environment.recordingBootstrapHoldMs,
      ));
    });
  }

  #cancelRecordingBootstrap(sourceId: string): void {
    const timer = this.#recordingBootstrapTimers.get(sourceId);
    if (timer !== undefined) this.#environment.clearTimeout(timer);
    this.#recordingBootstrapTimers.delete(sourceId);
    this.#recordingBootstrapResolvers.get(sourceId)?.();
    this.#recordingBootstrapResolvers.delete(sourceId);
    this.#recordingBootstrapPendingConnections.get(sourceId)?.close();
    this.#recordingBootstrapPendingConnections.delete(sourceId);
  }

  #cancelPublisherRetry(sourceId: string): void {
    const timer = this.#publisherRetryTimers.get(sourceId);
    if (timer !== undefined) this.#environment.clearTimeout(timer);
    this.#publisherRetryTimers.delete(sourceId);
    this.#publisherAttempts.delete(sourceId);
  }

  async #subscribeWithRetry(
    sourceId: string,
    kind: "camera" | "screen",
    displayName: string,
  ): Promise<void> {
    if (
      this.#closed
      || this.#subscribers.has(sourceId)
      || this.#subscriberConnecting.has(sourceId)
      || this.#subscriberRetryTimers.has(sourceId)
    ) return;
    this.#subscriberConnecting.add(sourceId);
    if ((this.#subscriberAttempts.get(sourceId) ?? 0) === 0) {
      this.#callbacks.onState?.("peer", "waiting", `Waiting for ${displayName}`);
    }
    let shouldRetry = false;
    try {
      const endpoint = this.#subscribeEndpoint(sourceId);
      if (!endpoint) throw new Error("The peer media source identity changed.");
      await this.#subscribe(endpoint, kind, displayName);
      this.#subscriberAttempts.delete(sourceId);
    } catch (reason) {
      if (reason instanceof Error && reason.message.includes("capability")) {
        this.#callbacks.onState?.("peer", "failed", reason.message);
      } else {
        shouldRetry = true;
      }
    } finally {
      this.#subscriberConnecting.delete(sourceId);
    }
    if (shouldRetry) {
      this.#scheduleSubscriberRetry(sourceId, kind, displayName);
    }
  }

  #scheduleSubscriberRetry(
    sourceId: string,
    kind: "camera" | "screen",
    displayName: string,
  ): void {
    if (
      this.#closed
      || this.#subscribers.has(sourceId)
      || this.#subscriberConnecting.has(sourceId)
      || this.#subscriberRetryTimers.has(sourceId)
    ) return;
    const attempt = this.#subscriberAttempts.get(sourceId) ?? 0;
    const timer = this.#environment.setTimeout(() => {
      this.#subscriberRetryTimers.delete(sourceId);
      void this.#subscribeWithRetry(sourceId, kind, displayName);
    }, subscriberBackoffMs(kind, attempt, this.#environment.random));
    this.#subscriberAttempts.set(
      sourceId,
      Math.min(MAX_SUBSCRIBER_BACKOFF_ATTEMPT, attempt + 1),
    );
    this.#subscriberRetryTimers.set(sourceId, timer);
  }

  #subscribeEndpoint(sourceId: string): MediaEndpoint | null {
    return this.#grant.subscribe
      .flatMap((peer) => [peer.camera, peer.screen])
      .find((endpoint) => endpoint.sourceId === sourceId) ?? null;
  }

  #peerForSource(sourceId: string) {
    return this.#grant.subscribe.find((peer) =>
      peer.camera.sourceId === sourceId || peer.screen.sourceId === sourceId,
    ) ?? null;
  }

  #emitPeerRoster(): void {
    this.#callbacks.onPeerRoster?.(this.#grant.subscribe.map((peer) => ({
      participantId: peer.participantId,
      displayName: peer.displayName,
    })));
  }

  async #reconcilePeerSubscriptions(
    previous: MediaSessionGrant,
    next: MediaSessionGrant,
  ): Promise<void> {
    if (!this.#localStream || this.#closed) {
      this.#emitPeerRoster();
      return;
    }
    const nextSourceIds = new Set(next.subscribe.flatMap((peer) => [
      peer.camera.sourceId,
      peer.screen.sourceId,
    ]));
    const nextParticipantIds = new Set(next.subscribe.map((peer) => peer.participantId));
    const departedPeers = previous.subscribe.filter((peer) =>
      !nextParticipantIds.has(peer.participantId),
    );
    const removed = previous.subscribe.flatMap((peer) => [
      { endpoint: peer.camera, kind: "camera" as const, peer },
      { endpoint: peer.screen, kind: "screen" as const, peer },
    ]).filter(({ endpoint }) => !nextSourceIds.has(endpoint.sourceId));
    await Promise.all(removed.map(async ({ endpoint, kind, peer }) => {
      const retry = this.#subscriberRetryTimers.get(endpoint.sourceId);
      if (retry !== undefined) this.#environment.clearTimeout(retry);
      this.#subscriberRetryTimers.delete(endpoint.sourceId);
      this.#subscriberAttempts.delete(endpoint.sourceId);
      const health = this.#subscriberHealthTimers.get(endpoint.sourceId);
      if (health !== undefined) this.#environment.clearTimeout(health);
      this.#subscriberHealthTimers.delete(endpoint.sourceId);
      this.#subscriberConnecting.delete(endpoint.sourceId);
      this.#subscriberPendingConnections.get(endpoint.sourceId)?.close();
      this.#subscriberPendingConnections.delete(endpoint.sourceId);
      const session = this.#subscribers.get(endpoint.sourceId);
      this.#subscribers.delete(endpoint.sourceId);
      if (session) await releaseSession(session, this.#environment.fetch);
      this.#callbacks.onRemoteStream?.(
        kind,
        null,
        peer.displayName,
        peer.participantId,
      );
    }));
    this.#emitPeerRoster();
    for (const peer of departedPeers) {
      this.#callbacks.onState?.(
        "peer",
        "waiting",
        `${peer.displayName} left the room — waiting for them to rejoin`,
      );
    }

    const previousSourceIds = new Set(previous.subscribe.flatMap((peer) => [
      peer.camera.sourceId,
      peer.screen.sourceId,
    ]));
    for (const peer of next.subscribe) {
      if (!previousSourceIds.has(peer.camera.sourceId)) {
        void this.#subscribeWithRetry(peer.camera.sourceId, "camera", peer.displayName);
      }
      if (!previousSourceIds.has(peer.screen.sourceId)) {
        void this.#subscribeWithRetry(peer.screen.sourceId, "screen", peer.displayName);
      }
    }
  }

  async #subscribe(
    endpoint: MediaEndpoint,
    kind: "camera" | "screen",
    displayName: string,
  ): Promise<void> {
    const participantId = this.#peerForSource(endpoint.sourceId)?.participantId;
    if (!participantId) throw new Error("The peer media source identity changed.");
    const peerConnection = this.#environment.createPeerConnection();
    this.#subscriberPendingConnections.set(endpoint.sourceId, peerConnection);
    const remoteStream = new MediaStream();
    let recovering = false;
    const cancelStallRecovery = () => {
      const timer = this.#subscriberHealthTimers.get(endpoint.sourceId);
      if (timer !== undefined) this.#environment.clearTimeout(timer);
      this.#subscriberHealthTimers.delete(endpoint.sourceId);
    };
    const recover = () => {
      if (recovering || this.#closed) return;
      recovering = true;
      cancelStallRecovery();
      const session = this.#subscribers.get(endpoint.sourceId);
      this.#subscribers.delete(endpoint.sourceId);
      this.#callbacks.onRemoteStream?.(kind, null, displayName, participantId);
      this.#callbacks.onState?.("peer", "recovering", `Reconnecting ${displayName}`);
      const release = session
        ? releaseSession(session, this.#environment.fetch)
        : Promise.resolve(peerConnection.close());
      void release.finally(() => {
        // A track can mute while the initial WHEP setup is still unwinding.
        // Clear that attempt before reconnecting so subscriberConnecting does
        // not discard the only recovery attempt.
        this.#subscriberConnecting.delete(endpoint.sourceId);
        void this.#subscribeWithRetry(endpoint.sourceId, kind, displayName);
      });
    };
    peerConnection.addTransceiver("video", { direction: "recvonly" });
    peerConnection.addTransceiver("audio", { direction: "recvonly" });
    peerConnection.addEventListener("track", (event) => {
      if (!remoteStream.getTracks().some((track) => track.id === event.track.id)) {
        remoteStream.addTrack(event.track);
      }
      event.track.addEventListener("ended", recover, { once: true });
      if (event.track.kind === "video") {
        event.track.addEventListener("mute", () => {
          cancelStallRecovery();
          const timer = this.#environment.setTimeout(() => {
            this.#subscriberHealthTimers.delete(endpoint.sourceId);
            if (event.track.muted) recover();
          }, REMOTE_VIDEO_STALL_GRACE_MS);
          this.#subscriberHealthTimers.set(endpoint.sourceId, timer);
        });
        event.track.addEventListener("unmute", cancelStallRecovery);
      }
      this.#callbacks.onRemoteStream?.(kind, remoteStream, displayName, participantId);
    });
    remoteStream.addEventListener("removetrack", () => {
      if (!remoteStream.getTracks().some((track) => track.readyState === "live")) recover();
    });
    peerConnection.addEventListener("connectionstatechange", () => {
      const state = peerConnection.connectionState;
      if (state === "connected") {
        this.#callbacks.onState?.("peer", "connected", `${displayName} connected`);
      }
      if ((state === "failed" || state === "disconnected") && !this.#closed) {
        const session = this.#subscribers.get(endpoint.sourceId);
        if (session?.peerConnection === peerConnection) recover();
      }
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await waitForIceGathering(peerConnection);
    let response: Response;
    try {
      response = await this.#environment.fetch(endpoint.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${endpoint.token}`,
          "Content-Type": "application/sdp",
        },
        body: peerConnection.localDescription?.sdp,
      });
    } catch {
      peerConnection.close();
      this.#subscriberPendingConnections.delete(endpoint.sourceId);
      throw new Error("Peer media is not available yet.");
    }
    if (!response.ok) {
      peerConnection.close();
      this.#subscriberPendingConnections.delete(endpoint.sourceId);
      const message = response.status === 401
        ? "The peer media capability expired. Rejoin the room to continue."
        : `Peer media is not available yet (HTTP ${response.status}).`;
      throw new Error(message);
    }
    const session = {
      endpoint,
      etag: response.headers.get("ETag"),
      peerConnection,
      resource: response.headers.get("X-Media-Resource"),
    };
    try {
      await peerConnection.setRemoteDescription({ type: "answer", sdp: await response.text() });
      this.#subscriberPendingConnections.delete(endpoint.sourceId);
      if (this.#closed || !this.#subscribeEndpoint(endpoint.sourceId)) {
        await releaseSession(session, this.#environment.fetch);
        return;
      }
      this.#subscribers.set(endpoint.sourceId, session);
    } catch (reason) {
      this.#subscriberPendingConnections.delete(endpoint.sourceId);
      await releaseSession(session, this.#environment.fetch);
      throw reason;
    }
  }

  #startMetrics() {
    if (this.#metricsTimer !== null) this.#environment.clearInterval(this.#metricsTimer);
    this.#metricsTimer = this.#environment.setInterval(() => void this.#collectMetrics(), 2_000);
  }

  async #collectMetrics() {
    const publisher = this.#publishers.get(this.#grant.publish.camera.sourceId);
    if (!publisher || !this.#localStream) return;
    const metrics = negotiatedMedia(this.#localStream);
    const reports = await publisher.peerConnection.getStats();
    for (const report of reports.values()) {
      const value = report as RTCStats & Record<string, number | string | undefined>;
      if (value.type === "outbound-rtp" && value.kind === "video") {
        const bytes = Number(value.bytesSent ?? 0);
        const timestamp = Number(value.timestamp ?? 0);
        if (this.#lastTimestamp && timestamp > this.#lastTimestamp) {
          metrics.bitrateKbps = Math.max(
            0,
            Math.round(((bytes - this.#lastBytes) * 8) / (timestamp - this.#lastTimestamp)),
          );
        }
        metrics.framesPerSecond = Number(value.framesPerSecond ?? metrics.framesPerSecond);
        this.#lastBytes = bytes;
        this.#lastTimestamp = timestamp;
      }
      if (value.type === "remote-inbound-rtp" && value.kind === "video") {
        metrics.packetLoss = Number(value.packetsLost ?? 0);
        metrics.roundTripMs = value.roundTripTime === undefined
          ? null
          : Math.round(Number(value.roundTripTime) * 1_000);
      }
    }
    this.#callbacks.onMetrics?.(metrics);
  }
}
