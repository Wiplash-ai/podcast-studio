import { describe, expect, it, vi } from "vitest";
import type { AccountRoomSummary } from "@wiplash/podcast-contracts";

import { roomRequestHeaders } from "./studio-utils";
import {
  accountReturnUrl,
  consumeAccountSignInRedirect,
  createAccountClient,
  createUnavailableAccountClient,
  rememberAccountSignInRedirect,
} from "./account";

const accountSnapshot = {
  account: {
    id: "342db180-8dbf-4bc7-9fa8-3b0b29084f8d",
    email: "host@example.com",
    displayName: "Podcast Host",
    expiresAt: "2026-08-16T20:00:00.000Z",
  },
  capabilities: {
    signInAvailable: true,
    roomLibrary: true,
    retentionDays: 7,
    roomLimit: 100,
    guestSeatLimit: 2,
  },
  csrfToken: "c".repeat(43),
};

const accountRoom = {
  room: {
    id: "9f394f30-43cc-4dce-babf-8dfba0529967",
    title: "Weekly show",
    hostName: "Podcast Host",
    settings: {
      maxGuests: 1,
      admissionMode: "host_approval",
      videoPreset: "balanced",
      audioPreset: "voice",
      screenSharePreset: "detail",
      requestedLayouts: ["horizontal", "vertical"],
    },
    lifecycleState: "created",
    healthState: "healthy",
    warnings: [],
    recordingAdapter: null,
    recordingEpoch: null,
    stoppedAt: null,
    currentRecordingId: null,
    programs: [],
    createdAt: "2026-08-16T12:00:00.000Z",
    updatedAt: "2026-08-16T12:00:00.000Z",
    revision: 0,
  },
  retentionClass: "free",
  mediaExpiresAt: "2026-08-23T12:00:00.000Z",
  mediaDeletedAt: null,
  claimedAt: "2026-08-16T12:00:00.000Z",
  openPath: "/?room=9f394f30-43cc-4dce-babf-8dfba0529967",
} satisfies AccountRoomSummary;

