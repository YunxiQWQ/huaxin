// Font catalog permissions, real local font bytes, exports and portable references.
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import fontkit from "@pdf-lib/fontkit";
import { open, OUT, sleep, log, state, findEl, fromTemplate, exportVia } from "./lib.mjs";
import { inspectPdf, readZip, readZipJson } from "./files.mjs";

const official = fs.readFileSync("public/fonts/lxgw-wenkai-v1.530-400.ttf");
assert.match(fontkit.create(official).version, /1\.530/);
const manifest = JSON.parse(fs.readFileSync("public/fonts/manifest-v1.530.json", "utf8"));
assert.equal(manifest.fonts["lxgw-wenkai-400"].original, true);
assert.equal(manifest.fonts["lxgw-wenkai-400"].bytes, official.length);
log("official WenKai v1.530", crypto.createHash("sha256").update(official).digest("hex"));

const run = Date.now();
const mock = await open({ profile: `${OUT}/fonts-mock-${run}` });
try {
  const { ctx, page, errors, external } = mock;
  await ctx.addInitScript(() => {
    const permissionQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (desc) =>
      desc.name === "local-fonts"
        ? Promise.resolve({
            state: sessionStorage.getItem("font-test-mode") === "granted" ? "granted" : "prompt",
          })
        : permissionQuery(desc);
    window.__fontQueries = 0;
    window.__fontBlobs = 0;
    const font = (family, style, postscriptName, url, flags = 0) => ({
      family,
      style,
      postscriptName,
      fullName: `${family} ${style}`,
      blob: async () => {
        window.__fontBlobs++;
        const bytes = await (await fetch(url)).arrayBuffer();
        if (flags) {
          const view = new DataView(bytes);
          for (let i = 0; i < view.getUint16(4); i++) {
            const at = 12 + i * 16;
            if (view.getUint32(at) === 0x4f532f32)
              view.setUint16(view.getUint32(at + 8) + 8, flags);
          }
        }
        return new Blob([bytes]);
      },
    });
    Object.defineProperty(window, "queryLocalFonts", {
      configurable: true,
      value:
        sessionStorage.getItem("font-test-mode") === "unsupported"
          ? undefined
          : async () => {
              window.__fontQueries++;
              if (sessionStorage.getItem("font-test-mode") !== "granted")
                throw new DOMException("Denied", "NotAllowedError");
              return [
                font("本机测试文楷", "Regular", "TestLocal-Regular", "/fonts/noto-sans-sc-400.ttf"),
                font("本机测试文楷", "Bold", "TestLocal-Bold", "/fonts/noto-sans-sc-700.ttf"),
                font(
                  "本机测试受限",
                  "Regular",
                  "TestRestricted-Regular",
                  "/fonts/noto-sans-sc-400.ttf",
                  2,
                ),
                font(
                  "本机测试完整嵌入",
                  "Regular",
                  "TestFull-Regular",
                  "/fonts/noto-sans-sc-400.ttf",
                  256,
                ),
              ];
            },
    });
  });
  await fromTemplate(page, "青禾校园报 · 四版");
  const body = await findEl(page, "e.type==='text' && e.text.startsWith('开馆仪式')");
  const selectBody = () =>
    page.locator(`[data-el="${body.id}"]`).click({ position: { x: 40, y: 40 } });
  await selectBody();
  assert.equal(
    await page.evaluate(() => window.__fontQueries),
    0,
    "never enumerate without a click/permission",
  );
  await page.getByRole("button", { name: "使用本机字体", exact: true }).click();
  await page.getByText(/未获得本机字体权限/).waitFor();
  await page.evaluate(() => sessionStorage.setItem("font-test-mode", "granted"));
  await page.getByRole("button", { name: "使用本机字体", exact: true }).click();
  await page.getByRole("button", { name: "刷新本机字体", exact: true }).waitFor();
  const picker = page.getByRole("combobox", { name: "字体系列" });
  assert.deepEqual(await picker.evaluate((el) => [...el.children].map((x) => x.tagName)), [
    "OPTGROUP",
    "HR",
    "OPTGROUP",
  ]);
  assert.equal(await picker.locator("optgroup").first().getAttribute("label"), "网站字体");
  assert.equal(await picker.locator("optgroup").first().locator("option").count(), 5);
  assert.equal(
    await page.evaluate(() => window.__fontBlobs),
    0,
    "enumeration must not load every font file",
  );
  await picker.selectOption({ label: "本机测试文楷" });
  await page.waitForFunction(() => window.__fontBlobs === 1);
  const localId = (await state(page)).doc.pages[0].elements.find((e) => e.id === body.id).style
    .fontFamily;
  const marker = "本机字体导出验证：玉兰花开，版心排版。";
  await page.locator("aside textarea").first().fill(marker);
  await page.getByRole("button", { name: "粗体 Ctrl+B", exact: true }).click();
  await page.waitForFunction(() => window.__fontBlobs === 2);
  await exportVia(page, /导出 PDF/, /导出 PDF|仍然导出/, `${OUT}/fonts-local.pdf`);
  assert.ok((await inspectPdf(`${OUT}/fonts-local.pdf`)).text.includes(marker));
  await exportVia(page, /导出 PDF/, /导出 PDF|仍然导出/, `${OUT}/fonts-local-repeat.pdf`);
  assert.ok(
    (await inspectPdf(`${OUT}/fonts-local-repeat.pdf`)).text.includes(marker),
    "transferred buffers remain reusable",
  );

  const png = await page.evaluate(async () => {
    const { exportImages } = await import("/src/io/imageExport.ts");
    const { blob } = await exportImages(
      window.__bx.state().doc,
      [0],
      { format: "png", dpi: 96, quality: 0.9 },
      () => {},
    );
    const bitmap = await createImageBitmap(blob);
    return [bitmap.width, bitmap.height, blob.size];
  });
  assert.deepEqual(png.slice(0, 2), [1020, 1474]);
  assert.ok(png[2] > 10000);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载工程", exact: true }).click();
  await (await download).saveAs(`${OUT}/fonts-local.bxproj`);
  const entries = readZip(`${OUT}/fonts-local.bxproj`);
  const packaged = readZipJson(entries, "manifest.json");
  assert.equal(packaged.fonts.find((f) => f.id === localId).name, "本机测试文楷");
  assert.ok(packaged.fonts.every((f) => f.embedded === false));
  assert.ok(!Object.keys(entries).some((x) => /\.(ttf|otf|woff2?)$/i.test(x)));
  const sanitized = await page.evaluate(
    async (doc) => {
      const { sanitizeDoc } = await import("/src/io/validate.ts");
      return sanitizeDoc(doc);
    },
    readZipJson(entries, "document.json"),
  );
  assert.equal(sanitized.pages[0].elements.find((e) => e.id === body.id).style.fontFamily, localId);
  await sleep(1300);
  page.on("dialog", (d) => (d.type() === "beforeunload" ? d.accept() : d.dismiss()));
  await page.reload();
  await page.waitForFunction(() => window.__bx?.state()?.doc);
  await selectBody();
  await page.getByRole("button", { name: "刷新本机字体", exact: true }).waitFor();
  assert.equal(await picker.inputValue(), localId, "granted permission restores a draft's family");
  await page.evaluate(() => sessionStorage.setItem("font-test-mode", "prompt"));
  await page.reload();
  await page.waitForFunction(() => window.__bx?.state()?.doc);
  await selectBody();
  assert.equal(await picker.inputValue(), localId);
  await page.getByText(/请在下方启用本机字体/).waitFor();
  assert.equal(await page.evaluate(() => window.__fontQueries), 0);
  await page.evaluate(() => sessionStorage.setItem("font-test-mode", "granted"));
  await page.getByRole("button", { name: "使用本机字体", exact: true }).click();
  await page.getByRole("button", { name: "刷新本机字体", exact: true }).waitFor();
  assert.equal(await picker.inputValue(), localId);
  await page.screenshot({ path: `${OUT}/fonts-picker.png` });

  await picker.selectOption({ label: "本机测试完整嵌入" });
  await exportVia(page, /导出 PDF/, /导出 PDF|仍然导出/, `${OUT}/fonts-no-subset.pdf`);
  assert.ok(fs.statSync(`${OUT}/fonts-no-subset.pdf`).size > 1000000);
  await picker.selectOption({ label: "本机测试受限" });
  const restricted = await page.evaluate(async () => {
    try {
      const { exportPdf } = await import("/src/io/pdfExport.ts");
      await exportPdf(window.__bx.state().doc, [0], () => {});
      return "unexpected success";
    } catch (err) {
      return err.message;
    }
  });
  assert.match(restricted, /嵌入限制/);
  await page.evaluate(() => sessionStorage.setItem("font-test-mode", "unsupported"));
  await page.reload();
  await page.waitForFunction(() => window.__bx?.state()?.doc);
  await selectBody();
  assert.equal(
    await page.getByRole("button", { name: "使用本机字体", exact: true }).isDisabled(),
    true,
  );
  assert.equal(await picker.locator("optgroup").first().locator("option").count(), 5);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  log(
    "mock: permission/denial, website-first separator, lazy bytes, bold, PDF x2, PNG, package, refresh/regrant, restrictions, unsupported passed",
  );
} finally {
  await mock.ctx.close();
}

