import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "apps/web/dist");
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function pngSize(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature || buffer.length < 24) {
    return null;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function checkManifest() {
  const manifest = JSON.parse(await readFile(resolve(dist, "manifest.webmanifest"), "utf8"));
  check(manifest.name === "Porchcast", "manifest name must be Porchcast");
  check(manifest.short_name === "Porchcast", "manifest short name must be Porchcast");
  check(manifest.display === "standalone", "manifest must use standalone display mode");
  check(typeof manifest.id === "string" && manifest.id.length > 0, "manifest requires an id");
  check(manifest.scope === manifest.start_url, "manifest scope and start URL must share the app base");
  check(manifest.prefer_related_applications === false, "manifest must prefer the web app");

  const expectedIcons = new Map([
    ["pwa-192x192.png", { width: 192, height: 192, purpose: "any" }],
    ["pwa-512x512.png", { width: 512, height: 512, purpose: "any" }],
    ["pwa-maskable-512x512.png", { width: 512, height: 512, purpose: "maskable" }],
  ]);
  for (const [path, expected] of expectedIcons) {
    const icon = manifest.icons?.find((candidate) => candidate.src === path);
    check(Boolean(icon), `manifest is missing ${path}`);
    check(icon?.purpose === expected.purpose, `${path} requires ${expected.purpose} purpose`);
    const size = pngSize(await readFile(resolve(dist, path)));
    check(
      size?.width === expected.width && size?.height === expected.height,
      `${path} must be ${expected.width}x${expected.height}`,
    );
  }

  const appleSize = pngSize(await readFile(resolve(dist, "apple-touch-icon.png")));
  check(appleSize?.width === 180 && appleSize?.height === 180, "Apple touch icon must be 180x180");
}

async function checkServiceWorker() {
  const serviceWorker = await readFile(resolve(dist, "sw.js"), "utf8");
  const precacheUrls = [...serviceWorker.matchAll(/\{url:"([^"]+)"/g)]
    .map((match) => decodeURIComponent(match[1]));
  check(precacheUrls.includes("index.html"), "service worker must precache the app shell");
  check(precacheUrls.some((url) => /^assets\/.*\.js$/.test(url)), "service worker must precache app JavaScript");
  check(new Set(precacheUrls).size === precacheUrls.length, "service worker precache contains duplicate URLs");
  check(precacheUrls.length <= 25, "service worker precache must stay within the 25-entry shell budget");

  const precacheBytes = (await Promise.all(precacheUrls.map(async (url) => (
    await stat(resolve(dist, url))
  ).size))).reduce((total, size) => total + size, 0);
  check(
    precacheBytes <= 800 * 1024,
    `service worker precache must stay within 800 KiB; received ${(precacheBytes / 1024).toFixed(2)} KiB`,
  );
  check(
    precacheUrls.some((url) => /assets\/PublicSite-.*\.js$/.test(url)),
    "service worker must keep the public site available offline",
  );
  check(
    precacheUrls.some((url) => /assets\/DemoStudioView-.*\.js$/.test(url)),
    "service worker must keep the local demo available offline",
  );
  check(
    precacheUrls.some((url) => /assets\/AccountDialog-.*\.js$/.test(url)),
    "service worker must keep the always-visible account surface available offline",
  );
  check(
    !precacheUrls.some((url) => /assets\/CloudStudioView-/.test(url)),
    "service worker must not install the online-only Cloud room chunk",
  );

  const precachedFonts = precacheUrls.filter((url) => /\.woff2?$/.test(url));
  check(precachedFonts.length === 3, "service worker must precache only the three English UI fonts");
  check(
    precachedFonts.every((url) => /-latin-/.test(url) && url.endsWith(".woff2")),
    "service worker fonts must be Latin-only WOFF2 files",
  );
  check(
    precachedFonts.some((url) => /manrope-latin-wght-normal/.test(url)),
    "service worker must keep Manrope available offline",
  );
  for (const weight of [400, 500]) {
    check(
      precachedFonts.some((url) => new RegExp(`ibm-plex-mono-latin-${weight}-normal`).test(url)),
      `service worker must keep IBM Plex Mono ${weight} available offline`,
    );
  }

  const unsafeUrl = precacheUrls.find((url) => (
    /(?:^|\/)(?:v1|internal)(?:\/|$)/.test(url)
    || /(?:^|\/)(?:gateway-healthz|healthz)$/.test(url)
    || /\/(?:whip|whep)(?:\/|$)/.test(url)
    || /\.(?:m4a|mkv|mov|mp4|opus|wav|webm)$/i.test(url)
    || /[?&](?:code|invite|room|state|token)=/i.test(url)
  ));
  check(!unsafeUrl, `service worker must not precache private or media URL: ${unsafeUrl}`);
  check(serviceWorker.includes("NavigationRoute"), "service worker requires offline navigation fallback");
  check(serviceWorker.includes("gateway-healthz|healthz"), "navigation fallback must exclude health routes");
  check(serviceWorker.includes("v1|internal"), "navigation fallback must exclude API routes");
  check(!/(?:CacheFirst|NetworkFirst|StaleWhileRevalidate)/.test(serviceWorker), "runtime caching strategies are forbidden");
}

async function checkLazyRoutes() {
  const assets = await readdir(resolve(dist, "assets"));
  for (const route of [
    "AccountDialog",
    "BookingView",
    "CloudStudioView",
    "DemoStudioView",
    "PublicSite",
  ]) {
    check(
      assets.some((asset) => new RegExp(`^${route}-.*\\.js$`).test(asset)),
      `${route} must remain a lazy JavaScript chunk`,
    );
    check(
      assets.some((asset) => new RegExp(`^${route}-.*\\.css$`).test(asset)),
      `${route} must own a route-specific CSS chunk`,
    );
  }
}

async function checkIndex() {
  const index = await readFile(resolve(dist, "index.html"), "utf8");
  check(index.includes('rel="manifest"'), "built index must link the web manifest");
  check(index.includes('rel="apple-touch-icon"'), "built index must link the Apple touch icon");
}

async function checkRobots() {
  const robots = await readFile(resolve(dist, "robots.txt"), "utf8");
  check(/^User-agent: \*$/m.test(robots), "robots policy must address general crawlers");
  check(/^Allow: \/$/m.test(robots), "robots policy must allow the public site");
  check(!/^Disallow: \/$/m.test(robots), "robots policy must not block the entire site");

  for (const privatePath of ["/v1/", "/internal/", "/healthz", "/gateway-healthz"]) {
    check(
      robots.includes(`Disallow: ${privatePath}`),
      `robots policy must keep ${privatePath} out of search results`,
    );
  }

  for (const privateQuery of ["code", "invite", "room", "state", "token"]) {
    check(
      robots.includes(`Disallow: /*?*${privateQuery}=`),
      `robots policy must keep ${privateQuery} query URLs out of search results`,
    );
  }
}

await Promise.all([
  checkManifest(),
  checkServiceWorker(),
  checkIndex(),
  checkLazyRoutes(),
  checkRobots(),
]);

if (failures.length > 0) {
  process.stderr.write(`PWA boundary check failed:\n${failures.map((item) => `- ${item}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("PWA boundary check passed.\n");
}
