import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Emit the FCM background service worker into dist at build time, injecting the
 * Firebase config from env — so the config is never committed in a source file.
 */
function firebaseMessagingSw(env: Record<string, string>): Plugin {
  return {
    name: "firebase-messaging-sw",
    apply: "build",
    closeBundle() {
      if (!env.VITE_FIREBASE_API_KEY) return;
      const cfg = {
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: env.VITE_FIREBASE_APP_ID,
      };
      const sw =
        `importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");\n` +
        `importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");\n` +
        `firebase.initializeApp(${JSON.stringify(cfg)});\n` +
        `const messaging = firebase.messaging();\n` +
        `messaging.onBackgroundMessage((p) => {\n` +
        `  const n = p.notification || {};\n` +
        `  self.registration.showNotification(n.title || "RADS-HFC-APP", { body: n.body });\n` +
        `});\n`;
      writeFileSync(join("dist", "firebase-messaging-sw.js"), sw);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
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
      firebaseMessagingSw(env),
    ],
    // workspace @rads/* packages ship TS source; let esbuild transpile them
    optimizeDeps: { exclude: ["@rads/scene", "@rads/model", "@rads/viewer-3d", "@rads/dxf-import", "@rads/container", "@rads/report", "@rads/labeling", "@rads/nfpa170", "@rads/geometry", "@rads/standards-engine", "@rads/calc-engine"] },
    server: { port: 5173 },
  };
});
