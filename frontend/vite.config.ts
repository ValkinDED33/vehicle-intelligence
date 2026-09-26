import { defineConfig } from "vite";

const API_TARGET = process.env.VITE_PROXY_TARGET ?? "http://localhost:3000";

// Dev: serve the SPA on :5173 and proxy API calls to the NestJS backend so the
// frontend can use same-origin relative URLs in both dev and production
// (in prod the backend serves frontend/dist directly).
export default defineConfig({
  server: {
    host: "0.0.0.0",
    proxy: {
      "/auth": { target: API_TARGET, changeOrigin: true },
      "/garage": { target: API_TARGET, changeOrigin: true },
      "/vehicles": { target: API_TARGET, changeOrigin: true },
      "/health": { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
