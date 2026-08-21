import {
  accountAuthorizationResponseSchema,
  accountBillingRedirectSchema,
  accountBillingSnapshotSchema,
  accountLogoutResponseSchema,
  accountRecordingLibrarySchema,
  accountRoomInvitationSchema,
  accountRoomListSchema,
  accountRoomSummarySchema,
  accountSnapshotSchema,
  type AccountRoomSummary,
  type AccountRecordingLibrary,
  type AccountRoomInvitation,
  type AccountSnapshot,
  type AccountBillingSnapshot,
  type PaidAccountPlan,
  type UpdateAccountRoomRequest,
} from "@wiplash/podcast-contracts";

import { apiUrl } from "./public-path";

export interface AccountClient {
  getSnapshot(): Promise<AccountSnapshot>;
  listRooms(): Promise<AccountRoomSummary[]>;
  listRecordings(): Promise<AccountRecordingLibrary>;
  getBilling(): Promise<AccountBillingSnapshot>;
  startCheckout(plan: PaidAccountPlan): Promise<string>;
  openBillingPortal(): Promise<string>;
  startSignIn(returnUrl: string): Promise<string>;
  signOut(returnUrl: string): Promise<{ snapshot: AccountSnapshot; redirectUrl?: string }>;
  claimRoom(roomId: string, hostToken: string): Promise<AccountRoomSummary>;
  updateRoom(roomId: string, input: UpdateAccountRoomRequest): Promise<AccountRoomSummary>;
  deleteRoom(roomId: string): Promise<void>;
  reissueRoomInvitation(roomId: string): Promise<AccountRoomInvitation>;
}

type SignInResumeStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const accountSignInResumeKey = "podcast-studio:account-sign-in-resume-v1";
const accountSignInResumeDurationMs = 10 * 60_000;

export const EMPTY_ACCOUNT_SNAPSHOT: AccountSnapshot = {
  account: null,
  capabilities: {
    signInAvailable: false,
    roomLibrary: false,
    retentionDays: 7,
    roomLimit: 100,
    guestSeatLimit: 2,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rejectCredentialFields(value: unknown): void {
  if (Array.isArray(value)) return value.forEach(rejectCredentialFields);
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (/^(apiKey|accessToken|refreshToken|idToken|password|secret|clientSecret|authJson)$/i.test(key)) {
      throw new Error("The account service returned credential-shaped data.");
    }
    rejectCredentialFields(nested);
  }
}

function errorMessage(value: unknown, fallback: string): string {
  if (!isRecord(value)) return fallback;
  const error = isRecord(value.error) ? value.error : null;
  return typeof error?.message === "string" && error.message.trim()
    ? error.message
    : fallback;
}

function safeRedirect(value: string): string {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("The account service returned an unsafe redirect.");
  }
  return url.toString();
}

export function accountReturnUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function signInResumePath(value: string): string {
  const url = new URL(accountReturnUrl(value));
  return `${url.pathname}${url.search}`;
}

export function rememberAccountSignInRedirect(
  storage: SignInResumeStorage,
  returnUrl: string,
  now = Date.now(),
): void {
  try {
    storage.setItem(accountSignInResumeKey, JSON.stringify({
      returnPath: signInResumePath(returnUrl),
      expiresAt: now + accountSignInResumeDurationMs,
    }));
  } catch {
    // Sign-in still works when private browsing blocks session storage.
  }
}

export function consumeAccountSignInRedirect(
  storage: SignInResumeStorage,
  currentUrl: string,
  now = Date.now(),
): boolean {
  let value: string | null = null;
  try {
    value = storage.getItem(accountSignInResumeKey);
    storage.removeItem(accountSignInResumeKey);
  } catch {
    return false;
  }
  if (!value) return false;
  try {
    const candidate = JSON.parse(value) as { expiresAt?: unknown; returnPath?: unknown };
    return typeof candidate.expiresAt === "number"
      && candidate.expiresAt >= now
      && typeof candidate.returnPath === "string"
      && candidate.returnPath === signInResumePath(currentUrl);
  } catch {
    return false;
  }
}

export function createAccountClient(fetcher: typeof fetch = globalThis.fetch): AccountClient {
  let csrfToken = "";

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body) headers.set("Content-Type", "application/json");
    if (init.method && init.method !== "GET" && csrfToken) {
      headers.set("X-Podcast-Studio-CSRF", csrfToken);
    }
    const response = await fetcher(apiUrl(path), {
      ...init,
      headers,
      credentials: "include",
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(errorMessage(payload, `Account request failed (${response.status}).`));
    rejectCredentialFields(payload);
    return payload;
  }

  function remember(value: unknown): AccountSnapshot {
    const snapshot = accountSnapshotSchema.parse(value);
    csrfToken = snapshot.csrfToken ?? "";
    return snapshot;
  }

  return {
    async getSnapshot() {
      return remember(await request("/v1/account"));
    },
    async listRooms() {
      return accountRoomListSchema.parse(await request("/v1/account/rooms")).rooms;
    },
    async listRecordings() {
      return accountRecordingLibrarySchema.parse(await request("/v1/account/recordings"));
    },
    async getBilling() {
      return accountBillingSnapshotSchema.parse(await request("/v1/account/billing"));
    },
    async startCheckout(plan) {
      const payload = accountBillingRedirectSchema.parse(await request(
        "/v1/account/billing/checkout",
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ plan }),
        },
      ));
      return safeRedirect(payload.url);
    },
    async openBillingPortal() {
      const payload = accountBillingRedirectSchema.parse(await request(
        "/v1/account/billing/portal",
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
        },
      ));
      return safeRedirect(payload.url);
    },
    async startSignIn(returnUrl) {
      const payload = accountAuthorizationResponseSchema.parse(await request(
        "/v1/auth/authorizations",
        {
          method: "POST",
          body: JSON.stringify({ provider: "wiplash", returnUrl: accountReturnUrl(returnUrl) }),
        },
      ));
      return safeRedirect(payload.authorizationUrl);
    },
    async signOut(returnUrl) {
      const payload = accountLogoutResponseSchema.parse(await request("/v1/auth/logout", {
        method: "POST",
        body: JSON.stringify({ returnUrl: accountReturnUrl(returnUrl) }),
      }));
      const snapshot = remember(payload);
      return {
        snapshot,
        redirectUrl: payload.redirectUrl ? safeRedirect(payload.redirectUrl) : undefined,
      };
    },
    async claimRoom(roomId, hostToken) {
      return accountRoomSummarySchema.parse(await request(
        `/v1/account/rooms/${encodeURIComponent(roomId)}/claim`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ hostToken }),
        },
      ));
    },
    async updateRoom(roomId, input) {
      return accountRoomSummarySchema.parse(await request(
        `/v1/account/rooms/${encodeURIComponent(roomId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(input),
        },
      ));
    },
    async deleteRoom(roomId) {
      await request(`/v1/account/rooms/${encodeURIComponent(roomId)}`, {
        method: "DELETE",
      });
    },
    async reissueRoomInvitation(roomId) {
      return accountRoomInvitationSchema.parse(await request(
        `/v1/account/rooms/${encodeURIComponent(roomId)}/invitation`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
        },
      ));
    },
  };
}
