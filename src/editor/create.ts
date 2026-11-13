import type { AssetMeta, ImageElement, PageElement, ShapeElement } from "../model/types";
import { coverCrop, makeImage, makeShape, makeText } from "../model/defaults";
import { addElements, updateElement } from "./commands";
import { commit, currentPage, getState } from "./store";
import { ACCEPTED_IMAGE_TYPES, importImageFile } from "../storage/assets";
import { toast } from "../ui/toast";
import { ensureFace } from "../fonts/loader";
import { resolveFace } from "../fonts/registry";
import type { Pt } from "./geometry";

function contentBox() {
  const d = getState().doc;
  const m = d.margins;
  return {
    x: m.left,
    y: m.top,
    w: d.pageSize.width - m.left - m.right,
    h: d.pageSize.height - m.top - m.bottom,
  };
}

export const SAMPLE_TEXT: Record<string, string> = {
  masthead: "报头名称",
  issue: "第 1 期",
  date: "2025年3月18日　星期二",
  folio: "第一版　要闻",
  kicker: "引题：一句话交代背景",
  headline: "在此输入主标题",
  subhead: "小标题",
  lead: "导语：用一两句话概括新闻要点，交代时间、地点、人物与事件。",
  body: "在此输入或粘贴正文。正文会按栏顺序连续排版，文字排不下时文本框右下角会出现红色溢出标记。",
  caption: "▲ 图片说明文字。　摄影：",
  column: "栏目名",
  byline: "本报记者　某某",
};

export function addTextBox(presetId: string, text?: string, opts: { columns?: number } = {}) {
  const s = getState();
  const preset = s.doc.textStyles.find((p) => p.id === presetId) ?? s.doc.textStyles[0];
  const cb = contentBox();
  const isBody = presetId === "body" || presetId === "lead";
  const w = isBody
    ? cb.w
    : Math.min(cb.w, presetId === "headline" || presetId === "masthead" ? cb.w : cb.w / 2);
  const fsMm = (preset.style.fontSize * 25.4) / 72;
  const lines = isBody ? 12 : presetId === "masthead" ? 1.2 : 1.5;
  const h = Math.min(cb.h, Math.max(fsMm * preset.style.lineHeight * lines, 8));
  const el = makeText({
    x: cb.x + (cb.w - w) / 2,
    y: cb.y + cb.h * 0.25,
    w,
    h,
    text: text ?? SAMPLE_TEXT[presetId] ?? "文字",
    style: { ...preset.style },
    styleId: preset.id,
    columns: opts.columns ?? (isBody && cb.w > 150 ? 3 : 1),
  });
  void ensureFace(resolveFace(el.style.fontFamily, el.style.fontWeight).face.file);
  addElements([el]);
  return el;
}

export function addShape(kind: "rect" | "ellipse" | "line" | "frame") {
  const cb = contentBox();
  const size = Math.min(cb.w, cb.h) / 4;
  let el: ShapeElement;
  if (kind === "line")
    el = makeShape({
      shape: "line",
      x: cb.x + cb.w / 2 - size,
      y: cb.y + cb.h / 3,
      w: size * 2,
      h: 2,
      stroke: { color: "#1f1f1f", width: 0.5, dash: "solid" },
    });
  else if (kind === "frame")
    el = makeShape({
      shape: "rect",
      x: cb.x + cb.w / 2 - size,
      y: cb.y + cb.h / 3,
      w: size * 2,
      h: size * 1.3,
      fill: null,
      stroke: { color: "#b3261e", width: 0.6, dash: "solid" },
    });
  else
    el = makeShape({
      shape: kind,
      x: cb.x + cb.w / 2 - size / 2,
      y: cb.y + cb.h / 3,
      w: size,
      h: size,
    });
  addElements([el]);
}

export function addEmptyImageFrame() {
  const cb = contentBox();
  const w = cb.w / 2;
  addElements([makeImage({ x: cb.x + cb.w / 4, y: cb.y + cb.h / 4, w, h: w * 0.66 })]);
}

function registerAsset(meta: AssetMeta) {
  const d = getState().doc;
  if (d.assets[meta.id]) return;
  commit((doc) => ({ ...doc, assets: { ...doc.assets, [meta.id]: meta } }), {
    merge: "asset-register",
  });
}

export function imageElementFor(meta: AssetMeta, at?: Pt): ImageElement {
  const d = getState().doc;
  const cb = contentBox();
  const maxW = cb.w * 0.5;
  const maxH = cb.h * 0.5;
  const r = Math.min(maxW / meta.width, maxH / meta.height);
  const w = meta.width * r;
  const h = meta.height * r;
  const x = at ? Math.min(Math.max(0, at.x - w / 2), d.pageSize.width - w) : cb.x + (cb.w - w) / 2;
  const y = at ? Math.min(Math.max(0, at.y - h / 2), d.pageSize.height - h) : cb.y + (cb.h - h) / 3;
  return makeImage({ x, y, w, h, assetId: meta.id, crop: { x: 0, y: 0, w, h }, name: meta.name });
}

export function placeAsset(meta: AssetMeta, at?: Pt) {
  registerAsset(meta);
  addElements([imageElementFor(meta, at)]);
}

/** Replace the picture of an image frame, keeping frame position and size. */
export function replaceImage(id: string, meta: AssetMeta) {
  registerAsset(meta);
  const el = currentPage().elements.find((e) => e.id === id);
  if (!el || el.type !== "image") return;
  updateElement(id, {
    assetId: meta.id,
    crop: coverCrop(el.w, el.h, meta.width, meta.height),
    name: meta.name,
  } as Partial<PageElement>);
}

export async function importImages(files: File[]): Promise<AssetMeta[]> {
  const out: AssetMeta[] = [];
  for (const f of files) {
    if (f.type && !ACCEPTED_IMAGE_TYPES.includes(f.type)) {
      toast("warn", `已跳过“${f.name}”：仅支持 PNG、JPEG、WebP、GIF、BMP 图片`);
      continue;
    }
    try {
      out.push(await importImageFile(f));
    } catch (e: any) {
      toast("error", e?.message ?? `图片“${f.name}”导入失败`);
    }
  }
  for (const m of out) registerAsset(m);
  return out;
}

export async function addImagesFromFiles(files: File[], at?: Pt, targetId?: string) {
  const metas = await importImages(files);
  if (!metas.length) return;
  if (targetId && metas.length === 1) return replaceImage(targetId, metas[0]);
  const els = metas.map((m, i) =>
    imageElementFor(m, at ? { x: at.x + i * 8, y: at.y + i * 8 } : undefined),
  );
  addElements(els);
}

export function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.click();
  });
}

export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/bmp";
