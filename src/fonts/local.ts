import { localFontId, registerLocalFamilies, type FontFamilyDef } from "./registry";
import type { FontWeight } from "../model/types";
import { extractCollectionFace } from "./sfnt";

interface LocalFontData {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
  blob(): Promise<Blob>;
}
type FontWindow = Window & { queryLocalFonts?: () => Promise<LocalFontData[]> };
const handles = new Map<string, LocalFontData>();
const loaded = new Map<string, Promise<{ bytes: ArrayBuffer; characterSet: Set<number> }>>();
const glyphs = new Map<string, Set<number>>();
const listeners = new Set<() => void>();
let restored: Promise<void> | undefined;

export function subscribeLocalFonts(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function localFontsSupported() {
  return window.isSecureContext && typeof (window as FontWindow).queryLocalFonts === "function";
}

function weightOf(style: string): FontWeight {
  if (/black|heavy|extra.?bold|特粗|超粗/i.test(style)) return 900;
  if (/bold|demi|semi|粗/i.test(style)) return 700;
  return 400;
}

/** Called only from the permission button, or after confirming permission is already granted. */
export async function enableLocalFonts(): Promise<number> {
  if (!localFontsSupported())
    throw new Error("本机字体需要在桌面版 Chrome / Edge 中，通过 HTTPS 或 localhost 使用。");
  let fonts: LocalFontData[];
  try {
    fonts = await (window as FontWindow).queryLocalFonts!();
  } catch (err) {
    const name = (err as Error).name;
    if (name === "NotAllowedError")
      throw new Error("未获得本机字体权限。可在浏览器的网站设置中允许后重试。");
    if (name === "SecurityError")
      throw new Error("浏览器阻止了字体访问，请在独立窗口中打开本站后重试。");
    throw new Error("无法读取本机字体，请重试。");
  }
  const families = new Map<string, FontFamilyDef>();
  const nextHandles = new Map<string, LocalFontData>();
  // Prefer upright regular faces to light/condensed variants of the same family.
  fonts.sort(
    (a, b) =>
      Number(!/^(regular|normal|常规|标准)$/i.test(a.style)) -
        Number(!/^(regular|normal|常规|标准)$/i.test(b.style)) ||
      a.postscriptName.localeCompare(b.postscriptName),
  );
  for (const f of fonts) {
    if (!f.family || !f.postscriptName || /italic|oblique|斜体/i.test(f.style)) continue;
    const id = localFontId(f.family);
    const file = localFontId(f.postscriptName);
    if (id.length > 518 || file.length > 518) continue;
    const weight = weightOf(f.style);
    let family = families.get(id);
    if (!family) {
      family = {
        id,
        name: f.family,
        category: "正文",
        css: `BX Local ${id.slice(6)}`,
        fallback: "serif",
        license: "本机字体，按其自身授权使用",
        source: "local",
        faces: [],
      };
      families.set(id, family);
    }
    if (family.faces.some((face) => face.weight === weight)) continue;
    family.faces.push({ file, weight });
    nextHandles.set(file, f);
  }
  handles.clear();
  nextHandles.forEach((f, id) => handles.set(id, f));
  const list = [...families.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "zh-CN", { numeric: true }),
  );
  list.forEach((f) => f.faces.sort((a, b) => a.weight - b.weight));
  registerLocalFamilies(list);
  listeners.forEach((l) => l());
  return list.length;
}

/** Reopen drafts without prompting; denied/prompt permissions always require a click. */
export function restoreLocalFonts(): Promise<void> {
  if (!restored)
    restored = (async () => {
      if (!localFontsSupported() || !navigator.permissions) return;
      try {
        const permission = await navigator.permissions.query({
          name: "local-fonts" as PermissionName,
        });
        if (permission.state === "granted") await enableLocalFonts();
      } catch {
        /* unsupported permission query or browser policy; the button remains available */
      }
    })();
  return restored;
}

/** Only a chosen face is read. Bytes remain in this tab and are never put in IndexedDB. */
export function localFontBytes(
  file: string,
): Promise<{ bytes: ArrayBuffer; characterSet: Set<number> }> {
  let promise = loaded.get(file);
  if (!promise) {
    promise = (async () => {
      const handle = handles.get(file);
      if (!handle) throw new Error("请先点击“使用本机字体”授权访问所需字体。");
      let bytes = await (await handle.blob()).arrayBuffer();
      const { default: fontkit } = await import("@pdf-lib/fontkit");
      let font = fontkit.create(new Uint8Array(bytes));
      if ("fonts" in font && Array.isArray(font.fonts)) {
        const index = font.fonts.findIndex(
          (f: { postscriptName: string }) => f.postscriptName === handle.postscriptName,
        );
        bytes = extractCollectionFace(bytes, index);
        font = fontkit.create(new Uint8Array(bytes));
      }
      if (!("characterSet" in font)) throw new Error("此字体格式暂不支持，请选择其他字体。");
      const characterSet = new Set<number>(font.characterSet);
      glyphs.set(file, characterSet);
      return { bytes, characterSet };
    })().catch((err) => {
      loaded.delete(file);
      throw err;
    });
    loaded.set(file, promise);
  }
  return promise;
}

export function localGlyphs(file: string) {
  return glyphs.get(file);
}
