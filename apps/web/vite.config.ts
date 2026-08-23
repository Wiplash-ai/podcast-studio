import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.VITE_BASE_PATH || "/";
const appBase = base.endsWith("/") ? base : `${base}/`;
const pwaBuildId = process.env.VITE_PWA_BUILD_ID?.trim() ?? "";
const testOutDir = process.env.VITE_TEST_OUT_DIR?.trim() ?? "";

if (pwaBuildId && !/^[a-z0-9-]+$/i.test(pwaBuildId)) {
  throw new Error("VITE_PWA_BUILD_ID must contain only letters, numbers, and hyphens.");
}

export default defineConfig({
  base: appBase,
  ...(testOutDir ? { build: { emptyOutDir: false, outDir: testOutDir } } : {}),
  plugins: [
    react(),
    {
      name: "porchcast-pwa-build-marker",
      transformIndexHtml() {
        return pwaBuildId ? [{
          tag: "meta",
          attrs: { content: pwaBuildId, name: "porchcast-build" },
          injectTo: "head",
        }] : [];
      },
    },
    VitePWA({
      manifest: {
        id: appBase,
        name: "Porchcast",
        short_name: "Porchcast",
        description: "A Cloud recording room for remote podcasts.",
        lang: "en",
        start_url: appBase,
        scope: appBase,
        display: "standalone",
        background_color: "#0b090d",
        theme_color: "#2b153d",
        categories: ["music", "photo", "productivity"],
        prefer_related_applications: false,
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      registerType: "prompt",
      workbox: {
        cleanupOutdatedCaches: true,
        // Cloud rooms require a connection, so keep that large route out of the
        // install-time shell. Account UI stays cached because its trigger is
        // always visible and must degrade safely while offline.
        globIgnores: [
          "pwa-*.png",
          "assets/CloudStudioView-*",
        ],
        globPatterns: ["**/*.{css,html,js,png,svg,webp,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        navigateFallback: "index.html",
        navigateFallbackDenylist: [
          /^\/(?:v1|internal)(?:\/|$)/,
          /^\/(?:gateway-healthz|healthz)$/,
          /\/(?:whip|whep)(?:\/|$)/,
          /\.(?:m4a|mkv|mov|mp4|opus|wav|webm)$/i,
        ],
        runtimeCaching: [],
        skipWaiting: false,
        clientsClaim: false,
      },
    }),
  ],
  server: {
    port: 5193,
    strictPort: true,
    proxy: {
      "/healthz": "http://127.0.0.1:8788",
      "/v1": "http://127.0.0.1:8788",
    },
  },
});
