import type { Stroke } from "../model/types";

export const ITALIC_SKEW = Math.tan((12 * Math.PI) / 180);
export const SYNTH_BOLD = 0.03;

export function dashArray(s: Stroke, w = s.width): number[] | null {
  if (s.dash === "dashed") return [w * 3, w * 2];
  if (s.dash === "dotted") return [w, w * 1.5];
  return null;
}

/** Geometry of a stroked shape: the stroke sits fully inside the frame. */
export function strokeInsets(s: Stroke): { inset: number; width: number }[] {
  if (s.dash === "double") {
    const w = s.width / 3;
    return [
      { inset: w / 2, width: w },
      { inset: s.width - w / 2, width: w },
    ];
  }
  return [{ inset: s.width / 2, width: s.width }];
}
