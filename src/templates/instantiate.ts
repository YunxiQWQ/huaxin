import type { Doc, ImageElement, Page } from "../model/types";
import { importImageBytes, templateAssetUrl } from "../storage/assets";
import { TEMPLATES } from "./index";
import { uid } from "../model/units";

/** Copy template images into the local asset store so the new work is self-contained. */
export async function localizeTemplateAssets(
  pages: Page[],
): Promise<{ pages: Page[]; assets: Doc["assets"] }> {
  const ids = new Set<string>();
  for (const p of pages)
    for (const e of p.elements)
      if (e.type === "image" && e.assetId?.startsWith("tpl:")) ids.add(e.assetId);
  const map = new Map<string, string>();
  const assets: Doc["assets"] = {};
  for (const id of ids) {
    const r = await fetch(templateAssetUrl(id));
    if (!r.ok) throw new Error("模板图片下载失败，请检查网络连接后重试");
    const meta = await importImageBytes(await r.arrayBuffer(), `${id.slice(4)}.jpg`);
    map.set(id, meta.id);
    assets[meta.id] = meta;
  }
  return {
    pages: pages.map((p) => ({
      ...p,
      elements: p.elements.map((e) =>
        e.type === "image" && e.assetId && map.has(e.assetId)
          ? ({ ...e, assetId: map.get(e.assetId)! } as ImageElement)
          : e,
      ),
    })),
    assets,
  };
}

export async function createFromTemplate(templateId: string): Promise<Doc> {
  const t = TEMPLATES.find((x) => x.id === templateId);
  if (!t) throw new Error("模板不存在");
  const doc = t.build(); // fresh ids every time
  const { pages, assets } = await localizeTemplateAssets(doc.pages);
  const now = Date.now();
  return { ...doc, id: uid("d"), pages, assets, createdAt: now, updatedAt: now };
}

/** Fresh copies of template pages for inserting into an existing work. */
export async function templatePagesForInsert(templateId: string, pageIdx: number[]) {
  const t = TEMPLATES.find((x) => x.id === templateId)!;
  const doc = t.build();
  return localizeTemplateAssets(pageIdx.map((i) => doc.pages[i]));
}
