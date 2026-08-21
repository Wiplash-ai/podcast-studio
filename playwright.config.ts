import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/responsive",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "line",
  use: {
    baseURL: "http://127.0.0.1:4193",
    channel: "chrome",
    colorScheme: "dark",
    hasTouch: true,
    locale: "en-US",
    reducedMotion: "reduce",
  },
  webServer: {
    command: "npm run build && npm run preview -w @wiplash/podcast-web",
    url: "http://127.0.0.1:4193",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
