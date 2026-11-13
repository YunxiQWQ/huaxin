// UI screenshots for review: editor with a selected multi-column text box, export dialog.
import { open, OUT, sleep, findEl, fromTemplate } from "./lib.mjs";
const { ctx, page } = await open({ profile: `${OUT}/profile-shots`, w: 1600, h: 960 });
await fromTemplate(page, "青禾校园报 · 四版");
const body = await findEl(page, "e.type==='text' && e.text.startsWith('开馆仪式')");
await page.locator(`[data-el="${body.id}"]`).click({ position: { x: 60, y: 60 } });
await sleep(800);
await page.screenshot({ path: `${OUT}/S1-editor-text.png` });
const img = await findEl(page, "e.type==='image'");
await page.locator(`[data-el="${img.id}"]`).dblclick();
await sleep(600);
await page.screenshot({ path: `${OUT}/S2-crop.png` });
await page.keyboard.press("Escape");
await page.getByRole("button", { name: /^导出/ }).last().click();
await page.getByRole("button", { name: /导出 PDF/ }).click();
await sleep(1800);
await page.screenshot({ path: `${OUT}/S3-export.png` });
await ctx.close();
