/**
 * Render an NFPA-170 symbol's primitives to a canvas → a cached CanvasTexture
 * for use on camera-facing sprites (3D billboards) in the viewer.
 */
import { CanvasTexture, SRGBColorSpace } from "three";
import { getSymbol } from "@rads/nfpa170";

const cache = new Map<string, CanvasTexture | null>();

export function symbolTexture(id: string, color = "#b45309", px = 128): CanvasTexture | null {
  const key = `${id}|${color}|${px}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const def = getSymbol(id);
  if (!def || typeof document === "undefined") {
    cache.set(key, null);
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    cache.set(key, null);
    return null;
  }
  const R = px * 0.4;
  const cx = px / 2;
  const cy = px / 2;
  const X = (x: number) => cx + x * R;
  const Y = (y: number) => cy + y * R;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, px * 0.035);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (const p of def.prims) {
    ctx.beginPath();
    if (p.k === "line") {
      ctx.moveTo(X(p.x1), Y(p.y1));
      ctx.lineTo(X(p.x2), Y(p.y2));
      ctx.stroke();
    } else if (p.k === "circle") {
      ctx.arc(X(p.cx), Y(p.cy), p.r * R, 0, Math.PI * 2);
      if (p.fill) ctx.fill();
      else ctx.stroke();
    } else if (p.k === "rect") {
      if (p.fill) ctx.fillRect(X(p.x), Y(p.y), p.w * R, p.h * R);
      else ctx.strokeRect(X(p.x), Y(p.y), p.w * R, p.h * R);
    } else {
      p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      if (p.closed !== false) ctx.closePath();
      if (p.fill) ctx.fill();
      else ctx.stroke();
    }
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}
