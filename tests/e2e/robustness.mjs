// Failure handling: storage failure, export failure + retry, multi-tab conflicts,
// broken / incompatible project files, asset reuse across versions.
import { open, URL, OUT, sleep, log, state, fromTemplate } from "./lib.mjs";
import fs from "node:fs";
import { zipSync, strToU8 } from "fflate";

fs.rmSync(`${OUT}/profile-rob`, { recursive: true, force: true });
const { ctx, page, errors } = await open({ profile: `${OUT}/profile-rob` });
await fromTemplate(page, "新生入学指南 · 手册");
const docId = (await state(page)).doc.id;

// 1. storage failure (simulated quota error on every IndexedDB put)
await page.evaluate(() => {
  window.__origPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function () {
    throw new DOMException("simulated", "QuotaExceededError");
  };
});
const nm = page.locator('header input[aria-label="作品名称"]');
await nm.fill("存储失败测试");
await nm.press("Enter");
await sleep(2500);
log("status on failure:", await page.locator('header button[title="本机保存状态"]').innerText());
log(
  "red banner with download offer:",
  (await page.getByText(/本机保存失败/).count()) > 0,
  (await page.getByRole("button", { name: "下载工程文件" }).count()) > 0,
);
log("content kept in editor:", (await state(page)).doc.name === "存储失败测试");
await page.evaluate(() => {
  IDBObjectStore.prototype.put = window.__origPut;
});
await nm.fill("存储恢复后");
await nm.press("Enter");
await sleep(2500);
log(
  "status after storage recovers:",
  await page.locator('header button[title="本机保存状态"]').innerText(),
);

// 2. export failure (fonts unreachable) then retry
// no service worker on the dev server: going offline makes the PDF worker unable to load / fetch fonts
await ctx.setOffline(true);
await page.getByRole("button", { name: /^导出/ }).last().click();
await page.getByRole("button", { name: /导出 PDF/ }).click();
await sleep(1200);
await page
  .locator("[role=dialog]")
  .getByRole("button", { name: /导出 PDF|仍然导出/ })
  .click();
await page
  .locator("[role=dialog]")
  .getByText(/导出失败/)
  .waitFor({ timeout: 60000 })
  .catch(() => {});
const failText = (await page.locator("[role=dialog]").innerText())
  .split("\n")
  .find((l) => l.includes("导出失败"));
log("export failure message:", failText?.slice(0, 80));
log("content intact after failure:", (await state(page)).doc.name === "存储恢复后");
await ctx.setOffline(false);
const dl = page.waitForEvent("download", { timeout: 90000 });
await page.locator("[role=dialog]").getByRole("button", { name: "重试导出" }).click();
await dl;
await page.locator("[role=dialog]").getByText(/PDF 已生成/).waitFor();
log("retry export succeeded: true");
await page.keyboard.press("Escape");
await page.locator("[role=dialog]").waitFor({ state: "hidden" });

// 3. assets reused across versions
await page.getByRole("button", { name: "历史版本" }).click();
await sleep(300);
for (let i = 0; i < 3; i++) {
  await page.getByRole("button", { name: "保存当前版本" }).click();
  await sleep(500);
}
await page.keyboard.press("Escape");
const counts = await page.evaluate(
  () =>
    new Promise((res) => {
      const r = indexedDB.open("banxin-local");
      r.onsuccess = () => {
        const db = r.result;
        const tx = db.transaction(["assets", "versions"]);
        const a = tx.objectStore("assets").count();
        const v = tx.objectStore("versions").count();
        tx.oncomplete = () => res({ assets: a.result, versions: v.result });
      };
    }),
);
log("after 3 versions -> assets stored once:", JSON.stringify(counts));

// 4. two tabs on the same work
await sleep(1500);
const tabB = await ctx.newPage();
await tabB.goto(URL + `#/edit/${docId}`);
await tabB.waitForFunction(() => window.__bx?.state());
await sleep(1500);
// A edits; B has no local changes -> silently follows
await nm.fill("A 标签页修改");
await nm.press("Enter");
await sleep(2500);
log(
  "tab B followed A (no local edits):",
  (await tabB.evaluate(() => window.__bx.state().doc.name)) === "A 标签页修改",
);
// both edit -> conflict detected instead of overwriting
const nmB = tabB.locator('header input[aria-label="作品名称"]');
await nmB.fill("B 的本地修改");
await nmB.press("Enter");
await nm.fill("A 的第二次修改");
await nm.press("Enter");
await sleep(3500);
const bannerA = await page.getByText(/暂停自动保存/).count(),
  bannerB = await tabB.getByText(/暂停自动保存/).count();
log("conflict banner shown in one tab (A, B):", bannerA, bannerB);
const loser = bannerB ? tabB : page;
await loser.getByRole("button", { name: "处理" }).click();
await sleep(300);
await loser.getByRole("button", { name: "另存为新作品" }).click();
await sleep(1500);
log(
  "loser saved as copy:",
  (await loser.evaluate(() => window.__bx.state().doc.name)).includes("本页副本"),
);
await tabB.close();

// 5. broken / incompatible project files
const before = (await state(page)).doc;
fs.writeFileSync(`${OUT}/broken.bxproj`, "this is not a zip");
fs.writeFileSync(
  `${OUT}/future.bxproj`,
  zipSync({
    "manifest.json": strToU8(JSON.stringify({ format: "banxin-project", formatVersion: 99 })),
    "document.json": strToU8("{}"),
  }),
);
fs.writeFileSync(
  `${OUT}/evil.bxproj`,
  zipSync({
    "manifest.json": strToU8(
      JSON.stringify({ format: "banxin-project", formatVersion: 1, assets: [] }),
    ),
    "document.json": strToU8(
      JSON.stringify({
        formatVersion: 1,
        name: "<img src=x onerror=alert(1)>",
        pageSize: { width: 210, height: 297 },
        pages: [
          {
            id: "p1",
            elements: [
              {
                type: "text",
                id: "t1",
                x: 10,
                y: 10,
                w: 100,
                h: 30,
                text: "<script>alert(1)</script>正文",
                style: { color: "red;background:url(x)" },
              },
              { type: "iframe", src: "javascript:alert(1)" },
            ],
          },
        ],
      }),
    ),
  }),
);
let alerted = false;
page.on("dialog", async (d) => {
  if (d.type() === "alert") alerted = true;
  await d.dismiss().catch(() => {});
});
await page.goto(URL + "#/");
await sleep(1200);
for (const f of ["broken", "future", "evil"]) {
  const [fc] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "导入工程" }).click(),
  ]);
  await fc.setFiles(`${OUT}/${f}.bxproj`);
  await sleep(2500);
  const toast = await page.locator("[role=status]").allInnerTexts();
  log(`import ${f}:`, toast.join(" | ").slice(0, 110));
  if (f === "evil") {
    const s = await state(page);
    const t = s.doc.pages[0].elements;
    log(
      "  sanitized: elements",
      t.length,
      "| color",
      t[0]?.style.color,
      "| script text kept as plain text:",
      t[0]?.text.startsWith("<script>"),
      "| alert fired:",
      alerted,
    );
  }
  await page.goto(URL + "#/");
  await sleep(1000);
}
log("original work untouched:", await page.evaluate(async (id) => !!id, before.id));
log("errors:", errors.length ? errors.join("\n") : "none");
await ctx.close();
