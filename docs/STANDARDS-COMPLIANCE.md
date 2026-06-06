# Standards Compliance Dossier — RADS‑HFC‑APP

This document records, per standard, **what the app's design data is grounded against**,
the **specific clause/table**, and the **test that pins it**, so a reviewer (or the
`rads-agentic-ai` compliance auditor) can tell verified values from representative ones.

> **Status legend** — ✅ **Verified**: cross‑checked cell‑by‑cell against the printed
> document and guarded by a test. ⚠️ **Representative**: plausible placeholder, *not*
> from the printed document (no doc available or deferred); flagged `verified: false`
> in [`references.ts`](../packages/standards-engine/src/references.ts) and AUDIT‑noted in code.

## Verification methodology

1. **Ground against the real PDF** — text via `pdftotext -layout`, dense grids via
   `pdftotext -table`. Every grounded value is read from the printed standard, not
   inferred.
2. **Pin with a test** — each grounded value has a unit test asserting the exact
   number, so a future edit (or a wrong transcription) fails at the source. This
   session that discipline caught several values a test had been *pinning wrongly*
   (the fitting tee row, the NFPA 13 density/area figure number).
3. **Cross‑validate externally where possible** — the Hazen‑Williams friction calc is
   checked against **FM DS 2‑89** published tables, an independent standards body, not
   just the NFPA formula it implements.

The machine‑readable hand‑off carries these flags through to the auditor:
[`compliance-export.schema.json`](compliance-export.schema.json) (`references.verified`).

---

## NFPA 13 (2019) — Installation of Sprinkler Systems ✅

The primary design standard (Bangladesh RMG via RSC/BNBC → NFPA 13, Ordinary Hazard Gp II).

| Item | Value / rule | Clause | Pinned by |
|---|---|---|---|
| Friction loss formula | `p = 4.52·Q^1.85 / (C^1.85·d^4.87)` | §27.2.2.1 | `hydraulics.test.ts` (fixed + FM cross‑check) |
| Velocity pressure | `Pv = 0.001123·Q²/d⁴` | §27.2.2.2 | `hydraulics.test.ts` |
| Hazen‑Williams C‑factors | exact table | Table 27.2.4.8.1 | `tables-nfpa13.test.ts` |
| C‑value multiplier | 0.713 / 1.0 / 1.16 / 1.33 / 1.51 | Table 27.2.3.2.1 | `tables-nfpa13.test.ts` |
| Sch‑40 internal diameters (Sch‑10 verified by inspection) | exact | Table A.16.3.2 | `tables-nfpa13.test.ts` |
| Fitting equivalent lengths | **corrected** (tee row was wrong) | Table 27.2.3.1.1 | `tables-nfpa13.test.ts` |
| Density/area | curves, max‑area anchors | §19.3.3.2; Figure 19.3.3.1.1 | `solve.test.ts` |
| Design‑area adjustments | dry +30% · sloped +30% · QR reduction, **compounded** | §19.3.3.2.3–.2.8 | `solve.test.ts` |
| Extended‑coverage | per‑head limit + **5‑sprinkler minimum** area | §19.3.3.2.2.3 | `solve.test.ts`, `coverage-check.test.ts` |
| Remote‑area shape | dimension ≥ 1.2·√A along branch lines | §27.2.4.2.1 | (report nameplate) |
| Hose / duration | 100/250/500 gpm; LH30/OH60/EH90 min | Table 19.3.3.1.2 | `solve.test.ts` |
| Min operating pressure | 7 psi (0.5 bar) | §27.2 | `solve.test.ts` |

## NFPA 14 (2019) — Standpipe and Hose Systems ✅

| Item | Value / rule | Clause | Pinned by |
|---|---|---|---|
| Class I/III flow | 500 gpm most‑remote + 250 gpm each additional | §7.10.1.1.1–.1.1.3 | `solve.test.ts` |
| **Max flow** | **1000 gpm sprinklered / 1250 gpm not** | §7.10.1.1.5 | `solve.test.ts` |
| Min residual pressure | 100 psi (2½″) / 65 psi (1½″); Class II 100 gpm @ 65 psi | §7.8 / §7.10 | `index.test.ts` |

Out of scope: §7.10.1.1.2 (750 gpm horizontal standpipes), §7.10.1.1.3.1 (>80,000 ft²/floor).

## NFPA 20 (2019) — Stationary Fire Pumps ✅

