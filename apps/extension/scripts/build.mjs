import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { build } from "esbuild";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const widgetCss = await readFile(resolve(root, "src/widget.css"), "utf8");
const widgetMark = await readFile(resolve(root, "../web/public/porchcast-mark.svg"), "utf8");
const widgetMarkDataUrl = `data:image/svg+xml;base64,${Buffer.from(widgetMark).toString("base64")}`;
const baseManifest = {
  manifest_version: 3,
  name: "Porchcast Companion",
  version: "0.1.0",
  description: "Keep your current Porch and recent Porches close while you work in other tabs.",
  permissions: ["activeTab", "scripting", "storage"],
  action: {
    default_title: "Show Porchcast companion",
    default_icon: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      128: "icons/icon-128.png"
    }
  },
  icons: {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png"
  },
  content_scripts: [{
    matches: ["https://labs.wiplash.ai/porchcast/*"],
    js: ["scripts/content.js"],
    run_at: "document_idle"
  }]
};

const manifests = {
  chromium: {
    ...baseManifest,
    background: { service_worker: "scripts/background.js" }
  },
  firefox: {
    ...baseManifest,
    background: { scripts: ["scripts/background.js"] },
    browser_specific_settings: {
      gecko: {
        id: "porchcast@wiplash.ai",
        strict_min_version: "128.0",
        data_collection_permissions: { required: ["none"], optional: [] }
      }
    }
  }
};

await rm(dist, { recursive: true, force: true });

for (const [browser, manifest] of Object.entries(manifests)) {
  const outdir = resolve(dist, browser);
  await mkdir(resolve(outdir, "scripts"), { recursive: true });
  await mkdir(resolve(outdir, "icons"), { recursive: true });
  await build({
    bundle: true,
    define: {
      __PORCHCAST_MARK_DATA_URL__: JSON.stringify(widgetMarkDataUrl),
      __PORCHCAST_WIDGET_CSS__: JSON.stringify(widgetCss)
    },
    entryPoints: {
      background: resolve(root, "src/background.ts"),
      content: resolve(root, "src/content.ts")
    },
    format: "iife",
    legalComments: "none",
    minify: false,
    outdir: resolve(outdir, "scripts"),
    sourcemap: false,
    target: browser === "firefox" ? "firefox128" : "chrome120"
  });
  await cp(resolve(root, "assets/icons"), resolve(outdir, "icons"), { recursive: true });
  await writeFile(resolve(outdir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}
