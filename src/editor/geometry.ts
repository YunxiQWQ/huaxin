import type { PageElement } from "../model/types";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Pt {
  x: number;
  y: number;
}

const rad = (d: number) => (d * Math.PI) / 180;

export function rotatePoint(p: Pt, c: Pt, deg: number): Pt {
  const a = rad(deg);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

export function corners(e: Rect & { rotation: number }): Pt[] {
  const c = { x: e.x + e.w / 2, y: e.y + e.h / 2 };
  const pts = [
    { x: e.x, y: e.y },
    { x: e.x + e.w, y: e.y },
    { x: e.x + e.w, y: e.y + e.h },
    { x: e.x, y: e.y + e.h },
  ];
  return e.rotation ? pts.map((p) => rotatePoint(p, c, e.rotation)) : pts;
}

export function aabb(e: Rect & { rotation: number }): Rect {
  const pts = corners(e);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function unionRect(rs: Rect[]): Rect | null {
  if (!rs.length) return null;
  let x1 = Infinity,
    y1 = Infinity,
    x2 = -Infinity,
    y2 = -Infinity;
  for (const r of rs) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.w);
    y2 = Math.max(y2, r.y + r.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function selectionBounds(els: PageElement[]): Rect | null {
  return unionRect(els.map(aabb));
}

export function intersects(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** local unit position of a handle (-1..1) */
export function handleVec(h: Handle): Pt {
  return {
    x: h.includes("w") ? -1 : h.includes("e") ? 1 : 0,
    y: h.includes("n") ? -1 : h.includes("s") ? 1 : 0,
  };
}

/**
 * Resize a (possibly rotated) frame by dragging `handle` to page point `p`.
 * The opposite handle stays fixed in page coordinates.
 */
export function resizeFrame(
  start: Rect & { rotation: number },
  handle: Handle,
  p: Pt,
  keepRatio: boolean,
  minSize = 1,
): Rect {
  const v = handleVec(handle);
  const c = { x: start.x + start.w / 2, y: start.y + start.h / 2 };
  // anchor (opposite point) in local coords relative to centre
  const anchorLocal = { x: (-v.x * start.w) / 2, y: (-v.y * start.h) / 2 };
  const anchor = rotatePoint({ x: c.x + anchorLocal.x, y: c.y + anchorLocal.y }, c, start.rotation);
  // pointer in local (unrotated) frame around anchor
  const pl = rotatePoint(p, anchor, -start.rotation);
  let w = v.x === 0 ? start.w : Math.max(minSize, (pl.x - anchor.x) * v.x);
  let h = v.y === 0 ? start.h : Math.max(minSize, (pl.y - anchor.y) * v.y);
  if (keepRatio && start.w > 0 && start.h > 0) {
    const r = start.w / start.h;
    if (v.x === 0) w = h * r;
    else if (v.y === 0) h = w / r;
    else if (w / h > r) h = w / r;
    else w = h * r;
  }
  // new centre: anchor + rotated half-diagonal towards the handle
  const dir = { x: v.x === 0 ? 0 : (v.x * w) / 2, y: v.y === 0 ? 0 : (v.y * h) / 2 };
  // for edge handles the perpendicular axis stays centred on the anchor line
  const localCentre = { x: anchor.x + dir.x + (v.x === 0 ? 0 : 0), y: anchor.y + dir.y };
  const nc = rotatePoint(localCentre, anchor, start.rotation);
  // edge handles: keep centre on the original axis
  return { x: nc.x - w / 2, y: nc.y - h / 2, w, h };
}

// ---- snapping ----
export interface SnapTargets {
  xs: number[];
  ys: number[];
}
export interface SnapResult {
  dx: number;
  dy: number;
  lines: { axis: "x" | "y"; pos: number }[];
}

export function snapRect(
  r: Rect,
  t: SnapTargets,
  threshold: number,
  which: { x: number[]; y: number[] } = { x: [0, 0.5, 1], y: [0, 0.5, 1] },
): SnapResult {
  let best = { dx: 0, ax: Infinity, lx: NaN };
  for (const f of which.x) {
    const v = r.x + r.w * f;
    for (const tx of t.xs) {
      const d = tx - v;
      if (Math.abs(d) < threshold && Math.abs(d) < best.ax)
        best = { dx: d, ax: Math.abs(d), lx: tx };
    }
  }
  let bestY = { dy: 0, ay: Infinity, ly: NaN };
  for (const f of which.y) {
    const v = r.y + r.h * f;
    for (const ty of t.ys) {
      const d = ty - v;
      if (Math.abs(d) < threshold && Math.abs(d) < bestY.ay)
        bestY = { dy: d, ay: Math.abs(d), ly: ty };
    }
  }
  const lines: SnapResult["lines"] = [];
  if (isFinite(best.ax)) lines.push({ axis: "x", pos: best.lx });
  if (isFinite(bestY.ay)) lines.push({ axis: "y", pos: bestY.ly });
  return { dx: isFinite(best.ax) ? best.dx : 0, dy: isFinite(bestY.ay) ? bestY.dy : 0, lines };
}
