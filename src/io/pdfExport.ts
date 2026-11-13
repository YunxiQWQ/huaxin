import type { Doc } from "../model/types";
import { pageDisplayList } from "../render/displayList";
import { fontName, fontUrl, isLocalFont } from "../fonts/registry";
import { localFontBytes } from "../fonts/local";
import { ensureFontsForDoc } from "../fonts/loader";
import { assetBytes } from "../storage/assets";
import type { PdfJob, PdfMsg } from "../workers/pdf.worker";

export interface Progress {
  stage: string;
  done: number;
  total: number;
}

async function toPng(bytes: ArrayBuffer, mime: string): Promise<ArrayBuffer> {
  const bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  bmp.close();
  return (await c.convertToBlob({ type: "image/png" })).arrayBuffer();
}

export async function exportPdf(
  doc: Doc,
  pageIdx: number[],
  onProgress: (p: Progress) => void,
): Promise<{ blob: Blob; warnings: string[] }> {
  onProgress({ stage: "准备字体与排版", done: 0, total: 1 });
  await ensureFontsForDoc(doc, true);
  await document.fonts.ready;
  const pages = pageIdx.map((i) => pageDisplayList(doc, doc.pages[i]));
  const faces = new Set<string>();
  const assetIds = new Set<string>();
  for (const p of pages)
    for (const g of p.groups)
      for (const it of g.items) {
        if (it.t === "text") faces.add(it.face);
        if (it.t === "image") assetIds.add(it.assetId);
      }
  const images: PdfJob["images"] = [];
  const transfer: ArrayBuffer[] = [];
  const fonts: PdfJob["fonts"] = [];
  for (const file of faces) {
    if (isLocalFont(file)) {
      // Transfer a copy: keep the tab's bytes usable for later exports.
      const bytes = (await localFontBytes(file)).bytes.slice(0);
      fonts.push({ file, bytes, name: fontName(file) });
      transfer.push(bytes);
    } else fonts.push({ file, url: new URL(fontUrl(file), location.href).href });
  }
  let n = 0;
  for (const id of assetIds) {
    onProgress({ stage: "读取图片", done: n++, total: assetIds.size });
    const a = await assetBytes(id);
    if (!a) continue;
    let bytes = a.bytes;
    let kind: "png" | "jpg" = "jpg";
    if (a.mime === "image/png") kind = "png";
    else if (a.mime !== "image/jpeg") {
      bytes = await toPng(a.bytes, a.mime);
      kind = "png";
    }
    images.push({ id, bytes, kind });
    transfer.push(bytes);
  }
  const job: PdfJob = {
    title: doc.name,
    pages,
    fonts,
    images,
  };
  const worker = new Worker(new URL("../workers/pdf.worker.ts", import.meta.url), {
    type: "module",
  });
  try {
    return await new Promise((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<PdfMsg>) => {
        const m = e.data;
        if (m.type === "progress") onProgress(m);
        else if (m.type === "done")
          resolve({ blob: new Blob([m.bytes], { type: "application/pdf" }), warnings: m.warnings });
        else reject(new Error(m.message));
      };
      worker.onerror = (e) =>
        reject(
          new Error(
            e.message || "PDF 生成组件无法加载（可能已断网，且程序尚未完整缓存），请联网后重试",
          ),
        );
      worker.postMessage(job, transfer);
    });
  } finally {
    worker.terminate();
  }
}
