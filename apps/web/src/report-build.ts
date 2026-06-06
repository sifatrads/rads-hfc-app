/** Build the full NFPA §27.4 sheet set (3 working-plan drawings + report sheets)
 * and a print helper that opens one A4 page per sheet → vector PDF. Shared by the
 * Report tab. */
import type { ProjectModel } from "@rads/model";
import { solveProject } from "@rads/solve";
import { buildScene } from "@rads/scene";
import { setCustomMaterials } from "@rads/standards-engine";
import { reportSheets, renderDrawingSheetSvg, type Sheet } from "@rads/report";

export function buildReportSheets(model: ProjectModel): { sheets: Sheet[]; error?: string } {
  try {
    setCustomMaterials(model.customMaterials);
    const sol = solveProject(model);
    // Drawings are schematic (NTS): compress very long mains so a dense grid
    // isn't squeezed into a corner by one long supply run.
    const scene = buildScene(model, { results: sol.results, layout: { compressLongRuns: true } });
    const views: [("iso" | "plan" | "front"), string][] = [["iso", "Isometric"], ["plan", "Plan View"], ["front", "Elevation"]];
    const drawings: Sheet[] = views.map(([view, name]) => ({
      title: `Working Plan — ${name}`,
      svg: renderDrawingSheetSvg(scene, { paper: "A4", orientation: "portrait", view, colorMetric: "size", title: `${model.meta.name} — ${name}` }),
    }));
    return { sheets: [...drawings, ...reportSheets(model, sol)] };
  } catch (e) {
    return { sheets: [], error: (e as Error).message };
  }
}

export function printSheets(sheets: Sheet[], title: string): void {
  const w = window.open("", "_blank");
  if (!w) return;
  const style = "@page{size:A4 portrait;margin:0}body{margin:0}.sheet{page-break-after:always}.sheet:last-child{page-break-after:auto}.sheet svg{width:210mm;height:297mm;display:block}";
  w.document.write(`<!doctype html><html><head><title>${title}</title><style>${style}</style></head><body>${sheets.map((s) => `<div class="sheet">${s.svg}</div>`).join("")}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
}
