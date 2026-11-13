import type {
  Doc,
  DocKind,
  ImageElement,
  Page,
  PageElement,
  ShapeElement,
  Stroke,
  TextElement,
  TextStyle,
} from "../model/types";
import {
  createDoc,
  coverCrop,
  defaultTextStyles,
  makeImage,
  makeShape,
  makeText,
} from "../model/defaults";
import { uid } from "../model/units";

export const IMG: Record<string, [number, number]> = {
  alley: [1400, 2100],
  basketball: [1400, 933],
  "campus-lawn": [1400, 1050],
  campus: [1400, 1014],
  freethrow: [1400, 933],
  lab: [1400, 788],
  library: [1400, 2097],
  "mist-trees": [1400, 2102],
  mountains: [1400, 933],
  reading: [1400, 1750],
  steps: [1400, 2100],
  "tea-cups": [1400, 2089],
  teapot: [1400, 1750],
  zhangjiajie: [1400, 934],
};

const presets = Object.fromEntries(defaultTextStyles().map((p) => [p.id, p.style]));

type TextOpts = Partial<Omit<TextElement, "style">> & { style?: Partial<TextStyle> };

export function T(
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  styleId: string,
  o: TextOpts = {},
): TextElement {
  const { style, ...rest } = o;
  return makeText({
    x,
    y,
    w,
    h,
    text,
    style: { ...presets[styleId], ...style },
    styleId: style ? undefined : styleId,
    ...rest,
  });
}

export function I(
  x: number,
  y: number,
  w: number,
  h: number,
  img: string,
  o: Partial<ImageElement> & { zoom?: number; fx?: number; fy?: number } = {},
): ImageElement {
  const [iw, ih] = IMG[img];
  const { zoom = 1, fx = 0.5, fy = 0.5, ...rest } = o;
  const c = coverCrop(w, h, iw, ih);
  const cw = c.w * zoom;
  const ch = c.h * zoom;
  const crop = { x: (w - cw) * fx, y: (h - ch) * fy, w: cw, h: ch };
  return makeImage({ x, y, w, h, assetId: `tpl:${img}`, crop, ...rest });
}

export function R(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string | null,
  stroke: Stroke | null = null,
  o: Partial<ShapeElement> = {},
): ShapeElement {
  return makeShape({ x, y, w, h, shape: "rect", fill, stroke, ...o });
}

export function L(
  x: number,
  y: number,
  w: number,
  color = "#1f1f1f",
  width = 0.3,
  dash: Stroke["dash"] = "solid",
  o: Partial<ShapeElement> = {},
): ShapeElement {
  return makeShape({
    x,
    y: y - Math.max(1, width) / 2,
    w,
    h: Math.max(1, width),
    shape: "line",
    stroke: { color, width, dash },
    ...o,
  });
}

export function E(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string | null,
  stroke: Stroke | null = null,
): ShapeElement {
  return makeShape({ x, y, w, h, shape: "ellipse", fill, stroke });
}

export function group(...els: PageElement[]): PageElement[] {
  const g = uid("g");
  return els.map((e) => ({ ...e, groupId: g }));
}

export function page(elements: PageElement[], background = "#ffffff"): Page {
  return { id: uid("p"), background, elements, guides: { x: [], y: [] } };
}

export function docFrom(o: {
  name: string;
  kind: DocKind;
  width: number;
  height: number;
  sizeLabel?: string;
  margins: Doc["margins"];
  pages: Page[];
}): Doc {
  const d = createDoc({
    name: o.name,
    width: o.width,
    height: o.height,
    pages: 1,
    margins: o.margins,
    kind: o.kind,
    sizeLabel: o.sizeLabel,
  });
  d.pages = o.pages;
  return d;
}
