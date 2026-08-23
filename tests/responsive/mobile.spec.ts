import { expect, test, type Page } from "@playwright/test";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

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

async function loadCloudFixtureStyles(page: Page) {
  const assets = await readdir(resolve(import.meta.dirname, "../../apps/web/dist/assets"));
  const stylesheet = assets.find((asset) => (
    /^CloudStudioView-.*\.css$/.test(asset)
  ));
  if (!stylesheet) throw new Error("The production build is missing the Cloud route stylesheet.");
  await page.addStyleTag({ url: `/assets/${stylesheet}` });
}

async function prepare(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.route("**/v1/account", async (route) => {
    await route.fulfill({ contentType: "application/json", json: anonymousAccount });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(1);
  expect(overflow.document).toBeLessThanOrEqual(1);
}

async function expectInsideViewport(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
}

async function expectMinimumSize(page: Page, selector: string, width: number, height: number) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(width);
  expect(box!.height).toBeGreaterThanOrEqual(height);
}

async function offerPwaInstall(page: Page) {
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperties(event, {
      prompt: { value: () => Promise.resolve() },
      userChoice: {
        value: Promise.resolve({ outcome: "dismissed", platform: "test" }),
      },
    });
    window.dispatchEvent(event);
  });
}

async function renderRoomFixture(page: Page, options: { participantCount: number; screenActive?: boolean }) {
  await page.goto("/");
  await loadCloudFixtureStyles(page);
  const participants = Array.from({ length: options.participantCount }, (_, index) => `
    <figure class="participant-tile ${index === options.participantCount - 1 ? "local-participant" : "remote-participant"}">
      <figcaption>${index === options.participantCount - 1 ? "YOU · HOST" : `GUEST ${index + 1}`}</figcaption>
    </figure>
  `).join("");
  await page.evaluate(({ participantCount, participants, screenActive }) => {
    document.body.innerHTML = `
      <div id="root">
        <div class="app-shell">
          <header class="topbar">
            <button class="wordmark"><span class="wordmark-mark"><img alt="" src="/porchcast-mark.svg"></span><span>Porchcast</span></button>
            <div class="app-breadcrumb"><span>Rooms</span><i>/</i><strong>Responsive room</strong></div>
            <div class="topbar-actions"><button class="new-room-button">Book a room</button></div>
          </header>
          <main class="studio-main">
            <section class="studio-header"><div><p class="eyebrow">Cloud room</p><h1>Responsive room</h1></div><a class="extension-callout" href="#extension"><img alt="" src="/porchcast-mark.svg"><span><strong>Get the browser companion</strong><small>Porch shortcuts + recording-ready alerts</small></span><i>↗</i></a></section>
            <section class="studio-workspace">
              <div class="stage-column">
                <div class="stage-frame">
                  <div class="stage-meta"><span>LIVE ROOM</span><span class="standby"><i></i>STANDBY</span><time>00:00:00</time></div>
                  <section class="cloud-room portrait-room ${screenActive ? "screen-active" : ""}">
                    ${screenActive ? '<div class="shared-screen-tile"><span>GUEST · SCREEN</span></div>' : ""}
                    <div class="participant-grid paired view-stacked participant-count-${participantCount}">${participants}</div>
                  </section>
                  <div class="stage-controls-overlay">
                    <div class="studio-controls">
                      ${Array.from({ length: 10 }, (_, index) => `<button aria-label="Control ${index + 1}">${index + 1}</button>`).join("")}
                      <button class="hangup-control" aria-label="Hang up">×</button>
                    </div>
                    <div class="record-control"><button class="record-button">Record</button></div>
                  </div>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    `;
  }, { participantCount: options.participantCount, participants, screenActive: Boolean(options.screenActive) });
}

