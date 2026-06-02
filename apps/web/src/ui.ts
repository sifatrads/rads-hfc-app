/** Shared UI tokens for the app tabs — one palette + reusable style objects so
 * Project / Summary / Analysis / Graph / Report look like one product. */
import type { CSSProperties } from "react";

export const FONT = "'Segoe UI', system-ui, Helvetica, Arial, sans-serif";

export const C = {
  primary: "#0b3d91",
  accent: "#2563b8",
  ink: "#16243a",
  muted: "#64748b",
  line: "#d7dee6",
  band: "#eef3f8",
  zebra: "#f6f9fd",
  good: "#15803d",
  warn: "#c2410c",
  bad: "#b91c1c",
  page: "#eef2f6",
};

export const card: CSSProperties = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, boxShadow: "0 1px 3px rgba(15,30,60,0.06)" };
export const cardPad: CSSProperties = { ...card, padding: 16 };

export const sectionTitle: CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: 0.7, color: C.muted, textTransform: "uppercase", margin: "0 0 10px" };

export const field: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
export const fieldLabel: CSSProperties = { fontSize: 11, color: C.muted, fontWeight: 600 };
export const input: CSSProperties = { fontSize: 13, padding: "6px 9px", border: `1px solid ${C.line}`, borderRadius: 7, background: "#fff", color: C.ink, fontFamily: FONT, width: "100%", boxSizing: "border-box" };
export const select: CSSProperties = { ...input, cursor: "pointer" };

export const btn: CSSProperties = { fontSize: 12.5, fontWeight: 600, padding: "6px 13px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: FONT };
export const btnPrimary: CSSProperties = { ...btn, background: C.primary, color: "#fff" };
export const btnGreen: CSSProperties = { ...btn, background: C.good, color: "#fff" };
export const btnGhost: CSSProperties = { ...btn, background: "#fff", color: C.ink, border: `1px solid ${C.line}` };
export const btnDanger: CSSProperties = { ...btn, background: "#fff", color: C.bad, border: `1px solid ${C.line}`, padding: "3px 8px" };

export const th: CSSProperties = { fontSize: 10.5, fontWeight: 700, color: "#fff", background: C.primary, padding: "7px 8px", textAlign: "left", letterSpacing: 0.3, position: "sticky", top: 0, whiteSpace: "nowrap" };
export const td: CSSProperties = { fontSize: 12.5, padding: "4px 6px", color: C.ink, borderBottom: `1px solid ${C.line}` };
export const tdNum: CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

/** Tone → color for pass/warn/fail values. */
export function toneColor(tone?: "good" | "warn" | "bad"): string {
  return tone === "good" ? C.good : tone === "warn" ? C.warn : tone === "bad" ? C.bad : C.ink;
}
