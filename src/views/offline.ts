import { FONT_FAMILIES, fontUrl } from "../fonts/registry";

export const RUNTIME_CACHE = "banxin-runtime-v1";

export async function offlineStatus(): Promise<{
  sw: boolean;
  fontsCached: number;
  fontsTotal: number;
}> {
  const files = FONT_FAMILIES.flatMap((f) => f.faces.map((x) => x.file));
  const sw = !!navigator.serviceWorker?.controller;
  let cached = 0;
  try {
    if ("caches" in window) {
      const c = await caches.open(RUNTIME_CACHE);
      for (const f of files) if (await c.match(new URL(fontUrl(f), location.href).href)) cached++;
    }
  } catch {
    /* ignore */
  }
  return { sw, fontsCached: cached, fontsTotal: files.length };
}

/** Fetch every bundled font so the service worker keeps it for offline use. */
export async function cacheAllFonts(onProgress: (done: number, total: number) => void) {
  const files = FONT_FAMILIES.flatMap((f) => f.faces.map((x) => x.file));
  let done = 0;
  for (const f of files) {
    onProgress(done, files.length);
    await fetch(fontUrl(f)).then((r) => r.arrayBuffer());
    done++;
  }
  onProgress(done, files.length);
}
