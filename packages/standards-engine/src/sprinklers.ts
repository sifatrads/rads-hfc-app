/**
 * Sprinkler parts catalog ("parts master"), one SprinklerProfile per listed
 * model keyed by its Sprinkler Identification Number (SIN — the UL/FM code
 * stamped on the deflector, e.g. "TY3251"). A head node references a profile by
 * SIN and DENORMALIZES K/orientation/temp/response at assignment time, so the
 * solver (q=K√P) never needs a live join and signed-off calcs stay reproducible.
 *
 * kImperial is the nominal K in gpm/psi^0.5 (the model's internal unit; the UI
 * converts to metric for display). kMetric is the nominal SI value (L/min/bar^0.5).
 *
 * ⚠ AUDIT before production use — SINs, K-factors, temperature ratings, min
 * operating pressures and listings change by edition/revision. Entries whose SIN
 * is inferred from family conventions carry `audit: true`. ESFR/CMSA minPressurePsi
 * is a storage/ceiling-height-dependent representative anchor, NOT a fixed value.
 */
export type SprinklerOrientation =
  | "pendent" | "upright" | "sidewall" | "concealed-pendent"
  | "recessed-pendent" | "dry-pendent" | "dry-sidewall" | "dry-upright";
export type SprinklerType =
  | "spray" | "esfr" | "cmsa" | "residential" | "dry" | "institutional";
export type SprinklerResponse = "QR" | "SR";

export interface SprinklerProfile {
  /** PRIMARY KEY — stamped UL/FM identifier, unique per listed model+orientation. */
  sin: string;
  manufacturer: string;
  model: string;
  /** Nominal K, imperial (gpm/psi^0.5) — REQUIRED; drives q=K√P. */
  kImperial: number;
  /** Nominal K, metric (L/min/bar^0.5). */
  kMetric: number;
  orientation: SprinklerOrientation;
  type: SprinklerType;
  response: SprinklerResponse;
  /** NPT thread size (in), display only. */
  threadIn?: string;
  /** Available temperature ratings (°F); the node picks ONE (tempRatingF). */
  tempRatingsF: number[];
  /** Listed minimum operating pressure (psi) — governs for ESFR/CMSA/residential. */
  minPressurePsi?: number;
  /** Residential/EC max listed spacing dimension (ft). */
  coverageMaxFt?: number;
  listings?: string[];
  /** True when the SIN/K is inferred from family convention — verify first. */
  audit?: boolean;
  note?: string;
}