| Item | Value / rule | Clause | Pinned by |
|---|---|---|---|
| Pump curve — 150% flow | head ≥ 65% of rated | §6.2.1 | `solve.test.ts` |
| Pump curve — churn/shutoff | head ≤ 140% of rated | §6.2.2 | `solve.test.ts` |
| Suction‑pipe velocity | ≤ 15 ft/s at 150% rated flow | §4.16 / Table 4.28 | (summary `suctionCheck`) |

## FM Global — Property Loss Prevention Data Sheets ✅ (non‑storage + common storage)

| Item | Value / rule | Source | Pinned by |
|---|---|---|---|
| Non‑storage HC‑1/2/3 density/area | 0.1/1500 · 0.2/2500 · 0.3/2500 | DS 3‑26 Table 2.3.1.10 | `index.test.ts` |
| Non‑storage hose / duration / min P | 250/250/500 gpm · 60 min · 7 psi | DS 3‑26 §2.3.1.11–.13 | `index.test.ts` |
| Storage — solid‑piled/palletized (count @ psi) | Class 1‑4, cartoned‑expanded, uncartoned plastic; K16.8/22.4/25.2 @ 20–40 ft | DS 8‑9 Tables 2–6 | `index.test.ts` |
| Storage — open‑frame rack (min 4 ft aisles) | same commodities; higher demand than solid‑piled | DS 8‑9 Tables 7–10 | `index.test.ts` |
| Storage hose / duration | by ceiling‑head count (≤12→250/60; 13‑19→500/90; 20+→500/120) | DS 8‑9 Table 14 | `index.test.ts` |

Out of scope (use the specific DS 8‑9 table): **in‑rack** sprinklers, **dry/upright**
systems, **extended‑coverage** storage sprinklers, ceilings **> 40 ft**.

## Independent cross‑validation ✅

The core Hazen‑Williams friction calc is checked against **FM DS 2‑89** (Pipe Friction Loss
Tables, Table 2, C=120) — a different standards body — reproducing its published psi/ft to
printed precision (e.g. 500 gpm / 4″ → FM 0.072, app 0.0718). See `hydraulics.test.ts`.

## Professional‑software cross‑validation — Canute FHC ✅ (design basis) / 📋 (full solve)

A real OH2 job — **TED Bernhardtz Textile, Gazipur (15008099)**, 96 pipes, NFPA 13 2019 —
was calculated in **Canute FHC** (a widely‑used commercial fire‑hydraulics package). The
Canute job (DXF + report + decoded input format) lives in `test_data/data from canute/`
(git‑ignored, local). Its design basis matches the app exactly:

| Quantity | Canute (metric) | → imperial | App basis |
|---|---|---|---|
| Hazard / density | OH2, 8.10 mm/min | 0.199 gpm/ft² | OH2 = 0.20 ✓ |
| Design area | 139 m² | 1 496 ft² | 1 500 ✓ |
| Highest head above source | 31.69 m | 104.0 ft | (elevation modeled) |
| **Canute computed source duty** | **1819.7 L/min @ 7.078 bar** | **480.8 gpm @ 102.7 psi** | oracle target |

The DXF‑import test (`dxf-import/import.test.ts`) already confirms the **geometry** matches
Canute's pipe schedule (91 pipes; longest run 40.841 m). A fully automated **solve‑vs‑Canute**
comparison (app source duty ≈ 480.8 gpm @ 102.7 psi) needs the complete hydraulic model
reconstructed from the Canute job — a documented target (📋), not yet an automated test.

---

## Representative / not yet grounded ⚠️

| Standard | Why | When to ground |
|---|---|---|
| NFPA 13D / 13R | residential; no dedicated PDF in the corpus | when the printed 13D/13R is available |
| NFPA 15 / NFPA 750 | water spray / water mist; niche, not a registered design module | if a deluge/mist design path is built |
| EN 12845 | European sprinklers | **user‑deferred — ground last** |
| AS 2118 | Australian sprinklers | **user‑deferred — ground last** |

For each, [`references.ts`](../packages/standards-engine/src/references.ts) carries
`verified: false`; flip it (and cite the real clauses) once grounded against the document —
the Basis‑of‑Design report sheet and the compliance export pick the change up automatically.

## Governing jurisdiction codes

BNBC 2020, RSC (Bangladesh RMG), and IBC 2021 each **adopt NFPA 13** and add occupancy /
coverage requirements. BNBC Table 4.4.7 coverage/spacing (LH 225 / OH 130 / EH 100 ft²) is an
exact match to the app's `coverage-check.ts`. These are primarily the auditor's compliance codes.
