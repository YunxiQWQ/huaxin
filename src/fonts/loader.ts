import { FONT_FAMILIES, fontUrl, getFamily, resolveFace } from "./registry";
import type { Doc } from "../model/types";

type Status = "loading" | "loaded" | "error";
const status = new Map<string, Status>();
const pending = new Map<string, Promise<void>>();
let epoch = 0;
const listeners = new Set<() => void>();

function bump() {
  epoch++;
  listeners.forEach((l) => l());
}

export function fontEpoch() {
  return epoch;
}
export function subscribeFonts(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function faceStatus(file: string): Status | undefined {
  return status.get(file);
}

export function ensureFace(file: string): Promise<void> {
  const existing = pending.get(file);
  if (existing) return existing;
  const fam = FONT_FAMILIES.find((f) => f.faces.some((x) => x.file === file));
  if (!fam) return Promise.resolve();
  const face = fam.faces.find((x) => x.file === file)!;
  status.set(file, "loading");
  const ff = new FontFace(fam.css, `url("${fontUrl(file)}") format("truetype")`, {
    weight: String(face.weight),
    display: "block",
  });
  const p = ff
    .load()
    .then(() => {
      document.fonts.add(ff);
      status.set(file, "loaded");
      bump();
    })
    .catch(() => {
      status.set(file, "error");
      pending.delete(file);
      bump();
    });
  pending.set(file, p);
  return p;
}

export function facesForDoc(doc: Doc): Set<string> {
  const files = new Set<string>();
  for (const p of doc.pages)
    for (const el of p.elements) {
      if (el.type !== "text") continue;
      files.add(resolveFace(el.style.fontFamily, el.style.fontWeight).face.file);
    }
  for (const s of doc.textStyles)
    files.add(resolveFace(s.style.fontFamily, s.style.fontWeight).face.file);
  return files;
}

export function ensureFontsForDoc(doc: Doc): Promise<void> {
  return Promise.all([...facesForDoc(doc)].map(ensureFace)).then(() => undefined);
}

/** Font families referenced by the document that this program does not provide. */
export function missingFamilies(doc: Doc): string[] {
  const out = new Set<string>();
  for (const p of doc.pages)
    for (const el of p.elements)
      if (el.type === "text" && !getFamily(el.style.fontFamily)) out.add(el.style.fontFamily);
  return [...out];
}

// ---- glyph coverage (charset of the bundled subsets) ----
let coverage: { charset: Set<string>; missing: Record<string, Set<string>> } | null = null;
let coverageP: Promise<void> | null = null;
export function loadCoverage(): Promise<void> {
  if (coverageP) return coverageP;
  const base = import.meta.env.BASE_URL;
  coverageP = Promise.all([
    fetch(`${base}fonts/charset.txt`).then((r) => r.text()),
    fetch(`${base}fonts/manifest.json`).then((r) => r.json()),
  ])
    .then(([cs, man]) => {
      const missing: Record<string, Set<string>> = {};
      for (const [id, info] of Object.entries<any>(man.fonts))
        missing[id] = new Set([...(info.missingHan as string)]);
      coverage = { charset: new Set([...cs]), missing };
    })
    .catch(() => {
      coverageP = null;
    });
  return coverageP;
}

/** Characters in `text` the resolved face cannot render (null when coverage data is not loaded). */
export function uncoveredChars(familyId: string, weight: number, text: string): string[] | null {
  if (!coverage) return null;
  const { face } = resolveFace(familyId, weight);
  const miss = coverage.missing[face.file];
  const out = new Set<string>();
  for (const ch of text) {
    if (ch === "\n" || ch === " " || ch === "\t" || ch === "\u3000") continue;
    if (!coverage.charset.has(ch) || miss?.has(ch)) out.add(ch);
  }
  return [...out];
}
