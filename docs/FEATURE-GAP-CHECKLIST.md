# RADS-HFC — Feature Decision Checklist

Derived from *Computational Fire Protection Hydraulics — Master Technical Specifications* (403 features extracted, 8 sections) mapped against the current app.
Status: ✅ already in app · 🟡 partial · ⬜ missing. Tick `- [ ]` items you want included.

## Nodal / Topology

**Already covered:** ✅ Add/insert node (auto-numbered table) · ✅ Static elevation · ✅ K-factor · ✅ K=0 junctions · ✅ Delete node · ✅ Split/divide pipe (3D click + table) · ✅ Split distance from start · ✅ Auto-ID on split · ✅ Property preservation across split · ✅ Add branch (direction+length) · ✅ Connect two nodes · ✅ Renumber 1..N

- [ ] Alphanumeric node IDs (≤4 char, e.g. S1, RN3A) — ID flexibility for plan-matching; replaces forced 1..N
- [x] Hose / Hydrant fixed-flow node flag (gpm on junction/hose-station) ✅ DONE
- [x] Design-area control — auto (most-remote) or LOCK a specific area (AHJ-directed / chosen from the design-area proof); operating heads highlighted on drawings + 3D ✅ DONE
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
- [x] User-defined pipe materials (project-level: label + C-factor + roughness over a base schedule's bore; appears in every Material dropdown + solver) ✅ DONE
- [x] Nominal-vs-Actual ID toggle + manual ID override ✅ DONE
- [x] Auto-fitting allocation (elbow at direction changes, toggle) ✅ DONE
- [x] Manual fittings via alphanumeric codes (2E, 1T, GV/BV/CV) ✅ DONE
- [x] Fitting equivalent-length C-factor adjustment (NFPA 13 §27.2.3.1.1) — C=120 table values scaled to the pipe C (×1.51 copper / ×0.713 dry) in the H-W solve ✅ DONE
- [x] Corrected the fitting equivalent-length table vs NFPA 13 2019 Table 27.2.3.1.1 — fixed transcription errors (tee/cross wrong for 1"–8", long-turn elbow, gate/butterfly/check valves) ✅ DONE
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
- [x] Supply robustness / contingency — re-solve with the fire pump off + a −15% degraded supply; margin - [x] Design-area proof — solve candidate remote areas, rank by required pressure, flag the governing one (Summary tab) ✅ DONE PASS/FAIL per scenario (Summary tab) ✅ DONE
- [x] Basis of Design / Design Philosophy report sheet — narrative + prepared standard clause references (NFPA 13/14, FM DS 3-26 verified; EN/AS/750 representative) + governing-code option (BNBC/RSC/IBC) ✅ DONE
- [x] Design notes / assumptions / exclusions — free-text (one bullet per line) on the Project tab → rendered on the Basis of Design sheet + compliance export ✅ DONE
- [x] Compliance Checklist report sheet — per-requirement PASS/REVIEW (supply, min-pressure, convergence, area, hose, coverage/spacing, grounding) with clause refs + overall verdict ✅ DONE
- [x] Critical Path / Hydraulic Profile report sheet — traces source→most-remote head: per-segment flow/friction/cumulative-length/pressure + a pressure-gradient sparkline ✅ DONE
- [x] Significant-pipes-only filter (Analysis tab: hide pipes carrying < 1 gpm) ✅ DONE
- [x] Loss-slope (psi/ft · bar/m) column — friction gradient in the Analysis pipe table ✅ DONE
- [x] Page-selection for print — choose which report sheets go into the PDF (Report tab) ✅ DONE
- [x] Report Table of Contents (sheet index) — page 2, every sheet + page number, zebra; two-column when long ✅ DONE

## Standards & Codes

**Already covered:** ✅ NFPA 13 (Sch40 ID, C-value, fitting/valve equiv-len, H-W C, equiv-len modifier) · ✅ Hazen-Williams · ✅ Gridded/looped/tree solver · ✅ Design-area = N most-remote · ✅ Pv / Pn=Pt−Pv · ✅ Pump + 150% overload (graph) · ✅ Required-pressure search

- [x] Auto-Peak: derives operating heads from design area + density-driven min pressure ✅ DONE
- [x] 1.2·√A rectangular remote-area shape (NFPA 13 §27.2.4.2.2) — branch-aware Auto-Peak: ceil(1.2√A / spacing) heads per branch across the most-remote branch lines; safe fallback to distance-based when topology unclear ✅ DONE
- [x] Delivered-density verification — density actually delivered at the most-remote head (discharge/coverage) vs design density, explicit on the Compliance Checklist + JSON export ✅ DONE
- [x] NFPA 14 standpipe auto-sizing (residual at most-remote outlet, per-standpipe flow) ✅ DONE
- [x] NFPA 14 §7.10.1.1.5 standpipe max-flow cap — 1000 gpm sprinklered / 1250 gpm not (toggle); rest of §7.10 (500+250, 100/65 psi) confirmed vs the doc ✅ DONE
- [x] NFPA 13D automation (two most-remote heads, no hose allowance) ✅ DONE
- [x] NFPA 13R automation (four most-remote heads) ✅ DONE
- [x] Compliance-path selector (Code picker: NFPA 13/13D/13R/14/EN) ✅ DONE
- [x] NFPA 20 suction-velocity check (≤15 ft/s at 150% flow) ✅ DONE
- [x] NFPA 15 deluge / water-spray (all nozzles flow at design density) ✅ DONE
- [x] Dry-pipe / preaction 30% design-area increase (NFPA 13 §19.2.3.2) — Auto-Peak pulls more heads for dry/preaction; effective area + note on nameplate/checklist/export ✅ DONE
- [x] Quick-response design-area reduction (NFPA 13 §19.2.3.3) — wet LH/OH + QR heads: up to 40% smaller area; opt-in % with a Check-Model warning if conditions are not met ✅ DONE
- [x] Sloped-ceiling +30% area + correct compounding of multiple area adjustments (NFPA 13 §19.3.3.2.4/.2.8) — dry × sloped × QR compounded on the original area ✅ DONE
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
- [~] Sprinkler coverage & spacing check (per-head area + along-branch spacing vs NFPA 13 hazard limits; Summary tab) ✅ DONE — full ceiling-grid/plan layout check is a follow-up
- [x] Protected-area coverage adequacy — installed heads must cover the building/floor footprint (Σ head coverage ≥ protected area); Summary + Compliance Checklist + JSON export ✅ DONE
- [x] Extended-coverage (EC) sprinkler limits — coverageType=extended-coverage raises the coverage/spacing max (≈400 ft²/20 ft, AUDIT vs listing) so EC factory-floor heads are not false-flagged ✅ DONE
- [x] Extended-coverage 5-sprinkler minimum design area (NFPA 13 §19.3.3.2.2.3) — EC Auto-Peak uses ≥5 operating heads even when the area is met with fewer ✅ DONE
- [ ] Vertical-offset / clash checking (elevation) — coordination; medium

## Menus & File Ops

**Already covered:** ✅ Open .dxf (layer→role map) · ✅ Open/Save .rhfc · ✅ Open/Export .json · ✅ Print/Save PDF · ✅ Add/Break/Delete/Edit pipe · ✅ Split at distance · ✅ Pipe↔pump · ✅ Cloud sync / My-projects / auto-save / Drive

- [x] Bulk edit (filter pipes by role → set material/size/role across them) ✅ DONE
- [x] Find node / pipe (filter the tables by id/role/material/note) ✅ DONE
- [x] Fixed / variable pressure source — supply type selector: city flow-test curve vs fixed-pressure (gravity / elevated tank, flat head); fire pump boosts either ✅ DONE
- [x] Merge file (combine two networks into one) ✅ DONE
- [x] Compliance summary export (machine-readable JSON: design basis + demand/supply result + coverage/area/validation checks + cited standard & jurisdiction clauses) for external review (rads-agentic-ai) ✅ DONE
- [x] Cleanup (remove orphan nodes) ✅ DONE
- [x] Draft auto-restore (localStorage) so a reload never loses work ✅ DONE
- [ ] Convert pipe → fixed-loss element (and back) — pairs with fixed pressure-drop
- [ ] Auto-hanger insertion + spacing — niche for hydraulics
- [ ] Keyboard macro / key-code slots — legacy automation; niche

## Settings & Units

**Already covered:** ✅ Imperial/Metric · ✅ NFPA13 tables · ✅ Min sprinkler pressure · ✅ Per-pipe C-factor

- [x] Min operating pressure + low-pressure node flagging ✅ DONE
- [x] Friction-equation selector (Hazen-Williams / Darcy-Weisbach) ✅ DONE
- [x] Configurable max-velocity limit (default 20 ft/s) — threads through Analysis + Sizing flags, the Compliance Checklist (PASS/REVIEW) + JSON export ✅ DONE
- [x] Component pressure-rating check (≥175 psi, configurable) — flags when the required source pressure exceeds the component rating (Compliance Checklist + JSON export) ✅ DONE
- [x] Fluid properties (water / propylene- / ethylene-glycol · temp · concentration → auto viscosity for D-W) ✅ DONE
- [~] Target safety margin — designBasis.targetMarginPsi: supply must clear the demand by ≥ target; PASS/REVIEW on the Compliance Checklist + JSON export + Project field ✅ DONE (the %-below-available variant is a follow-up)
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
