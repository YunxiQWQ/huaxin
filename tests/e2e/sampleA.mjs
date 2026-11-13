// Acceptance flow A: four-page campus newspaper.
import {
  open,
  URL,
  OUT,
  sleep,
  log,
  state,
  findEl,
  elText,
  fromTemplate,
  exportVia,
} from "./lib.mjs";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { inspectPdf } from "./files.mjs";

const articles = fs.readFileSync(
  new globalThis.URL("../../src/templates/articles.ts", import.meta.url),
  "utf8",
);
const LONG = [...articles.matchAll(/`([^`]+)`/g)]
  .map((m) => m[1])
  .filter((t) => t.length > 300)
  .join("\n"); // ~2500 字真实长稿
const SHORT = "短稿测试：校园里的玉兰花开了。\n\n  同学们纷纷驻足拍照，记录春天的样子。";

fs.rmSync(`${OUT}/profile`, { recursive: true, force: true });
const { ctx, page, errors, external } = await open();
await fromTemplate(page, "青禾校园报 · 四版");
log(
  "created pages / elements:",
  JSON.stringify((await state(page)).doc.pages.map((p) => p.elements.length)),
);

// 1. replace manuscript with a long article -> overflow marker
const body = await findEl(page, "e.type==='text' && e.text.startsWith('开馆仪式')");
await page.locator(`[data-el="${body.id}"]`).click({ position: { x: 40, y: 40 } });
const ta = page.locator("aside textarea").first();
await ta.fill(LONG);
await sleep(500);
log(
  "long manuscript chars:",
  (await elText(page, body.id)).length,
  "| inspector overflow badge:",
  await page
    .locator("aside")
    .getByText(/溢出约/)
    .count(),
  "| canvas overflow marker:",
  await page.locator('button[title^="文字溢出"]').count(),
);
await page.screenshot({ path: `${OUT}/A1-overflow.png` });
// overflow marker locates the box
await page.locator("[data-canvas]").click({ position: { x: 8, y: 8 } });
await page.locator('button[title^="文字溢出"]').first().click();
log(
  "overflow marker selects box:",
  JSON.stringify((await state(page)).selection) === JSON.stringify([body.id]),
);

// 2. change columns 2 -> 3 and back
const cols = page.locator("aside label", { hasText: "栏数" }).locator("input");
await cols.fill("3");
await cols.press("Enter");
await sleep(250);
log("columns -> 3:", (await findEl(page, `e.id==='${body.id}'`)).columns === 3);
await cols.fill("2");
await cols.press("Enter");
await sleep(250);

// 3. short manuscript + tidy
await ta.fill(SHORT);
await sleep(250);
await page.getByRole("button", { name: "整理稿件" }).click();
await sleep(250);
log(
  "tidied:",
  JSON.stringify(await elText(page, body.id)),
  "| overflow markers now:",
  await page.locator('button[title^="文字溢出"]').count(),
);

// 4. replace picture keeps frame
const img = await findEl(page, "e.type==='image'");
await page.locator(`[data-el="${img.id}"]`).click();
await sleep(200);
const [chooser] = await Promise.all([
  page.waitForEvent("filechooser"),
  page.getByRole("button", { name: "替换图片" }).click(),
]);
await chooser.setFiles(
  fileURLToPath(new globalThis.URL("../../public/templates/img/basketball.jpg", import.meta.url)),
);
await sleep(1500);
const img2 = await findEl(page, `e.id==='${img.id}'`);
log(
  "picture replaced:",
  img.assetId !== img2.assetId,
  "| frame kept:",
  img.x === img2.x && img.y === img2.y && img.w === img2.w && img.h === img2.h,
);

// 5. pages: duplicate, add, drag reorder, undo
const pageCard = (n) =>
  page
    .locator('[draggable="true"]')
    .filter({ hasText: `第 ${n} 页` })
    .first();
await pageCard(2).hover();
await pageCard(2).getByRole("button", { name: "复制页面" }).click();
await sleep(300);
let st = await state(page);
log(
  "duplicate page -> pages:",
  st.doc.pages.length,
  "| copy has same element count:",
  st.doc.pages[2].elements.length === st.doc.pages[1].elements.length,
);
const order0 = st.doc.pages.map((p) => p.id);
await pageCard(3).dragTo(pageCard(1), { targetPosition: { x: 60, y: 8 } });
await sleep(400);
st = await state(page);
log(
  "drag page 3 to front:",
  st.doc.pages[0].id === order0[2],
  "| order",
  st.doc.pages.map((p) => order0.indexOf(p.id)).join(),
);
await page.keyboard.press("Control+z");
await sleep(200);
log("undo reorder:", (await state(page)).doc.pages.map((p) => p.id).join() === order0.join());

// 6. autosave -> reload -> restored
await sleep(2500);
log("save status:", await page.locator('header button[title="本机保存状态"]').innerText());
const before = await state(page);
await page.reload();
await page.waitForFunction(() => window.__bx?.state());
await sleep(1500);
const after = await state(page);
log(
  "restored after reload:",
  after.doc.id === before.doc.id,
  "| page order same:",
  after.doc.pages.map((p) => p.id).join() === before.doc.pages.map((p) => p.id).join(),
  "| text same:",
  (await elText(page, body.id)) ===
    "SHORT".replace(
      "SHORT",
      before.doc.pages.flatMap((p) => p.elements).find((e) => e.id === body.id).text,
    ),
);

// 7. history: manual version, change, restore (keeps pre-restore backup, undoable)
await page.getByRole("button", { name: "历史版本" }).click();
await sleep(400);
await page.getByPlaceholder(/版本说明/).fill("定稿前");
await page.getByRole("button", { name: "保存当前版本" }).click();
await sleep(600);
await page.keyboard.press("Escape");
await page.locator(`[data-el="${img.id}"]`).click();
await page.keyboard.press("Delete");
await sleep(1500);
log("picture deleted:", !(await findEl(page, `e.id==='${img.id}'`)));
await page.getByRole("button", { name: "历史版本" }).click();
await sleep(500);
page.once("dialog", (d) => d.accept());
await page.locator("[role=dialog]").getByRole("button", { name: "恢复" }).first().click();
await sleep(1500);
log("restore brings picture back:", !!(await findEl(page, `e.id==='${img.id}'`)));
await page.getByRole("button", { name: "历史版本" }).click();
await sleep(500);
log(
  "versions now:",
  (await page.locator("[role=dialog]").innerText())
    .match(/(自动备份|手动保存|恢复前保留)/g)
    ?.join(" / "),
);
await page.keyboard.press("Escape");
await page.keyboard.press("Control+z");
await sleep(300);
log("restore is undoable:", !(await findEl(page, `e.id==='${img.id}'`)));
await page.keyboard.press("Control+Shift+z");
await sleep(1500);

// 8. PDF export
const pdfMsg = await exportVia(page, /导出 PDF/, /导出 PDF|仍然导出/, `${OUT}/A.pdf`);
log(
  "pdf dialog:",
  pdfMsg.split("\n").find((l) => /PDF 已生成|失败/.test(l)),
);
const pdf = await inspectPdf(`${OUT}/A.pdf`);
log("pdfinfo:", pdf.summary);
const txt = pdf.text;
log(
  "pdf text contains 报头/标题/新稿件:",
  txt.includes("青禾校园报"),
  txt.includes("一座图书馆，点亮整个春天"),
  txt.includes("校园里的玉兰花开了"),
);

// 9. project file download -> leave warning state
await page.locator("[data-canvas]").click({ position: { x: 8, y: 8 } });
const dl = page.waitForEvent("download");
await page.getByRole("button", { name: "下载工程" }).click();
await (await dl).saveAs(`${OUT}/A.bxproj`);
await sleep(600);
log(
  "file-dirty after download:",
  (await state(page)).doc !== null &&
    (await page.evaluate(() => {
      const s = window.__bx.state();
      return s.doc !== s.fileSavedDoc;
    })),
);
let prompted = false;
page.on("dialog", async (d) => {
  if (d.type() === "beforeunload") {
    prompted = true;
    await d.dismiss();
  }
});
await page.close({ runBeforeUnload: true }).catch(() => {});
await sleep(800);
log("leave prompt after download:", prompted);
const page2 = await ctx.newPage();
page2.on("dialog", async (d) => {
  if (d.type() === "beforeunload") {
    prompted = true;
    await d.accept();
  }
});
await page2.goto(URL);
await page2.waitForFunction(() => window.__bx?.state());
await sleep(1200);
const nm = page2.locator('header input[aria-label="作品名称"]');
await nm.fill("再次修改的校园报");
await nm.press("Enter");
await sleep(1500);
await page2.mouse.click(700, 500); // user activation is required for beforeunload prompts
prompted = false;
await page2.close({ runBeforeUnload: true }).catch(() => {});
await sleep(1200);
log("leave prompt after further edit:", prompted);

// 10. import the project file as an independent work
const page3 = await ctx.newPage();
await page3.goto(URL + "#/");
await sleep(1500);
const projectsBefore = await page3.locator("article").count();
const [fc] = await Promise.all([
  page3.waitForEvent("filechooser"),
  page3.getByRole("button", { name: "导入工程" }).click(),
]);
await fc.setFiles(`${OUT}/A.bxproj`);
await sleep(4000);
const imp = await state(page3);
log(
  "imported as new work:",
  imp?.doc.id !== before.doc.id,
  "| pages",
  imp?.doc.pages.length,
  "| name",
  imp?.doc.name,
);
const impBody = imp.doc.pages
  .flatMap((p) => p.elements)
  .find((e) => e.type === "text" && e.text.includes("玉兰花"));
log("imported text editable:", !!impBody);
await page3.goto(URL + "#/");
await sleep(1500);
log("works in workbench:", projectsBefore, "->", await page3.locator("article").count());

log("errors:", errors.length ? errors.join("\n") : "none");
log("requests leaving the site / non-GET:", external.length ? external.join("\n") : "none");
await ctx.close();
