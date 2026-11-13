import { strToU8, strFromU8, unzip, zip, type Unzipped, type Zippable } from "fflate";
import type { Doc, ImageElement } from "../model/types";
import { FORMAT_VERSION } from "../model/types";
import { assetBytes, importImageBytes, sha256, sniffImage } from "../storage/assets";
import { sanitizeDoc, ValidationError } from "./validate";
import { FONT_FAMILIES, getFamily } from "../fonts/registry";
import { uid } from "../model/units";

export const PROJECT_EXT = ".bxproj";
export const PROJECT_FORMAT = "banxin-project";
const MAX_FILE = 300 * 1024 * 1024;
const MAX_TOTAL = 1024 * 1024 * 1024;

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
};

export interface ProjectManifest {
  format: typeof PROJECT_FORMAT;
  formatVersion: number;
  app: string;
  exportedAt: string;
  name: string;
  pageCount: number;
  pageSize: { width: number; height: number };
  assets: { id: string; path: string; mime: string; size: number; sha256: string }[];
  fonts: { id: string; name: string; embedded: boolean; note: string }[];
}

export function usedAssetIds(doc: Doc): string[] {
  const ids = new Set<string>();
  for (const p of doc.pages)
    for (const e of p.elements) if (e.type === "image" && e.assetId) ids.add(e.assetId);
  return [...ids];
}

export async function buildProjectPackage(
  doc: Doc,
  onProgress?: (done: number, total: number) => void,
): Promise<{ blob: Blob; missing: number }> {
  const ids = usedAssetIds(doc);
  const files: Zippable = {};
  const manifestAssets: ProjectManifest["assets"] = [];
  let missing = 0;
  let i = 0;
  for (const id of ids) {
    onProgress?.(i++, ids.length);
    const a = await assetBytes(id);
    if (!a) {
      missing++;
      continue;
    }
    const hash = id.startsWith("tpl:") ? await sha256(a.bytes) : id;
    const path = `assets/${id.replace(":", "_")}.${EXT[a.mime] ?? "bin"}`;
    files[path] = [new Uint8Array(a.bytes), { level: 0 }];
    manifestAssets.push({ id, path, mime: a.mime, size: a.bytes.byteLength, sha256: hash });
  }
  const usedFonts = new Set<string>();
  for (const p of doc.pages)
    for (const e of p.elements) if (e.type === "text") usedFonts.add(e.style.fontFamily);
  const manifest: ProjectManifest = {
    format: PROJECT_FORMAT,
    formatVersion: FORMAT_VERSION,
    app: "版心 · 本地排版",
    exportedAt: new Date().toISOString(),
    name: doc.name,
    pageCount: doc.pages.length,
    pageSize: doc.pageSize,
    assets: manifestAssets,
    // 内置字体由程序站点提供，工程只记录名称；不打包字体文件。
    fonts: [...usedFonts].map((id) => ({
      id,
      name: getFamily(id)?.name ?? id,
      embedded: false,
      note: getFamily(id) ? "程序内置开源字体，按名称引用" : "程序中不存在此字体",
    })),
  };
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  files["document.json"] = strToU8(JSON.stringify(doc));
  files["README.txt"] = strToU8(
    `这是“版心 · 本地排版”的工程文件。\n请在版心中选择“导入工程”继续编辑。\n格式版本：${FORMAT_VERSION}\n导出时间：${manifest.exportedAt}\n内置字体：${FONT_FAMILIES.map((f) => f.name).join("、")}（SIL OFL 1.1，随程序站点提供，工程内仅记录名称）\n`,
  );
  onProgress?.(ids.length, ids.length);
  const data = await new Promise<Uint8Array>((res, rej) =>
    zip(files, { level: 6 }, (err, out) => (err ? rej(err) : res(out))),
  );
  return { blob: new Blob([data as BlobPart], { type: "application/zip" }), missing };
}

export interface ImportResult {
  doc: Doc;
  warnings: string[];
}

function unzipSafe(bytes: Uint8Array): Promise<Unzipped> {
  let total = 0;
  return new Promise((res, rej) =>
    unzip(
      bytes,
      {
        filter: (f) => {
          const ok =
            f.name === "manifest.json" ||
            f.name === "document.json" ||
            /^assets\/[A-Za-z0-9_\-.]+$/.test(f.name);
          if (!ok) return false;
          total += f.originalSize;
          if (f.originalSize > MAX_FILE || total > MAX_TOTAL)
            throw new ValidationError("工程文件中的数据量异常，已停止导入");
          return true;
        },
      },
      (err, out) => (err ? rej(err) : res(out)),
    ),
  );
}

