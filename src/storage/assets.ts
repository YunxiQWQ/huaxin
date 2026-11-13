import { db, type AssetRecord } from "./db";
import type { AssetMeta } from "../model/types";

export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/bmp",
];
const PREVIEW_MAX = 1800;

export async function sha256(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Detect image type from magic bytes; never trust the file name or declared type. */
export function sniffImage(buf: ArrayBuffer): string | null {
  const b = new Uint8Array(buf.slice(0, 16));
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x42 && b[1] === 0x4d) return "image/bmp";
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return "image/webp";
  return null;
}

async function makePreview(bitmap: ImageBitmap, mime: string): Promise<Blob | null> {
  const long = Math.max(bitmap.width, bitmap.height);
  if (
    long <= PREVIEW_MAX &&
    (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp")
  )
    return null;
  const k = Math.min(1, PREVIEW_MAX / long);
  const c = new OffscreenCanvas(
    Math.max(1, Math.round(bitmap.width * k)),
    Math.max(1, Math.round(bitmap.height * k)),
  );
  const ctx = c.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  return c.convertToBlob({ type: "image/webp", quality: 0.85 });
}

/** Store an image (deduplicated by SHA-256). Returns its metadata. */
export async function importImageBytes(
  buf: ArrayBuffer,
  name: string,
  knownId?: string,
): Promise<AssetMeta> {
  const mime = sniffImage(buf);
  if (!mime) throw new Error(`“${name}” 不是受支持的图片格式（支持 PNG、JPEG、WebP、GIF、BMP）`);
  const id = knownId ?? (await sha256(buf));
  const d = await db();
  const existing = await d.get("assets", id);
  if (existing) {
    const { blob: _b, preview: _p, createdAt: _c, ...meta } = existing;
    return meta;
  }
  const blob = new Blob([buf], { type: mime });
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error(`无法解码图片“${name}”，文件可能已损坏`);
  }
  const preview = await makePreview(bitmap, mime);
  const rec: AssetRecord = {
    id,
    mime,
    width: bitmap.width,
    height: bitmap.height,
    name: name.slice(0, 200),
    size: buf.byteLength,
    blob,
    preview,
    createdAt: Date.now(),
  };
  bitmap.close();
  await d.put("assets", rec);
  const { blob: _b, preview: _p, createdAt: _c, ...meta } = rec;
  return meta;
}

export async function importImageFile(file: File): Promise<AssetMeta> {
  return importImageBytes(await file.arrayBuffer(), file.name);
}

export async function getAsset(id: string): Promise<AssetRecord | undefined> {
  return (await db()).get("assets", id);
}

export async function hasAssets(ids: string[]): Promise<Set<string>> {
  const d = await db();
  const tx = d.transaction("assets");
  const found = new Set<string>();
  await Promise.all(ids.map(async (id) => ((await tx.store.getKey(id)) ? found.add(id) : null)));
  return found;
}

// ---- object URL cache for display ----
const urlCache = new Map<string, string>();
const urlPending = new Map<string, Promise<string | null>>();
const listeners = new Set<() => void>();

export function isTemplateAsset(id: string) {
  return id.startsWith("tpl:");
}
export function templateAssetUrl(id: string) {
  return `${import.meta.env.BASE_URL}templates/img/${id.slice(4)}.jpg`;
}

export function cachedAssetUrl(id: string): string | null | undefined {
  if (isTemplateAsset(id)) return templateAssetUrl(id);
  return urlCache.get(id);
}

export function subscribeAssetUrls(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function loadAssetUrl(id: string): Promise<string | null> {
  if (isTemplateAsset(id)) return Promise.resolve(templateAssetUrl(id));
  const hit = urlCache.get(id);
  if (hit !== undefined) return Promise.resolve(hit);
  let p = urlPending.get(id);
  if (!p) {
    p = getAsset(id).then((rec) => {
      const url = rec ? URL.createObjectURL(rec.preview ?? rec.blob) : "";
      urlCache.set(id, url);
      listeners.forEach((l) => l());
      return url || null;
    });
    urlPending.set(id, p);
  }
  return p;
}

/** Full resolution bytes for export; template assets are fetched from the site. */
export async function assetBytes(id: string): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  if (isTemplateAsset(id)) {
    const r = await fetch(templateAssetUrl(id));
    if (!r.ok) return null;
    return { bytes: await r.arrayBuffer(), mime: "image/jpeg" };
  }
  const rec = await getAsset(id);
  if (!rec) return null;
  return { bytes: await rec.blob.arrayBuffer(), mime: rec.mime };
}

const bitmapCache = new Map<string, Promise<ImageBitmap | null>>();
/** Decoded bitmap for raster rendering. `full` uses the original, otherwise the preview. */
export function assetBitmap(id: string, full: boolean): Promise<ImageBitmap | null> {
  const key = `${id}|${full ? "f" : "p"}`;
  let p = bitmapCache.get(key);
  if (!p) {
    p = (async () => {
      try {
        if (isTemplateAsset(id)) {
          const r = await fetch(templateAssetUrl(id));
          return r.ok ? await createImageBitmap(await r.blob()) : null;
        }
        const rec = await getAsset(id);
        if (!rec) return null;
        return await createImageBitmap(full ? rec.blob : (rec.preview ?? rec.blob));
      } catch {
        return null;
      }
    })();
    if (!full) bitmapCache.set(key, p);
  }
  return p;
}
