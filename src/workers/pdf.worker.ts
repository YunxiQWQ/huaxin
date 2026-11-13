/// <reference lib="webworker" />
import {
  PDFDocument,
  PDFName,
  PDFPage,
  TextRenderingMode,
  appendBezierCurve,
  beginText,
  clip,
  closePath,
  concatTransformationMatrix,
  drawObject,
  endPath,
  endText,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setCharacterSpacing,
  setDashPattern,
  setFillingRgbColor,
  setFontAndSize,
  setGraphicsState,
  setLineWidth,
  setStrokingRgbColor,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  stroke,
  type PDFFont,
  type PDFImage,
  type PDFOperator,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { subsetFont } from "./hbSubset";
import type { DLItem, PageDL } from "../render/displayList";
import { ITALIC_SKEW, SYNTH_BOLD, dashArray, strokeInsets } from "../render/primitives";
import type { Stroke } from "../model/types";
import { embeddingFlags } from "../fonts/embedding";

export interface PdfJob {
  title: string;
  pages: PageDL[];
  fonts: ({ file: string; url: string } | { file: string; bytes: ArrayBuffer; name: string })[];
  images: { id: string; bytes: ArrayBuffer; kind: "png" | "jpg" }[];
}

export type PdfMsg =
  | { type: "progress"; stage: string; done: number; total: number }
  | { type: "done"; bytes: ArrayBuffer; warnings: string[] }
  | { type: "error"; message: string };

const K = 72 / 25.4;
const KAPPA = 0.5522847498;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function roundRectPath(x: number, y: number, w: number, h: number, r: number): PDFOperator[] {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (r <= 0) return [rectangle(x, y, w, h)];
  const c = r * KAPPA;
  return [
    moveTo(x + r, y),
    lineTo(x + w - r, y),
    appendBezierCurve(x + w - r + c, y, x + w, y + r - c, x + w, y + r),
    lineTo(x + w, y + h - r),
    appendBezierCurve(x + w, y + h - r + c, x + w - r + c, y + h, x + w - r, y + h),
    lineTo(x + r, y + h),
    appendBezierCurve(x + r - c, y + h, x, y + h - r + c, x, y + h - r),
    lineTo(x, y + r),
    appendBezierCurve(x, y + r - c, x + r - c, y, x + r, y),
    closePath(),
  ];
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): PDFOperator[] {
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  return [
    moveTo(cx - rx, cy),
    appendBezierCurve(cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry),
    appendBezierCurve(cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy),
    appendBezierCurve(cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry),
    appendBezierCurve(cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy),
    closePath(),
  ];
}

function strokeOps(s: Stroke, path: (inset: number) => PDFOperator[]): PDFOperator[] {
  const ops: PDFOperator[] = [];
  for (const { inset, width } of strokeInsets(s)) {
    ops.push(
      ...path(inset),
      setLineWidth(width),
      setStrokingRgbColor(...rgb(s.color)),
      setDashPattern(dashArray(s, width) ?? [], 0),
      stroke(),
    );
  }
  ops.push(setDashPattern([], 0));
  return ops;
}

class PageWriter {
  fontNames = new Map<string, PDFName>();
  imageNames = new Map<string, PDFName>();
  gsNames = new Map<number, PDFName>();
  constructor(
    private page: PDFPage,
    private doc: PDFDocument,
    private fonts: Map<string, PDFFont>,
    private images: Map<string, PDFImage>,
  ) {}
  font(file: string): { name: PDFName; font: PDFFont } | null {
    const font = this.fonts.get(file);
    if (!font) return null;
    let n = this.fontNames.get(file);
    if (!n) {
      n = this.page.node.newFontDictionary("F", font.ref);
      this.fontNames.set(file, n);
    }
    return { name: n, font };
  }
  image(id: string) {
    const img = this.images.get(id);
    if (!img) return null;
    let n = this.imageNames.get(id);
    if (!n) {
      n = this.page.node.newXObject("Im", img.ref);
      this.imageNames.set(id, n);
    }
    return n;
  }
  gs(opacity: number) {
    const key = Math.round(opacity * 1000);
    let n = this.gsNames.get(key);
    if (!n) {
      n = this.page.node.newExtGState(
        "GS",
        this.doc.context.obj({ Type: "ExtGState", ca: key / 1000, CA: key / 1000 }),
      );
      this.gsNames.set(key, n);
    }
    return n;
  }
}

function itemOps(w: PageWriter, it: DLItem, warnings: Set<string>): PDFOperator[] {
  switch (it.t) {
    case "rect": {
      const ops: PDFOperator[] = [];
      if (it.fill)
        ops.push(
          setFillingRgbColor(...rgb(it.fill)),
          ...roundRectPath(it.x, it.y, it.w, it.h, it.r),
          fill(),
        );
      if (it.stroke)
        ops.push(
          ...strokeOps(it.stroke, (i) =>
            roundRectPath(it.x + i, it.y + i, it.w - 2 * i, it.h - 2 * i, Math.max(0, it.r - i)),
          ),
        );
      return ops;
    }
    case "ellipse": {
      const ops: PDFOperator[] = [];
      const cx = it.x + it.w / 2;
      const cy = it.y + it.h / 2;
      if (it.fill)
        ops.push(
          setFillingRgbColor(...rgb(it.fill)),
          ...ellipsePath(cx, cy, it.w / 2, it.h / 2),
          fill(),
        );
      if (it.stroke)
        ops.push(
          ...strokeOps(it.stroke, (i) =>
            ellipsePath(cx, cy, Math.max(0, it.w / 2 - i), Math.max(0, it.h / 2 - i)),
          ),
        );
      return ops;
    }
    case "line": {
      const s = it.stroke;
      const parts = s.dash === "double" ? [-s.width / 3, s.width / 3] : [0];
      const lw = s.dash === "double" ? s.width / 3 : s.width;
      const len = Math.hypot(it.x2 - it.x1, it.y2 - it.y1) || 1;
      const nx = -(it.y2 - it.y1) / len;
      const ny = (it.x2 - it.x1) / len;
      const ops: PDFOperator[] = [
        setLineWidth(lw),
        setStrokingRgbColor(...rgb(s.color)),
        setDashPattern(dashArray(s, lw) ?? [], 0),
      ];
      for (const off of parts)
        ops.push(
          moveTo(it.x1 + nx * off, it.y1 + ny * off),
          lineTo(it.x2 + nx * off, it.y2 + ny * off),
          stroke(),
        );
      ops.push(setDashPattern([], 0));
      return ops;
    }
    case "image": {
      const name = w.image(it.assetId);
      if (!name) {
        warnings.add("部分图片缺失，已留空");
        return [];
      }
      const d = it.dest;
      return [
        pushGraphicsState(),
        ...roundRectPath(it.clip.x, it.clip.y, it.clip.w, it.clip.h, it.clip.r),
        clip(),
        endPath(),
        concatTransformationMatrix(d.w, 0, 0, -d.h, d.x, d.y + d.h),
        drawObject(name),
        popGraphicsState(),
      ];
    }
    case "placeholder":
      return [];
    case "text": {
      const f = w.font(it.face);
      if (!f) {
        warnings.add(`字体文件不可用：${it.face}`);
        return [];
      }
      const ops: PDFOperator[] = [
        beginText(),
        setFillingRgbColor(...rgb(it.color)),
        setFontAndSize(f.name, it.size),
        setCharacterSpacing(it.spacing),
      ];
      if (it.synthBold)
        ops.push(
          setTextRenderingMode(TextRenderingMode.FillAndOutline),
          setLineWidth(it.size * SYNTH_BOLD),
          setStrokingRgbColor(...rgb(it.color)),
        );
      ops.push(
        setTextMatrix(1, 0, it.italic ? ITALIC_SKEW : 0, -1, it.x, it.baseline),
        showText(f.font.encodeText(it.text)),
      );
      if (it.synthBold) ops.push(setTextRenderingMode(TextRenderingMode.Fill));
      ops.push(endText());
      return ops;
    }
  }
}

const PS_NAMES: Record<string, string> = {
  "noto-sans-sc-400": "NotoSansSC-Regular",
  "noto-sans-sc-700": "NotoSansSC-Bold",
  "noto-serif-sc-400": "NotoSerifSC-Regular",
  "noto-serif-sc-700": "NotoSerifSC-Bold",
  "noto-serif-sc-900": "NotoSerifSC-Black",
  "lxgw-wenkai-400": "LXGWWenKai-Regular",
  "ma-shan-zheng-400": "MaShanZheng-Regular",
  "zcool-xiaowei-400": "ZCOOLXiaoWei-Regular",
};

const NO_FEATURES = {
  liga: false,
  clig: false,
  dlig: false,
  calt: false,
  kern: false,
  palt: false,
  halt: false,
  vert: false,
} as Record<string, boolean>;

async function run(job: PdfJob) {
  const post = (m: PdfMsg, t?: Transferable[]) =>
    (self as DedicatedWorkerGlobalScope).postMessage(m, t ?? []);
  const warnings = new Set<string>();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(job.title);
  doc.setCreator("版心 · 本地排版");
  doc.setProducer("版心 · 本地排版（pdf-lib）");
  const total = job.fonts.length + job.images.length + job.pages.length;
  let done = 0;
  const fonts = new Map<string, PDFFont>();
  for (const f of job.fonts) {
    post({ type: "progress", stage: "嵌入字体", done, total });
    let bytes: ArrayBuffer;
    try {
      if ("bytes" in f) bytes = f.bytes;
      else {
        const r = await fetch(f.url);
        if (!r.ok) throw new Error(String(r.status));
        bytes = await r.arrayBuffer();
      }
    } catch {
      throw new Error(`无法读取字体文件（${f.file}）。请联网后在编辑器中加载一次该字体再导出。`);
    }
    // collect every character drawn with this face, subset with HarfBuzz, embed the result whole
    let chars = " ";
    for (const p of job.pages)
      for (const g of p.groups)
        for (const it of g.items) if (it.t === "text" && it.face === f.file) chars += it.text;
    const flags = "bytes" in f ? embeddingFlags(bytes) : 0;
    if ((flags & 0x000e) === 0x0002 || flags & 0x0200)
      throw new Error(
        `本机字体“${"name" in f ? f.name : f.file}”设置了嵌入限制，无法用于 PDF。请换用网站字体或其他允许嵌入的字体。`,
      );
    const sub = flags & 0x0100 ? new Uint8Array(bytes) : await subsetFont(bytes, chars);
    fonts.set(
      f.file,
      await doc.embedFont(sub, {
        subset: false,
        features: NO_FEATURES,
        customName: PS_NAMES[f.file],
      }),
    );
    done++;
  }
  const images = new Map<string, PDFImage>();
  for (const im of job.images) {
    post({ type: "progress", stage: "嵌入图片", done, total });
    try {
      images.set(
        im.id,
        im.kind === "png" ? await doc.embedPng(im.bytes) : await doc.embedJpg(im.bytes),
      );
    } catch {
      warnings.add("有图片无法嵌入（文件可能已损坏），已留空");
    }
    done++;
  }
  for (const pdl of job.pages) {
    post({ type: "progress", stage: "生成页面", done, total });
    const page = doc.addPage([pdl.width * K, pdl.height * K]);
    const w = new PageWriter(page, doc, fonts, images);
    const ops: PDFOperator[] = [
      pushGraphicsState(),
      concatTransformationMatrix(K, 0, 0, -K, 0, pdl.height * K),
    ];
    if (pdl.background && pdl.background !== "#ffffff")
      ops.push(
        setFillingRgbColor(...rgb(pdl.background)),
        rectangle(0, 0, pdl.width, pdl.height),
        fill(),
      );
    for (const g of pdl.groups) {
      ops.push(pushGraphicsState());
      if (g.opacity < 1) ops.push(setGraphicsState(w.gs(g.opacity)));
      const a = (g.rotation * Math.PI) / 180;
      const cx = g.x + g.w / 2;
      const cy = g.y + g.h / 2;
      ops.push(concatTransformationMatrix(1, 0, 0, 1, cx, cy));
      if (g.rotation)
        ops.push(
          concatTransformationMatrix(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0),
        );
      ops.push(concatTransformationMatrix(1, 0, 0, 1, -g.w / 2, -g.h / 2));
      for (const it of g.items) ops.push(...itemOps(w, it, warnings));
      ops.push(popGraphicsState());
    }
    ops.push(popGraphicsState());
    page.pushOperators(...ops);
    done++;
  }
  // glyph coverage check
  for (const [file, f] of fonts) {
    const fk = (f as any).embedder?.font;
    if (!fk) continue;
    const missing = new Set<string>();
    for (const p of job.pages)
      for (const g of p.groups)
        for (const it of g.items)
          if (it.t === "text" && it.face === file)
            for (const ch of it.text)
              if (!fk.hasGlyphForCodePoint(ch.codePointAt(0))) missing.add(ch);
    if (missing.size)
      warnings.add(`字体缺少以下字符，PDF 中将无法显示：${[...missing].slice(0, 30).join(" ")}`);
  }
  post({ type: "progress", stage: "写入文件", done, total });
  const bytes = await doc.save({ useObjectStreams: true });
  const buf = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  post({ type: "done", bytes: buf, warnings: [...warnings] }, [buf]);
}

self.onmessage = (e: MessageEvent<PdfJob>) => {
  run(e.data).catch((err) =>
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: "error",
      message:
        (err?.message || String(err)) +
        (!__BX_BUILT__ && err?.stack
          ? ` [${String(err.stack).split("\n").slice(0, 6).join(" | ")}]`
          : ""),
    } satisfies PdfMsg),
  );
};
