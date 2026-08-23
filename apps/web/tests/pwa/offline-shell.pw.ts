import { expect, test, type Page } from "@playwright/test";

const anonymousAccount = {
  account: null,
  capabilities: {
    signInAvailable: true,
    roomLibrary: false,
    retentionDays: 1,
    roomLimit: 1,
    guestSeatLimit: 2,
  },
};

const forbiddenCacheUrl = /\/(?:v1|internal|gateway-healthz|healthz|whip|whep|media|recordings?|streams?)(?:\/|$)|\.(?:m4a|mkv|mov|mp4|opus|wav|webm)(?:$|[?#])/i;

async function readCacheEntries(page: Page) {
  return page.evaluate(async () => {
    const entries: Array<{ cacheName: string; url: string }> = [];
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName);
      for (const request of await cache.keys()) {
        entries.push({ cacheName, url: request.url });
      }
    }
    return entries;
  });
}

test("production app shell reopens offline without caching API or media traffic", async ({
  context,
  page,
}) => {
  await page.route("**/v1/account", async (route) => {
    await route.fulfill({ contentType: "application/json", json: anonymousAccount });
  });
  await page.route("**/v1/pwa-cache-probe", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { ok: true } });
  });
  await page.route("**/recordings/pwa-cache-probe.webm", async (route) => {
    await route.fulfill({ body: "media probe", contentType: "video/webm" });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Record a real podcast/i })).toBeVisible();

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(
    () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
  ).toBe(true);

  await page.evaluate(async () => {
    await Promise.allSettled([
      fetch("/v1/pwa-cache-probe"),
      fetch("/recordings/pwa-cache-probe.webm"),
    ]);
  });

  const warmedEntries = await readCacheEntries(page);
  expect(warmedEntries.length).toBeGreaterThan(0);
  expect(warmedEntries.some(({ url }) => new URL(url).pathname === "/index.html")).toBe(true);
  expect(warmedEntries.filter(({ url }) => forbiddenCacheUrl.test(url))).toEqual([]);

  await page.unrouteAll({ behavior: "wait" });
  await context.setOffline(true);

  const offlineResponse = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(offlineResponse?.fromServiceWorker()).toBe(true);
  await expect(page.getByRole("heading", { name: /Record a real podcast/i })).toBeVisible();
  expect(await page.evaluate(
    () => fetch("/uncached-network-probe").then(() => false).catch(() => true),
  )).toBe(true);

  const offlineEntries = await readCacheEntries(page);
  expect(offlineEntries.filter(({ url }) => forbiddenCacheUrl.test(url))).toEqual([]);
});
