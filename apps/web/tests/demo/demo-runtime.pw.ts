import { expect, test } from "@playwright/test";

const forbiddenRuntimeRequest = /\/(?:v1|internal)(?:\/|$)|\/(?:whip|whep)(?:\/|$)|\.(?:m4a|mkv|mov|mp4|opus|wav|webm)(?:$|[?#])/i;

test("explicit demo renders a full local studio without API or device access", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const forbiddenRequests: string[] = [];
  page.on("request", (request) => {
    if (forbiddenRuntimeRequest.test(new URL(request.url()).pathname)) {
      forbiddenRequests.push(request.url());
    }
  });
  await page.addInitScript(() => {
    const calls = { display: 0, user: 0 };
    Object.defineProperty(window, "__porchcastMediaCalls", { value: calls });
    if (navigator.mediaDevices) {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: () => {
          calls.user += 1;
          return Promise.reject(new Error("Demo must not request user media"));
        },
      });
      Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", {
        configurable: true,
        value: () => {
          calls.display += 1;
          return Promise.reject(new Error("Demo must not request display media"));
        },
      });
    }
  });

  await page.goto("/?demo=full-room");
  await expect(page.getByText("LOCAL DEMO · SIMULATED MEDIA")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Porchcast demo" })).toBeVisible();
  await expect(page.locator(".demo-studio__participant")).toHaveCount(13);
  expect(forbiddenRequests).toEqual([]);
  expect(await page.evaluate(() => (
    window as Window & { __porchcastMediaCalls: { display: number; user: number } }
  ).__porchcastMediaCalls)).toEqual({ display: 0, user: 0 });

  await page.getByRole("button", { name: "Mic on" }).click();
  await expect(page.getByRole("button", { name: "Mic off" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Share screen" }).click();
  await expect(page.getByRole("region", { name: "Simulated shared screen" })).toBeVisible();
  await page.getByRole("button", { name: "Chat closed" }).click();
  await page.getByLabel("Demo chat message").fill("Local test message");
  await page.getByRole("button", { name: "Add locally" }).click();
  await expect(page.getByText("Local test message")).toBeVisible();

  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(1);
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(forbiddenRequests).toEqual([]);
});

test("Cloud remains the default runtime", async ({ page }) => {
  await page.route("**/v1/account", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        account: null,
        capabilities: {
          signInAvailable: true,
          roomLibrary: false,
          retentionDays: 1,
          roomLimit: 1,
          guestSeatLimit: 2,
        },
      },
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Record a real podcast/i })).toBeVisible();
  await expect(page.getByText("LOCAL DEMO · SIMULATED MEDIA")).toHaveCount(0);
});

test("demo marketing navigation round-trips and account actions remain visibly local", async ({ page }) => {
  const forbiddenRequests: string[] = [];
  page.on("request", (request) => {
    if (forbiddenRuntimeRequest.test(new URL(request.url()).pathname)) {
      forbiddenRequests.push(request.url());
    }
  });

  await page.goto("/pricing?demo=ready");
  await expect(page.getByRole("heading", { name: /Start free/i })).toBeVisible();
  await expect(page).toHaveURL(/\/pricing\?demo=ready$/);
  await expect(page.getByText("LOCAL DEMO · SIMULATED MEDIA")).toHaveCount(0);
  await expect(page.getByText("Account sign-in unavailable").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in for Porchcaster" })).toHaveCount(0);
  await expect.poll(() => forbiddenRequests).toEqual([]);
  await expect(page.getByRole("link", { name: "Privacy" }).last())
    .toHaveAttribute("href", "/privacy?demo=ready");

  await page.getByRole("link", { name: "Product" }).first().click();
  await expect(page).toHaveURL(/\/\?demo=ready&surface=marketing$/);
  await expect(page.getByRole("heading", { name: /Record a real podcast/i })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /Record a real podcast/i })).toBeVisible();
  await expect(page.getByText("LOCAL DEMO · SIMULATED MEDIA")).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/pricing\?demo=ready$/);
  await expect(page.getByRole("heading", { name: /Start free/i })).toBeVisible();
  await expect.poll(() => forbiddenRequests).toEqual([]);
});

test("the responsive demo offline notice follows its actual header", async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?demo=ready");
  await expect(page.getByRole("heading", { name: "Porchcast demo" })).toBeVisible();

  await context.setOffline(true);
  const notice = page.locator(".pwa-status-in-room");
  await expect(notice).toBeVisible();

  await expect.poll(async () => {
    const header = await page.locator(".demo-studio__header").boundingBox();
    const banner = await notice.boundingBox();
    if (!header || !banner) return false;
    return banner.y >= header.y + header.height + 11;
  }).toBe(true);
  await expect(page.getByRole("button", { name: "Leave demo" })).toBeVisible();
});
