/**
 * Compact header control for the cloud features: Google sign-in, save the
 * current project's metadata to Firestore, and opt into push notifications.
 * Renders nothing when Firebase is not configured (`.env` absent).
 */
import { useEffect, useState, type CSSProperties } from "react";
import type { ProjectModel } from "@rads/model";
import { solveProject } from "@rads/solve";
import { firebaseConfigured } from "./firebase";
import { onUser, signIn, signOutUser, type User } from "./cloud/auth";
import { saveProjectMeta } from "./cloud/firestore";
import { enableNotifications, messagingSupported } from "./cloud/messaging";

export function CloudBar({ model }: { model: ProjectModel | null }): JSX.Element | null {
  const [user, setUser] = useState<User | null>(null);
  const [canPush, setCanPush] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => onUser(setUser), []);
  useEffect(() => void messagingSupported().then(setCanPush), []);

  if (!firebaseConfigured) return null;

  async function save(): Promise<void> {
    if (!user || !model) return;
    setMsg("Saving…");
    try {
      let result: { requiredPressurePsi?: number; systemFlowGpm?: number } = {};
      try {
        const s = solveProject(model).summary;
        result = { requiredPressurePsi: Math.round(s.sourcePressurePsi * 10) / 10, systemFlowGpm: Math.round(s.systemFlowGpm) };
      } catch {
        /* geometry-only project */
      }
      await saveProjectMeta(user.uid, { id: model.meta.id, name: model.meta.name, standardId: model.meta.standardId, systemType: model.meta.systemType, units: model.meta.units, rev: model.meta.rev, ...result });
      setMsg("Saved to cloud ✓");
    } catch (e) {
      setMsg(`Save failed: ${(e as Error).message}`);
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
      {user ? (
        <>
          <span style={{ fontSize: 12, color: "#cfd8dc" }} title={user.email ?? ""}>{user.email ?? "signed in"}</span>
          <button style={btn} disabled={!model} onClick={() => void save()}>Save to cloud</button>
          {canPush && <button style={btn} title="Enable push notifications" onClick={() => void notify()}>🔔</button>}
          <button style={ghost} onClick={() => void signOutUser()}>Sign out</button>
        </>
      ) : (
        <button style={btn} onClick={() => void signIn().catch((e: Error) => setMsg(e.message))}>Sign in with Google</button>
      )}
      {msg && <span style={{ fontSize: 11, color: "#9fb6d6", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msg}</span>}
    </div>
  );
}

const wrap: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const btn: CSSProperties = { padding: "4px 10px", background: "#1565c0", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const ghost: CSSProperties = { padding: "4px 10px", background: "transparent", color: "#fff", border: "1px solid #7f93b3", borderRadius: 4, cursor: "pointer", fontSize: 12 };
