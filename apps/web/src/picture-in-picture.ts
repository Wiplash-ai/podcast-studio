export type PictureInPictureMode = "everyone" | "guests" | "self";

export interface PictureInPictureSource<TStream = MediaStream> {
  id: string;
  label: string;
  mirrored: boolean;
  role: "guest" | "self";
  stream: TStream;
}

export interface PictureInPictureTile {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface PictureInPictureRoomVisibility {
  guests: boolean;
  self: boolean;
}

const canvasWidth = 960;
const canvasHeight = 540;
const canvasFrameRate = 20;
const canvasGap = 12;

export function selectPictureInPictureSources<TStream>(
  sources: readonly PictureInPictureSource<TStream>[],
  mode: PictureInPictureMode,
): PictureInPictureSource<TStream>[] {
  if (mode === "guests") return sources.filter((source) => source.role === "guest");
  if (mode === "self") return sources.filter((source) => source.role === "self");
  return [...sources];
}

export function selectPictureInPictureAudioSources<TStream>(
  sources: readonly PictureInPictureSource<TStream>[],
  mode: PictureInPictureMode,
): PictureInPictureSource<TStream>[] {
  if (mode === "self") return [];
  return sources.filter((source) => source.role === "guest");
}

export function pictureInPictureRoomVisibility(
  mode: PictureInPictureMode | null,
): PictureInPictureRoomVisibility {
  if (mode === "everyone") return { guests: false, self: false };
  if (mode === "guests") return { guests: false, self: true };
  if (mode === "self") return { guests: true, self: false };
  return { guests: true, self: true };
}

export function pictureInPictureTiles(
  count: number,
  width = canvasWidth,
  height = canvasHeight,
  gap = canvasGap,
): PictureInPictureTile[] {
  if (count <= 0) return [];
  const columns = count === 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;
  const rows = Math.ceil(count / columns);
  const tileWidth = (width - gap * (columns + 1)) / columns;
  const tileHeight = (height - gap * (rows + 1)) / rows;

  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const itemsInRow = Math.min(columns, count - row * columns);
    const rowWidth = itemsInRow * tileWidth + Math.max(0, itemsInRow - 1) * gap;
    const rowStart = (width - rowWidth) / 2;
    return {
      x: Math.round(rowStart + column * (tileWidth + gap)),
      y: Math.round(gap + row * (tileHeight + gap)),
      width: Math.round(tileWidth),
      height: Math.round(tileHeight),
    };
  });
}

export function compositePictureInPictureSupported(
  targetDocument: Document = document,
): boolean {
  return Boolean(
    targetDocument.pictureInPictureEnabled
    && typeof HTMLVideoElement !== "undefined"
    && "requestPictureInPicture" in HTMLVideoElement.prototype
    && typeof HTMLCanvasElement !== "undefined"
    && "captureStream" in HTMLCanvasElement.prototype,
  );
}

function roundedRectangle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const corner = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + corner, y);
  context.arcTo(x + width, y, x + width, y + height, corner);
  context.arcTo(x + width, y + height, x, y + height, corner);
  context.arcTo(x, y + height, x, y, corner);
  context.arcTo(x, y, x + width, y, corner);
  context.closePath();
}