const native = await open({ profile: `${OUT}/fonts-native-${run}` });
try {
  const { ctx, page, errors, external } = native;
  await ctx.grantPermissions(["local-fonts"]);
  await fromTemplate(page, "青禾校园报 · 四版");
  const body = await findEl(page, "e.type==='text' && e.text.startsWith('开馆仪式')");
  await page.locator(`[data-el="${body.id}"]`).click({ position: { x: 40, y: 40 } });
  await page.getByRole("button", { name: "刷新本机字体", exact: true }).waitFor();
  const picker = page.getByRole("combobox", { name: "字体系列" });
  const names = await picker.locator('optgroup[label="本机字体"] option').allTextContents();
  const name = ["Microsoft YaHei UI", "Microsoft YaHei", "SimSun", "Arial"].find((f) =>
    names.includes(f),
  );
  assert.ok(name, "need a known system font for the real FontData.blob path");
  await picker.selectOption({ label: name });
  const marker =
    name === "Arial" ? "Native local font export 2026" : "真实本机字体：春风又绿江南岸。";
  await page.locator("aside textarea").first().fill(marker);
  await exportVia(page, /导出 PDF/, /导出 PDF|仍然导出/, `${OUT}/fonts-native.pdf`);
  assert.ok((await inspectPdf(`${OUT}/fonts-native.pdf`)).text.includes(marker));
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  log(`native: ${names.length} installed families; ${name} FontData.blob -> PDF passed`);
} finally {
  await native.ctx.close();
}
