import type { Doc } from "../model/types";
import { layoutOf } from "../layout/textLayout";
import { faceStatus, loadCoverage, uncoveredChars } from "../fonts/loader";
import { getFamily, resolveFace } from "../fonts/registry";
import { hasAssets, isTemplateAsset } from "../storage/assets";

export interface Issue {
  level: "error" | "warning" | "info";
  kind:
    | "overflow"
    | "missing-image"
    | "empty-image"
    | "missing-font"
    | "font-load"
    | "missing-glyph";
  pageIndex: number;
  elementId?: string;
  message: string;
}

/** Synchronous checks that only depend on layout (used for live badges). */
export function overflowIssues(doc: Doc, pages?: number[]): Issue[] {
  const out: Issue[] = [];
  const idx = pages ?? doc.pages.map((_, i) => i);
  for (const i of idx) {
    const p = doc.pages[i];
    for (const el of p.elements) {
      if (el.type !== "text" || el.hidden) continue;
      const l = layoutOf(el);
      if (l.overflow) {
        const rest = [...el.text.slice(l.overflowAt).replace(/\s/g, "")].length;
        out.push({
          level: "warning",
          kind: "overflow",
          pageIndex: i,
          elementId: el.id,
          message: `文字溢出：约 ${rest} 字未能排入文本框`,
        });
      }
    }
  }
  return out;
}

export async function checkDoc(doc: Doc, pages?: number[]): Promise<Issue[]> {
  await loadCoverage();
  const idx = pages ?? doc.pages.map((_, i) => i);
  const out: Issue[] = overflowIssues(doc, idx);
  const assetIds = new Set<string>();
  for (const i of idx)
    for (const el of doc.pages[i].elements)
      if (el.type === "image" && el.assetId && !isTemplateAsset(el.assetId))
        assetIds.add(el.assetId);
  const found = await hasAssets([...assetIds]);
  for (const i of idx) {
    const p = doc.pages[i];
    for (const el of p.elements) {
      if (el.hidden) continue;
      if (el.type === "image") {
        if (!el.assetId)
          out.push({
            level: "info",
            kind: "empty-image",
            pageIndex: i,
            elementId: el.id,
            message: "空图框（导出时不显示）",
          });
        else if (!isTemplateAsset(el.assetId) && !found.has(el.assetId))
          out.push({
            level: "error",
            kind: "missing-image",
            pageIndex: i,
            elementId: el.id,
            message: "图片缺失：本机找不到该图片资源，请替换图片",
          });
      }
      if (el.type === "text") {
        if (!getFamily(el.style.fontFamily)) {
          out.push({
            level: "warning",
            kind: "missing-font",
            pageIndex: i,
            elementId: el.id,
            message: `字体“${el.style.fontFamily}”不可用，已使用思源宋体代替`,
          });
        }
        const { face } = resolveFace(el.style.fontFamily, el.style.fontWeight);
        if (faceStatus(face.file) === "error")
          out.push({
            level: "error",
            kind: "font-load",
            pageIndex: i,
            elementId: el.id,
            message: `字体文件加载失败（${getFamily(el.style.fontFamily)?.name ?? face.file}），请检查网络后重试`,
          });
        const miss = uncoveredChars(el.style.fontFamily, el.style.fontWeight, el.text);
        if (miss && miss.length)
          out.push({
            level: "warning",
            kind: "missing-glyph",
            pageIndex: i,
            elementId: el.id,
            message: `所选字体缺少字符：${miss.slice(0, 12).join(" ")}${miss.length > 12 ? " …" : ""}（请改用思源宋体/黑体）`,
          });
      }
    }
  }
  return out;
}
