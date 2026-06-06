# RADS-HFC — Feature Decision Checklist

Derived from *Computational Fire Protection Hydraulics — Master Technical Specifications* (403 features extracted, 8 sections) mapped against the current app.
Status: ✅ already in app · 🟡 partial · ⬜ missing. Tick `- [ ]` items you want included.

## Nodal / Topology

**Already covered:** ✅ Add/insert node (auto-numbered table) · ✅ Static elevation · ✅ K-factor · ✅ K=0 junctions · ✅ Delete node · ✅ Split/divide pipe (3D click + table) · ✅ Split distance from start · ✅ Auto-ID on split · ✅ Property preservation across split · ✅ Add branch (direction+length) · ✅ Connect two nodes · ✅ Renumber 1..N

- [ ] Alphanumeric node IDs (≤4 char, e.g. S1, RN3A) — ID flexibility for plan-matching; replaces forced 1..N
- [x] Hose / Hydrant fixed-flow node flag (gpm on junction/hose-station) ✅ DONE
- [ ] Remote Area Box + active-flowing-head assignment — auto-mark heads inside a design-area box; core NFPA workflow
- [x] Check-Model validation sweep (hanging ends, cyclic, unreachable, no-source) ✅ DONE
- [x] Zero-diameter / zero-connectivity error check ✅ DONE
- [ ] CAD auto-heal on node delete (Merge Pipes vs Leave Open) — merge adjacent segments + sum length
- [ ] Mid-point insertion auto-divide + auto-Tee on snapped branch — depends on auto-fitting engine
- [ ] Coordinate extraction → auto-elevation from CAD — minor; only with full CAD snap placement
- [x] Parts-Profile linking (default style/orientation/thread/K on new node) ✅ DONE (catalog SIN picker prefills K/orientation/temp/response; project default applied to new heads in table + 3D view)
- [ ] Suppress-leaks on open pipe ends — solver balances open-ended runs; niche (dry test headers)

## Pipe Properties & Segments

**Already covered:** ✅ Pipe ID · ✅ Nominal size · ✅ Internal diameter · ✅ Length · ✅ Elevation change · ✅ Direction code · ✅ C-factor · ✅ Type-Group/role · ✅ Fittings list (type/qty/equiv-len) · ✅ Inline valve + equiv length

- [x] Multi-material pipe DB (Sch10, Copper K/L/M, CPVC, PVC, Ductile, SS) — per-material ID + C lookup ✅ DONE
- [ ] Material database, up to 50 user-defined entries — build atop material DB
- [x] Nominal-vs-Actual ID toggle + manual ID override ✅ DONE
- [x] Auto-fitting allocation (elbow at direction changes, toggle) ✅ DONE
- [x] Manual fittings via alphanumeric codes (2E, 1T, GV/BV/CV) ✅ DONE
- [x] Fixed pressure-drop per segment (psi) — BFP/meter/filter constant loss ✅ DONE
- [x] Added/negative length (off-drawing run, ≥0 floor) ✅ DONE
- [ ] Fittings allocation mode (Pipe-Type-Specific vs physics) — affects equiv-length distribution
- [x] Per-material absolute roughness ε for D-W ✅ DONE
- [ ] Pipe end-preps (Grooved/Threaded/Flanged/Welded) — BOM/submittal only, no hydraulic effect
- [ ] Manufacturer / finish (galv/black/unlined) cataloging — BOM/pricing only

## Reports & Tables

**Already covered:** ✅ Pipe-information table (size/ID/length/flow/velocity/friction/elevation/total loss) · ✅ Node-analysis table (elev/K/total P/normal P/velocity P/discharge) · ✅ Start/end pressure per segment · ✅ Velocity pressure · ✅ Negative elevation head · ✅ Fitting equiv + total hyd length · ✅ §27.4.5.2 summary cards · ✅ Junction balancing · ✅ Formulas/C-value/equiv-length tables · ✅ 3 pump sheets · ✅ A4 PDF + print

- [x] Riser nameplate report (system/design/demand/supply/prepared-by) ✅ DONE
- [x] Heads Summary (per-head K/coverage/elev/pressure/flow) ✅ DONE
- [x] Report of Utilities — BOM (pipe length by material+size, valve/fitting counts) ✅ DONE
- [x] Design-area proof — solve candidate remote areas, rank by required pressure, flag the governing one (Summary tab) ✅ DONE
- [x] Significant-pipes-only filter (Analysis tab: hide pipes carrying < 1 gpm) ✅ DONE
- [x] Loss-slope (psi/ft · bar/m) column — friction gradient in the Analysis pipe table ✅ DONE
- [x] Page-selection for print — choose which report sheets go into the PDF (Report tab) ✅ DONE

