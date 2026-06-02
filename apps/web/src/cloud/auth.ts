/**
 * Google sign-in (Firebase Auth). Also requests the `drive.file` scope so a
 * later phase can save .rhfc files to the user's own Google Drive (per the plan).
 * All functions no-op gracefully when Firebase is not configured.
 */
import { app } from "../firebase";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged, type User } from "firebase/auth";

export const auth = app ? getAuth(app) : undefined;

const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/drive.file");

export type { User };

export async function signIn(): Promise<User> {
  if (!auth) throw new Error("Firebase is not configured");
  const res = await signInWithPopup(auth, provider);
  return res.user;
}

export async function signOutUser(): Promise<void> {
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
