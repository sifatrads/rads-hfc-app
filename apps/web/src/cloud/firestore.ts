/**
 * Cloud Firestore — per-user project metadata with offline persistence (per the
 * plan: small docs under users/{uid}/projects/{projectId}, written on save; the
 * full encrypted .rhfc lives in Drive in a later phase). Spark-tier friendly:
 * only light metadata is stored here.
 */
import { app } from "../firebase";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  setDoc,
  getDocs,
  collection,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";

/** Firestore with IndexedDB offline cache (multi-tab) — undefined when unconfigured. */
export const db: Firestore | undefined = app
  ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  : undefined;

export interface CloudProjectMeta {
  id: string;
  name: string;
  standardId?: string;
  systemType?: string;
  units: string;
  rev?: number;
  /** Headline calc result, if solved. */
  requiredPressurePsi?: number;
  systemFlowGpm?: number;
  /** Drive file id of the full encrypted .rhfc backup. */
  driveFileId?: string;
  updatedAt?: unknown;
}

/** Save (merge) a project's metadata under the signed-in user. */
export async function saveProjectMeta(uid: string, meta: CloudProjectMeta): Promise<void> {
  if (!db) throw new Error("Firebase is not configured");
  await setDoc(doc(db, "users", uid, "projects", meta.id), { ...meta, updatedAt: serverTimestamp() }, { merge: true });
}

/** List a user's saved project metadata (works offline from cache). */
export async function listProjects(uid: string): Promise<CloudProjectMeta[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, "users", uid, "projects"));
  return snap.docs.map((d) => d.data() as CloudProjectMeta);
}
