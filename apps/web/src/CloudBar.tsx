/**
 * Compact header control for the cloud features: Google sign-in; "Save to cloud"
 * (backs up the encrypted .rhfc to the user's Google Drive AND writes light
 * metadata to Firestore); "Restore" (lists Drive backups and loads one); and a
 * push-notification opt-in. Renders nothing when Firebase is not configured.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ProjectModel } from "@rads/model";
import { solveProject } from "@rads/solve";
import { firebaseConfigured } from "./firebase";
import { onUser, signIn, signOutUser, getDriveAccessToken, type User } from "./cloud/auth";
import { saveProject, listProjects, getProject, deleteProject, type CloudProjectMeta } from "./cloud/firestore";
import { backupToDrive, listDriveBackups, restoreFromDrive, type DriveBackup } from "./cloud/drive";
import { enableNotifications, messagingSupported } from "./cloud/messaging";

function resultOf(model: ProjectModel): { requiredPressurePsi?: number; systemFlowGpm?: number } {
  try {
    const s = solveProject(model).summary;
    return { requiredPressurePsi: Math.round(s.sourcePressurePsi * 10) / 10, systemFlowGpm: Math.round(s.systemFlowGpm) };
  } catch {
    return {};
  }
}

function asDate(ts: unknown): Date | null {
  return ts && typeof (ts as { toDate?: () => Date }).toDate === "function" ? (ts as { toDate: () => Date }).toDate() : null;
}
function whenStr(ts: unknown): string {
  return asDate(ts)?.toLocaleString() ?? "";
}
function whenMs(ts: unknown): number {
  return asDate(ts)?.getTime() ?? 0;
}

export function CloudBar({ model, onLoadProject }: { model: ProjectModel | null; onLoadProject: (m: ProjectModel) => void }): JSX.Element | null {
  const [user, setUser] = useState<User | null>(null);
  const [canPush, setCanPush] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [backups, setBackups] = useState<DriveBackup[] | null>(null);
  const [projects, setProjects] = useState<CloudProjectMeta[] | null>(null);
  const [auto, setAuto] = useState(true);
  const skipFirst = useRef(true);

  useEffect(() => onUser(setUser), []);
  useEffect(() => void messagingSupported().then(setCanPush), []);

  // Debounced auto-save to Firestore (cross-device, offline-capable). Skips the
  // very first model (the initial load) so we don't auto-create a sample doc.
  useEffect(() => {
    if (!auto || !user || !model) return;
    if (skipFirst.current) { skipFirst.current = false; return; }
    const h = setTimeout(() => {
      setMsg("Auto-saving…");
      saveProject(user.uid, model, resultOf(model)).then(
        () => setMsg("Auto-saved ✓"),
        (e: Error) => setMsg(`Auto-save failed: ${e.message}`),
      );
    }, 2500);
    return () => clearTimeout(h);
  }, [model, user, auto]);

  if (!firebaseConfigured) return null;

  async function saveToCloud(): Promise<void> {
    if (!user || !model) return;
    setBusy(true);
    setMsg("Saving…");
    try {
      let result: { requiredPressurePsi?: number; systemFlowGpm?: number } = {};
      try {
        const s = solveProject(model).summary;
        result = { requiredPressurePsi: Math.round(s.sourcePressurePsi * 10) / 10, systemFlowGpm: Math.round(s.systemFlowGpm) };
      } catch {
        /* geometry-only */
      }
      // Firestore always syncs; Drive backup is best-effort (needs a live token
      // + the Drive API enabled), so it never blocks the Firestore sync.
      let driveFileId: string | undefined;
      let note = "";
      if (getDriveAccessToken()) {
        try {
          driveFileId = await backupToDrive(model);
        } catch (e) {
          note = ` · Drive skipped (${(e as Error).message})`;
        }
      } else {
        note = " · sign in again for Drive backup";
      }
      await saveProject(user.uid, model, { ...(driveFileId ? { driveFileId } : {}), ...result });
      setMsg(`Synced to Firestore${driveFileId ? " + Drive" : ""} ✓${note}`);
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

  async function openProjects(): Promise<void> {
    if (projects) { setProjects(null); return; }
    if (!user) return;
    setBusy(true);
    try {
      const list = await listProjects(user.uid);
      list.sort((a, b) => whenMs(b.updatedAt) - whenMs(a.updatedAt));
      setProjects(list);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadCloud(meta: CloudProjectMeta): Promise<void> {
    if (!user) return;
    setProjects(null);
    setBusy(true);
    setMsg(`Loading ${meta.name}…`);
    try {
      const m = await getProject(user.uid, meta.id);
      if (m) { onLoadProject(m); setMsg(`Loaded ${meta.name} ✓`); }
      else setMsg("That project has no data");
    } catch (e) {
      setMsg(`Load failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeCloud(meta: CloudProjectMeta, ev: { stopPropagation: () => void }): Promise<void> {
    ev.stopPropagation();
    if (!user || !window.confirm(`Delete cloud project "${meta.name}"? This cannot be undone.`)) return;
    try {
      await deleteProject(user.uid, meta.id);
      setProjects((p) => p?.filter((x) => x.id !== meta.id) ?? null);
    } catch (e) {
      setMsg((e as Error).message);
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
          <span style={{ fontSize: 12, color: "#cfd8dc", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={user.email ?? ""}>{user.email ?? "signed in"}</span>
          <label style={autoLabel} title="Auto-save to the cloud as you edit">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto
          </label>
          <button style={btn} disabled={!model || busy} onClick={() => void saveToCloud()} title="Save now to Firestore + Google Drive">Save</button>
          <div style={{ position: "relative" }}>
            <button style={btn} disabled={busy} onClick={() => void openProjects()} title="Your cloud projects (sync across devices)">My projects ▾</button>
            {projects && (
              <div style={dropdown}>
                {projects.length === 0 ? (
                  <div style={{ padding: 8, fontSize: 12, color: "#607d8b" }}>No cloud projects yet</div>
                ) : (
                  projects.map((p) => (
                    <button key={p.id} style={projItem} onClick={() => void loadCloud(p)} title={whenStr(p.updatedAt)}>
                      <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <strong style={{ fontSize: 12.5, color: "#10243e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</strong>
                        <span style={{ marginLeft: "auto" }} />
                        <span onClick={(e) => void removeCloud(p, e)} style={del} title="Delete">✕</span>
                      </span>
                      <span style={{ fontSize: 10.5, color: "#78909c" }}>
                        {p.id}{p.requiredPressurePsi !== undefined ? ` · req ${p.requiredPressurePsi} psi` : ""}{p.systemFlowGpm !== undefined ? ` · ${p.systemFlowGpm} gpm` : ""}{whenStr(p.updatedAt) ? ` · ${whenStr(p.updatedAt)}` : ""}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div style={{ position: "relative" }}>
            <button style={ghost} disabled={busy} onClick={() => void openBackups()} title="Restore a backup from Google Drive">Drive ▾</button>
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
const projItem: CSSProperties = { display: "flex", flexDirection: "column", gap: 2, width: "100%", textAlign: "left", padding: "7px 10px", background: "transparent", border: "none", borderBottom: "1px solid #eceff1", cursor: "pointer" };
const del: CSSProperties = { fontSize: 12, color: "#b0bec5", cursor: "pointer", padding: "0 2px" };
const autoLabel: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11.5, color: "#cfd8dc", cursor: "pointer", userSelect: "none" };
