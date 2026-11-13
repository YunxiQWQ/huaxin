import type { Doc, Page, PageElement, Stroke, TextElement } from "../model/types";
import { layoutOf, type TextLayout } from "../layout/textLayout";
import { resolveFace } from "../fonts/registry";

export { ITALIC_SKEW, SYNTH_BOLD, dashArray, strokeInsets } from "./primitives";

export type DLItem =
  | {
      t: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      r: number;
      fill: string | null;
      stroke: Stroke | null;
    }
  | {
      t: "ellipse";
      x: number;
      y: number;
      w: number;
      h: number;
      fill: string | null;
      stroke: Stroke | null;
    }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; stroke: Stroke }
  | {
      t: "image";
      assetId: string;
      clip: { x: number; y: number; w: number; h: number; r: number };
      dest: { x: number; y: number; w: number; h: number };
    }
  | { t: "placeholder"; x: number; y: number; w: number; h: number; r: number; missing: boolean }
  | {
      t: "text";
      face: string;
      familyCss: string;
      fallback: string;
      weight: number;
      synthBold: boolean;
      italic: boolean;
      size: number;
      color: string;
      x: number;
      baseline: number;
      ascent: number;
      descent: number;
      text: string;
      spacing: number;
    };

export interface DLGroup {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  items: DLItem[];
}

export interface PageDL {
  width: number;
  height: number;
  background: string;
  groups: DLGroup[];
}

export function textItems(el: TextElement, layout: TextLayout = layoutOf(el)): DLItem[] {
  const st = el.style;
  const { family, face, synthBold } = resolveFace(st.fontFamily, st.fontWeight);
  const items: DLItem[] = [];
  for (const l of layout.lines) {
    if (!l.text) continue;
    items.push({
      t: "text",
      face: face.file,
      familyCss: family.css,
      fallback: family.fallback,
      weight: face.weight,
      synthBold,
      italic: st.italic,
      size: layout.fontSize,
      color: st.color,
      x: l.x,
      baseline: l.baseline,
      ascent: layout.ascent,
      descent: layout.descent,
      text: l.text,
      spacing: l.spacing,
    });
    if (st.underline) {
      const n = [...l.text].length;
      const w = l.width + Math.max(0, n - 1) * (l.spacing - st.letterSpacing * layout.fontSize);
      items.push({
        t: "rect",
        x: l.x,
        y: l.baseline + layout.fontSize * 0.1,
        w,
        h: Math.max(0.08, layout.fontSize * 0.055),
        r: 0,
        fill: st.color,
        stroke: null,
      });
    }
  }
  return items;
}

export function elementItems(el: PageElement, opts: { editor?: boolean } = {}): DLItem[] {
  if (el.type === "text") {
    const items: DLItem[] = [];
    if (el.fill || el.stroke)
      items.push({
        t: "rect",
        x: 0,
        y: 0,
        w: el.w,
        h: el.h,
        r: 0,
        fill: el.fill,
        stroke: el.stroke,
      });
    const layout = layoutOf(el);
    if (el.columnRule && el.columns > 1) {
      const pad = el.padding;
      for (let c = 1; c < el.columns; c++) {
        const x = pad + c * layout.colWidth + (c - 0.5) * el.columnGap;
        items.push({
          t: "line",
          x1: x,
          y1: pad,
          x2: x,
          y2: el.h - pad,
          stroke: { color: "#9a9a9a", width: 0.15, dash: "solid" },
        });
      }
    }
    items.push(...textItems(el, layout));
    return items;
  }
  if (el.type === "image") {
    const items: DLItem[] = [];
    if (el.assetId)
      items.push({
        t: "image",
        assetId: el.assetId,
        clip: { x: 0, y: 0, w: el.w, h: el.h, r: el.radius },
        dest: { ...el.crop },
      });
    else if (opts.editor)
      items.push({ t: "placeholder", x: 0, y: 0, w: el.w, h: el.h, r: el.radius, missing: false });
    if (el.stroke)
      items.push({
        t: "rect",
        x: 0,
        y: 0,
        w: el.w,
        h: el.h,
        r: el.radius,
        fill: null,
        stroke: el.stroke,
      });
    return items;
  }
  if (el.shape === "line") {
    return el.stroke
      ? [{ t: "line", x1: 0, y1: el.h / 2, x2: el.w, y2: el.h / 2, stroke: el.stroke }]
      : [];
  }
  if (el.shape === "ellipse")
    return [{ t: "ellipse", x: 0, y: 0, w: el.w, h: el.h, fill: el.fill, stroke: el.stroke }];
  return [
    { t: "rect", x: 0, y: 0, w: el.w, h: el.h, r: el.radius, fill: el.fill, stroke: el.stroke },
  ];
}

export function pageDisplayList(doc: Doc, page: Page): PageDL {
  return {
    width: doc.pageSize.width,
    height: doc.pageSize.height,
    background: page.background,
    groups: page.elements
      .filter((e) => !e.hidden)
      .map((e) => ({
        id: e.id,
        x: e.x,
        y: e.y,
        w: e.w,
        h: e.h,
        rotation: e.rotation,
        opacity: e.opacity,
        items: elementItems(e),
      })),
  };
}
