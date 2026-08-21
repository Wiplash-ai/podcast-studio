import { describe, expect, it } from "vitest";

import type { MediaSessionGrant } from "@wiplash/podcast-contracts";

import {
  ActiveSpeakerHysteresis,
  MediaGrantRefreshError,
  WhipWhepTransport,
  acceptRefreshedMediaGrant,
  captureConstraints,
  negotiatedMedia,
  preflightWarning,
  grantRefreshDelayMs,
  reconnectBackoffMs,
  REMOTE_VIDEO_STALL_GRACE_MS,
  subscriberBackoffMs,
} from "./media-transport";

const cameraSourceId = `ps_${"1".repeat(32)}`;
const screenSourceId = `ps_${"2".repeat(32)}`;
const grant: MediaSessionGrant = {
  transport: "whip_whep",
  roomId: "342db180-8dbf-4bc7-9fa8-3b0b29084f8d",
  participantId: "host",
  publish: {
    participantId: "host",
    displayName: "Host",
    camera: {
      sourceId: cameraSourceId,
      url: `/v1/media/sources/${cameraSourceId}/whip`,
      token: "c".repeat(32),
    },
    screen: {
      sourceId: screenSourceId,
      url: `/v1/media/sources/${screenSourceId}/whip`,
      token: "s".repeat(32),
    },
  },
  recordingBootstrap: {
    participantId: "host",
    displayName: "Host",
    camera: {
      sourceId: cameraSourceId,
      url: `/v1/media/sources/${cameraSourceId}/whep`,
      token: "r".repeat(32),
    },
    screen: {
      sourceId: screenSourceId,
      url: `/v1/media/sources/${screenSourceId}/whep`,
      token: "t".repeat(32),
    },
  },
  subscribe: [],
  expiresAt: "2026-08-13T14:00:00.000Z",
};

class DeterministicScheduler {
  readonly delays: number[] = [];
  now = 0;
  readonly #tasks = new Map<number, { callback: () => void; dueAt: number }>();
  #nextId = 1;

  setTimeout = (callback: () => void, delay: number): number => {
    const id = this.#nextId++;
    this.delays.push(delay);
    this.#tasks.set(id, { callback, dueAt: this.now + delay });
    return id;
  };

  clearTimeout = (id: number): void => {
    this.#tasks.delete(id);
  };

  get pending(): number {
    return this.#tasks.size;
  }

  runNext(): void {
    const next = [...this.#tasks.entries()].sort((left, right) =>
      left[1].dueAt - right[1].dueAt || left[0] - right[0],
    )[0];
    if (!next) return;
    this.#tasks.delete(next[0]);
    this.now = next[1].dueAt;
    next[1].callback();
  }
}

class FakePeerConnection {
  connectionState: RTCPeerConnectionState = "new";
  iceGatheringState: RTCIceGatheringState = "complete";
  localDescription: RTCSessionDescription | null = null;
  readonly addedStreams: MediaStream[] = [];
  readonly keyFrameRequests: Array<{
    options: unknown;
    track: MediaStreamTrack;
  }> = [];
  readonly senders: RTCRtpSender[] = [];
  closed = false;
  readonly #listeners = new Map<string, Set<(event: Event | { track: MediaStreamTrack }) => void>>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const callback = (event: Event | { track: MediaStreamTrack }) => {
      if (typeof listener === "function") listener(event as Event);
      else listener.handleEvent(event as Event);
    };
    const listeners = this.#listeners.get(type)
      ?? new Set<(event: Event | { track: MediaStreamTrack }) => void>();
    listeners.add(callback);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(): void {}

  addTransceiver(track: MediaStreamTrack | string, init?: RTCRtpTransceiverInit): RTCRtpTransceiver {
    if (init?.streams?.[0]) this.addedStreams.push(init.streams[0]);
    this.senders.push({
      track: typeof track === "string" ? null : track,
      getParameters: () => ({ encodings: [{}] }),
      setParameters: async (_parameters: RTCRtpSendParameters, options?: unknown) => {
        if (options && typeof track !== "string") {
          this.keyFrameRequests.push({ options, track });
        }
      },
    } as unknown as RTCRtpSender);
    return { setCodecPreferences: () => undefined } as unknown as RTCRtpTransceiver;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: "v=0\r\n" };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = description as RTCSessionDescription;
  }

  async setRemoteDescription(): Promise<void> {}

  getSenders(): RTCRtpSender[] {
    return this.senders;
  }

  async getStats(): Promise<RTCStatsReport> {
    return new Map() as unknown as RTCStatsReport;
  }

  close(): void {
    this.closed = true;
    this.connectionState = "closed";
  }

  transition(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    for (const listener of this.#listeners.get("connectionstatechange") ?? []) {
      listener(new Event("connectionstatechange"));
    }
  }

  emitTrack(track: MediaStreamTrack): void {
    for (const listener of this.#listeners.get("track") ?? []) listener({ track });
  }
}

class FakeRemoteTrack {
  readonly id: string;
  readonly kind: "audio" | "video";
  muted = false;
  readyState: MediaStreamTrackState = "live";
  readonly #listeners = new Map<string, Set<() => void>>();

  constructor(kind: "audio" | "video", id = `${kind}-track`) {
    this.kind = kind;
    this.id = id;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const callback = typeof listener === "function"
      ? () => listener(new Event(type))
      : () => listener.handleEvent(new Event(type));
    const listeners = this.#listeners.get(type) ?? new Set<() => void>();
    listeners.add(callback);
    this.#listeners.set(type, listeners);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    for (const listener of this.#listeners.get(muted ? "mute" : "unmute") ?? []) listener();
  }
}

class FakeMediaStream {
  readonly #tracks: MediaStreamTrack[];

  constructor(tracks: MediaStreamTrack[] = []) {
    this.#tracks = [...tracks];
  }

  addEventListener(): void {}

  addTrack(track: MediaStreamTrack): void {
    this.#tracks.push(track);
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.#tracks.filter((track) => track.kind === "audio");
  }

