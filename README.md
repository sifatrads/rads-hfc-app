# RADS-HFC-APP

**Offline-first fire sprinkler hydraulic calculation app** — an in-progress, source-available
alternative to Canute FHC / Hydratec HASS / SprinkCAD / AutoSPRINK. Pluggable multi-standard
engine (**NFPA 13 / 13R / 13D, EN 12845, FM Global, ISO**), runs entirely client-side as a PWA,
stores projects as a single **encrypted `.rhfc` file** plus the user's own Google Drive, and
exports scaled **DXF**, **PDF**, **CSV/TXT**, and **glTF** ("SketchUp").

> ⚠️ **Life-safety software.** All results MUST be independently reviewed and **stamped by a
> licensed fire protection engineer** and accepted by the AHJ before any design or construction
> use. Provided "as is", no warranty. See [NOTICE](NOTICE).

## Status — early foundation (calc + container + standards core)

This repo currently contains the **validated, dependency-light core**:

| Package | What it does | Tests |
|---|---|---|
| `packages/calc-engine` | Hazen-Williams friction loss, K-factor discharge, velocity, elevation head; NFPA tip-to-source **branch-line solver** | ✅ |
| `packages/container` | Encrypted single-file **`.rhfc`** codec — AES-256-GCM + DEFLATE via Web Crypto; `app` format-lock + optional passphrase | ✅ |
| `packages/standards-engine` | Pluggable `StandardModule` registry + **NFPA 13** data (C-factors, density/area, hose allowance, K-factors) | ✅ |
| `packages/model` | `ProjectModel` types + `createEmptyProject` (the decoded `.rhfc` contents) | ✅ |

**Next:** Global-Gradient (looped/gridded) solver, worked-example validation suite vs.
published reports + epanet-js cross-check, remaining standards data, the React/Konva 2D CAD UI,
DXF/PDF exporters, Firebase + Google Drive sync, the free viewer, and Capacitor mobile builds.
See the project plan for the full phased roadmap.

## Develop

Requires Node ≥ 20 (uses built-in Web Crypto + CompressionStream).

```bash
npm install
npm test          # vitest — runs all package tests
npm run test:watch
```

Monorepo (npm workspaces): each package under `packages/*` is `@rads/<name>` with its source as
the entry (`src/index.ts`). A React PWA (`apps/web`) and the free read-only viewer (`apps/viewer`)
are added in later phases.

## Honesty notes

- **`.skp` and `.dwg` cannot be written** by open client-side libraries (proprietary). The app
  exports **DXF** (AutoCAD opens it directly, to scale) and **glTF/GLB** (SketchUp imports it).
- **Encryption ≠ DRM.** The `.rhfc` `app` key is format-lock + at-rest protection; because the app
  is source-available, that key is public. Use the optional **passphrase** mode for real privacy.

## License

Dual-licensed (**source-available**, not OSI open source):

- **Non-commercial** — free under [PolyForm Noncommercial 1.0.0](LICENSE), with attribution.
- **Commercial** — **US$10 per project**, see [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).

Attribution: keep [NOTICE](NOTICE) and show "Calculations by RADS-HFC-APP — © Sifat Sarower" in the
app and on exports. © Sifat Sarower.
