import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? "/DMTools/" : "/",
  build: {
    rollupOptions: {
      // @microsoft/signalr's dist ships /*#__PURE__*/ comments in a position
      // rolldown can't read; the annotation is ignored harmlessly. Mute the
      // (per-build, multi-line) warning so it doesn't bury real output.
      onwarn(warning, defaultHandler) {
        if (
          warning.code === "INVALID_ANNOTATION" &&
          (warning.message ?? "").includes("@microsoft/signalr")
        ) {
          return;
        }
        defaultHandler(warning);
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    // Dev proxy: forward /api to the DMTool backend so the browser makes
    // same-origin requests (no CORS setup needed). When VITE_API_BASE is
    // empty (the default in .env), the client uses relative URLs that hit
    // this proxy. Set VITE_API_BASE to a full URL to bypass the proxy.
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:3501",
        changeOrigin: true,
        secure: false,
      },
      // SignalR encounter hub. WebSockets don't traverse an HTTP-only proxy,
      // so ws:true is required for the hub's WebSocket transport to reach the
      // backend (it also covers the negotiate/long-polling fallback over HTTP).
      "/hubs": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:3501",
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
});