export const SPRINKLERS: SprinklerProfile[] = [
  // ── Tyco / Johnson Controls ──
  { sin: "TY1234", manufacturer: "Tyco/JCI", model: "TY-B Upright (K2.8)", kImperial: 2.8, kMetric: 40, orientation: "upright", type: "spray", response: "SR", threadIn: "1/2", tempRatingsF: [135, 155, 175, 200, 286], minPressurePsi: 7, listings: ["UL", "cUL", "FM"], audit: true, note: "Small-orifice TY-B; TFP151/152. SIN varies by orientation/edition." },
  { sin: "TY3151", manufacturer: "Tyco/JCI", model: "TY-B Upright (K5.6)", kImperial: 5.6, kMetric: 80, orientation: "upright", type: "spray", response: "SR", threadIn: "1/2", tempRatingsF: [135, 155, 175, 200, 286, 360], minPressurePsi: 7, listings: ["UL", "cUL", "FM", "LPCB", "VdS"], note: "SR standard-spray, TFP151/152." },
  { sin: "TY3251", manufacturer: "Tyco/JCI", model: "TY-B Pendent (K5.6)", kImperial: 5.6, kMetric: 80, orientation: "pendent", type: "spray", response: "SR", threadIn: "1/2", tempRatingsF: [135, 155, 175, 200, 286, 360], minPressurePsi: 7, listings: ["UL", "cUL", "FM", "LPCB", "VdS"], audit: true, note: "Superseded by TY325 in newer editions — confirm SIN." },
  { sin: "TY4151", manufacturer: "Tyco/JCI", model: "TY-B Upright (K8.0)", kImperial: 8, kMetric: 115, orientation: "upright", type: "spray", response: "SR", threadIn: "3/4", tempRatingsF: [135, 155, 175, 200, 286, 360], minPressurePsi: 7, listings: ["UL", "cUL", "FM", "LPCB", "VdS"] },
  { sin: "TY4251", manufacturer: "Tyco/JCI", model: "TY-B Pendent (K8.0)", kImperial: 8, kMetric: 115, orientation: "pendent", type: "spray", response: "SR", threadIn: "3/4", tempRatingsF: [135, 155, 200, 286, 360], minPressurePsi: 7, listings: ["UL", "cUL", "FM"] },
  { sin: "TY3131", manufacturer: "Tyco/JCI", model: "TY-FRB Upright (K5.6 QR)", kImperial: 5.6, kMetric: 80, orientation: "upright", type: "spray", response: "QR", threadIn: "1/2", tempRatingsF: [135, 155, 175, 200, 286], minPressurePsi: 7, listings: ["UL", "cUL", "FM", "LPCB", "NYC"], note: "QR standard-spray, TFP172, 3mm bulb." },
  { sin: "TY3231", manufacturer: "Tyco/JCI", model: "TY-FRB Pendent (K5.6 QR)", kImperial: 5.6, kMetric: 80, orientation: "pendent", type: "spray", response: "QR", threadIn: "1/2", tempRatingsF: [135, 155, 175, 200, 286], minPressurePsi: 7, listings: ["UL", "cUL", "FM", "LPCB", "NYC"], note: "Recessed via Style 10/20/30 escutcheon, TFP172." },
  { sin: "TY3531", manufacturer: "Tyco/JCI", model: "TY-FRB Concealed Pendent (K5.6 QR)", kImperial: 5.6, kMetric: 80, orientation: "concealed-pendent", type: "spray", response: "QR", threadIn: "1/2", tempRatingsF: [155, 200], minPressurePsi: 7, listings: ["UL", "cUL", "FM"], note: "Cover plate 135/165°F limits temp options." },
  { sin: "TY3331", manufacturer: "Tyco/JCI", model: "TY-FRB Horizontal Sidewall (K5.6 QR)", kImperial: 5.6, kMetric: 80, orientation: "sidewall", type: "spray", response: "QR", threadIn: "1/2", tempRatingsF: [135, 155, 175, 200, 286], minPressurePsi: 7, listings: ["UL", "cUL", "FM", "LPCB", "NYC"], note: "TFP176." },
  { sin: "TY3255", manufacturer: "Tyco/JCI", model: "DS-1 Dry Pendent (K5.6)", kImperial: 5.6, kMetric: 80, orientation: "dry-pendent", type: "dry", response: "SR", threadIn: "1", tempRatingsF: [155, 175, 200, 286, 360], minPressurePsi: 7, listings: ["UL", "cUL", "FM"], note: "Freezer/unheated; TFP500. Barrel length per drop." },
  { sin: "TY7124", manufacturer: "Tyco/JCI", model: "ESFR-1 Pendent (K14)", kImperial: 14, kMetric: 200, orientation: "pendent", type: "esfr", response: "QR", threadIn: "3/4", tempRatingsF: [155, 165, 200, 214], minPressurePsi: 50, listings: ["UL", "cUL", "FM"], audit: true, note: "Nominal K14 (datasheets cite 14.3). Min-P storage-dependent (~50 psi)." },
  { sin: "TY7226", manufacturer: "Tyco/JCI", model: "ESFR-17 Pendent (K16.8)", kImperial: 16.8, kMetric: 240, orientation: "pendent", type: "esfr", response: "QR", threadIn: "3/4", tempRatingsF: [155, 165, 200, 214], minPressurePsi: 35, listings: ["UL", "cUL", "FM"], note: "TFP317. Min-P storage-height dependent (35–52 psi)." },
  { sin: "TY9226", manufacturer: "Tyco/JCI", model: "ESFR-25 Pendent (K25.2)", kImperial: 25.2, kMetric: 360, orientation: "pendent", type: "esfr", response: "QR", threadIn: "1", tempRatingsF: [165, 200, 214, 286], minPressurePsi: 15, listings: ["UL", "cUL", "FM"], note: "TFP312. Low min-P (~15 psi some configs) — verify per arrangement." },
  { sin: "TY5841", manufacturer: "Tyco/JCI", model: "ELO-231 Upright (K11.2 CMSA)", kImperial: 11.2, kMetric: 160, orientation: "upright", type: "cmsa", response: "SR", threadIn: "3/4", tempRatingsF: [165, 212, 286], minPressurePsi: 7, listings: ["UL", "cUL", "FM"], audit: true, note: "Extra-large-orifice/CMSA storage upright — confirm SIN." },
  // ── Viking ──
  { sin: "VK100", manufacturer: "Viking", model: "Micromatic SR Upright (K5.6)", kImperial: 5.6, kMetric: 80, orientation: "upright", type: "spray", response: "SR", threadIn: "1/2", tempRatingsF: [135, 155, 175, 200, 286, 360], minPressurePsi: 7, listings: ["UL", "cUL", "FM", "LPCB", "VdS"], note: "F_052014." },
  { sin: "VK200", manufacturer: "Viking", model: "Micromatic SR Pendent (K5.6)", kImperial: 5.6, kMetric: 80, orientation: "pendent", type: "spray", response: "SR", threadIn: "1/2", tempRatingsF: [135, 155, 175, 200, 286, 360], minPressurePsi: 7, listings: ["UL", "cUL", "FM", "LPCB", "VdS"], audit: true, note: "Confirm pendent SIN." },
  { sin: "VK302", manufacturer: "Viking", model: "Microfast QR Pendent (K5.6)", kImperial: 5.6, kMetric: 80, orientation: "pendent", type: "spray", response: "QR", threadIn: "1/2", tempRatingsF: [135, 155, 175, 200, 286], minPressurePsi: 7, listings: ["UL", "cUL", "FM", "LPCB", "VdS"], note: "F_033314, glass bulb." },
  { sin: "VK300", manufacturer: "Viking", model: "Microfast QR Upright (K5.6)", kImperial: 5.6, kMetric: 80, orientation: "upright", type: "spray", response: "QR", threadIn: "1/2", tempRatingsF: [135, 155, 175, 200, 286], minPressurePsi: 7, listings: ["UL", "cUL", "FM", "LPCB", "VdS"], audit: true },
  { sin: "VK350", manufacturer: "Viking", model: "Microfast QR Upright (K8.0)", kImperial: 8, kMetric: 115, orientation: "upright", type: "spray", response: "QR", threadIn: "3/4", tempRatingsF: [135, 155, 175, 200, 286], minPressurePsi: 7, listings: ["UL", "cUL", "FM", "LPCB", "VdS"] },
  { sin: "VK352", manufacturer: "Viking", model: "Microfast QR Pendent (K8.0)", kImperial: 8, kMetric: 115, orientation: "pendent", type: "spray", response: "QR", threadIn: "3/4", tempRatingsF: [135, 155, 175, 200, 286], minPressurePsi: 7, listings: ["UL", "cUL", "FM", "LPCB", "VdS"], audit: true },
  { sin: "VK630", manufacturer: "Viking", model: "Microfast QR Horizontal Sidewall (K5.6)", kImperial: 5.6, kMetric: 80, orientation: "sidewall", type: "spray", response: "QR", threadIn: "1/2", tempRatingsF: [135, 155, 175, 200, 286], minPressurePsi: 7, listings: ["UL", "cUL", "FM"], audit: true, note: "Verify exact VK sidewall SIN." },
  { sin: "VK540", manufacturer: "Viking", model: "CMSA Upright (K11.2)", kImperial: 11.2, kMetric: 160, orientation: "upright", type: "cmsa", response: "SR", threadIn: "3/4", tempRatingsF: [165, 212, 286], minPressurePsi: 15, listings: ["UL", "cUL", "FM"], note: "F_090595. Min-P per storage table." },
  { sin: "VK510", manufacturer: "Viking", model: "ESFR Pendent (K25.2)", kImperial: 25.2, kMetric: 360, orientation: "pendent", type: "esfr", response: "QR", threadIn: "1", tempRatingsF: [165, 214, 286], minPressurePsi: 15, listings: ["UL", "cUL", "FM"], note: "F_100102. ~40 psi @ 35ft, down to ~15 psi lower configs." },
  { sin: "VK520", manufacturer: "Viking", model: "ESFR Pendent (K14.0)", kImperial: 14, kMetric: 200, orientation: "pendent", type: "esfr", response: "QR", threadIn: "3/4", tempRatingsF: [155, 165, 214], minPressurePsi: 50, listings: ["UL", "cUL", "FM"], note: "F_060298. Min-P ~50 psi (storage-dependent)." },
  { sin: "VK516", manufacturer: "Viking", model: "ESFR Pendent (K16.8)", kImperial: 16.8, kMetric: 240, orientation: "pendent", type: "esfr", response: "QR", threadIn: "3/4", tempRatingsF: [155, 165, 214], minPressurePsi: 35, listings: ["UL", "cUL", "FM"], audit: true, note: "Confirm exact SIN/min-P." },
  { sin: "VK468", manufacturer: "Viking", model: "Freedom Residential Pendent (K4.9)", kImperial: 4.9, kMetric: 71, orientation: "pendent", type: "residential", response: "QR", threadIn: "1/2", tempRatingsF: [155, 175, 200], minPressurePsi: 7, coverageMaxFt: 20, listings: ["UL", "cUL"], note: "Up to 20×20 ft; min flow/P per coverage table." },
  { sin: "VK467", manufacturer: "Viking", model: "Freedom Residential Upright (K4.9)", kImperial: 4.9, kMetric: 71, orientation: "upright", type: "residential", response: "QR", threadIn: "1/2", tempRatingsF: [155, 175, 200], minPressurePsi: 7, coverageMaxFt: 16, listings: ["UL", "cUL"] },
  { sin: "VK150", manufacturer: "Viking", model: "SR Dry Pendent (K5.6)", kImperial: 5.6, kMetric: 80, orientation: "dry-pendent", type: "dry", response: "SR", threadIn: "1", tempRatingsF: [155, 200, 286], minPressurePsi: 7, listings: ["UL", "cUL", "FM"], note: "VK150/154/158 family; barrel length per drop." },
  { sin: "VK456", manufacturer: "Viking", model: "Institutional Pendent (K5.6)", kImperial: 5.6, kMetric: 80, orientation: "pendent", type: "institutional", response: "QR", threadIn: "1/2", tempRatingsF: [155, 175, 200, 286], minPressurePsi: 7, listings: ["UL", "cUL"], audit: true, note: "Tamper/ligature-resistant, F_032319." },
  // ── Reliable ──
  { sin: "RA1414", manufacturer: "Reliable", model: "F1FR56 Pendent (K5.6 QR)", kImperial: 5.6, kMetric: 80, orientation: "pendent", type: "spray", response: "QR", threadIn: "1/2", tempRatingsF: [135, 155, 175, 200, 286], minPressurePsi: 7, listings: ["UL", "cUL", "FM", "LPCB"], note: "Bulletin 074, glass bulb." },
  { sin: "RA1425", manufacturer: "Reliable", model: "F1FR56 Upright (K5.6 QR)", kImperial: 5.6, kMetric: 80, orientation: "upright", type: "spray", response: "QR", threadIn: "1/2", tempRatingsF: [135, 155, 175, 200, 286], minPressurePsi: 7, listings: ["UL", "cUL", "FM", "LPCB"], note: "Bulletin 014/074." },
  { sin: "RA1314", manufacturer: "Reliable", model: "F1-56 Pendent (K5.6 SR)", kImperial: 5.6, kMetric: 80, orientation: "pendent", type: "spray", response: "SR", threadIn: "1/2", tempRatingsF: [135, 155, 175, 200, 286, 360], minPressurePsi: 7, listings: ["UL", "cUL", "FM"], note: "Max WP 250 psi." },
  // ── Victaulic ──
  { sin: "V2708", manufacturer: "Victaulic", model: "FireLock FL-QR Pendent (K5.6)", kImperial: 5.6, kMetric: 80, orientation: "pendent", type: "spray", response: "QR", threadIn: "1/2", tempRatingsF: [135, 155, 175, 200, 286], minPressurePsi: 7, listings: ["UL", "cUL", "FM"], note: "Lit 40.10/41.01." },
  { sin: "V2704", manufacturer: "Victaulic", model: "FireLock FL-QR Upright (K5.6)", kImperial: 5.6, kMetric: 80, orientation: "upright", type: "spray", response: "QR", threadIn: "1/2", tempRatingsF: [135, 155, 175, 200, 286], minPressurePsi: 7, listings: ["UL", "cUL", "FM"] },
  // ── Senju ──
  { sin: "SS2551", manufacturer: "Senju", model: "FR-QR Pendent (K5.6)", kImperial: 5.6, kMetric: 80, orientation: "pendent", type: "spray", response: "QR", threadIn: "1/2", tempRatingsF: [162, 205, 286], minPressurePsi: 7, listings: ["UL", "FM"], note: "Doc U086953; Senju temps (162/205°F) differ from US values." },
  { sin: "SS2552", manufacturer: "Senju", model: "FR-QR Upright (K5.6)", kImperial: 5.6, kMetric: 80, orientation: "upright", type: "spray", response: "QR", threadIn: "1/2", tempRatingsF: [162, 205, 286], minPressurePsi: 7, listings: ["UL", "FM"] },
];

export const DEFAULT_SPRINKLER_SIN = "TY3251";
const BY_SIN = new Map(SPRINKLERS.map((s) => [s.sin, s]));

/** Full catalog (the no-arg accessor; mirrors PIPE_MATERIALS exposure). */
export function catalog(): SprinklerProfile[] {
  return SPRINKLERS;
}

/** Filter the catalog by any subset of fields (k matches kImperial). Undefined/null = ignore. */
export function findSprinklers(
  filter: { k?: number; orientation?: SprinklerOrientation; type?: SprinklerType; manufacturer?: string; response?: SprinklerResponse } = {},
): SprinklerProfile[] {
  return SPRINKLERS.filter((s) =>
    (filter.k == null || s.kImperial === filter.k) &&
    (filter.orientation == null || s.orientation === filter.orientation) &&
    (filter.type == null || s.type === filter.type) &&
    (filter.manufacturer == null || s.manufacturer === filter.manufacturer) &&
    (filter.response == null || s.response === filter.response),
  );
}

/** O(1) SIN lookup; undefined for an unknown/custom SIN. */
export function sprinklerBySin(sin?: string): SprinklerProfile | undefined {
  return sin == null ? undefined : BY_SIN.get(sin);
}
