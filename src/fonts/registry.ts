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
  source?: "local";
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
// Versioned asset paths also work with older installed service workers.
export const FONT_MANIFEST = "manifest-v1.530.json";

let localFamilies: FontFamilyDef[] = [];

export function getLocalFamilies() {
  return localFamilies;
}

export function registerLocalFamilies(families: FontFamilyDef[]) {
  localFamilies = families;
}

export function isLocalFont(id: string) {
  return id.startsWith("local:");
}

/** Stable, reversible IDs; neither font bytes nor the full installed-font list enter a draft. */
export function localFontId(name: string) {
  const bytes = new TextEncoder().encode(name);
  return (
    "local:" +
    btoa(Array.from(bytes, (n) => String.fromCharCode(n)).join(""))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
  );
}

export function fontName(id: string): string {
  const found = getFamily(id);
  if (found) return found.name;
  if (isLocalFont(id)) {
    try {
      const bytes = Uint8Array.from(atob(id.slice(6).replace(/-/g, "+").replace(/_/g, "/")), (ch) =>
        ch.charCodeAt(0),
      );
      return new TextDecoder().decode(bytes);
    } catch {
      /* malformed imported reference */
    }
  }
  return id;
}

export function getFamily(id: string): FontFamilyDef | undefined {
  return FONT_FAMILIES.find((f) => f.id === id) ?? localFamilies.find((f) => f.id === id);
}

export function familyForFace(file: string) {
  return [...FONT_FAMILIES, ...localFamilies].find((f) => f.faces.some((x) => x.file === file));
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
  const name = file === "lxgw-wenkai-400" ? "lxgw-wenkai-v1.530-400" : file;
  return `${import.meta.env.BASE_URL}fonts/${name}.ttf`;
}

/** CSS font-family stack; the face weight is chosen through font-weight. */
export function cssFamily(familyId: string) {
  const { family } = resolveFace(familyId, 400);
  return `"${family.css}", ${family.fallback}`;
}
