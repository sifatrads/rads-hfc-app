import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "RADS-HFC-APP",
        short_name: "RADS-HFC",
        description: "Fire sprinkler hydraulic calculation — 3D viewer",
        theme_color: "#0b3d91",
        background_color: "#eef2f5",
        display: "standalone",
        icons: [],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,woff2}"] },
    }),
  ],
  // workspace @rads/* packages ship TS source; let esbuild transpile them
  optimizeDeps: { exclude: ["@rads/scene", "@rads/model", "@rads/viewer-3d", "@rads/dxf-import", "@rads/container", "@rads/report", "@rads/labeling", "@rads/nfpa170", "@rads/geometry", "@rads/standards-engine", "@rads/calc-engine"] },
  server: { port: 5173 },
});
