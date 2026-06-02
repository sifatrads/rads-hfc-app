# RADS-HFC-APP — Feature Status / Phase Check

**Audit date:** 2026-06-02 · **Scope:** the Visualization & Reporting pillar
(plus the calc/standards enrichment it required).

## Verification snapshot (all green)

| Check | Result |
|---|---|
| Unit/integration tests (`npm test`) | **90 passed** across **20 files** |
| TypeScript typecheck — every package | **13 / 13 PASS** |
| `apps/web` typecheck + `vite build` | **PASS** (PWA + service worker emitted) |

Legend: ✅ done & verified · ◑ partial / approximation · ⛔ not yet (future).

---

## A. Original user requirements → status

| # | Requirement (as asked) | Status | Where |
|---|---|---|---|
| 1 | 3D, all-sides rotatable, **360° browser viewer** | ✅ | `@rads/viewer-3d`, `apps/web` |
| 2 | Every **pipe number, node number** labelled | ✅ | scene labels + labeling engine |
| 3 | **Pipe dia / size**, **valve + valve size** | ✅ | scene labels; NFPA-170 symbols |
| 4 | All **pressures** (static/residual/total/normal/velocity), **flow**, **pressure drop** | ✅ | solver results → scene/sheets |
| 5 | **Source / reservoir / suction / pump** details | ✅ (pump ✅; reservoir/suction modelled, shown when present) | model schema, scene, pump sheets |
| 6 | **Pump in 3 forms** (datasheet / hydraulic-calc / shop-test) | ✅ | report pump sheets ×3 |
| 7 | **NFPA 170** symbols + **legend** | ✅ | `@rads/nfpa170` (Table 7.2 / 7.6.2) + auto-legend |
| 8 | **All text readable**, auto-placed, **leader arrows** | ✅ | `@rads/labeling` (no-overlap + leaders) |
| 9 | **Print A3 / A2 / A1 / A0**, text readable at any size | ✅ | `@rads/report` drawing sheets (mm-sized text) |
| 10 | **Color-coded by value** + legend (bottom/right by orientation) | ✅ | colorizer + orientation-aware legend |
| 11 | **Plan View & Elevation View** | ✅ | report drawing sheets (plan/front/side) |
| 12 | Get the **AutoCAD design** in, calculate from it | ✅ | `@rads/dxf-import` (verified on real DXF) |
| 13 | Import mapping **selectable — all options** | ✅ | `ImportDialog` (per-layer roles + options + live preview) |
| 14 | Full **report suite** (Summary, Graph, Supply, Node, Pipe, Worksheets, Formulas, C-values, Equivalent lengths, Junction balancing, …) | ✅ | `@rads/report` (15 sheets incl. working plans) |
| 15 | **Hydraulic graph** on N^1.85 paper | ✅ | Graph sheet §27.4.5.3 |
| 16 | **Calculation procedure / formulas used** | ✅ | Formulas & Procedure sheet |
| 17 | **Hazen-Williams C-values table**, **C-multiplier used**, **equivalent lengths used** | ✅ | C-values + Equivalent-lengths sheets; standards tables |
| 18 | **PDF / TXT / CSV** export | ◑ | **PDF** ✅ (vector, browser print). Canute-text exporter prototype exists; CSV/TXT/DXF/glTF are scaffolded/future |

---

## B. Package inventory (what's built & tested)

| Package | Role | Tests |
|---|---|---|
| `@rads/model` | Typed (zod) ProjectModel v2 + migrations + new entities | ✅ |
| `@rads/geometry` | 3D auto-layout + iso/plan/elevation projection | ✅ |
| `@rads/scene` | AnnotatedScene + colorizer + unit formatter | ✅ |
| `@rads/labeling` | No-overlap label placement + leaders + LOD | ✅ |
| `@rads/nfpa170` | NFPA 170-2015 symbol set + renderer + legend | ✅ |
| `@rads/calc-engine` | Hazen-Williams, GGA solver, branch oracle (enriched results) | ✅ |
| `@rads/standards-engine` | NFPA 13 + EN 12845 data + §27.3 tables | ✅ |
| `@rads/solve` | Project→GGA solve (design area, required pressure, supply margin) | ✅ |
| `@rads/report` | Drawing sheets + NFPA §27.4 report sheets (SVG) | ✅ |
| `@rads/viewer-3d` | three.js/R3F interactive viewer | ✅ (pure-logic) |
| `@rads/container` | Encrypted `.rhfc` codec | ✅ (pre-existing) |
| `@rads/design` | Density/area design runner | ✅ (pre-existing) |
| `apps/web` | Vite + React PWA shell (viewer, import UI, reports) | typecheck + build ✅ |

---

## C. Pillar phase status

| Phase | Scope | Status |
|---|---|---|
| P0 | Typed model (zod) + geometry auto-layout | ✅ |
| P1 | Annotated scene + colorizer | ✅ |
| P2 | Calc/standards enrichment (Pv/Pn, loss split, junction residuals, NFPA tables) | ✅ |
| P3 | Label-placement engine | ✅ |
| P4 | Interactive 360° 3D viewer + app shell | ✅ |
| P5 | NFPA 170 exact symbols + legend | ✅ |
| P6 | Drawing sheets + project→solve + full §27.4 report suite + in-app PDF | ✅ |
| P7 | Polish (metric units, 3D billboards, label cap, realistic samples) | ✅ |
| + | DXF import + selectable mapping UI | ✅ |

---

## D. Honest gaps (broader app roadmap — not in this pillar)

These are part of the long-term RADS-HFC-APP vision but **not built yet**:

- ⛔ **Drawing/CAD canvas** (draw a network on a 2D canvas) — today projects come
  from DXF import, sample data, or `.rhfc`/JSON; there is no in-app draw tool.
- ⛔ **Scaled DXF / glTF (SketchUp) / CSV / TXT exporters** — only PDF (and a
  Canute-text prototype) exist; DXF/glTF/CSV are scaffolded.
- ⛔ **Cloud sync** — Firebase Auth/Firestore + Google Drive save are designed
  (see the plan) but not implemented; the app is fully local today.
- ⛔ **Mobile app-store builds** (Capacitor iOS/Android) — the PWA is the
  delivery vehicle now.
- ⛔ **Standalone free viewer app** (`apps/viewer`) — the main app already opens
  `.rhfc` read-friendly; a separate stripped viewer build is future.
- ⛔ **Looped/gridded most-demanding-area peaking**, **auto pipe sizing**, **BOM**.
- ◑ **Design-area selection** is the N-most-remote approximation (not full
  rectangular §27.2.4.2.1); **metric calc** is display-only (engine is imperial).
- ⛔ **EN 12845 / FM / ISO** data completeness (scaffolded, partial).

---

## E. How to re-run this check

```bash
npm test                                   # 90 tests
for d in packages/*/; do npx tsc --noEmit -p "$d/tsconfig.json"; done   # typecheck
cd apps/web && npm run build               # PWA build
```
