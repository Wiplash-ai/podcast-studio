import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const extensionRoot = resolve(import.meta.dirname, "..");

async function manifest(browser: "chromium" | "firefox") {
  return JSON.parse(await readFile(resolve(extensionRoot, "dist", browser, "manifest.json"), "utf8")) as Record<string, unknown>;
}

describe("Porchcast extension packages", () => {
  it("ships a toolbar action without a popup or broad permissions", async () => {
    const chromium = await manifest("chromium");
    expect(chromium.manifest_version).toBe(3);
    expect(chromium.permissions).toEqual(["activeTab", "scripting", "storage"]);
    expect(chromium).not.toHaveProperty("host_permissions");
    expect(chromium).not.toHaveProperty("optional_host_permissions");
    expect(chromium.action).not.toHaveProperty("default_popup");
    expect(chromium.content_scripts).toEqual([{
      matches: ["https://labs.wiplash.ai/porchcast/*"],
      js: ["scripts/content.js"],
      run_at: "document_idle",
    }]);
  });

  it("uses explicit Chromium and Firefox background contracts", async () => {
    const chromium = await manifest("chromium");
    const firefox = await manifest("firefox");
    expect(chromium.background).toEqual({ service_worker: "scripts/background.js" });
    expect(firefox.background).toEqual({ scripts: ["scripts/background.js"] });
    expect(firefox.browser_specific_settings).toMatchObject({
      gecko: {
        id: "porchcast@wiplash.ai",
        data_collection_permissions: { required: ["none"], optional: [] },
      },
    });
  });

  it("contains no media capture API or remote executable code", async () => {
    for (const browser of ["chromium", "firefox"] as const) {
      const background = await readFile(resolve(extensionRoot, "dist", browser, "scripts/background.js"), "utf8");
      const content = await readFile(resolve(extensionRoot, "dist", browser, "scripts/content.js"), "utf8");
      const code = `${background}\n${content}`;
      expect(code).not.toMatch(/getUserMedia|desktopCapture|tabCapture|MediaRecorder|eval\(|new Function/);
      expect(code).not.toMatch(/https?:\/\/(?!(?:(?:labs\.)?wiplash\.ai|www\.w3\.org\/2000\/svg))/);
      expect(code).not.toContain("Plans");
    }
  });
});