/** Read and validate a project package. Never touches the current project. */
export async function readProjectPackage(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<ImportResult> {
  if (file.size > MAX_TOTAL) throw new ValidationError("文件过大，无法导入");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b))
    throw new ValidationError("这不是版心工程文件（文件格式不正确或已损坏）");
  onProgress?.("正在解压工程包…");
  let files: Unzipped;
  try {
    files = await unzipSafe(bytes);
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    throw new ValidationError("工程文件已损坏，无法解压");
  }
  if (!files["manifest.json"] || !files["document.json"])
    throw new ValidationError(
      "工程包缺少必要内容（manifest.json / document.json），可能不是版心工程或已损坏",
    );
  let manifest: Partial<ProjectManifest>;
  let rawDoc: unknown;
  try {
    manifest = JSON.parse(strFromU8(files["manifest.json"]));
    rawDoc = JSON.parse(strFromU8(files["document.json"]));
  } catch {
    throw new ValidationError("工程数据无法解析，文件可能已损坏");
  }
  if (manifest.format !== PROJECT_FORMAT) throw new ValidationError("这不是版心工程文件");
  if (typeof manifest.formatVersion !== "number") throw new ValidationError("工程缺少格式版本信息");
  if (manifest.formatVersion > FORMAT_VERSION)
    throw new ValidationError(
      `此工程由更新版本的程序创建（格式版本 ${manifest.formatVersion}），当前仅支持到版本 ${FORMAT_VERSION}`,
    );
  const doc = sanitizeDoc(rawDoc);
  const warnings: string[] = [];

  // resolve assets: verify bytes, content-address them, remap ids when needed
  const pathById = new Map<string, string>();
  for (const a of Array.isArray(manifest.assets) ? manifest.assets : [])
    if (a && typeof a.id === "string" && typeof a.path === "string") pathById.set(a.id, a.path);
  const remap = new Map<string, string | null>();
  const ids = usedAssetIds(doc);
  let k = 0;
  for (const id of ids) {
    onProgress?.(`正在导入图片 ${++k}/${ids.length}…`);
    const path =
      pathById.get(id) ??
      Object.keys(files).find((n) => n.startsWith(`assets/${id.replace(":", "_")}.`));
    const data = path ? files[path] : undefined;
    if (!data) {
      remap.set(id, null);
      continue;
    }
    const buf = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
    if (!sniffImage(buf)) {
      warnings.push("工程中有文件不是有效图片，已忽略");
      remap.set(id, null);
      continue;
    }
    try {
      const meta = await importImageBytes(buf, doc.assets[id]?.name ?? "image");
      if (meta.id !== id && !id.startsWith("tpl:"))
        warnings.push("有图片的校验值与记录不符，已按实际内容导入");
      remap.set(id, meta.id);
      doc.assets[meta.id] = meta;
    } catch (e: any) {
      warnings.push(e?.message ?? "图片导入失败");
      remap.set(id, null);
    }
  }
  const missing = [...remap.values()].filter((v) => v === null).length;
  if (missing)
    warnings.push(`${missing} 张图片在工程包中缺失或损坏，对应图框已保留，可重新替换图片`);
  for (const p of doc.pages)
    p.elements = p.elements.map((e) => {
      if (e.type !== "image" || !e.assetId || !remap.has(e.assetId)) return e;
      const nid = remap.get(e.assetId);
      return { ...e, assetId: nid ?? e.assetId } as ImageElement;
    });
  for (const key of Object.keys(doc.assets))
    if (!ids.some((id) => remap.get(id) === key)) delete doc.assets[key];
  const missingFonts = new Set<string>();
  for (const p of doc.pages)
    for (const e of p.elements)
      if (e.type === "text" && !getFamily(e.style.fontFamily)) missingFonts.add(e.style.fontFamily);
  if (missingFonts.size)
    warnings.push(
      `工程使用的字体在本程序中不可用：${[...missingFonts].join("、")}，将以思源宋体显示`,
    );
  // imported projects always become a new, independent work
  const now = Date.now();
  doc.id = uid("d");
  doc.createdAt = now;
  doc.updatedAt = now;
  return { doc, warnings };
}
