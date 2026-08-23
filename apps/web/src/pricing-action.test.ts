import { describe, expect, it } from "vitest";

import type { AccountBillingSnapshot } from "@wiplash/podcast-contracts";

import { pricingAction } from "./pricing-action";

const studioSubscription: AccountBillingSnapshot = {
  mode: "test",
  plan: "studio",
  subscriptionPlan: "studio",
  status: "active",
  currentPeriodEnd: "2026-09-21T18:56:14.000Z",
  cancelAt: null,
  downloadUntil: null,
  capabilities: {
    guestSeatLimit: 12,
    retentionDays: 7,
    recording: {
      plan: "studio",
      includedSeconds: null,
      usedSeconds: 0,
      remainingSeconds: null,
      maxSessionSeconds: null,
      periodStartedAt: null,
      resetsAt: null,
      activeRecordingId: null,
    },
  },
  checkoutAvailable: true,
  planChangeAvailable: true,
  portalAvailable: true,
};

describe("Porchcast pricing actions", () => {
  it("uses Stripe-confirmed plan changes for existing subscribers", () => {
    expect(pricingAction("creator", studioSubscription, true)).toEqual({
      kind: "plan-change",
      label: "Switch to Porchcaster",
      plan: "creator",
    });
    expect(pricingAction("professional", studioSubscription, true)).toEqual({
      kind: "plan-change",
      label: "Switch to Showrunner",
      plan: "professional",
    });
    expect(pricingAction("studio", studioSubscription, true)).toEqual({
      kind: "manage",
      label: "Manage subscription",
    });
    expect(pricingAction("free", studioSubscription, true)).toEqual({
      kind: "manage",
      label: "Manage cancellation",
    });
  });

  it("does not offer paid checkout to an internal administrator", () => {
    const internal: AccountBillingSnapshot = {
      ...studioSubscription,
      plan: "internal",
      subscriptionPlan: null,
      capabilities: {
        ...studioSubscription.capabilities,
        recording: { ...studioSubscription.capabilities.recording, plan: "internal" },
      },
      planChangeAvailable: false,
      portalAvailable: false,
    };
    expect(pricingAction("studio", internal, true)).toEqual({
      kind: "included",
      label: "Studio access included",
    });
    expect(pricingAction("professional", internal, true).kind).toBe("included");
  });

  it("keeps first-time checkout and signed-out sign-in distinct", () => {
    const free: AccountBillingSnapshot = {
      ...studioSubscription,
      plan: "free",
      subscriptionPlan: null,
      capabilities: {
        ...studioSubscription.capabilities,
        guestSeatLimit: 2,
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
      planChangeAvailable: false,
      portalAvailable: false,
    };
    expect(pricingAction("creator", free, true).kind).toBe("checkout");
    expect(pricingAction("creator", null, false).kind).toBe("sign-in");
  });
});
