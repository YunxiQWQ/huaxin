import { resolveFace } from "../fonts/registry";
import { fontEpoch } from "../fonts/loader";

let ctx: CanvasRenderingContext2D | null = null;
let cacheEpoch = -1;
const widths = new Map<string, Map<string, number>>();
const metricsCache = new Map<string, { ascent: number; descent: number }>();
const BASE = 100;

function context() {
  if (!ctx) {
    const c = document.createElement("canvas");
    ctx = c.getContext("2d")!;
    (ctx as any).fontKerning = "none";
  }
  if (cacheEpoch !== fontEpoch()) {
    cacheEpoch = fontEpoch();
    widths.clear();
    metricsCache.clear();
  }
  return ctx;
}

export function canvasFont(familyId: string, weight: number, sizePx: number, italic = false) {
  const { family, face } = resolveFace(familyId, weight);
  // weight requested from CSS (may be synthesised); measurement uses the face weight.
  return `${italic ? "italic " : ""}${face.weight} ${sizePx}px "${family.css}", ${family.fallback}`;
}

export function fontKey(familyId: string, weight: number) {
  const { family, face } = resolveFace(familyId, weight);
  return `${family.id}:${face.weight}`;
}

/** Advance width in em for each character. */
export function charWidthEm(familyId: string, weight: number, ch: string): number {
  const c = context();
  const key = fontKey(familyId, weight);
  let m = widths.get(key);
  if (!m) {
    m = new Map();
    widths.set(key, m);
  }
  let w = m.get(ch);
  if (w === undefined) {
    c.font = canvasFont(familyId, weight, BASE);
    w = c.measureText(ch).width / BASE;
    m.set(ch, w);
  }
  return w;
}

export function fontMetricsEm(
  familyId: string,
  weight: number,
): { ascent: number; descent: number } {
  const c = context();
  const key = fontKey(familyId, weight);
  let m = metricsCache.get(key);
  if (!m) {
    c.font = canvasFont(familyId, weight, BASE);
    const t = c.measureText("国Hg");
    const ascent = (t.fontBoundingBoxAscent ?? BASE * 0.88) / BASE;
    const descent = (t.fontBoundingBoxDescent ?? BASE * 0.12) / BASE;
    m = { ascent, descent };
    metricsCache.set(key, m);
  }
  return m;
}
