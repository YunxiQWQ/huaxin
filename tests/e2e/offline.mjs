// Offline acceptance against the production build: after resources are loaded once,
// editing, local saving and PDF export keep working without network.
import { open, OUT, sleep, log } from "./lib.mjs";
import { inspectPdf, readZip } from "./files.mjs";
import assert from "node:assert/strict";
const URL = process.env.BX_URL || "http://localhost:4173/";
const { ctx, page, errors, external } = await open({ profile: `${OUT}/profile-offline` });
await page.goto(URL);
await page
  .waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 30000 })
  .catch(() => {});
await page.reload();
await sleep(1500);
log("service worker controlling:", await page.evaluate(() => !!navigator.serviceWorker.controller));
// create from template while online (loads fonts + images once)
await page.goto(URL + "#/templates");
await sleep(2500);
await page.getByText("山居茶事 · 电子画册").first().click();
await page.getByRole("button", { name: "使用此模板创建" }).click();
await page.waitForSelector("[data-canvas]", { timeout: 30000 });
await sleep(5000);
const cached = await page.evaluate(async () => {
  const out = {};
  for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).length;
  return out;
});
log("caches:", JSON.stringify(cached));

await ctx.setOffline(true);
log("— offline —");
await page.reload();
await sleep(3000);
log(
  "app reloaded offline, editor restored:",
  (await page.locator("[data-canvas]").count()) === 1,
  "| title:",
  await page.locator('header input[aria-label="作品名称"]').inputValue(),
);
// edit: rename + edit headline text through inspector
const nm = page.locator('header input[aria-label="作品名称"]');
await nm.fill("离线编辑的画册");
await nm.press("Enter");
await page.getByRole("button", { name: "文字", exact: true }).click();
await sleep(300);
await page.getByRole("button", { name: /^主标题/ }).click();
await sleep(300);
const ta = page.locator("aside textarea").first();
await ta.fill("断网后待编辑标题");
await page.locator("[data-el]").filter({ hasText: "断网后待编辑标题" }).dblclick();
const inline = page.getByRole("textbox", { name: "画布文字编辑" });
await inline.waitFor();
await page.keyboard.press("Control+a");
await page.keyboard.insertText("断网后新增的标题");
assert.equal(await ta.inputValue(), "断网后新增的标题", "offline canvas changes update the document immediately");
await page.keyboard.press("Escape");
assert.equal(await inline.count(), 0);
log("offline inline canvas edit: passed");
await sleep(2500);
log("save status offline:", await page.locator('header button[title="本机保存状态"]').innerText());
await page.reload();
await sleep(3000);
log(
  "after offline reload, edits kept:",
  (await page.locator('header input[aria-label="作品名称"]').inputValue()) === "离线编辑的画册",
);
// PDF export offline
await page.getByRole("button", { name: /^导出/ }).last().click();
await page.getByRole("button", { name: /导出 PDF/ }).click();
await sleep(1500);
const dl = page.waitForEvent("download", { timeout: 120000 });
await page
  .locator("[role=dialog]")
  .getByRole("button", { name: /导出 PDF|仍然导出/ })
  .click();
const d = await Promise.race([
  dl,
  page
    .locator("[role=dialog]")
    .getByText(/失败/)
    .waitFor({ timeout: 120000 })
    .then(() => null),
]);
if (d) {
  await d.saveAs(`${OUT}/offline.pdf`);
  const pdf = await inspectPdf(`${OUT}/offline.pdf`);
  log(
    "offline pdf:",
    pdf.summary,
    "| contains new headline:",
    pdf.text.includes("断网后新增的标题"),
  );
} else log("OFFLINE EXPORT FAILED:", await page.locator("[role=dialog]").innerText());
await page.keyboard.press("Escape");
// project file offline
const dl2 = page.waitForEvent("download");
await page.getByRole("button", { name: "下载工程" }).click();
await (await dl2).saveAs(`${OUT}/offline.bxproj`);
log(
  "offline project file saved:",
  Object.keys(readZip(`${OUT}/offline.bxproj`)).length + " entries",
);
await ctx.setOffline(false);
log("errors:", errors.length ? errors.join("\n") : "none");
log("requests leaving the site / non-GET:", external.length ? external.join("\n") : "none");
await ctx.close();