## Standards & Codes

**Already covered:** ✅ NFPA 13 (Sch40 ID, C-value, fitting/valve equiv-len, H-W C, equiv-len modifier) · ✅ Hazen-Williams · ✅ Gridded/looped/tree solver · ✅ Design-area = N most-remote · ✅ Pv / Pn=Pt−Pv · ✅ Pump + 150% overload (graph) · ✅ Required-pressure search

- [x] Auto-Peak: derives operating heads from design area + density-driven min pressure ✅ DONE
- [x] NFPA 14 standpipe auto-sizing (residual at most-remote outlet, per-standpipe flow) ✅ DONE
- [x] NFPA 13D automation (two most-remote heads, no hose allowance) ✅ DONE
- [x] NFPA 13R automation (four most-remote heads) ✅ DONE
- [x] Compliance-path selector (Code picker: NFPA 13/13D/13R/14/EN) ✅ DONE
- [x] NFPA 20 suction-velocity check (≤15 ft/s at 150% flow) ✅ DONE
- [x] NFPA 15 deluge / water-spray (all nozzles flow at design density) ✅ DONE
- [x] Darcy-Weisbach method (flow-dependent f, Swamee-Jain, per-material roughness) ✅ DONE
- [x] NFPA 750 water mist (Code + System=water-mist → all-nozzle discharge, high pressure, Darcy-Weisbach + fluid viscosity) ✅ DONE
- [x] EN 12845 (hazard classes, metric densities, C=100, Table 23 equiv-lengths, four-most-unfavourable report, metric data entry) ✅ DONE
- [x] FM Global Data Sheets — non-storage HC-1/2/3 density/area (DS 3-26) + STORAGE count-at-pressure schemes (DS 8-9: ESFR/CMSA K+N@Pmin, scheme picker, FM Storage report sheet) ✅ DONE
- [ ] BS 9251 / EN 16925 residential — UK/EU; large
- [ ] Glazing / exposure-protection sprinkler sizing — niche
- [~] Other intl — AS 2118 (Australia) ✅ DONE (metric density/area module via the EN 12845 pattern); CEA 4001 / UNI 10779 / MS 1910 / CP 52 still pending

## Views & 3D

**Already covered:** ✅ 3D viewer (line pipes) · ✅ Plan/Front/Side/Iso · ✅ Elevation · ✅ Color-by-metric flow diagram + legend · ✅ Direction/flow display · ✅ NFPA-170 symbols + glyphs · ✅ Label layers + auto-place + leaders + zoom LOD · ✅ AutoCAD nav · ✅ 3D click-edit (split/delete/branch/connect/drag) · ✅ Undo/redo · ✅ Supply/demand graph · ✅ Pump-verification chart · ✅ Working-plan iso/plan/elev drawings

- [x] NFPA 13 log-grid graph (Q^1.85 X-axis) — in-app Graph now uses the Q^1.85 scale ✅ DONE
- [x] Interactive sizing editor ✅ DONE (Sizing tab: edit size/material inline → live re-solve → flow/velocity/loss + margin update; velocity-flag, worst-first sort, ⬆⬇ bump; auto-size velocity / auto-size to pass / economize; ↔ 3D pipe-selection sync; metric-aware)
- [ ] 3D object viewer (right-click localized assembly preview) — medium
- [ ] Sprinkler-spacing verification vs ceiling grid (plan) — needs ceiling data; medium
- [ ] Vertical-offset / clash checking (elevation) — coordination; medium

## Menus & File Ops

**Already covered:** ✅ Open .dxf (layer→role map) · ✅ Open/Save .rhfc · ✅ Open/Export .json · ✅ Print/Save PDF · ✅ Add/Break/Delete/Edit pipe · ✅ Split at distance · ✅ Pipe↔pump · ✅ Cloud sync / My-projects / auto-save / Drive

