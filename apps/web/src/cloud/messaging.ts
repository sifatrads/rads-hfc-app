/**
 * Firebase Cloud Messaging (web push). `enableNotifications()` asks permission,
 * registers the background service worker, and returns the device token (which
 * your backend/Console can target). Foreground messages surface via onMessage.
 *
 * Requires: FCM enabled on the project + a Web Push (VAPID) key in
 * `VITE_FIREBASE_VAPID_KEY`. The background service worker is generated at build
 * time into `dist/firebase-messaging-sw.js` (see vite.config.ts).
 */
import { app } from "../firebase";
import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export async function messagingSupported(): Promise<boolean> {
  return Boolean(app) && (await isSupported());
}

/** Request permission + return the FCM registration token. Throws with guidance. */
export async function enableNotifications(): Promise<string> {
  if (!app) throw new Error("Firebase is not configured");
  if (!(await isSupported())) throw new Error("Web push is not supported in this browser");
  if (!vapidKey) throw new Error("Set VITE_FIREBASE_VAPID_KEY (Console → Cloud Messaging → Web configuration)");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted");

  // FCM auto-registers /firebase-messaging-sw.js at its own scope, so it does
  // not clobber the Workbox PWA service worker controlling "/".
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey });

  // foreground messages
  onMessage(messaging, (payload) => {
    const n = payload.notification;
    if (n && Notification.permission === "granted") new Notification(n.title ?? "RADS-HFC-APP", { body: n.body });
  });

  return token;
}
