# CLAUDE.md — RADS‑HFC‑APP

> **This file is the source of truth for Claude Code on this project.** It is both the
> working instructions **and** a living plan/progress log. **Keep it updated every turn:**
> when you start something add it under *In progress*, when you finish move it to *Completed
> log* with the commit hash, and keep *Roadmap* current. Prepend new completed entries at the
> top of their list (newest first).

---

## 1. What this is

**RADS‑HFC‑APP** is a fire‑sprinkler **hydraulic calculation** PWA (NFPA 13 / 14 / 20 + FM
Global), built for the **Bangladesh RMG (garment factory)** context. It imports/edits a pipe
network, runs a nodal hydraulic solve, checks compliance, and produces submittal reports + a
3D/isometric view. Deployed to **Firebase Hosting → https://rads-fhc-app.web.app**.

- npm‑workspaces **monorepo**, packages namespaced `@rads/*`.
- Sibling project `../rads-agentic-ai` is a Python RAG **compliance auditor** that reviews the
  designs this app exports. Keep the two aligned — see §6.

## 2. Architecture (packages/ + apps/)

| Package | Role |
|---|---|
| `@rads/model` | Zod schema for the project model (`schema.ts`); `parseProject`. Backward‑compatible (`.passthrough()` + optional fields). |
| `@rads/calc-engine` | Friction‑method‑agnostic **GGA nodal solver** (`gga.ts`); `hydraulics.ts` (Hazen‑Williams, velocity pressure). |
| `@rads/standards-engine` | Pluggable `StandardModule`s + `REGISTRY` (`index.ts`): nfpa13/13d/13r/14/750, fmds (FM), en12845, as2118. NFPA 13 tables (`tables-nfpa13.ts`), FM (`fmglobal.ts`), materials, sprinklers, basis‑of‑design citations (`references.ts`). |
| `@rads/solve` | `solveProject` — orchestrates the solve, design‑area selection, all the NFPA/FM checks, `SolveSummary`. **The heart of the calc.** |
| `@rads/report` | Report sheets (`report-sheets.ts`) via a `Spec` pattern; SVG primitives in `report-theme.ts`. |
| `@rads/dxf-import` | DXF → network geometry import. |
| `@rads/geometry` / `scene` / `viewer-3d` / `container` / `design` / `labeling` / `nfpa170` | Layout, 3D scene, viewer, drawing symbols. |
| `apps/web` | React/Vite PWA. Tabs in `src/tabs/` (Project, Summary, Analysis, Sizing, Graph…); `compliance-export.ts` (the `✓ Compliance` JSON hand‑off). |

The GGA solver computes `hL = resistance · Q · |Q|^(exponent-1)`; Hazen‑Williams is just a link
factory (exponent 1.85). Darcy‑Weisbach / fixed‑drop links would be new factories, **no solver
edits** (deferred — NFPA 13 uses HW).

## 3. Commands (run from repo root)

```bash
npm test                          # vitest run — ALL tests (currently 210 passing, 32 files)
npm run -w @rads/solve build      # build one workspace (tsc)
npm run typecheck                 # == build --workspaces; tsc across all 14 workspaces
npm run -w apps/web build         # tsc --noEmit + vite build (this is what deploy serves)
npx firebase-tools deploy --only hosting --project rads-fhc-app   # deploy
```

