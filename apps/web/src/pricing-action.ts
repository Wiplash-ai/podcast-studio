import type { AccountBillingSnapshot, PaidAccountPlan } from "@wiplash/podcast-contracts";

import type { PodcastPlanId } from "./plan-catalog";

export type PricingAction =
  | { kind: "book"; label: string }
  | { kind: "checkout"; label: string; plan: PaidAccountPlan }
  | { kind: "included"; label: string }
  | { kind: "manage"; label: string }
  | { kind: "plan-change"; label: string; plan: PaidAccountPlan }
  | { kind: "sign-in"; label: string }
  | { kind: "unavailable"; label: string };

const planNames: Record<PaidAccountPlan, string> = {
  creator: "Porchcaster",
  professional: "Showrunner",
  studio: "Studio",
};

export function pricingAction(
  plan: PodcastPlanId,
  billing: AccountBillingSnapshot | null,
  signedIn: boolean,
  signInAvailable = true,
): PricingAction {
  if (plan === "free") {
    if (signedIn && billing?.subscriptionPlan && billing.portalAvailable) {
      return { kind: "manage", label: "Manage cancellation" };
    }
    return {
      kind: "book",
      label: billing?.plan === "free" ? "Book with Free" : "Book a free room",
    };
  }
  const name = planNames[plan];
  if (!signedIn && !signInAvailable) {
    return { kind: "unavailable", label: "Account sign-in unavailable" };
  }
  if (!signedIn) return { kind: "sign-in", label: `Sign in for ${name}` };
  if (billing?.plan === "internal") {
    return {
      kind: "included",
      label: plan === "studio" ? "Studio access included" : "Included with admin access",
    };
  }
  if (billing?.subscriptionPlan) {
    if (billing.subscriptionPlan === plan) {
      return billing.portalAvailable
        ? { kind: "manage", label: "Manage subscription" }
        : { kind: "unavailable", label: "Billing settings unavailable" };
    }
    return billing.planChangeAvailable
      ? { kind: "plan-change", label: `Switch to ${name}`, plan }
      : { kind: "unavailable", label: "Plan changes unavailable" };
  }
  return billing?.checkoutAvailable
    ? { kind: "checkout", label: `Choose ${name}`, plan }
    : { kind: "unavailable", label: "Subscriptions opening soon" };
}
