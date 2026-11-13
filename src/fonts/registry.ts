import type { FontWeight } from "../model/types";

export interface FontFace {
  /** file id in public/fonts */
  file: string;
  weight: FontWeight;
}

export interface FontFamilyDef {
  id: string;
  name: string;
  category: "正文" | "标题" | "书法";
  css: string;
  faces: FontFace[];
  fallback: "serif" | "sans-serif";
  license: string;
}

export const FONT_FAMILIES: FontFamilyDef[] = [
  {
    id: "serif",
    name: "思源宋体",
    category: "正文",
    css: "BX Noto Serif SC",
    fallback: "serif",
    license: "SIL OFL 1.1",
    faces: [
      { file: "noto-serif-sc-400", weight: 400 },
      { file: "noto-serif-sc-700", weight: 700 },
      { file: "noto-serif-sc-900", weight: 900 },
    ],
  },
  {
    id: "sans",
    name: "思源黑体",
    category: "正文",
    css: "BX Noto Sans SC",
    fallback: "sans-serif",
    license: "SIL OFL 1.1",
    faces: [
      { file: "noto-sans-sc-400", weight: 400 },
      { file: "noto-sans-sc-700", weight: 700 },
    ],
  },
  {
    id: "kai",
    name: "霞鹜文楷",
    category: "正文",
    css: "BX LXGW WenKai",
    fallback: "serif",
    license: "SIL OFL 1.1",
    faces: [{ file: "lxgw-wenkai-400", weight: 400 }],
  },
  {
    id: "xiaowei",
    name: "站酷小薇",
    category: "标题",
    css: "BX ZCOOL XiaoWei",
    fallback: "serif",
    license: "SIL OFL 1.1",
    faces: [{ file: "zcool-xiaowei-400", weight: 400 }],
  },
  {
    id: "mashan",
    name: "马善政楷书",
    category: "书法",
    css: "BX Ma Shan Zheng",
    fallback: "serif",
    license: "SIL OFL 1.1",
    faces: [{ file: "ma-shan-zheng-400", weight: 400 }],
  },
];

export const DEFAULT_FONT = "serif";

export function getFamily(id: string): FontFamilyDef | undefined {
  return FONT_FAMILIES.find((f) => f.id === id);
}

/** Resolve the face actually used for a requested weight; `synthBold` when the family lacks a bold face. */
export function resolveFace(
  familyId: string,
  weight: number,
): { family: FontFamilyDef; face: FontFace; synthBold: boolean; missing: boolean } {
  const fam = getFamily(familyId);
  const family = fam ?? getFamily(DEFAULT_FONT)!;
  let best = family.faces[0];
  for (const f of family.faces)
    if (Math.abs(f.weight - weight) < Math.abs(best.weight - weight)) best = f;
  const synthBold = weight >= 600 && best.weight < 600;
  return { family, face: best, synthBold, missing: !fam };
}

export function fontUrl(file: string) {
  return `${import.meta.env.BASE_URL}fonts/${file}.ttf`;
}

/** CSS font-family stack; the face weight is chosen through font-weight. */
export function cssFamily(familyId: string) {
  const { family } = resolveFace(familyId, 400);
  return `"${family.css}", ${family.fallback}`;
}
