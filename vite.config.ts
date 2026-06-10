import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? "/DMTools/" : "/",
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
    },
  },
});
