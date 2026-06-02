/**
 * Cloud Firestore sync. On save the FULL project is stored (as a plain JSON
 * string field `data`) under users/{uid}/projects/{projectId}, alongside light
 * metadata, with offline persistence — so projects sync across devices.
 *
 * Online storage is access-controlled (Auth + per-user Security Rules), so the
 * cloud copy is NOT encrypted; only locally-saved .rhfc files are encrypted.
 */
import { app } from "../firebase";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import { parseProject, type ProjectModel } from "@rads/model";

/** Firestore with IndexedDB offline cache (multi-tab); ignores undefined fields. */
export const db: Firestore | undefined = app
  ? initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
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
  /** Drive file id of the full plain-JSON backup. */
  driveFileId?: string;
  updatedAt?: unknown;
}

/** Sync the full project (plain JSON) + metadata under the signed-in user. */
export async function saveProject(uid: string, model: ProjectModel, extra: Partial<CloudProjectMeta> = {}): Promise<void> {
  if (!db) throw new Error("Firebase is not configured");
  const meta: CloudProjectMeta = {
    id: model.meta.id,
    name: model.meta.name,
    standardId: model.meta.standardId,
    systemType: model.meta.systemType,
    units: model.meta.units,
    rev: model.meta.rev,
    ...extra,
  };
  await setDoc(doc(db, "users", uid, "projects", model.meta.id), { ...meta, data: JSON.stringify(model), updatedAt: serverTimestamp() }, { merge: true });
}

/** List a user's saved projects (light metadata only; works offline from cache). */
export async function listProjects(uid: string): Promise<CloudProjectMeta[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, "users", uid, "projects"));
  return snap.docs.map((d) => {
    const { data: _full, ...meta } = d.data() as CloudProjectMeta & { data?: string };
    return meta;
  });
}

/** Load the full project from Firestore. */
export async function getProject(uid: string, id: string): Promise<ProjectModel | undefined> {
  if (!db) return undefined;
  const snap = await getDoc(doc(db, "users", uid, "projects", id));
  const data = snap.data()?.["data"];
  return typeof data === "string" ? parseProject(JSON.parse(data)) : undefined;
}
