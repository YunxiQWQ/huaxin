import type { Doc } from "../model/types";
import { pageDisplayList } from "../render/displayList";
import { renderPageToCanvas } from "../render/canvasRender";
import { ensureFontsForDoc } from "../fonts/loader";
import { zip, type Zippable } from "fflate";
import { yieldToUI } from "./download";
import type { Progress } from "./pdfExport";

const MAX_PIXELS = 120_000_000;

export async function exportImages(
  doc: Doc,
  pageIdx: number[],
  opts: { format: "png" | "jpeg"; dpi: number; quality: number },
  onProgress: (p: Progress) => void,
): Promise<{ blob: Blob; ext: string; multi: boolean }> {
  await ensureFontsForDoc(doc);
  await document.fonts.ready;
  let scale = opts.dpi / 25.4;
  const area = doc.pageSize.width * doc.pageSize.height * scale * scale;
  if (area > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / area);
  const type = opts.format === "png" ? "image/png" : "image/jpeg";
  const ext = opts.format === "png" ? "png" : "jpg";
  const files: { name: string; data: Uint8Array }[] = [];
  for (let k = 0; k < pageIdx.length; k++) {
    onProgress({ stage: `渲染第 ${pageIdx[k] + 1} 页`, done: k, total: pageIdx.length });
    await yieldToUI();
    const canvas = (await renderPageToCanvas(pageDisplayList(doc, doc.pages[pageIdx[k]]), scale, {
      full: true,
    })) as HTMLCanvasElement;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, opts.quality));
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error("浏览器无法生成图片（页面尺寸或清晰度过大），请降低清晰度后重试");
    files.push({
      name: `page-${String(pageIdx[k] + 1).padStart(2, "0")}.${ext}`,
      data: new Uint8Array(await blob.arrayBuffer()),
    });
  }
  if (files.length === 1)
    return { blob: new Blob([files[0].data as BlobPart], { type }), ext, multi: false };
  onProgress({ stage: "打包 ZIP", done: pageIdx.length, total: pageIdx.length });
  const z: Zippable = {};
  for (const f of files) z[f.name] = [f.data, { level: 0 }];
  const out = await new Promise<Uint8Array>((res, rej) =>
    zip(z, (err, data) => (err ? rej(err) : res(data))),
  );
  return {
    blob: new Blob([out as BlobPart], { type: "application/zip" }),
    ext: "zip",
    multi: true,
  };
}
