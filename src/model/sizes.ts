export interface SizePreset {
  id: string;
  group: "报纸" | "常用" | "画册与手册";
  name: string;
  /** single page, portrait orientation, mm */
  width: number;
  height: number;
  note?: string;
}

/** 所有尺寸均为单页“宽 × 高”，单位毫米（竖向）。报纸开型取常见成品尺寸，可自行修改。 */
export const SIZE_PRESETS: SizePreset[] = [
  {
    id: "np-duikai",
    group: "报纸",
    name: "对开报纸",
    width: 390,
    height: 540,
    note: "常见日报版面",
  },
  {
    id: "np-sikai",
    group: "报纸",
    name: "四开报纸",
    width: 270,
    height: 390,
    note: "校报、企业报常用",
  },
  { id: "np-bakai", group: "报纸", name: "八开报纸", width: 195, height: 270 },
  { id: "np-berliner", group: "报纸", name: "柏林版", width: 315, height: 470 },
  { id: "np-tabloid", group: "报纸", name: "小报（Tabloid）", width: 280, height: 430 },
  { id: "a4", group: "常用", name: "A4", width: 210, height: 297 },
  { id: "a3", group: "常用", name: "A3", width: 297, height: 420 },
  { id: "a5", group: "常用", name: "A5", width: 148, height: 210 },
  { id: "b5", group: "常用", name: "B5", width: 176, height: 250 },
  { id: "16k", group: "画册与手册", name: "16 开", width: 185, height: 260 },
  { id: "big16k", group: "画册与手册", name: "大 16 开画册", width: 210, height: 285 },
  { id: "square", group: "画册与手册", name: "方形画册", width: 210, height: 210 },
  { id: "32k", group: "画册与手册", name: "32 开手册", width: 130, height: 184 },
];

export function sizeLabel(w: number, h: number) {
  return `宽 ${fmt(w)} × 高 ${fmt(h)} mm`;
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function orientationOf(w: number, h: number): "portrait" | "landscape" | "square" {
  if (Math.abs(w - h) < 0.5) return "square";
  return w > h ? "landscape" : "portrait";
}
