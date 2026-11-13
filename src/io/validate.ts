// Validation and sanitisation of untrusted document data (project files, clipboard).
// Everything is rebuilt field by field from a whitelist; unknown fields are dropped and
// nothing is ever evaluated or injected as HTML.
import type {
  AssetMeta,
  Doc,
  DocKind,
  FontWeight,
  ImageElement,
  Page,
  PageElement,
  ShapeElement,
  Stroke,
  TextElement,
  TextStyle,
  TextStylePreset,
} from "../model/types";
import { FORMAT_VERSION } from "../model/types";
import { BASE_STYLE, defaultTextStyles } from "../model/defaults";
import { uid } from "../model/units";

export class ValidationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ValidationError";
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
function num(v: unknown, def: number, min = -1e5, max = 1e5): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
function str(v: unknown, def = "", max = 200): string {
  return typeof v === "string" ? v.slice(0, max) : def;
}
const ID_RE = /^[A-Za-z0-9:_\-.]{1,80}$/;
function id(v: unknown, prefix: string): string {
  return typeof v === "string" && ID_RE.test(v) ? v : uid(prefix);
}
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
function color(v: unknown, def: string): string {
  return typeof v === "string" && COLOR_RE.test(v) ? v.toLowerCase() : def;
}
function colorOrNull(v: unknown): string | null {
  return typeof v === "string" && COLOR_RE.test(v) ? v.toLowerCase() : null;
}
function oneOf<T extends string>(v: unknown, list: readonly T[], def: T): T {
  return list.includes(v as T) ? (v as T) : def;
}
const ASSET_ID_RE = /^[a-f0-9]{64}$|^tpl:[a-z0-9-]{1,40}$/;

export function sanitizeStyle(v: unknown): TextStyle {
  const o = isObj(v) ? v : {};
  const w = num(o.fontWeight, 400);
  return {
    fontFamily:
      typeof o.fontFamily === "string" && /^[\w\- ]{1,60}$/.test(o.fontFamily)
        ? o.fontFamily
        : BASE_STYLE.fontFamily,
    fontSize: num(o.fontSize, BASE_STYLE.fontSize, 2, 600),
    fontWeight: (w >= 800 ? 900 : w >= 600 ? 700 : 400) as FontWeight,
    italic: o.italic === true,
    underline: o.underline === true,
    color: color(o.color, BASE_STYLE.color),
    align: oneOf(o.align, ["left", "center", "right", "justify"] as const, "justify"),
    lineHeight: num(o.lineHeight, 1.6, 0.6, 5),
    letterSpacing: num(o.letterSpacing, 0, -0.5, 3),
    spaceBefore: num(o.spaceBefore, 0, 0, 200),
    spaceAfter: num(o.spaceAfter, 0, 0, 200),
    indent: num(o.indent, 0, 0, 20),
  };
}

function sanitizeStroke(v: unknown): Stroke | null {
  if (!isObj(v)) return null;
  return {
    color: color(v.color, "#1f1f1f"),
    width: num(v.width, 0.5, 0.05, 50),
    dash: oneOf(v.dash, ["solid", "dashed", "dotted", "double"] as const, "solid"),
  };
}

export function sanitizeElement(v: unknown): PageElement | null {
  if (!isObj(v)) return null;
  const base = {
    id: id(v.id, "e"),
    name: typeof v.name === "string" ? v.name.slice(0, 80) : undefined,
    x: num(v.x, 0, -5000, 5000),
    y: num(v.y, 0, -5000, 5000),
    w: num(v.w, 10, 0.5, 5000),
    h: num(v.h, 10, 0.5, 5000),
    rotation: num(v.rotation, 0, -360, 360),
    opacity: num(v.opacity, 1, 0, 1),
    locked: v.locked === true || undefined,
    hidden: v.hidden === true || undefined,
    groupId: typeof v.groupId === "string" && ID_RE.test(v.groupId) ? v.groupId : undefined,
  };
  if (v.type === "text") {
    const el: TextElement = {
      ...base,
      type: "text",
      text: str(v.text, "", 200000).replace(/\r\n?/g, "\n"),
      style: sanitizeStyle(v.style),
      styleId: typeof v.styleId === "string" && ID_RE.test(v.styleId) ? v.styleId : undefined,
      columns: Math.round(num(v.columns, 1, 1, 12)),
      columnGap: num(v.columnGap, 5, 0, 100),
      columnRule: v.columnRule === true || undefined,
      padding: num(v.padding, 0, 0, 100),
      verticalAlign: oneOf(v.verticalAlign, ["top", "middle", "bottom"] as const, "top"),
      fill: colorOrNull(v.fill),
      stroke: sanitizeStroke(v.stroke),
    };
    return el;
  }
  if (v.type === "image") {
    const c = isObj(v.crop) ? v.crop : {};
    const el: ImageElement = {
      ...base,
      type: "image",
      assetId: typeof v.assetId === "string" && ASSET_ID_RE.test(v.assetId) ? v.assetId : null,
      crop: {
        x: num(c.x, 0, -20000, 20000),
        y: num(c.y, 0, -20000, 20000),
        w: num(c.w, base.w, 0.1, 50000),
        h: num(c.h, base.h, 0.1, 50000),
      },
      keepRatio: v.keepRatio !== false,
      radius: num(v.radius, 0, 0, 1000),
      stroke: sanitizeStroke(v.stroke),
    };
    return el;
  }
  if (v.type === "shape") {
    const el: ShapeElement = {
      ...base,
      type: "shape",
      shape: oneOf(v.shape, ["rect", "ellipse", "line"] as const, "rect"),
      fill: colorOrNull(v.fill),
      stroke: sanitizeStroke(v.stroke),
      radius: num(v.radius, 0, 0, 1000),
    };
    return el;
  }
  return null;
}

