/**
 * Google Drive backup store. The full project is encrypted to a single `.rhfc`
 * file (via @rads/container) and uploaded to a "RADS-HFC-APP" folder in the
 * USER'S OWN Drive (drive.file scope → the app only sees files it created).
 * Firestore keeps the light metadata + the returned Drive file id.
 */
import type { ProjectModel } from "@rads/model";
import { parseProject } from "@rads/model";
import { encodeJSON, decodeJSON } from "@rads/container";
import { getDriveAccessToken } from "./auth";

const API = "https://www.googleapis.com";
const FOLDER = "RADS-HFC-APP";

async function driveFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getDriveAccessToken();
  if (!token) throw new Error("Connect Google Drive (sign in) first");
  const res = await fetch(`${API}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) },
  });
  if (res.status === 401) throw new Error("Drive access expired — sign in again");
  if (!res.ok) throw new Error(`Drive error ${res.status}`);
  return res;
}

async function getFolderId(): Promise<string> {
  const q = encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = (await (await driveFetch(`drive/v3/files?q=${q}&fields=files(id)`)).json()).files?.[0];
  if (found) return found.id as string;
  const created = await (
    await driveFetch("drive/v3/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: FOLDER, mimeType: "application/vnd.google-apps.folder" }),
    })
  ).json();
  return created.id as string;
}

export interface DriveBackup {
  id: string;
  name: string;
  modifiedTime: string;
}

export async function listDriveBackups(): Promise<DriveBackup[]> {
  const fid = await getFolderId();
  const q = encodeURIComponent(`'${fid}' in parents and trashed=false`);
  const data = await (await driveFetch(`drive/v3/files?q=${q}&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime)`)).json();
  return (data.files ?? []) as DriveBackup[];
}

/** Encrypt the project to .rhfc and create-or-update it in the Drive folder. Returns the file id. */
export async function backupToDrive(model: ProjectModel): Promise<string> {
  const fid = await getFolderId();
  const fileName = `${model.meta.id}.rhfc`;
  const bytes = await encodeJSON(model);

  const existingQ = encodeURIComponent(`name='${fileName}' and '${fid}' in parents and trashed=false`);
  const existing = (await (await driveFetch(`drive/v3/files?q=${existingQ}&fields=files(id)`)).json()).files?.[0] as { id: string } | undefined;

  const boundary = `rads${Date.now().toString(16)}`;
  const metadata = existing ? { name: fileName } : { name: fileName, parents: [fid], mimeType: "application/octet-stream" };
  // copy into a plain ArrayBuffer-backed view so it is a valid BlobPart (TS 5.7)
  const media = new Uint8Array(bytes);
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
    media,
    `\r\n--${boundary}--`,
  ]);
  const url = existing ? `upload/drive/v3/files/${existing.id}?uploadType=multipart` : `upload/drive/v3/files?uploadType=multipart`;
  const res = await driveFetch(url, { method: existing ? "PATCH" : "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body });
  return (await res.json()).id as string;
}

/** Download a .rhfc backup and decode it back to a ProjectModel. */
export async function restoreFromDrive(fileId: string): Promise<ProjectModel> {
  const res = await driveFetch(`drive/v3/files/${fileId}?alt=media`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return parseProject(await decodeJSON(bytes));
}