**⚠️ Critical gotchas (learned the hard way):**
- **vitest does NOT typecheck.** apps/web builds with esbuild which strips types. **Always run
  `npm run typecheck` before committing** — passing tests ≠ types OK. (The web build is now
  `tsc --noEmit && vite build` so it's gated.)
- A **circular/wrong test can pin a wrong value** — several real bugs this session were hidden
  by tests asserting the wrong number (the fitting tee row; the NFPA 13 density/area figure
  number). When grounding, assert against the **document**, not the existing code/test.
- Grid PDFs: `pdftotext -layout` garbles dense tables — **use `pdftotext -table`** (poppler 4.0).
- In Bash, `cwd` resets between calls — prefix `cd /d/radsbd.com/Git-public/rads-hfc-app &&`.
- `grep -c` returns exit 1 on zero matches → breaks `&&` chains; run it separately.

## 4. Working agreement / conventions

- **Foundation‑first, grounded.** Ground every standards value against the **real PDF** (NFPA
  in `../rads-agentic-ai/data/standards_pdf/NFPA/`, FM in `../../ALL STD Files/FM GLobal/`),
  cite the clause, and **pin it with a test**. Flag representative/placeholder values clearly
  (`verified: false` in `references.ts`, AUDIT comments in code).
- **Each increment = its own commit + deploy** (if runtime changed) + tests green + typecheck
  clean + tick `docs/FEATURE-GAP-CHECKLIST.md`.
- Commit footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Keep the model backward‑compatible (optional fields, `.passthrough()`).
- **Do not** prioritise EN 12845 / AS 2118 — user deferred them to **last**.

## 5. Status

### In progress
- _(nothing active — update this when you start work)_

### Roadmap / not yet done
- **Solve‑vs‑Canute automated test** (📋 documented target). Canute FHC computed **480.8 gpm @
  102.7 psi** for the real TED Bernhardtz OH2 job; design basis already verified to match.
  Needs the full hydraulic model reconstructed from `test_data/data from canute/` (git‑ignored)
  → solve → assert ≈ Canute. See `docs/STANDARDS-COMPLIANCE.md`.
- **FM DS 8‑9 remaining**: in‑rack sprinklers, dry/upright systems, extended‑coverage storage
  heads, ceilings > 40 ft (each needs its specific DS 8‑9 table).
- **NFPA 13D/13R** residential: representative only — no PDF in the corpus; ground when available.
- **NFPA 15 / 750** (water spray / mist): not registered design modules; niche.
- **EN 12845 / AS 2118**: representative — **user‑deferred to last.**
- Deferred engine work (Tier 6): Darcy‑Weisbach + fluid properties, parts catalog, interactive
  report editor, CAD round‑trip. See `.claude/plans/noble-weaving-tide.md` for the full roadmap.

### Completed log (newest first)

**Standards grounding arc (all grounded against the real PDFs + test‑pinned):**
- `96b3528` Record Canute FHC professional‑software validation in the dossier (basis matches; oracle = 480.8 gpm @ 102.7 psi).
- `ed80667` Pin NFPA 13 hose‑allowance handling (hose draws supply down, not piping — §27.2.4.1).
- `dcb8bdd` Ground FM DS 8‑9 **open‑frame rack** storage (Tables 7‑10) — rack demand > solid‑piled (real under‑design gap).
- `955d8c0` **`docs/STANDARDS-COMPLIANCE.md`** dossier — per‑standard grounded value + clause + test evidence.
- `08d7e5f` Cross‑validate Hazen‑Williams vs **FM DS 2‑89** published friction tables (independent body).
- `84eabc3` Correct basis‑of‑design clause citations (NFPA 13 fig 19.3.3.1.1, NFPA 20 §6.2/§4.16) to match grounding.
- `ccdca90` NFPA 20 **§6.2 pump‑curve** check (churn ≤140% rated; head at 150% flow ≥65% rated).
- `9763347` Ground FM DS 8‑9 **solid‑piled** storage to real Tables 2‑6 + Table 14 (was materially wrong, e.g. K25.2@30ft 12@40→9@20).
- `bee9ecb` NFPA 14 **§7.10.1.1.5** standpipe max‑flow cap (1000 gpm sprinklered / 1250 not).
- `86aa5c3` FM audit — DS 3‑26 re‑verified; DS 8‑9 Table 14 hose/duration; CMSA duration 120→90 min.
- `fb3d6de` Publish **`docs/compliance-export.schema.json`** (JSON Schema 2020‑12) + drift‑guard test.
- `31e6c11` Pin Hazen‑Williams to fixed reference values (non‑circular).
- `1a67a54` Verify + lock Sch‑40 ID (Table A.16.3.2) and C‑multiplier (Table 27.2.3.2.1).
- `367cf32` **Correct the fitting equivalent‑length table** vs Table 27.2.3.1.1 (tee row was wrong for 1″‑8″ — affected every calc).
- `b1bff82` Extended‑coverage 5‑sprinkler minimum design area (§19.3.3.2.2.3).
- `9bc56fc` Sloped‑ceiling +30% + **compound** multiple area adjustments (§19.3.3.2.8).
- `55db68a` Extended‑coverage (EC) sprinkler limits in the coverage check.
- `31e75c0` Fix latent type errors + **make the typecheck actually run**.

**Earlier foundation (same session, abridged):** branch‑aware 1.2·√A remote area (§27.2.4.2.1);
delivered‑density verification; component‑rating flag (175 psi); fitting C‑factor + diameter
adjustment (§27.2.3.1.1); auto water‑supply duration (Table 19.3.3.1.2); QR + dry design‑area
adjustments; supply‑robustness analysis; protected‑area coverage check; compliance export
(`rads-hfc-compliance/1`) + the `✓ Compliance` button; Basis‑of‑Design report sheet.

## 6. The `rads-agentic-ai` integration

The app's compliance export (`apps/web/src/compliance-export.ts`, schema
`rads-hfc-compliance/1`, contract in `docs/compliance-export.schema.json`) is the artifact the
auditor ingests. `references.verified` tells the auditor grounded vs representative. RSC/BNBC
mandate **NFPA 13 OH2** for RMG → the app already meets the Bangladesh RMG design basis.

## 7. Key docs
- `docs/STANDARDS-COMPLIANCE.md` — the compliance dossier (what's grounded, clause, test).
- `docs/compliance-export.schema.json` — the auditor hand‑off contract.
- `docs/FEATURE-GAP-CHECKLIST.md` — feature coverage ticks.
- `.claude/plans/noble-weaving-tide.md` — the full tiered roadmap.