function sanitizePage(v: unknown): Page {
  const o = isObj(v) ? v : {};
  const g = isObj(o.guides) ? o.guides : {};
  const nums = (a: unknown) =>
    Array.isArray(a)
      ? a
          .slice(0, 200)
          .map((x) => num(x, NaN))
          .filter(Number.isFinite)
      : [];
  const elements = (Array.isArray(o.elements) ? o.elements.slice(0, 5000) : [])
    .map(sanitizeElement)
    .filter(Boolean) as PageElement[];
  // element ids must be unique within a page
  const seen = new Set<string>();
  for (const e of elements) {
    if (seen.has(e.id)) e.id = uid(e.type[0]);
    seen.add(e.id);
  }
  return {
    id: id(o.id, "p"),
    background: color(o.background, "#ffffff"),
    elements,
    guides: { x: nums(g.x), y: nums(g.y) },
  };
}

export function sanitizeAssets(v: unknown): Record<string, AssetMeta> {
  const out: Record<string, AssetMeta> = {};
  if (!isObj(v)) return out;
  for (const [k, a] of Object.entries(v)) {
    if (!ASSET_ID_RE.test(k) || !isObj(a)) continue;
    out[k] = {
      id: k,
      mime: oneOf(
        a.mime,
        ["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"] as const,
        "image/jpeg",
      ),
      width: num(a.width, 1, 1, 100000),
      height: num(a.height, 1, 1, 100000),
      name: str(a.name, "image"),
      size: num(a.size, 0, 0, 1e10),
    };
  }
  return out;
}

export function sanitizeDoc(v: unknown): Doc {
  if (!isObj(v)) throw new ValidationError("工程数据格式不正确");
  const fv = num(v.formatVersion, NaN);
  if (!Number.isFinite(fv)) throw new ValidationError("工程缺少格式版本信息");
  if (fv > FORMAT_VERSION)
    throw new ValidationError(
      `此工程由更新版本的程序创建（格式版本 ${fv}），当前程序仅支持到版本 ${FORMAT_VERSION}，请更新后再导入`,
    );
  if (!Array.isArray(v.pages) || v.pages.length === 0)
    throw new ValidationError("工程中没有任何页面");
  if (v.pages.length > 2000) throw new ValidationError("工程页数异常");
  const ps = isObj(v.pageSize) ? v.pageSize : {};
  const m = isObj(v.margins) ? v.margins : {};
  const presetsRaw = Array.isArray(v.textStyles) ? v.textStyles.slice(0, 200) : [];
  const textStyles: TextStylePreset[] = presetsRaw
    .filter(isObj)
    .map((p) => ({
      id: id(p.id, "st"),
      name: str(p.name, "样式", 40),
      style: sanitizeStyle(p.style),
    }));
  const pages = v.pages.map(sanitizePage);
  const seen = new Set<string>();
  for (const p of pages) {
    if (seen.has(p.id)) p.id = uid("p");
    seen.add(p.id);
  }
  const now = Date.now();
  return {
    formatVersion: FORMAT_VERSION,
    id: id(v.id, "d"),
    name: str(v.name, "导入的作品", 120) || "导入的作品",
    kind: oneOf(
      v.kind,
      ["newspaper", "magazine", "album", "manual", "blank"] as const,
      "blank",
    ) as DocKind,
    pageSize: { width: num(ps.width, 210, 20, 2000), height: num(ps.height, 297, 20, 2000) },
    sizeLabel: typeof v.sizeLabel === "string" ? v.sizeLabel.slice(0, 60) : undefined,
    margins: {
      top: num(m.top, 15, 0, 500),
      right: num(m.right, 15, 0, 500),
      bottom: num(m.bottom, 15, 0, 500),
      left: num(m.left, 15, 0, 500),
    },
    pages,
    textStyles: textStyles.length ? textStyles : defaultTextStyles(),
    assets: sanitizeAssets(v.assets),
    createdAt: num(v.createdAt, now, 0, 1e14),
    updatedAt: num(v.updatedAt, now, 0, 1e14),
  };
}
