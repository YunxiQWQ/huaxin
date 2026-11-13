import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { unzipSync, strFromU8 } from "fflate";
import { PDFDocument } from "pdf-lib";

export async function inspectPdf(file) {
  const task = getDocument({
    data: new Uint8Array(fs.readFileSync(file)),
    useSystemFonts: false,
    isEvalSupported: false,
    useWasm: false,
    disableFontFace: true,
  });
  const pdf = await task.promise;
  try {
    const firstPage = await pdf.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1 });
    const text = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      text.push(content.items.map((item) => item.str || "").join(""));
    }
    return {
      summary: `Pages: ${pdf.numPages}; Page size: ${viewport.width.toFixed(3)} x ${viewport.height.toFixed(3)} pt`,
      pages: pdf.numPages,
      text: text.join("\n"),
    };
  } finally {
    await task.destroy();
  }
}

export function readZip(file) {
  return unzipSync(new Uint8Array(fs.readFileSync(file)));
}

export function readZipJson(entries, name) {
  return JSON.parse(strFromU8(entries[name]));
}

export async function describeJpeg(bytes) {
  const pdf = await PDFDocument.create();
  const image = await pdf.embedJpg(bytes);
  return `JPEG ${image.width} x ${image.height}`;
}

export function renderPdf(file, prefix) {
  if (!process.env.PDFTOPPM) return;
  execFileSync(process.env.PDFTOPPM, ["-r", "40", "-png", file, prefix]);
}
