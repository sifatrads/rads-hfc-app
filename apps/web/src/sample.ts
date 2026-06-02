import { parseProject, type ProjectModel } from "@rads/model";

/** A small built-in sprinkler tree so the viewer shows something on first load. */
export function sampleProject(): ProjectModel {
  const nodes: Record<string, unknown>[] = [
    { id: "BFP-OUT", type: "junction", elevationFt: 0 },
    { id: "BOR", type: "junction", elevationFt: 0 },
    { id: "RTOP", type: "junction", elevationFt: 30 },
  ];
  const pipes: Record<string, unknown>[] = [
    { id: "P-SUP", from: "BFP-OUT", to: "BOR", role: "supply-main", direction: "E", nominalSize: "6", internalDiameterIn: 6.065, cFactor: 120, material: "black-steel-wet", lengthFt: 30 },
    { id: "P-RIS", from: "BOR", to: "RTOP", role: "riser", direction: "U", nominalSize: "4", internalDiameterIn: 4.026, cFactor: 120, material: "black-steel-wet", lengthFt: 30, elevationChangeFt: 30 },
    { id: "P-FEED", from: "RTOP", to: "CM-0", role: "feed-main", direction: "E", nominalSize: "2-1/2", internalDiameterIn: 2.469, cFactor: 120, lengthFt: 18 },
  ];
  for (let cm = 0; cm < 3; cm++) {
    nodes.push({ id: `CM-${cm}`, type: "junction", elevationFt: 30 });
    if (cm > 0) pipes.push({ id: `P-CM${cm}`, from: `CM-${cm - 1}`, to: `CM-${cm}`, role: "cross-main", direction: "N", nominalSize: "2-1/2", internalDiameterIn: 2.469, cFactor: 120, lengthFt: 12 });
    let prev = `CM-${cm}`;
    for (let s = 1; s <= 3; s++) {
      const id = `S-${cm + 1}-${s}`;
      nodes.push({ id, type: "sprinkler", elevationFt: 30, kFactor: 5.6, coverageAreaFt2: 130, sprinkler: s % 2 ? "pendent" : "upright" });
      pipes.push({ id: `P-${cm + 1}-${s}`, from: prev, to: id, role: "branch-line", direction: "E", nominalSize: s === 1 ? "1-1/4" : "1", internalDiameterIn: s === 1 ? 1.38 : 1.049, cFactor: 120, lengthFt: 12 });
      prev = id;
    }
  }
  return parseProject({
    schemaVersion: 2,
    meta: { id: "SAMPLE", name: "Sample sprinkler tree", systemType: "sprinkler", standardId: "nfpa13", units: "imperial" },
    designBasis: { method: "density/area", densityGpmFt2: 0.2, designAreaFt2: 1500 },
    waterSupply: { type: "city+fire-pump", flowTest: { staticPsi: 70, residualPsi: 52, testFlowGpm: 1500 }, firePump: { listed: "NFPA 20", ratedFlowGpm: 500, ratedPsi: 90 } },
    network: { nodes, pipes, valves: [{ id: "BV-1", type: "butterfly-valve", onPipe: "riser", sizeIn: "4" }, { id: "CV-1", type: "check-valve", onPipe: "supply-main", sizeIn: "6" }] },
  });
}
