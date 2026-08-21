import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react()],
  server: {
    port: 5193,
    strictPort: true,
    proxy: {
      "/healthz": "http://127.0.0.1:8788",
      "/v1": "http://127.0.0.1:8788",
    },
  },
});
