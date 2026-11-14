import assert from "node:assert/strict";
import { open, OUT, sleep, fromTemplate, findEl, elText, log, exportVia } from "./lib.mjs";
import { inspectPdf } from "./files.mjs";

const { ctx, page, errors, external } = await open({ profile: `${OUT}/inline-${Date.now()}` });
try {
  await fromTemplate(page, "青禾校园报 · 四版");
  const white = await findEl(page, "e.type==='text' && /^#(?:fff|ffffff)$/i.test(e.style.color)");
  assert.ok(white);
  const frame = page.locator(`[data-el="${white.id}"]`);
  const beforeBounds = await frame.boundingBox();
  const originalLines = await frame.locator("span").evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, height: rect.height, text: node.textContent };
    }),
  );
  await frame.dblclick({ position: { x: 15, y: 3 } });
  const editor = page.getByRole("textbox", { name: "画布文字编辑" });
  await editor.waitFor();
  const afterBounds = await editor.boundingBox();
  for (const key of ["x", "y", "width", "height"])
    assert.ok(
      Math.abs(beforeBounds[key] - afterBounds[key]) < 0.8,
      `${key} matches the actual frame`,
    );
  const inlineLines = await editor.locator("[data-line-start]").evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, height: rect.height, text: node.textContent };
    }),
  );
  assert.equal(inlineLines.length, originalLines.length);
  for (let i = 0; i < inlineLines.length; i++) {
    assert.equal(inlineLines[i].text, originalLines[i].text);
    for (const key of ["x", "y", "height"])
      assert.ok(
        Math.abs(inlineLines[i][key] - originalLines[i][key]) < 0.8,
        `line ${i} ${key} matches canvas`,
      );
  }
  assert.deepEqual(
    await editor.evaluate((el) => ({
      color: getComputedStyle(el).color,
      bg: getComputedStyle(el).backgroundColor,
      popup: !!el.querySelector("textarea"),
    })),
    { color: "rgb(255, 255, 255)", bg: "rgba(0, 0, 0, 0)", popup: false },
  );
  assert.equal(await page.getByText(/编辑文字 · .*Esc 完成/).count(), 0);
  await page.keyboard.press("Control+a");
  const marker = "白字实时编辑：画芯原位输入";
  await page.keyboard.insertText(marker);
  assert.equal(await elText(page, white.id), marker, "model updates before blur");
  assert.equal(await editor.textContent(), marker);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.insertText("新");
  assert.equal(
    await elText(page, white.id),
    marker.slice(0, -1) + "新" + marker.slice(-1),
    "caret survives reflow",
  );
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("👩‍🎨");
  await page.keyboard.press("Backspace");
  assert.equal(
    await elText(page, white.id),
    marker.slice(0, -1) + "新" + marker.slice(-1),
    "delete one grapheme",
  );
  await page.screenshot({ path: `${OUT}/inline-white.png` });
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");
  assert.equal(await elText(page, white.id), "");
  await page.keyboard.insertText("第一行");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("第二行");
  assert.equal(await elText(page, white.id), "第一行\n第二行");
  await page.keyboard.press("Control+Home");
  // This banner only fits one visible line; place the caret at the source
  // paragraph boundary instead of navigating down into clipped overflow.
  await editor.evaluate((node) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let text,
      offset = 0;
    while ((text = walker.nextNode())) {
      if (offset + text.length >= 4) {
        window.getSelection().setBaseAndExtent(text, 4 - offset, text, 4 - offset);
        break;
      }
      offset += text.length;
    }
  });
  await page.keyboard.press("Backspace");
  assert.equal(await elText(page, white.id), "第一行第二行", "backspace joins paragraphs");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("[data-texteditor]").count(), 0);

  await frame.dblclick({ position: { x: 15, y: 3 } });
  await editor.waitFor();
  await page.keyboard.press("Control+End");
  const beforeIme = await elText(page, white.id);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Input.imeSetComposition", { text: "zhong", selectionStart: 5, selectionEnd: 5 });
  assert.equal(await elText(page, white.id), beforeIme);
  assert.ok((await editor.textContent()).includes("zhong"));
  await cdp.send("Input.imeSetComposition", { text: "中文", selectionStart: 2, selectionEnd: 2 });
  await cdp.send("Input.insertText", { text: "中文输入" });
  assert.equal(await elText(page, white.id), beforeIme + "中文输入");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  assert.equal(await elText(page, white.id), beforeIme, "IME commits as one undo step");

  const body = await findEl(page, "e.type==='text' && e.text.startsWith('开馆仪式')");
  await page.locator(`[data-el="${body.id}"]`).dblclick({ position: { x: 20, y: 10 } });
  await editor.waitFor();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText("第一行\n第二行");
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  assert.equal(
    await elText(page, body.id),
    "第一行第二行",
    "arrow navigation joins visible paragraphs",
  );
  await page.keyboard.press("Control+a");
  await cdp.send("Input.imeSetComposition", { text: "quan", selectionStart: 4, selectionEnd: 4 });
  assert.equal(
    await elText(page, body.id),
    "第一行第二行",
    "select-all composition remains provisional",
  );
  await cdp.send("Input.insertText", { text: "全选后中文输入" });
  assert.equal(await elText(page, body.id), "全选后中文输入");
  await page.keyboard.press("Control+z");
  assert.equal(await elText(page, body.id), "第一行第二行", "undo inside inline editor");
  await page.keyboard.press("Control+y");
  assert.equal(await elText(page, body.id), "全选后中文输入", "redo inside inline editor");
  await page.keyboard.press("Control+a");
  const article =
    "中文多栏实时编排，保持原有换行和字号。".repeat(170) + "\n\n第二段保留段落和空行。";
  await editor.evaluate((node, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    node.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, article);
  assert.equal(await elText(page, body.id), article);
  assert.equal(
    await editor.textContent(),
    article,
    "overflow and newlines stay in the editable source",
  );
  assert.ok((await editor.locator("[data-line-start]").count()) > 10);
  assert.ok(
    await editor.evaluate(
      (node) =>
        new Set([...node.querySelectorAll("[data-line-start]")].map((line) => line.style.left))
          .size > 1,
    ),
  );
  await page.keyboard.press("Control+a");
  const copied = await editor.evaluate((node) => {
    const data = new DataTransfer();
    node.dispatchEvent(
      new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }),
    );
    return data.getData("text/plain");
  });
  assert.equal(copied, article, "copy preserves source paragraphs without visual wrapping");
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Shift+ArrowRight");
  await editor.evaluate((node) =>
    node.dispatchEvent(
      new ClipboardEvent("cut", {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  assert.equal(await elText(page, body.id), article.slice(1), "cut deletes only selected source");
  await page.locator("aside textarea").first().click();
  assert.equal(await page.locator("[data-texteditor]").count(), 0, "clicking outside ends editing");
  const finalText = "画芯原位编辑导出验证。";
  await page.locator("aside textarea").first().fill(finalText);
  await exportVia(page, /导出 PDF/, /导出 PDF|仍然导出/, `${OUT}/inline-text.pdf`);
  assert.ok((await inspectPdf(`${OUT}/inline-text.pdf`)).text.includes(finalText));
  await sleep(1400);
  page.on("dialog", (dialog) =>
    dialog.type() === "beforeunload" ? dialog.accept() : dialog.dismiss(),
  );
  await page.reload();
  await page.waitForFunction(() => window.__bx?.state()?.doc);
  assert.equal(await elText(page, body.id), finalText);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  log(
    "inline editing: white-on-red geometry, live changes, caret, emoji deletion, paragraphs, IME/undo, columns/overflow, blur, PDF and reload passed",
  );
} finally {
  await ctx.close();
}
