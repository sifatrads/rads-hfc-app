/**
 * Compact header control for the cloud features: Google sign-in; "Save to cloud"
 * (backs up the encrypted .rhfc to the user's Google Drive AND writes light
 * metadata to Firestore); "Restore" (lists Drive backups and loads one); and a
 * push-notification opt-in. Renders nothing when Firebase is not configured.
 */
import { useEffect, useState, type CSSProperties } from "react";
import type { ProjectModel } from "@rads/model";
import { solveProject } from "@rads/solve";
import { firebaseConfigured } from "./firebase";
import { onUser, signIn, signOutUser, getDriveAccessToken, type User } from "./cloud/auth";
import { saveProjectMeta } from "./cloud/firestore";
import { backupToDrive, listDriveBackups, restoreFromDrive, type DriveBackup } from "./cloud/drive";
import { enableNotifications, messagingSupported } from "./cloud/messaging";

export function CloudBar({ model, onLoadProject }: { model: ProjectModel | null; onLoadProject: (m: ProjectModel) => void }): JSX.Element | null {
  const [user, setUser] = useState<User | null>(null);
  const [canPush, setCanPush] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [backups, setBackups] = useState<DriveBackup[] | null>(null);

  useEffect(() => onUser(setUser), []);
  useEffect(() => void messagingSupported().then(setCanPush), []);

  if (!firebaseConfigured) return null;

  async function saveToCloud(): Promise<void> {
    if (!user || !model) return;
    setBusy(true);
    setMsg("Saving…");
    try {
      if (!getDriveAccessToken()) await signIn(); // refresh Drive token if needed
      const driveFileId = await backupToDrive(model); // full encrypted .rhfc → user's Drive
      let result: { requiredPressurePsi?: number; systemFlowGpm?: number } = {};
      try {
        const s = solveProject(model).summary;
        result = { requiredPressurePsi: Math.round(s.sourcePressurePsi * 10) / 10, systemFlowGpm: Math.round(s.systemFlowGpm) };
      } catch {
        /* geometry-only */
      }
      await saveProjectMeta(user.uid, { id: model.meta.id, name: model.meta.name, standardId: model.meta.standardId, systemType: model.meta.systemType, units: model.meta.units, rev: model.meta.rev, driveFileId, ...result });
      setMsg("Saved to Drive + metadata ✓");
    } catch (e) {
      setMsg(`Save failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function openBackups(): Promise<void> {
    if (backups) {
      setBackups(null);
      return;
    }
    setBusy(true);
    try {
      if (!getDriveAccessToken()) await signIn();
      setBackups(await listDriveBackups());
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function restore(b: DriveBackup): Promise<void> {
    setBackups(null);
    setBusy(true);
    setMsg(`Restoring ${b.name}…`);
    try {
      onLoadProject(await restoreFromDrive(b.id));
      setMsg(`Restored ${b.name} ✓`);
    } catch (e) {
      setMsg(`Restore failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function notify(): Promise<void> {
    try {
      const token = await enableNotifications();
      setMsg(`Notifications on (${token.slice(0, 10)}…)`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div style={wrap}>
      {msg && <span style={msgStyle}>{msg}</span>}
      {user ? (
        <>
          <span style={{ fontSize: 12, color: "#cfd8dc", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={user.email ?? ""}>{user.email ?? "signed in"}</span>
          <button style={btn} disabled={!model || busy} onClick={() => void saveToCloud()} title="Back up to your Google Drive + save metadata">Save to cloud</button>
          <div style={{ position: "relative" }}>
            <button style={btn} disabled={busy} onClick={() => void openBackups()} title="Restore a backup from Drive">Restore ▾</button>
            {backups && (
              <div style={dropdown}>
                {backups.length === 0 ? (
                  <div style={{ padding: 8, fontSize: 12, color: "#607d8b" }}>No backups yet</div>
                ) : (
                  backups.map((b) => (
                    <button key={b.id} style={item} onClick={() => void restore(b)} title={new Date(b.modifiedTime).toLocaleString()}>
                      {b.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {canPush && <button style={btn} title="Enable push notifications" onClick={() => void notify()}>🔔</button>}
          <button style={ghost} onClick={() => void signOutUser()}>Sign out</button>
        </>
      ) : (
        <button style={btn} onClick={() => void signIn().catch((e: Error) => setMsg(e.message))}>Sign in with Google</button>
      )}
    </div>
  );
}

const wrap: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const msgStyle: CSSProperties = { fontSize: 11, color: "#9fb6d6", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const btn: CSSProperties = { padding: "4px 10px", background: "#1565c0", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const ghost: CSSProperties = { padding: "4px 10px", background: "transparent", color: "#fff", border: "1px solid #7f93b3", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const dropdown: CSSProperties = { position: "absolute", top: "calc(100% + 4px)", right: 0, background: "#fff", border: "1px solid #cfd8dc", borderRadius: 4, boxShadow: "0 4px 14px rgba(0,0,0,0.2)", minWidth: 200, maxHeight: 300, overflow: "auto", zIndex: 50 };
const item: CSSProperties = { display: "block", width: "100%", textAlign: "left", padding: "6px 10px", background: "transparent", border: "none", borderBottom: "1px solid #eceff1", cursor: "pointer", fontSize: 12, color: "#10243e" };
