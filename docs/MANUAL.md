# RADS-HFC-APP — User Manual

**Fire sprinkler hydraulic calculation suite** — an offline-first, client-side
Progressive Web App. Draw/import a sprinkler network, view it as a fully
annotated rotatable 3D model, run an NFPA 13 hydraulic calculation, and produce
a complete NFPA §27.4 report — entirely in the browser.

> ⚠️ **Life-safety notice.** RADS-HFC-APP is a *calculation aid*. All results
> must be independently reviewed and **stamped by a licensed fire protection
> engineer** and accepted by the Authority Having Jurisdiction (AHJ) before use
> in design or construction. Provided "as is", without warranty.

---

## 1. Installation & running

**Prerequisites:** Node.js 18+ and npm.

```bash
# from the repository root
npm install            # install all workspace dependencies

# run the app (development)
cd apps/web
npm run dev            # → http://localhost:5173

# production build (static PWA, output in apps/web/dist/)
npm run build
npm run preview        # serve the production build locally

# run the test suite (from the repo root)
npm test
```

The app is a **PWA**: once loaded it works offline, and can be "installed" from
the browser. No server, account, or network connection is required to draw,
calculate, view, or export.

---

## 2. Quick start (5 steps)

1. Open the app — a **built-in sample** sprinkler tree loads automatically and is
   already solved (you'll see flow + required pressure in the header).
2. **Open** your own project: click **Open .dxf / .rhfc / .json** and pick a file.
3. For a DXF, set the **import mapping** in the dialog (or accept the
   auto-guess), then click **Import**.
4. **Explore** in 3D — rotate, recolor by any metric, toggle label layers, snap
   to ISO/Plan/Front/Side views.
5. Click **Reports** → review the sheets → **Print / Save as PDF**.

---

## 3. Opening a project

The **Open** button accepts three formats:

| Format | What it is | Behaviour |
|---|---|---|
| **`.dxf`** | An AutoCAD / Canute drawing | Opens the **import mapping dialog** (see §4) to turn drawing geometry into a calc-ready model. |
| **`.rhfc`** | An encrypted RADS project file | Decrypted and opened directly. |
| **`.json`** | A raw project model | Validated and opened directly. |

On open, the project is **solved automatically** and the header shows system
flow, required source pressure, and a supply-shortfall warning if applicable.

### Exporting a DXF from AutoCAD
Use **Save As → "AutoCAD 2013 DXF (\*.dxf)" (ASCII)** — *not* the Export menu
(it has no DXF; its DXX option carries attributes only). Keep the model 3D if
your pipework is modelled in 3D — RADS reads true (x, y, z) and elevations.

---

## 4. DXF import — the selectable mapping

When you open a `.dxf`, the import dialog analyses every layer and lets you map
the drawing to a hydraulic model. **Every field is editable**; sensible defaults
are pre-filled from the drawing.

**Global options**
- **Source units** — mm / cm / m / in / ft (auto-detected from the drawing extent or `$INSUNITS`).
- **System type** — sprinkler / standpipe.
- **Standard** — nfpa13 / nfpa13r / nfpa13d / en12845.
- **Display units** — imperial / metric.
- **Default K-factor, default C, material** — applied to heads / pipes that lack data.
- **Snap tolerance** — how close two pipe ends must be to share a node.
- **Size source** — read each pipe's size from the nearest size text, or use a constant.

**Per-layer roles** — each layer is shown with its entity counts and sample
text, and a role dropdown: **pipes · heads · valves · node-id · pipe-size ·
length · pressure · coverage · annotation · ignore**.

A **live preview** ("N pipes · N heads · N nodes · N sized" + warnings)
recomputes on every change. Click **Import** when satisfied.

> The importer builds the network from **true 3D geometry** (so elevations and
> routing are exact), reads pipe sizes / node numbers / coverage from positioned
> text, and identifies sprinkler heads from head symbols or coverage labels.

---

## 5. The 3D viewer

The main window is an interactive WebGL model.

**Navigation**
- **Rotate** — left-drag (one-finger drag on touch).
- **Pan** — right-drag (two-finger drag).
- **Zoom** — mouse wheel (pinch on touch).
- **Camera presets** — **ISO / Plan / Front / Side** buttons.

**Toolbar (top-left)**
- **Color by** — recolor pipes/nodes by **size · role · material · velocity ·
  flow · pressure · pressure-drop**. A live legend (bottom-left) shows the scale;
  metrics needing calc results are labelled accordingly.
- **Labels** — toggle each annotation layer independently: node #, pipe #, size,
  valve, elevation, K-factor, flow, velocity, total pressure, source, pump.
  Labels are placed to avoid overlap and draw leader lines when displaced.

**What you see**
- Pipes as 3D cylinders sized by bore and colored by the active metric.
- Sprinkler heads (red) and junction nodes.
- **NFPA 170 device symbols** (valves, FDC, pump, etc.) as upright billboards.
- The header status bar: system flow · required source pressure · supply warning.

---

## 6. The hydraulic calculation

RADS solves the **whole network** and reports the standard design result.

**Method (NFPA 13 density/area):**
1. Select the **design area** — the *N* most hydraulically remote sprinklers
   (*N* from the design basis "operating sprinklers", else all heads).
2. Build a nodal network: pipes use the **Hazen-Williams** friction formula
   (with fitting + valve equivalent lengths); design-area sprinklers are
   **emitters** (Q = K·√P); the source is a fixed-grade supply.
3. Solve with the **Global Gradient Algorithm** (the EPANET nodal method).
4. Find the **required source pressure** such that the most-remote head sits at
   its **minimum design pressure** — the standard "required pressure" output.
5. Compare to the **water supply** (city flow test ± fire pump curve) to get the
   **margin** (available − required) → pass/fail.

**Reported per element:** node total/normal/velocity pressure and discharge;
pipe flow, velocity, friction loss and elevation loss; junction balance.

> The calc engine is US-customary internally; metric projects are displayed in
> metric (bar / L·min⁻¹ / m / mm) with values converted for display.

---

## 7. Reports & PDF export

Click **Reports** to open the report panel. It solves the current project and
renders a complete, paginated sheet set as vector graphics:

**Working plans** (annotated drawings)
- **Isometric**, **Plan View**, **Elevation** — the network with pipe numbers,
  node numbers, sizes, NFPA 170 valve/device symbols, a color legend and a title
  block.

**NFPA 13 §27.4 hydraulic report**
- **Summary Sheet** (§27.4.5.2) — design basis, demand, required/available
  pressure, supply margin, pass/fail.
- **Graph Sheet** (§27.4.5.3) — supply curve + demand point on N^1.85 paper.
- **Water Supply Analysis** (§27.4.5.4).
- **Node Analysis** (§27.4.5.5) — pressures + discharge per node.
- **Detailed Worksheet / Pipe Information** (§27.4.5.6) — flow, velocity,
  friction and elevation loss per pipe.
- **Hydraulic Junction Points** — balance residuals (§27.2.2.4.1).
- **Formulas & Procedure**, **Hazen-Williams C-Values** (Table 27.2.4.8.1),
  **Equivalent Lengths & C-Multiplier** (§27.2.3).
- **Fire Pump** — datasheet, hydraulic calculation, and shop-test sheets.

**Save as PDF:** click **Print / Save as PDF**. A print window opens with one
page per sheet; choose **"Save as PDF"** (or a physical printer) in the dialog.
Output is **vector** — text stays crisp at any paper size. Every sheet carries
the attribution and life-safety disclaimer.

> The drawing sheets also render at **A3 / A2 / A1 / A0** via the report engine
> (`renderDrawingSheetSvg`, paper option) for large-format plotting; text is
> sized in millimetres so it stays readable at any paper size.

---

## 8. Units & standards

- **Units** follow the project (imperial for NFPA, metric for EN) and are shown
  per project; labels and sheets convert automatically for display.
- **Standards:** NFPA 13 (full data set: hazard classes, density/area, C-values,
  equivalent lengths, C-multiplier). EN 12845 is included (metric, flat C=100);
  NFPA 13R/13D/FM/ISO are scaffolded for future data.

---

## 9. Project file format (`.rhfc`)

Projects save as a single **encrypted** file (AES-256-GCM, deflate-compressed):
- **App-key mode (default):** any RADS build (and the free viewer) opens it with
  no prompt — a format lock + data-at-rest protection (not strong DRM, since the
  app is source-available).
- **Passphrase mode:** PBKDF2-derived key for true confidentiality.

Exported DXF / PDF / CSV remain plain and standard so they open anywhere.

---

## 10. Limitations & honest notes

- **Engineer review is mandatory** — see the life-safety notice above.
- **Design-area selection** uses the *N most-remote* sprinklers by path length —
  a practical approximation, not the full rectangular-area rule of §27.2.4.2.1.
- **Input quality matters** — a DXF imports only as well as it is drawn (clean
  connected centerlines, consistent layers/text). The import mapping is editable
  to compensate.
- **Metric** is a *display* conversion today; a metric-native (EN 12845) calc
  path is future work.
- **DWG/SKP cannot be written** client-side (proprietary). Use DXF (AutoCAD-
  openable) and glTF/COLLADA (SketchUp) as the equivalents.

---

## 11. Licensing

Source-available, **dual-licensed**:
- **Non-commercial:** free under **PolyForm Noncommercial 1.0.0**, with required
  attribution to **Sifat Sarower**.
- **Commercial:** **US$10 per project** under `COMMERCIAL-LICENSE.md`.

See `LICENSE`, `COMMERCIAL-LICENSE.md`, and `NOTICE` in the repository root.

---

## 12. Controls quick reference

| Action | Control |
|---|---|
| Rotate | Left-drag / one-finger drag |
| Pan | Right-drag / two-finger drag |
| Zoom | Wheel / pinch |
| Preset views | ISO · Plan · Front · Side buttons |
| Recolor | "Color by" dropdown |
| Toggle a label layer | "Labels" checkboxes |
| Open a file | "Open .dxf / .rhfc / .json" |
| Generate report | "Reports" → "Print / Save as PDF" |
