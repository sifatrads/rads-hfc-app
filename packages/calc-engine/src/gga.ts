/**
 * Global Gradient Algorithm (Todini & Pilati / EPANET) nodal hydraulic solver.
 *
 * Works in TOTAL HEAD (psi) where  H = gauge_pressure_psi + 0.433·elevation_ft,
 * so a link's head loss is pure friction:  H_from − H_to = hL(Q).
 *
 * Every element is a link with  hL = r · Q · |Q|^(n−1):
 *   - pipe:    n = 1.85, r = Hazen-Williams resistance
 *   - emitter: n = 2,    r = 1/K²  (a sprinkler/orifice → discharges to a fixed
 *              sink node at gauge 0, so H_node − H_sink = (Q/K)² = pressure, i.e.
 *              Q = K·√P is solved, not assumed).
 *
 * Per iteration: linearize each link, solve the symmetric-positive-definite
 * nodal system A·H = F for new heads, then update each link's flow. Iterate to
 * Σ|ΔQ| / Σ|Q| < tolerance. The exact branch-line solver is the validation oracle.
 */
import { solveLinear } from "./linalg";

export const HW_EXPONENT = 1.85;

export interface GgaNode {
  id: string;
  /** Fixed-grade node (source / tank / emitter sink). */
  fixed?: boolean;
  /** Total head (psi). Required when `fixed`. */
  headPsi?: number;
  /** Elevation (ft), used to report gauge pressure at junctions. Default 0. */
  elevationFt?: number;
  /** Fixed demand drawn at this node (gpm). Default 0. */
  demandGpm?: number;
}

export interface GgaLink {
  id: string;
  from: string;
  to: string;
  /** Resistance r in hL = r·Q·|Q|^(n−1). */
  resistance: number;
  /** Exponent n (1.85 pipe, 2 emitter). */
  exponent: number;
  internalDiameterIn?: number;
}

export interface GgaNetwork {
  nodes: GgaNode[];
  links: GgaLink[];
}

export interface GgaNodeResult {
  id: string;
  headPsi: number;
  pressurePsi: number;
}

export interface GgaLinkResult {
  id: string;
  flowGpm: number;
  headlossPsi: number;
  velocityFps?: number;
}

export interface GgaResult {
  converged: boolean;
  iterations: number;
  nodes: Record<string, GgaNodeResult>;
  links: Record<string, GgaLinkResult>;
}

export interface GgaOptions {
  maxIterations?: number;
  tolerance?: number;
  initialFlowGpm?: number;
}

/** Floor on |Q| when forming the gradient, to keep the matrix conditioned near zero flow. */
const Q_FLOOR = 1e-4;

/** Hazen-Williams resistance r for hL(psi) = r·Q^1.85 (Q in gpm). */
export function hwResistance(cFactor: number, internalDiameterIn: number, totalLengthFt: number): number {
  return (4.52 * totalLengthFt) / (100 * Math.pow(cFactor, HW_EXPONENT) * Math.pow(internalDiameterIn, 4.87));
}

export interface HwPipeParams {
  cFactor: number;
  internalDiameterIn: number;
  lengthFt: number;
  equivalentLengthFt?: number;
}

/** Build a Hazen-Williams pipe link. */
export function hwPipeLink(id: string, from: string, to: string, params: HwPipeParams): GgaLink {
  const totalLength = params.lengthFt + (params.equivalentLengthFt ?? 0);
  return {
    id,
    from,
    to,
    resistance: hwResistance(params.cFactor, params.internalDiameterIn, totalLength),
    exponent: HW_EXPONENT,
    internalDiameterIn: params.internalDiameterIn,
  };
}

/** Build a sprinkler/orifice emitter link (`to` should be a fixed sink at gauge 0). */
export function emitterLink(id: string, from: string, to: string, kFactor: number): GgaLink {
  return { id, from, to, resistance: 1 / (kFactor * kFactor), exponent: 2 };
}

