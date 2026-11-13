import type {
  Doc,
  DocKind,
  ImageElement,
  Page,
  ShapeElement,
  TextElement,
  TextStyle,
  TextStylePreset,
} from "./types";
import { FORMAT_VERSION } from "./types";
import { uid } from "./units";

export const BASE_STYLE: TextStyle = {
  fontFamily: "serif",
  fontSize: 10,
  fontWeight: 400,
  italic: false,
  underline: false,
  color: "#1f1f1f",
  align: "justify",
  lineHeight: 1.6,
  letterSpacing: 0,
  spaceBefore: 0,
  spaceAfter: 0,
  indent: 2,
};

const s = (p: Partial<TextStyle>): TextStyle => ({ ...BASE_STYLE, ...p });

/** 可复用的文字样式（报刊常用） */
export function defaultTextStyles(): TextStylePreset[] {
  return [
    {
      id: "masthead",
      name: "报头",
      style: s({
        fontFamily: "mashan",
        fontSize: 72,
        color: "#b3261e",
        align: "center",
        lineHeight: 1.1,
        indent: 0,
        letterSpacing: 0.05,
      }),
    },
    {
      id: "issue",
      name: "期号",
      style: s({ fontFamily: "sans", fontSize: 9, align: "center", lineHeight: 1.4, indent: 0 }),
    },
    {
      id: "date",
      name: "日期",
      style: s({ fontFamily: "sans", fontSize: 9, align: "left", lineHeight: 1.4, indent: 0 }),
    },
    {
      id: "folio",
      name: "版次",
      style: s({
        fontFamily: "sans",
        fontSize: 9,
        fontWeight: 700,
        align: "left",
        lineHeight: 1.3,
        indent: 0,
        letterSpacing: 0.1,
      }),
    },
    {
      id: "kicker",
      name: "引题",
      style: s({
        fontFamily: "sans",
        fontSize: 11,
        align: "center",
        lineHeight: 1.4,
        indent: 0,
        color: "#444444",
      }),
    },
    {
      id: "headline",
      name: "主标题",
      style: s({
        fontFamily: "serif",
        fontSize: 26,
        fontWeight: 900,
        align: "center",
        lineHeight: 1.25,
        indent: 0,
      }),
    },
    {
      id: "subhead",
      name: "副标题",
      style: s({
        fontFamily: "sans",
        fontSize: 13,
        fontWeight: 700,
        align: "left",
        lineHeight: 1.35,
        indent: 0,
      }),
    },
    {
      id: "lead",
      name: "导语",
      style: s({
        fontFamily: "kai",
        fontSize: 11,
        align: "justify",
        lineHeight: 1.6,
        indent: 2,
        color: "#333333",
      }),
    },
    {
      id: "body",
      name: "正文",
      style: s({
        fontFamily: "serif",
        fontSize: 9.5,
        align: "justify",
        lineHeight: 1.65,
        indent: 2,
      }),
    },
    {
      id: "caption",
      name: "图片说明",
      style: s({
        fontFamily: "kai",
        fontSize: 8,
        align: "left",
        lineHeight: 1.45,
        indent: 0,
        color: "#555555",
      }),
    },
    {
      id: "column",
      name: "栏目名",
      style: s({
        fontFamily: "sans",
        fontSize: 12,
        fontWeight: 700,
        align: "left",
        lineHeight: 1.2,
        indent: 0,
        color: "#ffffff",
        letterSpacing: 0.15,
      }),
    },
    {
      id: "byline",
      name: "作者署名",
      style: s({
        fontFamily: "sans",
        fontSize: 8.5,
        align: "left",
        lineHeight: 1.4,
        indent: 0,
        color: "#666666",
      }),
    },
  ];
}

export function newPage(): Page {
  return { id: uid("p"), background: "#ffffff", elements: [], guides: { x: [], y: [] } };
}

export interface NewDocOptions {
  name: string;
  width: number;
  height: number;
  pages: number;
  margins: { top: number; right: number; bottom: number; left: number };
  kind?: DocKind;
  sizeLabel?: string;
}

export function createDoc(o: NewDocOptions): Doc {
  const now = Date.now();
  return {
    formatVersion: FORMAT_VERSION,
    id: uid("d"),
    name: o.name || "未命名作品",
    kind: o.kind ?? "blank",
    pageSize: { width: o.width, height: o.height },
    sizeLabel: o.sizeLabel,
    margins: o.margins,
    pages: Array.from({ length: Math.max(1, o.pages) }, newPage),
    textStyles: defaultTextStyles(),
    assets: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function makeText(
  p: Partial<TextElement> & { x: number; y: number; w: number; h: number },
): TextElement {
  return {
    id: uid("t"),
    type: "text",
    rotation: 0,
    opacity: 1,
    text: "",
    style: { ...BASE_STYLE },
    columns: 1,
    columnGap: 5,
    padding: 0,
    verticalAlign: "top",
    fill: null,
    stroke: null,
    ...p,
  };
}

export function makeImage(
  p: Partial<ImageElement> & { x: number; y: number; w: number; h: number },
): ImageElement {
  return {
    id: uid("i"),
    type: "image",
    rotation: 0,
    opacity: 1,
    assetId: null,
    crop: { x: 0, y: 0, w: p.w, h: p.h },
    keepRatio: true,
    radius: 0,
    stroke: null,
    ...p,
  };
}

export function makeShape(
  p: Partial<ShapeElement> & {
    x: number;
    y: number;
    w: number;
    h: number;
    shape: ShapeElement["shape"];
  },
): ShapeElement {
  return {
    id: uid("s"),
    type: "shape",
    rotation: 0,
    opacity: 1,
    fill: p.shape === "line" ? null : "#e8e2d6",
    stroke: p.shape === "line" ? { color: "#1f1f1f", width: 0.5, dash: "solid" } : null,
    radius: 0,
    ...p,
  };
}

/** Fit an image of the given pixel size to cover a frame (centred). */
export function coverCrop(frameW: number, frameH: number, imgW: number, imgH: number) {
  const r = Math.max(frameW / imgW, frameH / imgH);
  const w = imgW * r;
  const h = imgH * r;
  return { x: (frameW - w) / 2, y: (frameH - h) / 2, w, h };
}

export function containCrop(frameW: number, frameH: number, imgW: number, imgH: number) {
  const r = Math.min(frameW / imgW, frameH / imgH);
  const w = imgW * r;
  const h = imgH * r;
  return { x: (frameW - w) / 2, y: (frameH - h) / 2, w, h };
}

export const elementTypeName: Record<string, string> = {
  text: "文本框",
  image: "图片",
  shape: "图形",
};
export const shapeName: Record<string, string> = { rect: "矩形", ellipse: "圆形", line: "直线" };
