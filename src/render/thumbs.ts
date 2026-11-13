import { useEffect, useState } from "react";
import type { Doc, Page } from "../model/types";
import { pageDisplayList } from "./displayList";
import { renderPageToCanvas } from "./canvasRender";
import { fontEpoch } from "../fonts/loader";

// Raster thumbnails for pages that are not near the current page.
const cache = new WeakMap<Page, { epoch: number; width: number; url: string }>();
const queue: { doc: Doc; page: Page; width: number; resolve: (u: string) => void }[] = [];
let running = false;

function idle(): Promise<void> {
  return new Promise((r) =>
    (window as any).requestIdleCallback
      ? (window as any).requestIdleCallback(() => r(), { timeout: 400 })
      : setTimeout(r, 16),
  );
}

async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift()!;
    const hit = cache.get(job.page);
    if (hit && hit.epoch === fontEpoch() && hit.width >= job.width) {
      job.resolve(hit.url);
      continue;
    }
    await idle();
    try {
      const scale = (job.width * (window.devicePixelRatio || 1)) / job.doc.pageSize.width;
      const c = (await renderPageToCanvas(pageDisplayList(job.doc, job.page), scale, {
        full: false,
      })) as HTMLCanvasElement;
      const url = c.toDataURL("image/jpeg", 0.8);
      cache.set(job.page, { epoch: fontEpoch(), width: job.width, url });
      job.resolve(url);
    } catch {
      /* ignore */
    }
  }
  running = false;
}

export function useThumbnail(doc: Doc, page: Page, width: number, enabled: boolean): string | null {
  const hit = cache.get(page);
  const [url, setUrl] = useState<string | null>(hit?.url ?? null);
  useEffect(() => {
    if (!enabled) return;
    const h = cache.get(page);
    if (h && h.epoch === fontEpoch() && h.width >= width) {
      setUrl(h.url);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      queue.push({ doc, page, width, resolve: (u) => alive && setUrl(u) });
      void pump();
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [page, width, enabled, fontEpoch()]);
  return url;
}