  getTracks(): MediaStreamTrack[] {
    return [...this.#tracks];
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.#tracks.filter((track) => track.kind === "video");
  }
}

function screenStream(): MediaStream {
  const track = {
    kind: "video",
    readyState: "live",
    getSettings: () => ({ width: 1920, height: 1080, frameRate: 30 }),
    stop: () => undefined,
  } as unknown as MediaStreamTrack;
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
    getAudioTracks: () => [],
  } as unknown as MediaStream;
  return stream;
}

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function acceptedWhip(resource = `/${screenSourceId}/whip/session-1`): Response {
  return new Response("v=0\r\n", {
    status: 201,
    headers: {
      ETag: '"session"',
      "X-Media-Resource": resource,
    },
  });
}

const peerCameraSourceId = `ps_${"3".repeat(32)}`;
const peerScreenSourceId = `ps_${"4".repeat(32)}`;
const secondPeerId = "9b0a5de7-b3cc-48f7-97ff-e2517243ce36";
const secondPeerCameraSourceId = `ps_${"5".repeat(32)}`;
const secondPeerScreenSourceId = `ps_${"6".repeat(32)}`;

function renewableGrant(
  expiresAtMs: number,
  tokenCharacter: string,
  withPeer = false,
): MediaSessionGrant {
  return {
    ...grant,
    publish: {
      ...grant.publish,
      camera: { ...grant.publish.camera, token: tokenCharacter.repeat(32) },
      screen: { ...grant.publish.screen, token: tokenCharacter.repeat(32) },
    },
    recordingBootstrap: {
      ...grant.recordingBootstrap,
      camera: { ...grant.recordingBootstrap.camera, token: tokenCharacter.repeat(32) },
      screen: { ...grant.recordingBootstrap.screen, token: tokenCharacter.repeat(32) },
    },
    subscribe: withPeer ? [{
      participantId: "guest",
      displayName: "Guest",
      camera: {
        sourceId: peerCameraSourceId,
        url: `/v1/media/sources/${peerCameraSourceId}/whep`,
        token: tokenCharacter.repeat(32),
      },
      screen: {
        sourceId: peerScreenSourceId,
        url: `/v1/media/sources/${peerScreenSourceId}/whep`,
        token: tokenCharacter.repeat(32),
      },
    }] : [],
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

function withSecondPeer(value: MediaSessionGrant, tokenCharacter: string): MediaSessionGrant {
  return {
    ...value,
    subscribe: [
      ...value.subscribe,
      {
        participantId: secondPeerId,
        displayName: "Second guest",
        camera: {
          sourceId: secondPeerCameraSourceId,
          url: `/v1/media/sources/${secondPeerCameraSourceId}/whep`,
          token: tokenCharacter.repeat(32),
        },
        screen: {
          sourceId: secondPeerScreenSourceId,
          url: `/v1/media/sources/${secondPeerScreenSourceId}/whep`,
          token: tokenCharacter.repeat(32),
        },
      },
    ],
  };
}

function withStudioPeers(value: MediaSessionGrant, tokenCharacter: string): MediaSessionGrant {
  return {
    ...value,
    subscribe: Array.from({ length: 12 }, (_, index) => {
      const participantId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
      const camera = `ps_${(index * 2 + 3).toString(36).padStart(32, "0")}`;
      const screen = `ps_${(index * 2 + 4).toString(36).padStart(32, "0")}`;
      return {
        participantId,
        displayName: `Guest ${index + 1}`,
        camera: {
          sourceId: camera,
          url: `/v1/media/sources/${camera}/whep`,
          token: tokenCharacter.repeat(32),
        },
        screen: {
          sourceId: screen,
          url: `/v1/media/sources/${screen}/whep`,
          token: tokenCharacter.repeat(32),
        },
      };
    }),
  };
}

function transportEnvironment(
  scheduler: DeterministicScheduler,
  peers: FakePeerConnection[],
  request: typeof fetch,
) {
  return {
    clearInterval: () => undefined,
    clearTimeout: scheduler.clearTimeout,
    createPeerConnection: () => {
      const peer = new FakePeerConnection();
      peers.push(peer);
      return peer as unknown as RTCPeerConnection;
    },
    fetch: request,
    now: () => scheduler.now,
    random: () => 0.5,
    recordingBootstrapHoldMs: 0,
    setInterval: () => 1,
    setTimeout: scheduler.setTimeout,
  };
}

describe("media grant renewal identity", () => {
  it("accepts only a later grant with the same room, role, sources, and endpoint paths", () => {
    const current = renewableGrant(20_000, "a", true);
    const next = renewableGrant(40_000, "b", true);

    expect(acceptRefreshedMediaGrant(current, next, 10_000)).toEqual(next);
    expect(() => acceptRefreshedMediaGrant(current, {
      ...next,
      roomId: "9d06e992-f73d-4864-951d-fd08ce6067e5",
    }, 10_000)).toThrow(MediaGrantRefreshError);
    expect(() => acceptRefreshedMediaGrant(current, {
      ...next,
      participantId: "guest",
      publish: { ...next.publish, participantId: "guest" },
    }, 10_000)).toThrow(MediaGrantRefreshError);
    expect(() => acceptRefreshedMediaGrant(current, {
      ...next,
      publish: {
        ...next.publish,
        camera: {
          ...next.publish.camera,
          sourceId: `ps_${"9".repeat(32)}`,
          url: `/v1/media/sources/ps_${"9".repeat(32)}/whip`,
        },
      },
    }, 10_000)).toThrow(MediaGrantRefreshError);
    expect(() => acceptRefreshedMediaGrant(current, {
      ...next,
      recordingBootstrap: {
        ...next.recordingBootstrap,
        camera: {
          ...next.recordingBootstrap.camera,
          token: "z".repeat(32),
          url: `/v1/media/sources/${next.recordingBootstrap.screen.sourceId}/whep`,
        },
      },
    }, 10_000)).toThrow(MediaGrantRefreshError);
    expect(() => acceptRefreshedMediaGrant(current, {
      ...next,
      publish: {
        ...next.publish,
        camera: next.publish.screen,
        screen: next.publish.camera,
      },
    }, 10_000)).toThrow(MediaGrantRefreshError);
  });

  it("accepts a server-authorized peer roster expansion without changing existing sources", () => {
    const current = renewableGrant(20_000, "a", true);
    const expanded = withSecondPeer(renewableGrant(40_000, "b", true), "b");

    expect(acceptRefreshedMediaGrant(current, expanded, 10_000)).toEqual(expanded);
    expect(() => acceptRefreshedMediaGrant(current, {
      ...expanded,
      subscribe: expanded.subscribe.map((peer, index) => index === 0 ? {
        ...peer,
        camera: {
          ...peer.camera,
          sourceId: `ps_${"9".repeat(32)}`,
          url: `/v1/media/sources/ps_${"9".repeat(32)}/whep`,
        },
      } : peer),
    }, 10_000)).toThrow(MediaGrantRefreshError);
  });

  it("renews five minutes before a long grant and halfway through a short grant", () => {
    expect(grantRefreshDelayMs(new Date(7_200_000).toISOString(), 0)).toBe(6_900_000);
    expect(grantRefreshDelayMs(new Date(20_000).toISOString(), 0)).toBe(10_000);
    expect(grantRefreshDelayMs(new Date(0).toISOString(), 0)).toBe(0);
  });
});

describe("media grant renewal lifecycle", () => {
  it("uses a refreshed read capability for recording bootstrap without replacing the publisher", async () => {
    const scheduler = new DeterministicScheduler();
    const peers: FakePeerConnection[] = [];
    const requests: Array<{ authorization: string | null; method: string; url: string }> = [];
    const initial = renewableGrant(20_000, "a");
    const refreshed = renewableGrant(120_000, "b");
    const request: typeof fetch = async (input, init) => {
      requests.push({
        authorization: new Headers(init?.headers).get("authorization"),
        method: init?.method ?? "GET",
        url: String(input),
      });
      return init?.method === "DELETE"
        ? new Response(null, { status: 204 })
        : acceptedWhip(`/media/session-${requests.length}`);
    };
    const transport = new WhipWhepTransport(initial, "balanced", {
      refreshGrant: async () => refreshed,
    }, transportEnvironment(scheduler, peers, request));

    await transport.connect(screenStream());
    scheduler.runNext();
    await flush();
    await transport.requestRecordingKeyFrames();

    expect(peers).toHaveLength(2);
    expect(peers[0]!.closed).toBe(false);
    expect(peers[1]!.addedStreams).toHaveLength(0);
    expect(requests.find(({ method, url }) => method === "POST" && url.endsWith("/whep")))
      .toMatchObject({ authorization: `Bearer ${"b".repeat(32)}` });
    await transport.close();
  });

  it("preserves an active publisher and reconnects the same stream with the refreshed token", async () => {
    const scheduler = new DeterministicScheduler();
    const peers: FakePeerConnection[] = [];
    const requests: Array<{ method: string; authorization: string | null }> = [];
    const initial = renewableGrant(20_000, "a");
    const refreshed = renewableGrant(120_000, "b");
    const request: typeof fetch = async (_input, init) => {
      requests.push({
        method: init?.method ?? "GET",
        authorization: new Headers(init?.headers).get("authorization"),
      });
      return init?.method === "DELETE"
        ? new Response(null, { status: 204 })
        : acceptedWhip();
    };
    const states: string[] = [];
    const stream = screenStream();
    const transport = new WhipWhepTransport(initial, "balanced", {
      refreshGrant: async () => refreshed,
      onGrantState: (state) => states.push(state),
    }, transportEnvironment(scheduler, peers, request));

    await transport.publishScreen(stream);
    scheduler.runNext();
    await flush();

    expect(states).toEqual(["healthy"]);
    expect(peers).toHaveLength(1);
    expect(peers[0]!.closed).toBe(false);
    expect(requests.filter((item) => item.method === "POST")).toHaveLength(1);

    peers[0]!.transition("failed");
    await flush();
    scheduler.runNext();
    await flush();

    const posts = requests.filter((item) => item.method === "POST");
    expect(peers[1]!.addedStreams[0]).toBe(stream);
    expect(posts[0]!.authorization).toBe(`Bearer ${"a".repeat(32)}`);
    expect(posts[1]!.authorization).toBe(`Bearer ${"b".repeat(32)}`);
    await transport.close();
  });

  it("preserves active WHEP sessions and uses the refreshed token for a later subscription", async () => {
    const originalMediaStream = globalThis.MediaStream;
    Object.defineProperty(globalThis, "MediaStream", {
      configurable: true,
      value: FakeMediaStream,
      writable: true,
    });
    try {
      const scheduler = new DeterministicScheduler();
      const peers: FakePeerConnection[] = [];
      const requests: Array<{ method: string; url: string; authorization: string | null }> = [];
      const initial = renewableGrant(20_000, "a", true);
      const refreshed = renewableGrant(120_000, "b", true);
      const request: typeof fetch = async (input, init) => {
        requests.push({
          method: init?.method ?? "GET",
          url: String(input),
          authorization: new Headers(init?.headers).get("authorization"),
        });
        return init?.method === "DELETE"
          ? new Response(null, { status: 204 })
          : acceptedWhip(`/media/session-${requests.length}`);
      };
      const localStream = screenStream();
      const transport = new WhipWhepTransport(initial, "balanced", {
        refreshGrant: async () => refreshed,
      }, transportEnvironment(scheduler, peers, request));

      await transport.connect(localStream);
      await flush();
      expect(peers).toHaveLength(3);
      expect(requests.filter((item) => item.method === "POST")).toHaveLength(3);

      scheduler.runNext();
      await flush();
      expect(peers).toHaveLength(3);
      expect(peers.every((peer) => !peer.closed)).toBe(true);
      expect(requests.filter((item) => item.method === "POST")).toHaveLength(3);

      peers[1]!.transition("failed");
      await flush();

      const cameraSubscriptions = requests.filter((item) =>
        item.method === "POST" && item.url === initial.subscribe[0]!.camera.url,
      );
      expect(cameraSubscriptions).toHaveLength(2);
      expect(cameraSubscriptions[0]!.authorization).toBe(`Bearer ${"a".repeat(32)}`);
      expect(cameraSubscriptions[1]!.authorization).toBe(`Bearer ${"b".repeat(32)}`);
      expect(peers[0]!.closed).toBe(false);
      expect(peers[1]!.closed).toBe(true);
      expect(peers[2]!.closed).toBe(false);
      expect(peers[3]!.closed).toBe(false);
      expect(peers[0]!.addedStreams[0]).toBe(localStream);
      await transport.close();
    } finally {
      if (originalMediaStream) {
        Object.defineProperty(globalThis, "MediaStream", {
          configurable: true,
          value: originalMediaStream,
          writable: true,
        });
      } else {
        Reflect.deleteProperty(globalThis, "MediaStream");
      }
    }
  });

  it("adds a newly admitted peer without replacing active publish or WHEP sessions", async () => {
    const originalMediaStream = globalThis.MediaStream;
    Object.defineProperty(globalThis, "MediaStream", {
      configurable: true,
      value: FakeMediaStream,
      writable: true,
    });
    try {
      const scheduler = new DeterministicScheduler();
      const peers: FakePeerConnection[] = [];
      const initial = renewableGrant(20_000, "a", true);
      const refreshed = withSecondPeer(renewableGrant(120_000, "b", true), "b");
      let nextGrant = refreshed;
      const rosters: string[][] = [];
      const removedParticipants: string[] = [];
      const peerStates: string[] = [];
      const requests: string[] = [];
      const request: typeof fetch = async (input, init) => {
        if (init?.method === "POST") requests.push(String(input));
        return init?.method === "DELETE"
          ? new Response(null, { status: 204 })
          : acceptedWhip(`/media/session-${peers.length}`);
      };
      const localStream = screenStream();
      const transport = new WhipWhepTransport(initial, "balanced", {
        refreshGrant: async () => nextGrant,
        onPeerRoster: (roster) => rosters.push(roster.map((peer) => peer.participantId)),
        onRemoteStream: (_kind, stream, _displayName, participantId) => {
          if (!stream) removedParticipants.push(participantId);
        },
        onState: (kind, state, detail) => {
          if (kind === "peer" && state === "waiting" && detail) peerStates.push(detail);
        },
      }, transportEnvironment(scheduler, peers, request));

      await transport.connect(localStream);
      await flush();
      const originalPeers = [...peers];
      await transport.synchronizePeers();
      await flush();

      expect(rosters).toEqual([["guest"], ["guest", secondPeerId]]);
      expect(peers).toHaveLength(5);
      expect(originalPeers.every((peer) => !peer.closed)).toBe(true);
      expect(peers[0]!.addedStreams[0]).toBe(localStream);
      expect(requests.filter((url) => url === secondPeerCameraSourceId)).toEqual([]);
      expect(requests).toContain(`/v1/media/sources/${secondPeerCameraSourceId}/whep`);
      expect(requests).toContain(`/v1/media/sources/${secondPeerScreenSourceId}/whep`);

      nextGrant = renewableGrant(240_000, "c", true);
      await transport.synchronizePeers();
      await flush();
      expect(rosters.at(-1)).toEqual(["guest"]);
      expect(removedParticipants).toEqual([secondPeerId, secondPeerId]);
      expect(peerStates.filter((detail) => detail.includes("left the room"))).toEqual([
        "Second guest left the room — waiting for them to rejoin",
      ]);
      expect(peers[3]!.closed).toBe(true);
      expect(peers[4]!.closed).toBe(true);
      expect(originalPeers.every((peer) => !peer.closed)).toBe(true);
      await transport.close();
    } finally {
      if (originalMediaStream) {
        Object.defineProperty(globalThis, "MediaStream", {
          configurable: true,
          value: originalMediaStream,
          writable: true,
        });
      } else {
        Reflect.deleteProperty(globalThis, "MediaStream");
      }
    }
  });

  it("caps refresh retries, reports degradation, and fails honestly at expiry", async () => {
    const scheduler = new DeterministicScheduler();
    const states: string[] = [];
    let attempts = 0;
    const transport = new WhipWhepTransport(renewableGrant(20_000, "a"), "balanced", {
      refreshGrant: async () => {
        attempts += 1;
        throw new Error("offline");
      },
      onGrantState: (state) => states.push(state),
    }, transportEnvironment(scheduler, [], fetch));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(scheduler.pending).toBe(1);
      scheduler.runNext();
      await flush();
    }
    expect(attempts).toBe(5);
    expect(states).toEqual([
      "degraded",
      "degraded",
      "degraded",
      "degraded",
      "degraded",
    ]);
    expect(scheduler.pending).toBe(1);
    scheduler.runNext();
    await flush();
    expect(scheduler.now).toBe(20_000);
    expect(states.at(-1)).toBe("failed");
    expect(scheduler.pending).toBe(0);
    await transport.close();
  });

  it("clears scheduled and in-flight renewal work on close", async () => {
    const scheduled = new DeterministicScheduler();
    const first = new WhipWhepTransport(renewableGrant(20_000, "a"), "balanced", {
      refreshGrant: async () => renewableGrant(40_000, "b"),
    }, transportEnvironment(scheduled, [], fetch));
    expect(scheduled.pending).toBe(1);
    await first.close();
    expect(scheduled.pending).toBe(0);

    const inFlight = new DeterministicScheduler();
    const states: string[] = [];
    let resolveRefresh!: (grant: MediaSessionGrant) => void;
    const pending = new Promise<MediaSessionGrant>((resolve) => {
      resolveRefresh = resolve;
    });
    const second = new WhipWhepTransport(renewableGrant(20_000, "a"), "balanced", {
      refreshGrant: () => pending,
      onGrantState: (state) => states.push(state),
    }, transportEnvironment(inFlight, [], fetch));
    inFlight.runNext();
    await flush();
    await second.close();
    resolveRefresh(renewableGrant(40_000, "b"));
    await flush();
    expect(inFlight.pending).toBe(0);
    expect(states).toEqual([]);
  });
});

describe("subscriber recovery lifecycle", () => {
  it("backs absent optional screens off to a bounded polling cadence", () => {
    expect([0, 1, 2, 3, 4, 5, 8].map((attempt) =>
      subscriberBackoffMs("screen", attempt, () => 0.5),
    )).toEqual([1_500, 3_000, 6_000, 12_000, 24_000, 30_000, 30_000]);
    expect([0, 1, 2, 3, 4, 8].map((attempt) =>
      subscriberBackoffMs("camera", attempt, () => 0.5),
    )).toEqual([750, 1_500, 3_000, 6_000, 8_000, 8_000]);
  });

  it("keeps one absent-screen attempt in flight and cancels its retry on close", async () => {
    const originalMediaStream = globalThis.MediaStream;
    Object.defineProperty(globalThis, "MediaStream", {
      configurable: true,
      value: FakeMediaStream,
      writable: true,
    });
    try {
      const scheduler = new DeterministicScheduler();
      const peers: FakePeerConnection[] = [];
      const mediaGrant = renewableGrant(120_000, "a", true);
      let screenPosts = 0;
      const request: typeof fetch = async (input, init) => {
        if (init?.method === "DELETE") return new Response(null, { status: 204 });
        if (String(input) === mediaGrant.subscribe[0]!.screen.url) {
          screenPosts += 1;
          return new Response("screen absent", { status: 404 });
        }
        return acceptedWhip(`/media/session-${peers.length}`);
      };
      const transport = new WhipWhepTransport(mediaGrant, "balanced", {},
        transportEnvironment(scheduler, peers, request));

      await transport.connect(screenStream());
      await flush();
      expect(screenPosts).toBe(1);
      expect(scheduler.pending).toBe(1);
      expect(peers.filter((peer) => !peer.closed)).toHaveLength(2);

      for (let attempt = 0; attempt < 6; attempt += 1) {
        scheduler.runNext();
        await flush();
        expect(peers.filter((peer) => !peer.closed)).toHaveLength(2);
        expect(scheduler.pending).toBe(1);
      }
      expect(screenPosts).toBe(7);
      expect(scheduler.delays).toEqual([
        1_500,
        3_000,
        6_000,
        12_000,
        24_000,
        30_000,
        30_000,
      ]);

      await transport.close();
      expect(scheduler.pending).toBe(0);
      expect(peers.every((peer) => peer.closed)).toBe(true);
    } finally {
      if (originalMediaStream) {
        Object.defineProperty(globalThis, "MediaStream", {
          configurable: true,
          value: originalMediaStream,
          writable: true,
        });
      } else {
        Reflect.deleteProperty(globalThis, "MediaStream");
      }
    }
  });

  it("releases a late WHEP response after hang up instead of installing it", async () => {
    const originalMediaStream = globalThis.MediaStream;
    Object.defineProperty(globalThis, "MediaStream", {
      configurable: true,
      value: FakeMediaStream,
      writable: true,
    });
    try {
      const scheduler = new DeterministicScheduler();
      const peers: FakePeerConnection[] = [];
      const mediaGrant = renewableGrant(120_000, "a", true);
      let resolveScreen!: (response: Response) => void;
      const pendingScreen = new Promise<Response>((resolve) => {
        resolveScreen = resolve;
      });
      const methods: string[] = [];
      const remoteStreams: Array<MediaStream | null> = [];
      const request: typeof fetch = async (input, init) => {
        methods.push(init?.method ?? "GET");
        if (init?.method === "DELETE") return new Response(null, { status: 204 });
        if (String(input) === mediaGrant.subscribe[0]!.screen.url) return pendingScreen;
        return acceptedWhip(`/media/session-${peers.length}`);
      };
      const transport = new WhipWhepTransport(mediaGrant, "balanced", {
        onRemoteStream: (_kind, stream) => remoteStreams.push(stream),
      }, transportEnvironment(scheduler, peers, request));

      await transport.connect(screenStream());
      await flush();
      expect(peers).toHaveLength(3);
      await transport.close();
      expect(peers[2]!.closed).toBe(true);

      resolveScreen(acceptedWhip("/media/late-screen-session"));
      await flush();
      await flush();
      expect(peers[2]!.closed).toBe(true);
      expect(scheduler.pending).toBe(0);
      expect(methods.filter((method) => method === "POST")).toHaveLength(3);
      expect(methods.filter((method) => method === "DELETE")).toHaveLength(3);
      expect(remoteStreams).toEqual([]);
    } finally {
      if (originalMediaStream) {
        Object.defineProperty(globalThis, "MediaStream", {
          configurable: true,
          value: originalMediaStream,
          writable: true,
        });
      } else {
        Reflect.deleteProperty(globalThis, "MediaStream");
      }
    }
  });

  it("removes a frozen peer frame after a short video stall instead of waiting for ICE timeout", async () => {
    const originalMediaStream = globalThis.MediaStream;
    Object.defineProperty(globalThis, "MediaStream", {
      configurable: true,
      value: FakeMediaStream,
      writable: true,
    });
    try {
      const scheduler = new DeterministicScheduler();
      const peers: FakePeerConnection[] = [];
      const mediaGrant = renewableGrant(120_000, "a", true);
      const remoteStreams: Array<MediaStream | null> = [];
      const request: typeof fetch = async (_input, init) => init?.method === "DELETE"
        ? new Response(null, { status: 204 })
        : acceptedWhip(`/media/session-${peers.length}`);
      const transport = new WhipWhepTransport(mediaGrant, "balanced", {
        onRemoteStream: (kind, stream) => {
          if (kind === "camera") remoteStreams.push(stream);
        },
      }, transportEnvironment(scheduler, peers, request));

      await transport.connect(screenStream());
      await flush();
      const cameraTrack = new FakeRemoteTrack("video");
      peers[1]!.emitTrack(cameraTrack as unknown as MediaStreamTrack);
      expect(remoteStreams.at(-1)).not.toBeNull();

      cameraTrack.setMuted(true);
      expect(scheduler.delays.at(-1)).toBe(REMOTE_VIDEO_STALL_GRACE_MS);
      scheduler.runNext();
      await flush();
      await flush();

      expect(remoteStreams.at(-1)).toBeNull();
      expect(peers[1]!.closed).toBe(true);
      expect(peers.filter((peer) => !peer.closed)).toHaveLength(3);

      await transport.close();
      expect(scheduler.pending).toBe(0);
    } finally {
      if (originalMediaStream) {
        Object.defineProperty(globalThis, "MediaStream", {
          configurable: true,
          value: originalMediaStream,
          writable: true,
        });
      } else {
        Reflect.deleteProperty(globalThis, "MediaStream");
      }
    }
  });
});

describe("large room subscriber topology", () => {
  it("opens one publisher and one bounded camera/screen subscription per Studio peer", async () => {
    const originalMediaStream = globalThis.MediaStream;
    Object.defineProperty(globalThis, "MediaStream", {
      configurable: true,
      value: FakeMediaStream,
      writable: true,
    });
    try {
      const scheduler = new DeterministicScheduler();
      const peers: FakePeerConnection[] = [];
      const requests: Array<{ method: string; url: string }> = [];
      const rosters: number[] = [];
      const request: typeof fetch = async (input, init) => {
        requests.push({ method: init?.method ?? "GET", url: String(input) });
        return init?.method === "DELETE"
          ? new Response(null, { status: 204 })
          : acceptedWhip(`/media/session-${requests.length}`);
      };
      const studioGrant = withStudioPeers(renewableGrant(120_000, "a"), "a");
      const transport = new WhipWhepTransport(studioGrant, "balanced", {
        onPeerRoster: (roster) => rosters.push(roster.length),
      }, transportEnvironment(scheduler, peers, request));

      await transport.connect(screenStream());
      await flush();
      await flush();

      expect(rosters).toEqual([12]);
      expect(peers).toHaveLength(25);
      expect(requests.filter(({ method, url }) => method === "POST" && url.endsWith("/whip")))
        .toHaveLength(1);
      expect(requests.filter(({ method, url }) => method === "POST" && url.endsWith("/whep")))
        .toHaveLength(24);
      expect(peers.filter((peer) => peer.addedStreams.length > 0)).toHaveLength(1);

      await transport.close();
      expect(peers.every((peer) => peer.closed)).toBe(true);
      expect(scheduler.pending).toBe(0);
    } finally {
      if (originalMediaStream) {
        Object.defineProperty(globalThis, "MediaStream", {
          configurable: true,
          value: originalMediaStream,
          writable: true,
        });
      } else {
        Reflect.deleteProperty(globalThis, "MediaStream");
      }
    }
  });
});

describe("publisher reconnect lifecycle", () => {
  it("bootstraps late recorders without recapture or another publisher", async () => {
    const scheduler = new DeterministicScheduler();
    const peers: FakePeerConnection[] = [];
    const requests: Array<{ authorization: string | null; method: string; url: string }> = [];
    const request: typeof fetch = async (input, init) => {
      const method = init?.method ?? "GET";
      requests.push({
        authorization: new Headers(init?.headers).get("authorization"),
        method,
        url: String(input),
      });
      return init?.method === "DELETE"
        ? new Response(null, { status: 204 })
        : acceptedWhip(`/media/session-${requests.length}`);
    };
    const camera = screenStream();
    const screen = screenStream();
    const transport = new WhipWhepTransport(grant, "balanced", {},
      transportEnvironment(scheduler, peers, request));

    await transport.connect(camera);
    await transport.publishScreen(screen);
    const requested = await transport.requestRecordingKeyFrames();

    expect(requested).toBe(2);
    expect(peers).toHaveLength(4);
    expect(peers[0]!.addedStreams[0]).toBe(camera);
    expect(peers[1]!.addedStreams[0]).toBe(screen);
    expect(peers[0]!.keyFrameRequests).toEqual([{
      track: camera.getVideoTracks()[0],
      options: { encodingOptions: [{ keyFrame: true }] },
    }]);
    expect(peers[1]!.keyFrameRequests).toEqual([{
      track: screen.getVideoTracks()[0],
      options: { encodingOptions: [{ keyFrame: true }] },
    }]);
    expect(peers.slice(2).every((peer) => peer.addedStreams.length === 0)).toBe(true);
    expect(peers.slice(2).every((peer) => peer.closed)).toBe(true);
    expect(peers.slice(0, 2).every((peer) => !peer.closed)).toBe(true);
    expect(requests.filter(({ method, url }) => method === "POST" && url.endsWith("/whip")))
      .toHaveLength(2);
    expect(requests.filter(({ method, url }) => method === "POST" && url.endsWith("/whep")))
      .toEqual([
        expect.objectContaining({ authorization: `Bearer ${grant.recordingBootstrap.camera.token}` }),
        expect.objectContaining({ authorization: `Bearer ${grant.recordingBootstrap.screen.token}` }),
      ]);
    expect(requests.filter(({ method, url }) => method === "DELETE" && url.endsWith("/whep")))
      .toHaveLength(2);
    await transport.close();
  });

  it("releases a late recording-bootstrap response after close instead of installing it", async () => {
    const scheduler = new DeterministicScheduler();
    const peers: FakePeerConnection[] = [];
    const requests: Array<{ authorization: string | null; method: string; url: string }> = [];
    let resolveBootstrap: ((response: Response) => void) | undefined;
    const lateBootstrap = new Promise<Response>((resolve) => {
      resolveBootstrap = resolve;
    });
    const request: typeof fetch = async (input, init) => {
      const method = init?.method ?? "GET";
      const url = String(input);
      requests.push({
        authorization: new Headers(init?.headers).get("authorization"),
        method,
        url,
      });
      if (method === "DELETE") return new Response(null, { status: 204 });
      if (url.endsWith("/whep")) return lateBootstrap;
      return acceptedWhip("/media/camera-publish");
    };
    const transport = new WhipWhepTransport(grant, "balanced", {},
      transportEnvironment(scheduler, peers, request));

    await transport.connect(screenStream());
    const bootstrap = transport.requestRecordingKeyFrames();
    await flush();
    expect(peers).toHaveLength(2);
    expect(peers[1]!.closed).toBe(false);

    const closing = transport.close();
    expect(peers[1]!.closed).toBe(true);
    resolveBootstrap?.(acceptedWhip("/media/late-bootstrap"));
    await bootstrap;
    await closing;

    expect(requests).toContainEqual({
      authorization: `Bearer ${grant.recordingBootstrap.camera.token}`,
      method: "DELETE",
      url: grant.recordingBootstrap.camera.url,
    });
    expect(peers.filter((peer) => !peer.closed)).toHaveLength(0);
  });

  it("stopScreen cancels and releases an active recording bootstrap", async () => {
    const scheduler = new DeterministicScheduler();
    const peers: FakePeerConnection[] = [];
    const methods: string[] = [];
    const request: typeof fetch = async (_input, init) => {
      methods.push(init?.method ?? "GET");
      return init?.method === "DELETE"
        ? new Response(null, { status: 204 })
        : acceptedWhip(`/media/session-${methods.length}`);
    };
    const transport = new WhipWhepTransport(grant, "balanced", {}, {
      ...transportEnvironment(scheduler, peers, request),
      recordingBootstrapHoldMs: 1_500,
    });

    await transport.publishScreen(screenStream());
    const bootstrap = transport.requestRecordingKeyFrames();
    for (let attempt = 0; attempt < 4 && scheduler.pending === 0; attempt += 1) {
      await flush();
    }
    expect(peers).toHaveLength(2);
    expect(scheduler.pending).toBe(1);

    await transport.stopScreen();
    await bootstrap;

    expect(scheduler.pending).toBe(0);
    expect(peers.every((peer) => peer.closed)).toBe(true);
    expect(methods.filter((method) => method === "DELETE")).toHaveLength(2);
    await transport.close();
  });

  it("never overlaps sessions and reuses the same stream and stable endpoint identity", async () => {
    const scheduler = new DeterministicScheduler();
    const peers: FakePeerConnection[] = [];
    const requests: Array<{ method: string; url: string; authorization: string | null }> = [];
    const request: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      requests.push({
        method: init?.method ?? "GET",
        url: String(input),
        authorization: headers.get("authorization"),
      });
      return init?.method === "DELETE"
        ? new Response(null, { status: 204 })
        : acceptedWhip(`/${screenSourceId}/whip/session-${requests.length}`);
    };
    const stream = screenStream();
    const transport = new WhipWhepTransport(grant, "balanced", {}, {
      clearTimeout: scheduler.clearTimeout,
      createPeerConnection: () => {
        const peer = new FakePeerConnection();
        peers.push(peer);
        return peer as unknown as RTCPeerConnection;
      },
      fetch: request,
      random: () => 0.5,
      setTimeout: scheduler.setTimeout,
    });

    await transport.publishScreen(stream);
    peers[0]!.transition("failed");
    peers[0]!.transition("disconnected");
    await flush();

    expect(scheduler.pending).toBe(1);
    expect(peers.filter((peer) => !peer.closed)).toHaveLength(0);
    scheduler.runNext();
    await flush();

    expect(peers).toHaveLength(2);
    expect(peers.filter((peer) => !peer.closed)).toHaveLength(1);
    expect(peers[0]!.addedStreams[0]).toBe(stream);
    expect(peers[1]!.addedStreams[0]).toBe(stream);
    const posts = requests.filter((item) => item.method === "POST");
    expect(posts.map((item) => item.url)).toEqual([
      grant.publish.screen.url,
      grant.publish.screen.url,
    ]);
    expect(posts.every((item) => item.authorization === `Bearer ${grant.publish.screen.token}`))
      .toBe(true);
    await transport.close();
  });

  it("requests a clean recorder frame again after a publisher reconnect", async () => {
    const scheduler = new DeterministicScheduler();
    const peers: FakePeerConnection[] = [];
    const requests: Array<{ authorization: string | null; method: string; url: string }> = [];
    const request: typeof fetch = async (input, init) => {
      const method = init?.method ?? "GET";
      requests.push({
        authorization: new Headers(init?.headers).get("authorization"),
        method,
        url: String(input),
      });
      return method === "DELETE"
        ? new Response(null, { status: 204 })
        : acceptedWhip(`/media/session-${requests.length}`);
    };
    const stream = screenStream();
    const transport = new WhipWhepTransport(grant, "balanced", {}, {
      clearTimeout: scheduler.clearTimeout,
      createPeerConnection: () => {
        const peer = new FakePeerConnection();
        peers.push(peer);
        return peer as unknown as RTCPeerConnection;
      },
      fetch: request,
      random: () => 0.5,
      recordingBootstrapHoldMs: 0,
      setTimeout: scheduler.setTimeout,
    });

    await transport.publishScreen(stream);
    await transport.requestRecordingKeyFrames();
    expect(peers).toHaveLength(2);
    expect(peers[0]!.keyFrameRequests).toHaveLength(1);
    expect(peers[1]!.closed).toBe(true);

    peers[0]!.transition("disconnected");
    await flush();
    expect(scheduler.pending).toBe(1);
    scheduler.runNext();
    await flush();
    await flush();

    expect(peers).toHaveLength(4);
    expect(peers[2]!.addedStreams[0]).toBe(stream);
    expect(peers[2]!.keyFrameRequests).toHaveLength(1);
    expect(peers[3]!.addedStreams).toHaveLength(0);
    for (let attempt = 0; attempt < 4 && !peers[3]!.closed; attempt += 1) await flush();
    expect(peers[3]!.closed).toBe(true);
    expect(peers.filter((peer) => peer.addedStreams.length > 0 && !peer.closed)).toHaveLength(1);
    expect(requests.filter(({ method, url }) => method === "POST" && url.endsWith("/whip")))
      .toHaveLength(2);
    expect(requests.filter(({ method, url }) => method === "POST" && url.endsWith("/whep")))
      .toEqual([
        expect.objectContaining({ authorization: `Bearer ${grant.recordingBootstrap.screen.token}` }),
        expect.objectContaining({ authorization: `Bearer ${grant.recordingBootstrap.screen.token}` }),
      ]);

    await transport.close();
  });

  it("caps retry attempts and exponential jitter delay", async () => {
    const scheduler = new DeterministicScheduler();
    const peers: FakePeerConnection[] = [];
    let posts = 0;
    const states: string[] = [];
    const request: typeof fetch = async (_input, init) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      posts += 1;
      return posts === 1 ? acceptedWhip() : new Response("unavailable", { status: 503 });
    };
    const transport = new WhipWhepTransport(grant, "balanced", {
      onState: (_kind, state) => states.push(state),
    }, {
      clearTimeout: scheduler.clearTimeout,
      createPeerConnection: () => {
        const peer = new FakePeerConnection();
        peers.push(peer);
        return peer as unknown as RTCPeerConnection;
      },
      fetch: request,
      random: () => 0.5,
      setTimeout: scheduler.setTimeout,
    });

    await transport.publishScreen(screenStream());
    peers[0]!.transition("failed");
    await flush();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      expect(scheduler.pending).toBe(1);
      scheduler.runNext();
      await flush();
    }

    expect(scheduler.pending).toBe(0);
    expect(scheduler.delays).toEqual([500, 1_000, 2_000, 4_000, 8_000, 8_000, 8_000, 8_000]);
    expect(posts).toBe(9);
    expect(states.at(-1)).toBe("failed");
    await transport.close();
  });

  it("lets the user restart the bounded camera retry budget without recapture", async () => {
    const scheduler = new DeterministicScheduler();
    const peers: FakePeerConnection[] = [];
    const stream = screenStream();
    let posts = 0;
    let unavailable = false;
    const transport = new WhipWhepTransport(grant, "balanced", {}, {
      clearInterval: () => undefined,
      clearTimeout: scheduler.clearTimeout,
      createPeerConnection: () => {
        const peer = new FakePeerConnection();
        peers.push(peer);
        return peer as unknown as RTCPeerConnection;
      },
      fetch: async (_input, init) => {
        if (init?.method === "DELETE") return new Response(null, { status: 204 });
        posts += 1;
        return unavailable
          ? new Response("unavailable", { status: 503 })
          : acceptedWhip(`/${cameraSourceId}/whip/session-${posts}`);
      },
      random: () => 0.5,
      setInterval: () => 1,
      setTimeout: scheduler.setTimeout,
    });

    await transport.connect(stream);
    unavailable = true;
    peers[0]!.transition("failed");
    await flush();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      scheduler.runNext();
      await flush();
    }
    expect(scheduler.pending).toBe(0);

    unavailable = false;
    transport.retryCamera();
    expect(scheduler.pending).toBe(1);
    scheduler.runNext();
    await flush();

    expect(peers.at(-1)?.addedStreams[0]).toBe(stream);
    expect(posts).toBe(10);
    expect(peers.filter((peer) => !peer.closed)).toHaveLength(1);
    await transport.close();
  });

  it("cancels pending retries on stopScreen and close", async () => {
    async function pendingReconnect() {
      const scheduler = new DeterministicScheduler();
      const peers: FakePeerConnection[] = [];
      let posts = 0;
      const transport = new WhipWhepTransport(grant, "balanced", {}, {
        clearTimeout: scheduler.clearTimeout,
        createPeerConnection: () => {
          const peer = new FakePeerConnection();
          peers.push(peer);
          return peer as unknown as RTCPeerConnection;
        },
        fetch: async (_input, init) => {
          if (init?.method === "DELETE") return new Response(null, { status: 204 });
          posts += 1;
          return acceptedWhip();
        },
        random: () => 0.5,
        setTimeout: scheduler.setTimeout,
      });
      await transport.publishScreen(screenStream());
      peers[0]!.transition("disconnected");
      await flush();
      expect(scheduler.pending).toBe(1);
      return { scheduler, transport, posts: () => posts };
    }

    const stopped = await pendingReconnect();
    await stopped.transport.stopScreen();
    expect(stopped.scheduler.pending).toBe(0);
    stopped.scheduler.runNext();
    await flush();
    expect(stopped.posts()).toBe(1);

    const closed = await pendingReconnect();
    await closed.transport.close();
    expect(closed.scheduler.pending).toBe(0);
    closed.scheduler.runNext();
    await flush();
    expect(closed.posts()).toBe(1);
  });

  it("releases a late WHIP response after stop instead of installing it", async () => {
    const scheduler = new DeterministicScheduler();
    const peer = new FakePeerConnection();
    const requests: string[] = [];
    let resolveWhip!: (response: Response) => void;
    const lateWhip = new Promise<Response>((resolve) => {
      resolveWhip = resolve;
    });
    const states: string[] = [];
    const transport = new WhipWhepTransport(grant, "balanced", {
      onState: (_kind, state) => states.push(state),
    }, {
      clearTimeout: scheduler.clearTimeout,
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
      fetch: async (_input, init) => {
        requests.push(init?.method ?? "GET");
        return init?.method === "DELETE"
          ? new Response(null, { status: 204 })
          : lateWhip;
      },
      random: () => 0.5,
      setTimeout: scheduler.setTimeout,
    });

    const publishing = transport.publishScreen(screenStream());
    await flush();
    await transport.stopScreen();
    resolveWhip(acceptedWhip());
    await publishing;
    await flush();

    expect(peer.closed).toBe(true);
    expect(requests).toEqual(["POST", "DELETE"]);
    expect(states).not.toContain("connected");
    await transport.stopScreen();
    expect(requests).toEqual(["POST", "DELETE"]);
    await transport.close();
  });
});

