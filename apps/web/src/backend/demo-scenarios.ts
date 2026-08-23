export const demoScenarioIds = [
  "ready",
  "recording",
  "finalizing",
  "full-room",
  "reconnecting",
] as const;

export type DemoScenario = (typeof demoScenarioIds)[number];

export function isDemoScenario(value: string | null | undefined): value is DemoScenario {
  return demoScenarioIds.includes(value as DemoScenario);
}
