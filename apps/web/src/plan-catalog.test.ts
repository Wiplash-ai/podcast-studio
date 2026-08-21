import { describe, expect, it } from "vitest";

import { podcastPlans, pricingQuery, pricingQuestions, upgradePromptLocations } from "./plan-catalog";

describe("public plan catalog", () => {
  it("publishes the accepted subscription catalog without changing recording quality", () => {
    expect(podcastPlans).toHaveLength(4);
    expect(podcastPlans.filter((plan) => plan.status === "free").map((plan) => plan.id))
      .toEqual(["free"]);
    expect(podcastPlans.filter((plan) => plan.status === "subscription")).toHaveLength(3);
    expect(podcastPlans.find((plan) => plan.id === "free")).toMatchObject({
      priceCadence: "forever",
      guests: "Up to 2 guests",
      recordingStorage: "3 hours / month",
      quality: "Full quality",
    });
    expect(podcastPlans.filter((plan) => plan.status === "subscription").map((plan) => ({
      cadence: plan.priceCadence,
      guests: plan.guests,
      name: plan.name,
      price: plan.priceLabel,
      storage: plan.recordingStorage,
    }))).toEqual([
      { cadence: "/ month", guests: "Up to 4 guests", name: "Podcaster", price: "$9.99", storage: "10 hours / month" },
      { cadence: "/ month", guests: "Up to 8 guests", name: "Showrunner", price: "$24.99", storage: "30 hours / month" },
      { cadence: "/ month", guests: "Up to 12 guests", name: "Studio", price: "$49.99", storage: "Unlimited recording hours" },
    ]);
    expect(new Set(podcastPlans.map((plan) => plan.quality))).toEqual(new Set(["Full quality"]));
  });

  it("states the accepted Stripe, retry, cancellation, and recording-removal policy", () => {
    expect(pricingQuestions.map((item) => item.question)).toEqual([
      "Are the paid plans subscriptions?",
      "Do Free recordings have lower quality?",
      "What changes between plans?",
      "What happens when I use all my recording hours?",
      "What happens if a subscription payment fails?",
      "How long do I have to download recordings after cancellation?",
      "Can I cancel whenever I want?",
      "Do guests need their own subscription?",
      "Does Wiplash store my card number?",
    ]);
    expect(pricingQuestions.find((item) => item.question.includes("payment fails"))?.answer)
      .toContain("three payment attempts");
    expect(pricingQuestions.find((item) => item.question.includes("after cancellation"))?.answer)
      .toContain("30 days");
    expect(pricingQuestions.find((item) => item.question.includes("subscriptions"))?.answer)
      .toContain("Stripe");
    expect(pricingQuestions.find((item) => item.question === "What changes between plans?")?.answer)
      .toContain("Studio has no monthly recording-hour limit");
  });

  it("allows only documented contextual upgrade sources", () => {
    expect(upgradePromptLocations).toEqual([
      "guest_seats",
      "recording_hours",
      "retention_warning",
      "recording_downloads",
      "account_plan",
    ]);
    expect(pricingQuery("recording_hours")).toBe("?from=recording_hours");
    expect(pricingQuery("guest_seats")).toBe("?from=guest_seats");
  });
});