async function renderPreflightFixture(page: Page) {
  await page.goto("/");
  await loadCloudFixtureStyles(page);
  await page.evaluate(() => {
    document.body.innerHTML = `
      <div id="root"><div class="app-shell">
        <header class="topbar"><button class="wordmark"><span class="wordmark-mark"><img alt="" src="/porchcast-mark.svg"></span><span>Porchcast</span></button><div class="topbar-actions"><button class="new-room-button">Book a room</button></div></header>
        <main class="studio-main">
          <section class="studio-header"><div><p class="eyebrow">Cloud room</p><h1>Device setup</h1></div></section>
          <section class="studio-workspace"><div class="stage-column"><div class="stage-frame">
            <div class="stage-meta"><span>LIVE ROOM</span><span class="standby"><i></i>STANDBY</span><time>00:00:00</time></div>
            <section class="cloud-preflight devices-pending" aria-label="Camera and microphone setup">
              <div class="preflight-shell">
                <header class="preflight-heading"><div><span class="panel-kicker">READY ROOM</span><h2>Look and sound your best.</h2><p>Choose your devices once.</p></div><div class="preflight-privacy"><span><strong>Private preview</strong><small>Nothing is sent until you join.</small></span></div></header>
                <div class="preflight-grid">
                  <div class="preflight-preview-panel"><div class="preflight-camera"><div class="camera-placeholder"><strong>Your preview will appear here</strong><span>Camera access stays local until you join.</span></div></div><footer class="preflight-preview-footer"><span>Microphone not selected</span><span>Basic video</span></footer></div>
                  <aside class="preflight-controls"><div class="preflight-controls-heading"><span>DEVICE SETUP</span><h3>Start with your camera and microphone</h3><p>Your browser will ask for permission once.</p></div><div class="preflight-actions preflight-actions-pending"><button class="preflight-cancel-button">Cancel</button><button class="prepare-media-button"><span class="preflight-action-copy"><strong>Use camera &amp; microphone</strong><small>One private preview. One room publication.</small></span></button></div></aside>
                </div>
              </div>
            </section>
          </div></div></section>
        </main>
      </div></div>
    `;
  });
}

for (const viewport of [
  { name: "compact phone", width: 320, height: 568 },
  { name: "standard phone", width: 390, height: 844 },
  { name: "large phone", width: 430, height: 932 },
  { name: "portrait tablet", width: 768, height: 1024 },
]) {
  test(`${viewport.name} keeps the landing page and booking sheet in bounds`, async ({ page }) => {
    await prepare(page, viewport.width, viewport.height);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Record a real podcast/i })).toBeVisible();
    await offerPwaInstall(page);
    await expect(page.getByRole("button", { name: /Install app/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectInsideViewport(page, ".topbar");
    await expectInsideViewport(page, ".landing-hero h1");
    await expectInsideViewport(page, ".landing-product");

    await page.getByRole("button", { name: /Book a room/i }).first().click();
    const dialog = page.getByRole("dialog", { name: "Book a Porchcast room" });
    await expect(dialog).toBeVisible();
    await expectInsideViewport(page, ".booking-modal");
    await expectNoHorizontalOverflow(page);
    await expect(page.getByLabel("Episode or room name")).toBeVisible();
    await expect(page.getByLabel("Your display name")).toBeVisible();
    await expect(page.getByRole("button", { name: /guest/i }).first()).toBeVisible();
    await expectMinimumSize(page, ".booking-modal .modal-close", 44, 44);
    await expectMinimumSize(page, ".guest-seat-trigger", 44, 44);
  });
}

test("booking dialog receives focus and returns it to its trigger when dismissed", async ({ page }) => {
  await prepare(page, 390, 844);
  await page.goto("/");

  const bookingTrigger = page.getByRole("button", { name: "Book a room" }).first();
  await bookingTrigger.click();

  const dialog = page.getByRole("dialog", { name: "Book a Porchcast room" });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("Episode or room name")).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(dialog).toHaveCount(0);
  await expect(bookingTrigger).toBeFocused();
});