function drawVideoCover(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  tile: PictureInPictureTile,
  mirrored: boolean,
): void {
  const videoRatio = video.videoWidth / video.videoHeight;
  const tileRatio = tile.width / tile.height;
  let sourceWidth = video.videoWidth;
  let sourceHeight = video.videoHeight;
  let sourceX = 0;
  let sourceY = 0;
  if (videoRatio > tileRatio) {
    sourceWidth = video.videoHeight * tileRatio;
    sourceX = (video.videoWidth - sourceWidth) / 2;
  } else {
    sourceHeight = video.videoWidth / tileRatio;
    sourceY = (video.videoHeight - sourceHeight) / 2;
  }

  context.save();
  roundedRectangle(context, tile.x, tile.y, tile.width, tile.height, 18);
  context.clip();
  if (mirrored) {
    context.translate(tile.x * 2 + tile.width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(
    video,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    tile.x,
    tile.y,
    tile.width,
    tile.height,
  );
  context.restore();
}

function drawLabel(
  context: CanvasRenderingContext2D,
  label: string,
  tile: PictureInPictureTile,
): void {
  context.save();
  context.font = "700 17px Manrope, sans-serif";
  const labelWidth = Math.min(tile.width - 24, context.measureText(label).width + 24);
  roundedRectangle(context, tile.x + 12, tile.y + tile.height - 44, labelWidth, 32, 10);
  context.fillStyle = "rgba(12, 9, 16, .78)";
  context.fill();
  context.fillStyle = "#f8f5ff";
  context.textBaseline = "middle";
  context.fillText(label, tile.x + 24, tile.y + tile.height - 28, labelWidth - 18);
  context.restore();
}

function drawUnavailableSource(
  context: CanvasRenderingContext2D,
  label: string,
  tile: PictureInPictureTile,
): void {
  const initial = label.trim().slice(0, 1).toUpperCase() || "?";
  context.save();
  roundedRectangle(context, tile.x, tile.y, tile.width, tile.height, 18);
  const gradient = context.createLinearGradient(tile.x, tile.y, tile.x + tile.width, tile.y + tile.height);
  gradient.addColorStop(0, "#23192e");
  gradient.addColorStop(1, "#100d14");
  context.fillStyle = gradient;
  context.fill();
  context.fillStyle = "rgba(167, 139, 250, .22)";
  context.beginPath();
  context.arc(
    tile.x + tile.width / 2,
    tile.y + tile.height / 2 - 6,
    Math.min(tile.width, tile.height) * .16,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.fillStyle = "#d9ccff";
  context.font = `800 ${Math.max(28, Math.min(62, tile.height * .18))}px Manrope, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(initial, tile.x + tile.width / 2, tile.y + tile.height / 2 - 6);
  context.restore();
}

export class CompositePictureInPicture {
  private audioContext: AudioContext | null = null;
  private audioDestination: MediaStreamAudioDestinationNode | null = null;
  private audioSources = new Map<string, {
    node: MediaStreamAudioSourceNode;
    stream: MediaStream;
  }>();
  private animationFrame: number | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private canvasStream: MediaStream | null = null;
  private lastFrameAt = 0;
  private mode: PictureInPictureMode | null = null;
  private output: HTMLVideoElement | null = null;
  private outputStream: MediaStream | null = null;
  private root: HTMLDivElement | null = null;
  private sourceVideos = new Map<string, HTMLVideoElement>();

  constructor(
    private readonly sources: () => readonly PictureInPictureSource[],
    private readonly onModeChange: (mode: PictureInPictureMode | null) => void,
    private readonly targetDocument: Document = document,
  ) {}

  prepare(): boolean {
    if (this.output) return true;
    if (!compositePictureInPictureSupported(this.targetDocument)) return false;

    const root = this.targetDocument.createElement("div");
    root.className = "picture-in-picture-renderer";
    root.setAttribute("aria-hidden", "true");
    const canvas = this.targetDocument.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const output = this.targetDocument.createElement("video");
    output.autoplay = true;
    output.muted = true;
    output.playsInline = true;
    output.addEventListener("leavepictureinpicture", this.handleNativeClose);
    const canvasStream = canvas.captureStream(canvasFrameRate);
    output.srcObject = canvasStream;
    root.append(canvas, output);
    this.targetDocument.body.append(root);
    this.root = root;
    this.canvas = canvas;
    this.canvasStream = canvasStream;
    this.output = output;
    this.drawEmptyCanvas();
    void output.play().catch(() => undefined);
    return true;
  }

  async open(mode: PictureInPictureMode): Promise<void> {
    if (!this.prepare() || !this.output) {
      throw new Error("Picture-in-picture is not supported by this browser.");
    }
    this.mode = mode;
    this.onModeChange(mode);
    this.syncAudio(selectPictureInPictureSources(this.sources(), mode));
    this.startDrawing();
    if (this.targetDocument.pictureInPictureElement !== this.output) {
      try {
        await this.output.requestPictureInPicture();
      } catch (reason) {
        this.stopDrawing();
        this.disconnectAudioSources();
        this.output.muted = true;
        this.mode = null;
        this.onModeChange(null);
        throw reason;
      }
    }
  }

  async close(): Promise<void> {
    if (this.output && this.targetDocument.pictureInPictureElement === this.output) {
      await this.targetDocument.exitPictureInPicture().catch(() => undefined);
    }
    this.finishNativeClose();
  }

  async destroy(): Promise<void> {
    await this.close();
    this.output?.removeEventListener("leavepictureinpicture", this.handleNativeClose);
    this.disconnectAudioSources();
    this.audioDestination?.stream.getTracks().forEach((track) => track.stop());
    if (this.audioContext) void this.audioContext.close().catch(() => undefined);
    this.canvasStream?.getTracks().forEach((track) => track.stop());
    this.output?.pause();
    if (this.output) this.output.srcObject = null;
    this.root?.remove();
    this.root = null;
    this.canvas = null;
    this.canvasStream = null;
    this.audioContext = null;
    this.audioDestination = null;
    this.outputStream = null;
    this.output = null;
  }

  private handleNativeClose = (): void => {
    this.finishNativeClose();
  };

  private finishNativeClose(): void {
    this.stopDrawing();
    this.disconnectAudioSources();
    if (this.output) this.output.muted = true;
    if (this.audioContext?.state === "running") {
      void this.audioContext.suspend().catch(() => undefined);
    }
    this.sourceVideos.forEach((video) => video.remove());
    this.sourceVideos.clear();
    if (this.mode !== null) {
      this.mode = null;
      this.onModeChange(null);
    }
  }

  private startDrawing(): void {
    if (this.animationFrame !== null) return;
    const draw = (time: number) => {
      if (time - this.lastFrameAt >= 1_000 / canvasFrameRate) {
        this.drawFrame();
        this.lastFrameAt = time;
      }
      this.animationFrame = requestAnimationFrame(draw);
    };
    this.animationFrame = requestAnimationFrame(draw);
  }

  private stopDrawing(): void {
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.lastFrameAt = 0;
  }

  private drawEmptyCanvas(): void {
    const context = this.canvas?.getContext("2d");
    if (!context) return;
    const background = context.createLinearGradient(0, 0, canvasWidth, canvasHeight);
    background.addColorStop(0, "#17111f");
    background.addColorStop(1, "#09070b");
    context.fillStyle = background;
    context.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  private drawFrame(): void {
    const context = this.canvas?.getContext("2d");
    if (!context || !this.mode || !this.root) return;
    this.drawEmptyCanvas();
    const selected = selectPictureInPictureSources(this.sources(), this.mode);
    this.syncAudio(selected);
    const activeIds = new Set(selected.map((source) => source.id));
    for (const [id, video] of this.sourceVideos) {
      if (!activeIds.has(id)) {
        video.remove();
        this.sourceVideos.delete(id);
      }
    }

    if (selected.length === 0) {
      context.fillStyle = "#d8d0df";
      context.font = "700 25px Manrope, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(
        this.mode === "guests" ? "Waiting for a guest to join" : "Camera unavailable",
        canvasWidth / 2,
        canvasHeight / 2,
      );
      return;
    }

    const tiles = pictureInPictureTiles(selected.length);
    selected.forEach((source, index) => {
      const tile = tiles[index];
      if (!tile) return;
      let video = this.sourceVideos.get(source.id);
      if (!video) {
        video = this.targetDocument.createElement("video");
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = source.stream;
        this.root!.append(video);
        this.sourceVideos.set(source.id, video);
        void video.play().catch(() => undefined);
      } else if (video.srcObject !== source.stream) {
        video.srcObject = source.stream;
        void video.play().catch(() => undefined);
      }
      const trackAvailable = source.stream.getVideoTracks().some((track) =>
        track.enabled && track.readyState === "live",
      );
      if (trackAvailable && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        drawVideoCover(context, video, tile, source.mirrored);
      } else {
        drawUnavailableSource(context, source.label, tile);
      }
      drawLabel(context, source.label, tile);
    });
  }

  private syncAudio(selected: readonly PictureInPictureSource[]): void {
    if (!this.mode || !this.output || !this.canvasStream) return;
    const audible = selectPictureInPictureAudioSources(selected, this.mode).filter((source) =>
      source.stream.getAudioTracks().some((track) =>
        track.enabled && track.readyState === "live",
      ),
    );
    const activeIds = new Set(audible.map((source) => source.id));
    for (const [id, current] of this.audioSources) {
      const next = audible.find((source) => source.id === id);
      if (!activeIds.has(id) || next?.stream !== current.stream) {
        current.node.disconnect();
        this.audioSources.delete(id);
      }
    }

    if (audible.length === 0) {
      this.output.muted = true;
      return;
    }

    if (!this.audioContext || !this.audioDestination) {
      const AudioContextConstructor = this.targetDocument.defaultView?.AudioContext;
      if (!AudioContextConstructor) {
        this.output.muted = true;
        return;
      }
      this.audioContext = new AudioContextConstructor();
      this.audioDestination = this.audioContext.createMediaStreamDestination();
      this.outputStream = new MediaStream([
        ...this.canvasStream.getVideoTracks(),
        ...this.audioDestination.stream.getAudioTracks(),
      ]);
      this.output.srcObject = this.outputStream;
    }

    for (const source of audible) {
      if (this.audioSources.has(source.id)) continue;
      const node = this.audioContext.createMediaStreamSource(source.stream);
      node.connect(this.audioDestination);
      this.audioSources.set(source.id, { node, stream: source.stream });
    }
    this.output.muted = false;
    if (this.audioContext.state !== "running") {
      void this.audioContext.resume().catch(() => undefined);
    }
    void this.output.play().catch(() => undefined);
  }

  private disconnectAudioSources(): void {
    this.audioSources.forEach(({ node }) => node.disconnect());
    this.audioSources.clear();
  }
}
