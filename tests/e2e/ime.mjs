// Chinese IME composition inside the in-canvas text editor (via CDP Input.imeSetComposition).
import { open, URL, sleep, log, elText } from "./lib.mjs";
const { ctx, page, errors } = await open();
await page.goto(URL);
await page.waitForFunction(() => window.__bx?.state());
await sleep(1500);
const id = await page.evaluate(() => {
  const s = window.__bx.state();
  const p = s.doc.pages.find((x) => x.id === s.pageId);
  return p.elements
    .filter((e) => e.type === "text")
    .sort((a, b) => b.text.length - a.text.length)[0].id;
});
const before = await elText(page, id);
await page.locator(`[data-el="${id}"]`).dblclick({ position: { x: 30, y: 12 } });
await sleep(500);
log("editing opened:", (await page.evaluate(() => window.__bx.state().editingId)) === id);
await page.keyboard.press("Control+End");
const cdp = await ctx.newCDPSession(page);
await cdp.send("Input.imeSetComposition", { text: "zhong", selectionStart: 5, selectionEnd: 5 });
await sleep(200);
log(
  "pinyin visible at canvas position:",
  (await page.evaluate(() => document.activeElement.textContent)).endsWith("zhong"),
);
log("pinyin leaked into document:", (await elText(page, id)).includes("zhong"));
await page.keyboard.press("Delete").catch(() => {});
await cdp.send("Input.imeSetComposition", { text: "中文", selectionStart: 2, selectionEnd: 2 });
await cdp.send("Input.insertText", { text: "中文输入" });
await sleep(400);
const after = await elText(page, id);
log(
  "committed text appended:",
  after.endsWith("中文输入"),
  "length +",
  after.length - before.length,
);
await page.keyboard.press("Escape");
await sleep(200);
log(
  "element still present after Delete during editing:",
  !!(await page.locator(`[data-el="${id}"]`).count()),
);
await page.keyboard.press("Control+z");
await sleep(200);
log("one undo restores pre-typing text:", (await elText(page, id)) === before);
log("errors:", errors.length ? errors.join("\n") : "none");
await ctx.close();