test("booking dialog contains keyboard focus", async ({ page }) => {
  await prepare(page, 390, 844);
  await page.goto("/");
  await page.getByRole("button", { name: "Book a room" }).first().click();

  const continueButton = page.getByRole("button", { name: /Continue/ });
  for (let presses = 0; presses < 12 && !(await continueButton.evaluate(
    (element) => element === document.activeElement,
  )); presses += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(continueButton).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close room booking" })).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(continueButton).toBeFocused();
});

test("Escape closes the guest-seat list before the booking dialog", async ({ page }) => {
  await prepare(page, 390, 844);
  await page.goto("/");
  await page.getByRole("button", { name: "Book a room" }).first().click();

  const dialog = page.getByRole("dialog", { name: "Book a Porchcast room" });
  const guestSeats = page.getByRole("button", { name: /Guest seats 1 guest/i });
  await guestSeats.click();
  await expect(page.getByRole("listbox", { name: "Guest seats" })).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.getByRole("listbox", { name: "Guest seats" })).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(guestSeats).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("mobile header keeps the home control named and touch sized", async ({ page }) => {
  await prepare(page, 320, 568);
  await page.goto("/");

  const home = page.getByRole("button", { name: "Porchcast home" });
  await expect(home).toBeVisible();
  const box = await home.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test("phone pricing and privacy surfaces remain readable without sideways scrolling", async ({ page }) => {
  await prepare(page, 390, 844);
  for (const path of ["/pricing", "/privacy"]) {
    await page.goto(path);
    await expectNoHorizontalOverflow(page);
    await expectInsideViewport(page, ".marketing-hero h1");
    await expect(page.locator(".marketing-footer")).toBeAttached();
  }
});

test("a thirteen-person portrait room uses readable stacked cards", async ({ page }) => {
  await prepare(page, 390, 844);
  await renderRoomFixture(page, { participantCount: 13 });
  await expectNoHorizontalOverflow(page);
  await expectInsideViewport(page, ".stage-controls-overlay");
  await expectInsideViewport(page, ".extension-callout");

  const gallery = page.locator(".participant-grid");
  const firstTile = gallery.locator(".participant-tile").first();
  await expect(firstTile).toBeVisible();
  await expectMinimumSize(page, ".participant-tile", 300, 240);
  const galleryMetrics = await gallery.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(galleryMetrics.scrollHeight).toBeGreaterThan(galleryMetrics.clientHeight * 2);
  await expectMinimumSize(page, ".studio-controls button", 44, 44);

  const controls = page.locator(".stage-controls-overlay");
  const controlMetrics = await controls.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(controlMetrics.scrollWidth).toBeGreaterThan(controlMetrics.clientWidth);
  await controls.evaluate((element) => element.scrollTo({ left: element.scrollWidth }));
  await expectInsideViewport(page, ".record-control");
});

test("an in-room offline notice never blocks studio controls", async ({ page }) => {
  await prepare(page, 390, 844);
  await renderRoomFixture(page, { participantCount: 2 });
  await page.evaluate(() => {
    const notice = document.createElement("aside");
    notice.className = "pwa-status pwa-status-offline pwa-status-in-room";
    notice.innerHTML = "<span>Offline</span><p>Cloud features are reconnecting.</p>";
    document.querySelector(".app-shell")?.append(notice);
  });

  const notice = page.locator(".pwa-status-in-room");
  await expect(notice).toBeVisible();
  await expect(notice).toHaveCSS("pointer-events", "none");
  await expectInsideViewport(page, ".pwa-status-in-room");

  const noticeBox = await notice.boundingBox();
  const headerBox = await page.locator(".studio-header").boundingBox();
  const controlsBox = await page.locator(".stage-controls-overlay").boundingBox();
  expect(noticeBox).not.toBeNull();
  expect(headerBox).not.toBeNull();
  expect(controlsBox).not.toBeNull();
  expect(noticeBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
  expect(noticeBox!.y + noticeBox!.height).toBeLessThan(controlsBox!.y);
});

test("portrait screen sharing keeps the screen readable and cameras in a swipe rail", async ({ page }) => {
  await prepare(page, 390, 844);
  await renderRoomFixture(page, { participantCount: 4, screenActive: true });
  await expectNoHorizontalOverflow(page);

  const screen = await page.locator(".shared-screen-tile").boundingBox();
  const gallery = await page.locator(".participant-grid").boundingBox();
  expect(screen).not.toBeNull();
  expect(gallery).not.toBeNull();
  expect(screen!.height).toBeGreaterThanOrEqual(180);
  expect(gallery!.y).toBeGreaterThanOrEqual(screen!.y + screen!.height - 1);
  await expectMinimumSize(page, ".participant-tile", 250, 120);

  const galleryMetrics = await page.locator(".participant-grid").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(galleryMetrics.scrollWidth).toBeGreaterThan(galleryMetrics.clientWidth);
});

test("compact-phone device setup stays contained and scrollable", async ({ page }) => {
  await prepare(page, 320, 568);
  await renderPreflightFixture(page);
  await expectNoHorizontalOverflow(page);
  await expectInsideViewport(page, ".cloud-preflight");
  await expectInsideViewport(page, ".preflight-camera");
  await expectMinimumSize(page, ".prepare-media-button", 150, 62);
  await expectMinimumSize(page, ".preflight-cancel-button", 86, 44);

  const preflightMetrics = await page.locator(".cloud-preflight").evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(preflightMetrics.scrollHeight).toBeGreaterThan(preflightMetrics.clientHeight);
});
