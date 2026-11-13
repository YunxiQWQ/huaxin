export const MM_PER_PT = 25.4 / 72;
export const PT_PER_MM = 72 / 25.4;
/** CSS px per mm at 96dpi */
export const PX_PER_MM = 96 / 25.4;

export const ptToMm = (pt: number) => pt * MM_PER_PT;
export const mmToPt = (mm: number) => mm * PT_PER_MM;

export const round = (v: number, d = 1) => {
  const k = 10 ** d;
  return Math.round(v * k) / k;
};

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function uid(prefix = ""): string {
  const a = crypto.getRandomValues(new Uint32Array(2));
  return prefix + a[0].toString(36) + a[1].toString(36).slice(0, 4);
}
