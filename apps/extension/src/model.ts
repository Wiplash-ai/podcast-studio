import type { PorchcastCompanionStateMessage } from "@wiplash/podcast-contracts";

export const PORCHCAST_APP_ORIGIN = "https://labs.wiplash.ai";
export const PORCHCAST_APP_PATH = "/porchcast/";
export const MAX_RECENT_PORCHES = 10;
export const MAX_ACCOUNT_ITEMS = 20;

export type RecentPorch = {
  id: string;
  title: string;
  role: "host" | "guest";
  lastVisitedAt: string;
};

export type WidgetPreferences = {
  collapsed: boolean;
  x: number | null;
  y: number | null;
};

export const defaultWidgetPreferences: WidgetPreferences = {
  collapsed: false,
  x: null,
  y: null,
};

export function isStablePorchId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{6,80}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

const lifecycleStates = [
  "created",
  "preflight",
  "armed",
  "recording",
  "finalizing",
  "ready",
  "failed",
  "cancelled",
] as const;

function isLifecycleState(value: unknown): boolean {
  return lifecycleStates.includes(value as typeof lifecycleStates[number]);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isCompanionAccount(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, ["state", "porches", "recordings"])) return false;
  if (!["checking", "signed_out", "ready", "degraded", "unavailable"].includes(String(value.state))) return false;
  if (!Array.isArray(value.porches) || value.porches.length > MAX_ACCOUNT_ITEMS) return false;
  if (!Array.isArray(value.recordings) || value.recordings.length > MAX_ACCOUNT_ITEMS) return false;
  if (!value.porches.every((porch) => (
    isRecord(porch)
    && hasExactKeys(porch, ["id", "title", "lifecycleState", "updatedAt"])
    && isStablePorchId(porch.id)
    && typeof porch.title === "string"
    && porch.title.trim().length > 0
    && porch.title.length <= 120
    && isLifecycleState(porch.lifecycleState)
    && isIsoDate(porch.updatedAt)
  ))) return false;
  return value.recordings.every((recording) => (
    isRecord(recording)
    && hasExactKeys(recording, [
      "id",
      "porchId",
      "name",
      "porchTitle",
      "lifecycleState",
      "createdAt",
      "durationSeconds",
    ])
    && typeof recording.id === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recording.id)
    && isStablePorchId(recording.porchId)
    && typeof recording.name === "string"
    && recording.name.trim().length > 0
    && recording.name.length <= 120
    && typeof recording.porchTitle === "string"
    && recording.porchTitle.trim().length > 0
    && recording.porchTitle.length <= 120
    && isLifecycleState(recording.lifecycleState)
    && isIsoDate(recording.createdAt)
    && (recording.durationSeconds === null
      || (Number.isInteger(recording.durationSeconds) && Number(recording.durationSeconds) >= 0))
  ));
}

export function parseCompanionStateMessage(value: unknown): PorchcastCompanionStateMessage | null {
  if (!isRecord(value) || !hasExactKeys(value, ["protocol", "version", "source", "type", "payload"])) return null;
  if (
    value.protocol !== "porchcast-companion"
    || value.version !== 1
    || value.source !== "porchcast-web"
    || value.type !== "state"
    || !isRecord(value.payload)
  ) return null;
  const payload = value.payload;
  if (!hasExactKeys(payload, ["revision", "porch", "status", "capabilities", "account", "noticeKey"])) return null;
  if (!Number.isInteger(payload.revision) || Number(payload.revision) < 0) return null;
  if (!["unknown", "live", "recording", "rendering", "ready", "attention"].includes(String(payload.status))) return null;
  if (
    payload.noticeKey !== null
    && (typeof payload.noticeKey !== "string" || !/^[A-Za-z0-9:_-]{1,160}$/.test(payload.noticeKey))
  ) return null;
  if (!isRecord(payload.capabilities) || !hasExactKeys(payload.capabilities, ["account", "downloads", "invite"])) return null;
  if (![payload.capabilities.account, payload.capabilities.downloads, payload.capabilities.invite]
    .every((entry) => typeof entry === "boolean")) return null;
  if (!isCompanionAccount(payload.account)) return null;
  if (payload.porch !== null) {
    if (!isRecord(payload.porch) || !hasExactKeys(payload.porch, ["id", "title", "role"])) return null;
    if (
      !isStablePorchId(payload.porch.id)
      || typeof payload.porch.title !== "string"
      || payload.porch.title.trim().length === 0
      || payload.porch.title.length > 120
      || (payload.porch.role !== "host" && payload.porch.role !== "guest")
    ) return null;
  }
  return value as PorchcastCompanionStateMessage;
}

export function isRecentPorch(value: unknown): value is RecentPorch {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RecentPorch> & Record<string, unknown>;
  return Object.keys(candidate).every((key) => ["id", "title", "role", "lastVisitedAt"].includes(key))
    && isStablePorchId(candidate.id)
    && typeof candidate.title === "string"
    && candidate.title.trim().length > 0
    && candidate.title.length <= 120
    && (candidate.role === "host" || candidate.role === "guest")
    && typeof candidate.lastVisitedAt === "string"
    && Number.isFinite(Date.parse(candidate.lastVisitedAt));
}

export function normalizeRecentPorches(value: unknown): RecentPorch[] {
  if (!Array.isArray(value)) return [];
  const deduplicated = new Map<string, RecentPorch>();
  for (const candidate of value) {
    if (!isRecentPorch(candidate) || deduplicated.has(candidate.id)) continue;
    deduplicated.set(candidate.id, candidate);
  }
  return [...deduplicated.values()]
    .sort((left, right) => Date.parse(right.lastVisitedAt) - Date.parse(left.lastVisitedAt))
    .slice(0, MAX_RECENT_PORCHES);
}

export function upsertRecentPorch(
  current: unknown,
  porch: Omit<RecentPorch, "lastVisitedAt">,
  visitedAt: string,
): RecentPorch[] {
  const next = normalizeRecentPorches(current).filter((candidate) => candidate.id !== porch.id);
  return normalizeRecentPorches([{ ...porch, lastVisitedAt: visitedAt }, ...next]);
}

export function normalizeWidgetPreferences(value: unknown): WidgetPreferences {
  if (!value || typeof value !== "object") return defaultWidgetPreferences;
  const candidate = value as Partial<WidgetPreferences>;
  return {
    collapsed: candidate.collapsed === true,
    x: typeof candidate.x === "number" && Number.isFinite(candidate.x) ? candidate.x : null,
    y: typeof candidate.y === "number" && Number.isFinite(candidate.y) ? candidate.y : null,
  };
}

export function porchUrl(id: string): string | null {
  if (!isStablePorchId(id)) return null;
  const url = new URL(PORCHCAST_APP_PATH, PORCHCAST_APP_ORIGIN);
  url.searchParams.set("room", id);
  return url.toString();
}

export function destinationUrl(destination: "account" | "app" | "book"): string {
  if (destination === "account") return new URL(`${PORCHCAST_APP_PATH}?account=1`, PORCHCAST_APP_ORIGIN).toString();
  if (destination === "book") return new URL(`${PORCHCAST_APP_PATH}?book=1`, PORCHCAST_APP_ORIGIN).toString();
  return new URL(PORCHCAST_APP_PATH, PORCHCAST_APP_ORIGIN).toString();
}

export function isPorchcastAppUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === PORCHCAST_APP_ORIGIN
      && (url.pathname === PORCHCAST_APP_PATH.slice(0, -1) || url.pathname.startsWith(PORCHCAST_APP_PATH));
  } catch {
    return false;
  }
}