export function solveGga(network: GgaNetwork, opts: GgaOptions = {}): GgaResult {
  const maxIter = opts.maxIterations ?? 100;
  const tol = opts.tolerance ?? 1e-6;
  const q0 = opts.initialFlowGpm ?? 10;

  const junctions = network.nodes.filter((n) => !n.fixed);
  const J = junctions.length;
  const idx = new Map<string, number>();
  junctions.forEach((n, i) => idx.set(n.id, i));

  const nodeById = new Map<string, GgaNode>();
  for (const n of network.nodes) nodeById.set(n.id, n);
  const headOf = (id: string): number => {
    const node = nodeById.get(id);
    if (!node) throw new Error(`Link references unknown node '${id}'.`);
    return node.headPsi ?? 0;
  };

  const Q = network.links.map(() => q0);
  let H: number[] = new Array<number>(J).fill(0);
  let converged = false;
  let iterations = 0;

  for (let it = 0; it < maxIter; it++) {
    iterations = it + 1;

    const A: number[][] = Array.from({ length: J }, () => new Array<number>(J).fill(0));
    const F = new Array<number>(J).fill(0);
    junctions.forEach((n, i) => {
      F[i] = -(n.demandGpm ?? 0);
    });

    network.links.forEach((link, p) => {
      const q = Q[p]!;
      const aq = Math.max(Math.abs(q), Q_FLOOR);
      const n = link.exponent;
      const grad = n * link.resistance * Math.pow(aq, n - 1); // dhL/dQ > 0
      const pc = 1 / grad;
      const correction = (1 - 1 / n) * q; // F-term per the GGA derivation

      const ai = idx.get(link.from);
      const bi = idx.get(link.to);

      if (ai !== undefined) {
        A[ai]![ai]! += pc;
        F[ai]! += -correction; // incidence −1 at `from`
        if (bi === undefined) F[ai]! += pc * headOf(link.to); // fixed neighbor head
      }
      if (bi !== undefined) {
        A[bi]![bi]! += pc;
        F[bi]! += correction; // incidence +1 at `to`
        if (ai === undefined) F[bi]! += pc * headOf(link.from);
      }
      if (ai !== undefined && bi !== undefined) {
        A[ai]![bi]! -= pc;
        A[bi]![ai]! -= pc;
      }
    });

    H = J > 0 ? solveLinear(A, F) : [];

    let sumDelta = 0;
    let sumQ = 0;
    network.links.forEach((link, p) => {
      const q = Q[p]!;
      const aq = Math.max(Math.abs(q), Q_FLOOR);
      const n = link.exponent;
      const grad = n * link.resistance * Math.pow(aq, n - 1);
      const pc = 1 / grad;
      const hL = link.resistance * q * Math.pow(Math.abs(q), n - 1);
      const hFrom = idx.has(link.from) ? H[idx.get(link.from)!]! : headOf(link.from);
      const hTo = idx.has(link.to) ? H[idx.get(link.to)!]! : headOf(link.to);
      const qNew = q + pc * (hFrom - hTo - hL);
      sumDelta += Math.abs(qNew - q);
      sumQ += Math.abs(qNew);
      Q[p] = qNew;
    });

    if (sumQ === 0 || sumDelta / sumQ < tol) {
      converged = true;
      break;
    }
  }

  const nodes: Record<string, GgaNodeResult> = {};
  for (const node of network.nodes) {
    const head = node.fixed ? node.headPsi ?? 0 : idx.has(node.id) ? H[idx.get(node.id)!]! : 0;
    nodes[node.id] = {
      id: node.id,
      headPsi: head,
      pressurePsi: head - 0.433 * (node.elevationFt ?? 0),
    };
  }

  const links: Record<string, GgaLinkResult> = {};
  network.links.forEach((link, p) => {
    const q = Q[p]!;
    const hL = link.resistance * q * Math.pow(Math.abs(q), link.exponent - 1);
    const result: GgaLinkResult = { id: link.id, flowGpm: q, headlossPsi: hL };
    if (link.internalDiameterIn) {
      result.velocityFps = (0.4085 * Math.abs(q)) / (link.internalDiameterIn * link.internalDiameterIn);
    }
    links[link.id] = result;
  });

  return { converged, iterations, nodes, links };
}
