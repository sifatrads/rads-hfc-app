/**
 * Firebase initialization — configuration comes from Vite env vars
 * (`VITE_FIREBASE_*`, see apps/web/.env.example), NOT hard-coded, so it is never
 * committed to the source repo.
 *
 * NOTE: the web `apiKey` is a PUBLIC identifier — it is necessarily present in
 * the deployed JS bundle and cannot be a secret. Real protection comes from
 * Firebase Security Rules + (optionally) App Check + restricting the API key to
 * your hosting domains in the Google Cloud console. Keeping it in `.env` only
 * stops it from living in version control.
 */
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

/** True when the Vite env supplied a usable Firebase config. */
export const firebaseConfigured = Boolean(cfg.apiKey && cfg.projectId);

/** The Firebase app, or `undefined` when not configured (cloud features hide). */
export const app: FirebaseApp | undefined = firebaseConfigured ? initializeApp(cfg) : undefined;

if (app) {
  void isSupported()
    .then((ok) => {
      if (ok) getAnalytics(app);
    })
    .catch(() => {
      /* analytics unavailable — ignore */
    });
}
