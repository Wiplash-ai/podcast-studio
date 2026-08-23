import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, resolve, sep } from "node:path";
import { promisify } from "node:util";

import { expect, test } from "@playwright/test";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "../../../..");
const webRoot = resolve(root, "apps/web");
const viteBin = resolve(root, "node_modules/vite/bin/vite.js");

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

async function buildVersion(directory: string, version: string): Promise<void> {
  await run(process.execPath, [viteBin, "build"], {
    cwd: webRoot,
    env: {
      ...process.env,
      VITE_PWA_BUILD_ID: version,
      VITE_TEST_OUT_DIR: directory,
    },
    maxBuffer: 10 * 1024 * 1024,
  });
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Version server did not open a TCP port.");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  });
}

test("a controlled room defers a real waiting update until reload is safe", async ({ page }) => {
  test.setTimeout(120_000);

  const temporaryRoot = await mkdtemp(resolve(tmpdir(), "porchcast-pwa-update-"));
  const versionOne = resolve(temporaryRoot, "v1");
  const versionTwo = resolve(temporaryRoot, "v2");
  let activeDirectory = versionOne;

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (/^\/(?:v1|internal)(?:\/|$)/.test(url.pathname)) {
        response.writeHead(404, { "Content-Type": "application/json" });
        response.end('{"error":"not-found"}\n');
        return;
      }

      const relativePath = url.pathname === "/"
        ? "index.html"
        : decodeURIComponent(url.pathname.slice(1));
      let file = resolve(activeDirectory, relativePath);
      const directoryBoundary = `${activeDirectory}${sep}`;
      if (file !== activeDirectory && !file.startsWith(directoryBoundary)) {
        response.writeHead(400);
        response.end();
        return;
      }

      try {
        const details = await stat(file);
        if (details.isDirectory()) file = resolve(file, "index.html");
      } catch {
        file = resolve(activeDirectory, "index.html");
      }

      const body = await readFile(file);
      const headers: Record<string, string> = {
        "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream",
      };
      if (url.pathname === "/sw.js") {
        headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
        headers["Service-Worker-Allowed"] = "/";
      } else if (file.endsWith("index.html")) {
        headers["Cache-Control"] = "no-cache";
      }
      response.writeHead(200, headers);
      response.end(body);
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : "Version server failed.");
    }
  });

  try {
    await buildVersion(versionOne, "pwa-update-v1");
    await buildVersion(versionTwo, "pwa-update-v2");
    expect(await readFile(resolve(versionOne, "sw.js"), "utf8"))
      .not.toBe(await readFile(resolve(versionTwo, "sw.js"), "utf8"));

    const origin = await listen(server);
    await page.goto(`${origin}/?demo=ready`);
    await expect(page.locator('meta[name="porchcast-build"]')).toHaveAttribute(
      "content",
      "pwa-update-v1",
    );
    await expect(page.getByRole("heading", { name: "Porchcast demo" })).toBeVisible();

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(
      () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    ).toBe(true);

    activeDirectory = versionTwo;
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error("Porchcast service worker is not registered.");
      await registration.update();
    });
    await expect.poll(
      () => page.evaluate(async () => (
        await navigator.serviceWorker.getRegistration()
      )?.waiting?.state ?? null),
      { timeout: 15_000 },
    ).toBe("installed");

    await expect(page.getByText("Update ready", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Leave demo" }).click();
    await expect(page.getByRole("button", { name: "Back to home" })).toBeVisible();
    await expect(page.getByText("Update ready", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Back to home" }).click();
    await expect(page.getByText("Update ready", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Reload Porchcast" }).click();

    await expect(page.locator('meta[name="porchcast-build"]')).toHaveAttribute(
      "content",
      "pwa-update-v2",
    );
    await expect.poll(
      () => page.evaluate(async () => Boolean((
        await navigator.serviceWorker.getRegistration()
      )?.active && !(await navigator.serviceWorker.getRegistration())?.waiting)),
    ).toBe(true);
  } finally {
    if (server.listening) await close(server);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