describe("Porchcast account client", () => {
  it("keeps every account operation offline when the runtime disables accounts", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    const client = createUnavailableAccountClient();

    await expect(client.getSnapshot()).rejects.toThrow("local demo");
    await expect(client.startSignIn("https://labs.wiplash.ai/")).rejects.toThrow("local demo");
    await expect(client.startCheckout("creator")).rejects.toThrow("local demo");
    await expect(client.claimRoom(accountRoom.room.id, "host-token")).rejects.toThrow("local demo");
    expect(fetcher).not.toHaveBeenCalled();

    fetcher.mockRestore();
  });

  it("uses the in-memory account CSRF value for tokenless owned-room requests", () => {
    expect(roomRequestHeaders("", "account-csrf", { Accept: "application/json" })).toEqual({
      Accept: "application/json",
      "X-Podcast-Studio-CSRF": "account-csrf",
    });
    expect(roomRequestHeaders("room-capability", "")).toEqual({
      "X-Room-Token": "room-capability",
    });
  });

  it("keeps credentials in HTTP-only cookies and sends the opaque CSRF value on mutations", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(accountSnapshot))
      .mockResolvedValueOnce(Response.json({
        ...accountSnapshot,
        account: null,
        csrfToken: undefined,
      }));
    const client = createAccountClient(fetcher);

    await client.getSnapshot();
    await client.signOut("https://labs.wiplash.ai/porchcast/");

    const first = fetcher.mock.calls[0]![1]!;
    const second = fetcher.mock.calls[1]![1]!;
    expect(first.credentials).toBe("include");
    expect(new Headers(second.headers).get("x-podcast-studio-csrf")).toBe("c".repeat(43));
    expect(JSON.stringify(second)).not.toContain("ps_account_session");
  });

  it("rejects credential-shaped account responses", async () => {
    const client = createAccountClient(vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      ...accountSnapshot,
      accessToken: "must-not-reach-the-browser",
    })));
    await expect(client.getSnapshot()).rejects.toThrow("credential-shaped");
  });

  it("loads the account recording library and allowance from one safe endpoint", async () => {
    const recordingLibrary = {
      allowance: {
        plan: "free",
        includedSeconds: 10_800,
        usedSeconds: 600,
        remainingSeconds: 10_200,
        maxSessionSeconds: 10_800,
        periodStartedAt: "2026-08-01T00:00:00.000Z",
        resetsAt: "2026-09-01T00:00:00.000Z",
        activeRecordingId: null,
      },
      recordings: [],
    };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(accountSnapshot))
      .mockResolvedValueOnce(Response.json(recordingLibrary));
    const client = createAccountClient(fetcher);

    await client.getSnapshot();
    const library = await client.listRecordings();

    expect(library.allowance).toMatchObject({ usedSeconds: 600, remainingSeconds: 10_200 });
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("/v1/account/recordings");
    expect(fetcher.mock.calls[1]?.[1]?.credentials).toBe("include");
  });

  it("loads server-owned billing state and starts Stripe-hosted flows with CSRF and idempotency", async () => {
    const billing = {
      mode: "test",
      plan: "free",
      subscriptionPlan: null,
      status: "active",
      currentPeriodEnd: null,
      cancelAt: null,
      downloadUntil: null,
      capabilities: {
        guestSeatLimit: 2,
        retentionDays: 7,
        recording: {
          plan: "free",
          includedSeconds: 10_800,
          usedSeconds: 0,
          remainingSeconds: 10_800,
          maxSessionSeconds: 10_800,
          periodStartedAt: "2026-08-01T00:00:00.000Z",
          resetsAt: "2026-09-01T00:00:00.000Z",
          activeRecordingId: null,
        },
      },
      checkoutAvailable: true,
      planChangeAvailable: false,
      portalAvailable: true,
    };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(accountSnapshot))
      .mockResolvedValueOnce(Response.json(billing))
      .mockResolvedValueOnce(Response.json({
        status: "redirect",
        url: "https://checkout.stripe.com/c/pay/cs_test_safe",
      }))
      .mockResolvedValueOnce(Response.json({
        status: "redirect",
        url: "https://billing.stripe.com/p/session/test_safe",
      }))
      .mockResolvedValueOnce(Response.json({
        status: "redirect",
        url: "https://billing.stripe.com/p/session/test_plan_change",
      }));
    const client = createAccountClient(fetcher);

    await client.getSnapshot();
    expect((await client.getBilling()).plan).toBe("free");
    expect(await client.startCheckout("professional")).toContain("checkout.stripe.com");
    expect(await client.openBillingPortal()).toContain("billing.stripe.com");
    expect(await client.startPlanChange("creator")).toContain("billing.stripe.com");

    const checkout = fetcher.mock.calls[2]![1]!;
    const portal = fetcher.mock.calls[3]![1]!;
    const planChange = fetcher.mock.calls[4]![1]!;
    expect(JSON.parse(String(checkout.body))).toEqual({ plan: "professional" });
    expect(JSON.parse(String(planChange.body))).toEqual({ plan: "creator" });
    expect(String(fetcher.mock.calls[4]?.[0])).toContain("/v1/account/billing/plan-change");
    for (const request of [checkout, portal, planChange]) {
      const headers = new Headers(request.headers);
      expect(headers.get("x-podcast-studio-csrf")).toBe("c".repeat(43));
      expect(headers.get("idempotency-key")).toMatch(/^[0-9a-f-]{36}$/);
      expect(request.credentials).toBe("include");
    }
  });

  it("rejects credential-shaped billing responses and unsafe billing redirects", async () => {
    const credentialClient = createAccountClient(vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(accountSnapshot))
      .mockResolvedValueOnce(Response.json({
        status: "redirect",
        url: "https://checkout.stripe.com/c/pay/cs_test_safe",
        secret: "must-not-reach-the-browser",
      })));
    await credentialClient.getSnapshot();
    await expect(credentialClient.startCheckout("creator")).rejects.toThrow("credential-shaped");

    const unsafeClient = createAccountClient(vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(accountSnapshot))
      .mockResolvedValueOnce(Response.json({
        status: "redirect",
        url: "http://stripe.invalid/checkout",
      })));
    await unsafeClient.getSnapshot();
    await expect(unsafeClient.startCheckout("studio")).rejects.toThrow("unsafe redirect");
  });

  it("reissues a guest invitation with account CSRF and no room capability", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(accountSnapshot))
      .mockResolvedValueOnce(Response.json({
        roomId: "342db180-8dbf-4bc7-9fa8-3b0b29084f8d",
        guestInvitePath: `/?room=342db180-8dbf-4bc7-9fa8-3b0b29084f8d&invite=${"g".repeat(43)}`,
        rotatedAt: "2026-08-16T12:00:00.000Z",
      }));
    const client = createAccountClient(fetcher);
    await client.getSnapshot();
    const invitation = await client.reissueRoomInvitation(
      "342db180-8dbf-4bc7-9fa8-3b0b29084f8d",
    );
    const request = fetcher.mock.calls[1]![1]!;

    expect(invitation.guestInvitePath).toContain("invite=");
    expect(new Headers(request.headers).get("x-podcast-studio-csrf")).toBe("c".repeat(43));
    expect(JSON.stringify(request)).not.toContain("X-Room-Token");
  });

  it("edits and deletes saved rooms with account CSRF and no room capability", async () => {
    const updatedRoom = {
      ...accountRoom,
      room: { ...accountRoom.room, title: "Renamed show", revision: 1 },
    };
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(accountSnapshot))
      .mockResolvedValueOnce(Response.json(updatedRoom))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createAccountClient(fetcher);
    await client.getSnapshot();
    const updated = await client.updateRoom(accountRoom.room.id, {
      title: "Renamed show",
      hostName: accountRoom.room.hostName,
      settings: accountRoom.room.settings,
    });
    await client.deleteRoom(accountRoom.room.id);

    expect(updated.room.title).toBe("Renamed show");
    const updateRequest = fetcher.mock.calls[1]![1]!;
    const deleteRequest = fetcher.mock.calls[2]![1]!;
    expect(updateRequest.method).toBe("PATCH");
    expect(deleteRequest.method).toBe("DELETE");
    expect(new Headers(updateRequest.headers).get("x-podcast-studio-csrf"))
      .toBe("c".repeat(43));
    expect(new Headers(deleteRequest.headers).get("x-podcast-studio-csrf"))
      .toBe("c".repeat(43));
    expect(JSON.stringify([updateRequest, deleteRequest])).not.toMatch(/room-token|hostToken|password/i);
  });

  it("starts sign-in through the shared Wiplash entry and removes URL fragments", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      status: "redirect",
      authorizationUrl: "https://auth.wiplash.ai/realms/wiplash/protocol/openid-connect/auth?client_id=podcast-studio-web",
    }));
    const client = createAccountClient(fetcher);
    const authorization = await client.startSignIn(
      "https://labs.wiplash.ai/porchcast/?room=one#private-state",
    );

    expect(authorization).toContain("auth.wiplash.ai");
    const body = JSON.parse(String(fetcher.mock.calls[0]![1]?.body));
    expect(body).toEqual({
      provider: "wiplash",
      returnUrl: "https://labs.wiplash.ai/porchcast/?room=one",
    });
    expect(accountReturnUrl("https://labs.wiplash.ai/porchcast/#state"))
      .toBe("https://labs.wiplash.ai/porchcast/");
  });

  it("remembers a same-tab room return long enough to restore device setup", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const roomUrl = "https://labs.wiplash.ai/porchcast/?room=weekly#private";

    rememberAccountSignInRedirect(storage, roomUrl, 1_000);

    expect(consumeAccountSignInRedirect(
      storage,
      "https://labs.wiplash.ai/porchcast/?room=weekly",
      2_000,
    )).toBe(true);
    expect(consumeAccountSignInRedirect(storage, roomUrl, 2_000)).toBe(false);
  });

  it("fails closed for expired or mismatched sign-in resume checkpoints", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const roomUrl = "https://labs.wiplash.ai/porchcast/?room=weekly";

    rememberAccountSignInRedirect(storage, roomUrl, 1_000);
    expect(consumeAccountSignInRedirect(
      storage,
      "https://labs.wiplash.ai/porchcast/?room=different",
      2_000,
    )).toBe(false);

    rememberAccountSignInRedirect(storage, roomUrl, 1_000);
    expect(consumeAccountSignInRedirect(storage, roomUrl, 700_001)).toBe(false);
  });
});
