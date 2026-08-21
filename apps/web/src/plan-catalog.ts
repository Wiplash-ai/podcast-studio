export type PodcastPlanId = "free" | "creator" | "professional" | "studio";

export interface PodcastPlan {
  id: PodcastPlanId;
  name: string;
  status: "free" | "subscription";
  priceLabel: string;
  priceCadence: string;
  summary: string;
  guests: string;
  recordingStorage: string;
  quality: string;
  features: string[];
}

export interface PricingQuestion {
  answer: string;
  question: string;
}

/**
 * This is the accepted public subscription catalog, not the authorization
 * source of truth. Only Free is enforced today; checkout availability remains
 * a server capability until signed Stripe billing and paid entitlements ship.
 */
export const podcastPlans: PodcastPlan[] = [
  {
    id: "free",
    name: "Free",
    status: "free",
    priceLabel: "$0",
    priceCadence: "forever",
    summary: "For solo shows and smaller conversations that still deserve a polished recording.",
    guests: "Up to 2 guests",
    recordingStorage: "3 hours / month",
    quality: "Full quality",
    features: [
      "Full-quality Desktop and Mobile views",
      "Reusable rooms and invite links",
      "Secure isolated camera, audio, and screen sources",
    ],
  },
  {
    id: "creator",
    name: "Podcaster",
    status: "subscription",
    priceLabel: "$9.99",
    priceCadence: "/ month",
    summary: "For a weekly show that needs the recording workload off your main computer.",
    guests: "Up to 4 guests",
    recordingStorage: "10 hours / month",
    quality: "Full quality",
    features: [
      "Full-quality Desktop and Mobile views",
      "Reusable rooms and invite links",
      "Secure isolated camera, audio, and screen sources",
    ],
  },
  {
    id: "professional",
    name: "Showrunner",
    status: "subscription",
    priceLabel: "$24.99",
    priceCadence: "/ month",
    summary: "For producers running several active shows without turning a laptop into a render station.",
    guests: "Up to 8 guests",
    recordingStorage: "30 hours / month",
    quality: "Full quality",
    features: [
      "Full-quality Desktop and Mobile views",
      "Reusable rooms and invite links",
      "Secure isolated camera, audio, and screen sources",
    ],
  },
  {
    id: "studio",
    name: "Studio",
    status: "subscription",
    priceLabel: "$49.99",
    priceCadence: "/ month",
    summary: "For a busy studio recording larger panels and a full calendar of conversations.",
    guests: "Up to 12 guests",
    recordingStorage: "Unlimited recording hours",
    quality: "Full quality",
    features: [
      "Full-quality Desktop and Mobile views",
      "Reusable rooms and invite links",
      "Secure isolated camera, audio, and screen sources",
    ],
  },
];

export const pricingQuestions: PricingQuestion[] = [
  {
    question: "Are the paid plans subscriptions?",
    answer: "Yes. Podcaster, Showrunner, and Studio are monthly subscriptions that renew automatically until you cancel. Stripe will securely process subscription payments.",
  },
  {
    question: "Do Free recordings have lower quality?",
    answer: "No. Free and paid accounts receive the same recording quality, secure isolated sources, and Desktop and Mobile views. Upgrading gives you more guest seats and more Cloud recording hours—not a better-looking file.",
  },
  {
    question: "What changes between plans?",
    answer: "Guest capacity and Cloud recording storage. Storage is measured in hours of recorded conversation each month, so one hour of recording uses one hour whether the room has one guest or twelve. Studio has no monthly recording-hour limit.",
  },
  {
    question: "What happens when I use all my recording hours?",
    answer: "You can still open rooms, talk with guests, and download existing recordings. New Cloud recordings wait until your hours reset or you move to a plan with more recording storage. Studio recording hours do not run out.",
  },
  {
    question: "What happens if a subscription payment fails?",
    answer: "We will make up to three payment attempts. If all three fail, we automatically cancel the subscription. We do not interrupt an active recording or immediately remove existing recordings because of one missed payment.",
  },
  {
    question: "How long do I have to download recordings after cancellation?",
    answer: "You have 30 days from the subscription cancellation date to download your recordings. Your account will show the removal date, and recordings remaining after that date are scheduled for permanent deletion.",
  },
  {
    question: "Can I cancel whenever I want?",
    answer: "Yes. Canceling stops the next renewal. Your paid limits continue through the end of the current billing period, followed by the 30-day recording download window.",
  },
  {
    question: "Do guests need their own subscription?",
    answer: "No. The host’s plan controls the room’s guest capacity and Cloud recording hours. Guests can join from the host’s invitation without buying a plan.",
  },
  {
    question: "Does Wiplash store my card number?",
    answer: "No. Stripe processes the payment details. Podcast Studio receives the billing status and identifiers needed to manage your subscription, not your complete card number.",
  },
];

export const upgradePromptLocations = [
  "guest_seats",
  "recording_hours",
  "retention_warning",
  "recording_downloads",
  "account_plan",
] as const;

export type UpgradePromptLocation = typeof upgradePromptLocations[number];

export function pricingQuery(location: UpgradePromptLocation): string {
  return `?from=${encodeURIComponent(location)}`;
}
