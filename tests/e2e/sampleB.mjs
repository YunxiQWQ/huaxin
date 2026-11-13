// Acceptance flow B: multi-page e-album (cover, editable TOC, inner pages, back cover).
import { open, OUT, sleep, log, state, findEl, elText, fromTemplate, exportVia } from "./lib.mjs";
import fs from "node:fs";
import { inspectPdf, readZip, readZipJson, describeJpeg } from "./files.mjs";

const { ctx, page, errors, external } = await open();
await fromTemplate(page, "山居茶事 · 电子画册");
let st = await state(page);
log(
  "album pages:",
  st.doc.pages.length,
  "| size",
  st.doc.pageSize.width,
  "×",
  st.doc.pageSize.height,
  "mm",
);

// edit the TOC page (page 2)
await page.locator('[draggable="true"]').filter({ hasText: "第 2 页" }).first().click();
await sleep(600);
const toc = await findEl(page, "e.type==='text' && e.text.startsWith('01')");
await page.locator(`[data-el="${toc.id}"]`).click({ position: { x: 20, y: 10 } });
const ta = page.locator("aside textarea").first();
await ta.fill(
  "01　入山\n云雾深处的茶舍\n\n02　茶舍\n三间木屋，一方小院\n\n03　制茶\n杀青、揉捻与等待\n\n04　茶席\n一杯茶的时间\n\n05　归途\n山下的灯火",
);
await sleep(400);
log("TOC edited:", (await elText(page, toc.id)).includes("05　归途"));
// edit an inner page headline (page 3) by double-click editing
await page.locator('[draggable="true"]').filter({ hasText: "第 3 页" }).first().click();
await sleep(600);
const head = await findEl(page, "e.type==='text' && e.text==='入山'");
await page.locator(`[data-el="${head.id}"]`).dblclick({ position: { x: 10, y: 10 } });
await sleep(300);
await page.keyboard.press("Control+a");
await page.keyboard.type("入山记");
await page.keyboard.press("Escape");
await sleep(300);
log("inner headline edited in canvas:", (await elText(page, head.id)) === "入山记");
// add a page at the end and a text box on it
await page.locator('[draggable="true"]').filter({ hasText: "第 6 页" }).first().click();
await sleep(300);
await page.getByRole("button", { name: "新增页面", exact: true }).click();
await sleep(300);
await page.getByRole("button", { name: "文字", exact: true }).click();
await sleep(300);
await page.getByRole("button", { name: /^主标题/ }).click();
await sleep(400);
st = await state(page);
log("new page with headline:", st.doc.pages.length === 7 && st.doc.pages[6].elements.length === 1);
await page.keyboard.press("Control+z");
await page.keyboard.press("Control+z");
await sleep(300);
log("undo back to 6 pages:", (await state(page)).doc.pages.length);

// preview: single / spread / book flip; closing returns to editor state
const pageBefore = (await state(page)).pageId;
await page.getByRole("button", { name: "预览" }).click();
await sleep(1500);
await page.screenshot({ path: `${OUT}/B1-preview-spread.png` });
const readCounter = () => page.locator('[aria-label="本地预览"] span.tabular-nums').last().innerText();
await page.keyboard.press("ArrowRight");
await sleep(400);
const c1 = await readCounter();
await page.getByRole("radio", { name: "整本翻阅" }).click();
await sleep(400);
await page.getByRole("button", { name: "下一页", exact: true }).click();
await sleep(300);
await page.screenshot({ path: `${OUT}/B2-preview-flip.png` });
await sleep(800);
const c2 = await readCounter();
await page.getByRole("radio", { name: "单页" }).click();
await sleep(300);
await page.locator('[aria-label="本地预览"] .h-\\[118px\\] button').nth(4).click();
await sleep(400);
const c3 = await readCounter();
await page.getByRole("button", { name: "关闭预览" }).click();
await sleep(400);
log(
  "preview spread → flip → thumbnail jump:",
  `${c1} → ${c2} → ${c3}`,
  "| editor page kept:",
  (await state(page)).pageId === pageBefore,
);

// project file
await sleep(1500);
const dl = page.waitForEvent("download");
await page.getByRole("button", { name: "下载工程" }).click();
await (await dl).saveAs(`${OUT}/B.bxproj`);
await sleep(500);
const entries = readZip(`${OUT}/B.bxproj`);
const list = Object.keys(entries).join("\n");
log(
  "project package:",
  (list.match(/assets\//g) || []).length,
  "images |",
  /manifest\.json/.test(list) && /document\.json/.test(list) ? "manifest+document ok" : "MISSING",
);
const manifest = readZipJson(entries, "manifest.json");
log(
  "manifest formatVersion",
  manifest.formatVersion,
  "| fonts",
  manifest.fonts.map((f) => `${f.name}${f.embedded ? "(嵌入)" : "(名称)"}`).join("、"),
);

// PDF + images
const pdfMsg = await exportVia(page, /导出 PDF/, /导出 PDF|仍然导出/, `${OUT}/B.pdf`);
log(
  "pdf:",
  pdfMsg.split("\n").find((l) => /PDF 已生成|失败/.test(l)),
);
const pdf = await inspectPdf(`${OUT}/B.pdf`);
log("pdfinfo:", pdf.summary);
const t = pdf.text;
// PDF text extractors may insert spaces between glyphs in widely tracked headings.
const searchableText = t.replace(/\s+/gu, "");
log(
  "pdf text: 封面/目录/改后标题/封底:",
  searchableText.includes("山居茶事"),
  searchableText.includes("归途"),
  searchableText.includes("入山记"),
  searchableText.includes("青禾摄影社"),
);
if (!["山居茶事", "归途", "入山记", "青禾摄影社"].every((text) => searchableText.includes(text))) {
  throw new Error("Exported album PDF is missing expected Chinese text.");
}
await page.getByRole("button", { name: /^导出/ }).last().click();
await page.getByRole("button", { name: /导出图片/ }).click();
await sleep(800);
await page.locator("[role=dialog]").getByRole("button", { name: "指定页" }).click();
await page.locator('[role=dialog] input[placeholder="如 1-3,5"]').fill("1-2");
await page.locator("[role=dialog]").getByRole("button", { name: "JPEG", exact: true }).click();
await page.locator("[role=dialog]").getByRole("button", { name: "屏幕 96" }).click();
await sleep(600);
const dl2 = page.waitForEvent("download", { timeout: 60000 });
await page
  .locator("[role=dialog]")
  .getByRole("button", { name: /导出 图片|仍然导出/ })
  .click();
await (await dl2).saveAs(`${OUT}/B-images.zip`);
await sleep(300);
const imageEntries = readZip(`${OUT}/B-images.zip`);
log("image zip:", Object.keys(imageEntries).join(" / "));
await page.keyboard.press("Escape");
const firstImage = Object.entries(imageEntries).find(([name]) => name.startsWith("page-01"));
if (!firstImage) throw new Error("Exported ZIP lacks the first page image.");
log("page 1 jpeg:", await describeJpeg(firstImage[1]));

log("errors:", errors.length ? errors.join("\n") : "none");
log("requests leaving the site / non-GET:", external.length ? external.join("\n") : "none");
await ctx.close();