describe("local active-speaker hysteresis", () => {
  it("emits one transition only after sustained speech and rearms after sustained quiet", () => {
    const detector = new ActiveSpeakerHysteresis({
      attackMs: 350,
      releaseMs: 800,
    });

    expect(detector.sample(0.06, 0)).toBe(false);
    expect(detector.sample(0.06, 200)).toBe(false);
    expect(detector.sample(0.06, 350)).toBe(true);
    expect(detector.sample(0.08, 900)).toBe(false);
    expect(detector.sample(0.01, 1_000)).toBe(false);
    expect(detector.sample(0.01, 1_800)).toBe(false);
    expect(detector.sample(0.07, 2_000)).toBe(false);
    expect(detector.sample(0.07, 2_350)).toBe(true);
  });

  it("rejects short noise spikes without emitting a speaker transition", () => {
    const detector = new ActiveSpeakerHysteresis();

    expect(detector.sample(0.08, 0)).toBe(false);
    expect(detector.sample(0.01, 200)).toBe(false);
    expect(detector.sample(0.08, 400)).toBe(false);
    expect(detector.sample(0.01, 600)).toBe(false);
  });
});

describe("publisher reconnect backoff", () => {
  it("uses capped jitter without creating an unbounded retry delay", () => {
    expect(reconnectBackoffMs(0, () => 0)).toBe(375);
    expect(reconnectBackoffMs(2, () => 0.5)).toBe(2_000);
    expect(reconnectBackoffMs(20, () => 1)).toBe(8_000);
  });
});

describe("media transport preflight", () => {
  it("maps the balanced room profile to one 720p/30 capture", () => {
    expect(captureConstraints("balanced", "voice", "camera-1", "mic-1")).toEqual({
      video: {
        deviceId: { exact: "camera-1" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: {
        deviceId: { exact: "mic-1" },
        autoGainControl: true,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
  });

  it("reports negotiated resolution and frame-rate degradation", () => {
    const stream = {
      getVideoTracks: () => [{
        getSettings: () => ({ width: 640, height: 360, frameRate: 15 }),
      }],
    } as unknown as MediaStream;
    const metrics = negotiatedMedia(stream);

    expect(metrics).toMatchObject({ width: 640, height: 360, framesPerSecond: 15 });
    expect(preflightWarning(metrics)).toContain("1280×720");
    expect(preflightWarning({ ...metrics, width: 1280, height: 720 })).toContain("25 fps");
  });

  it("accepts a negotiated 720p/30 stream", () => {
    expect(preflightWarning({
      bitrateKbps: null,
      framesPerSecond: 30,
      height: 720,
      packetLoss: null,
      roundTripMs: null,
      width: 1280,
    })).toBeNull();
  });
});
