/**
 * Google sign-in (Firebase Auth). Requests the `drive.file` scope so the app can
 * back up .rhfc files to the user's own Google Drive, and captures the Google
 * OAuth access token used for Drive REST calls.
 */
import { app } from "../firebase";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged, type User } from "firebase/auth";

export const auth = app ? getAuth(app) : undefined;

const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/drive.file");

export type { User };

// Google OAuth access token for Drive REST — captured at sign-in, in memory only
// (lost on reload → re-acquired by signing in again).
let driveAccessToken: string | undefined;
export function getDriveAccessToken(): string | undefined {
  return driveAccessToken;
}

export async function signIn(): Promise<User> {
  if (!auth) throw new Error("Firebase is not configured");
  const res = await signInWithPopup(auth, provider);
  driveAccessToken = GoogleAuthProvider.credentialFromResult(res)?.accessToken ?? undefined;
  return res.user;
}

export async function signOutUser(): Promise<void> {
  driveAccessToken = undefined;
  if (auth) await fbSignOut(auth);
}

/** Subscribe to auth state; returns an unsubscribe fn. Calls back null when unconfigured. */
export function onUser(cb: (user: User | null) => void): () => void {
  if (!auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, cb);
}
