import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const base = process.env.VITE_BASE_PATH || "/";
const appBase = base.endsWith("/") ? base : `${base}/`;

export default defineConfig({
  base: appBase,
  plugins: [
    react(),
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
        globIgnores: ["pwa-*.png"],
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