- [x] Bulk edit (filter pipes by role → set material/size/role across them) ✅ DONE
- [x] Find node / pipe (filter the tables by id/role/material/note) ✅ DONE
- [ ] Toggle fixed / variable pressure source node — static supply vs flow-test source
- [x] Merge file (combine two networks into one) ✅ DONE
- [x] Cleanup (remove orphan nodes) ✅ DONE
- [x] Draft auto-restore (localStorage) so a reload never loses work ✅ DONE
- [ ] Convert pipe → fixed-loss element (and back) — pairs with fixed pressure-drop
- [ ] Auto-hanger insertion + spacing — niche for hydraulics
- [ ] Keyboard macro / key-code slots — legacy automation; niche

## Settings & Units

**Already covered:** ✅ Imperial/Metric · ✅ NFPA13 tables · ✅ Min sprinkler pressure · ✅ Per-pipe C-factor

- [x] Min operating pressure + low-pressure node flagging ✅ DONE
- [x] Friction-equation selector (Hazen-Williams / Darcy-Weisbach) ✅ DONE
- [x] Fluid properties (water / propylene- / ethylene-glycol · temp · concentration → auto viscosity for D-W) ✅ DONE
- [ ] Demand-sizing modes (satisfy-min / below-available / %-below-available) — flexible targets
- [ ] Default equivalent-lengths (PDT) editor by type/size — tune fitting tables
- [ ] Precision / tolerance + decimal places — convergence + display control
- [ ] Bar vs kPa metric split (3-way English/Bar/kPa) — finer metric control
- [ ] Dual-unit calc/report (calc in one, report in another) — submittal convenience
- [ ] Sprinkler K viscosity correction — with fluid props

## Project Data & Catalogs

**Already covered:** ✅ Design density · ✅ Design area · ✅ Operating sprinklers · ✅ Sprinkler K · ✅ Min pressure · ✅ Hose allowance · ✅ Flow test static/residual/test-flow · ✅ Fire pump (curve + datasheet upload) · ✅ Reservoir · ✅ Suction

- [x] Hazard classification picker (Light/OH1/OH2/EH1/EH2) ✅ DONE
- [x] System type (Wet/Dry/Preaction/Deluge) + dry steel C derate ✅ DONE
- [x] Administrative fields (project name/no/date) ✅ DONE
- [x] Contact block (client/contractor/designer/company/address) ✅ DONE
- [ ] Sheet layout (drawing numbers / sheet refs / revisions) — submittal metadata
- [ ] Inside/outside hose + hydrant allowance split — finer than single hose allowance
- [x] Min stored-water volume (total demand × supply duration) ✅ DONE
- [x] Parts / sprinkler catalog profiles ✅ DONE (standards-engine/sprinklers.ts: ~38 real SINs across Tyco/Viking/Reliable/Victaulic/Senju; picker prefill, K-mismatch/temp/orientation validation, Sprinkler Schedule report by SIN; AUDIT-flagged)
- [ ] Continuous pressure tank / alt supply source types — medium

---

## Top 10 highest-impact gaps

1. **Multi-material pipe database** (Sch10/Copper/CPVC/PVC/DI/SS) — real jobs need it.
2. **Auto-Peak** (most-demanding 1500 ft² remote-area + area-density) — the defining NFPA 13 automation.
3. **NFPA 14 standpipe auto-sizing** — opens the standpipe market.
4. **Hazard class + system type + riser nameplate report** — AHJ/plan-review essentials, low effort.
5. **Min operating pressure + low-pressure node flagging** — instant pass/fail.
6. **Auto-fitting allocation from direction changes** (+ alphanumeric codes) — removes tedious entry.
7. **Fixed pressure-drop element** (BFP/meter/valve) + convert-pipe-to-fixed-loss.
8. **Heads Summary + Report of Utilities (BOM)** — standard deliverables.
9. **Check Model validation** (disconnected/zero-diameter, block calc) — prevents silently-wrong results.
10. **Nominal-vs-Actual ID toggle + manual ID override** — model already stores ID; just needs the control.

*Honorable mention: Darcy-Weisbach + friction-equation selector (prereq for mist/Europe).*

## Probably out of scope / niche

Full international code suite (EN 12845, BS 9251, EN 16925, CEA 4001, UNI 10779, AS 2118, MS 1910, CP 52) · NFPA 750 water mist + rheology · pipe end-preps/manufacturer/finish cataloging · auto-hanger insertion · keyboard macro recorder / key-code slots · full snaps suite + absolute-coordinate free-drafting · AutoCAD/Revit auto-layering · reverse-video error marking · interactive sizing report editor.
