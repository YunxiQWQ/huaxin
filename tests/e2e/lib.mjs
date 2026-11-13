// Shared helpers for the end-to-end checks (Playwright + system Chromium).
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
export const URL = process.env.BX_URL || "http://localhost:8443/";
export const OUT = path.resolve(process.env.BX_OUT || "artifacts/e2e");
const browserPaths = process.platform === "win32"
  ? [
      path.join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
      path.join(process.env.ProgramFiles || "C:/Program Files", "Google/Chrome/Application/chrome.exe"),
      path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe"),
    ]
  : process.platform === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    : ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"];
export const CHROME = process.env.CHROME || browserPaths.find((candidate) => fs.existsSync(candidate));
if (!CHROME) throw new Error("Install Chrome or Edge, or set CHROME to its executable path.");
fs.mkdirSync(OUT, { recursive: true });

export async function open({ profile = `${OUT}/profile`, scale = 1, w = 1500, h = 920 } = {}) {
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: CHROME,
    args: process.platform === "linux" ? ["--no-sandbox"] : [],
    viewport: { width: w, height: h },
    locale: "zh-CN",
    deviceScaleFactor: scale,
    acceptDownloads: true,
  });
  // force the <a download> path so Playwright can capture files (the save picker is used in real browsers)
  await ctx.addInitScript(() =>
    Object.defineProperty(window, "showSaveFilePicker", {
      value: undefined,
      configurable: true,
      writable: true,
    }),
  );
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const errors = [];
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push("[console] " + m.text()));
  // record anything that leaves the site origin, and any non-GET request (uploads)
  const external = [];
  ctx.on("request", (r) => {
    const u = r.url();
    if (!u.startsWith(new globalThis.URL(URL).origin) && !/^(data|blob|chrome-extension|chrome|edge|devtools):/.test(u))
      external.push(r.method() + " " + u);
    if (r.method() !== "GET") external.push("NON-GET " + r.method() + " " + u);
  });
  return { ctx, page, errors, external };
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (...a) => console.log("•", ...a);

export const state = (page) => page.evaluate(() => window.__bx?.state());
export async function findEl(page, src) {
  return page.evaluate((src) => {
    const s = window.__bx.state();
    const p = s.doc.pages.find((x) => x.id === s.pageId);
    const e = p.elements.find(new Function("e", "return " + src));
    return e && JSON.parse(JSON.stringify(e));
  }, src);
}
export async function elText(page, id) {
  return page.evaluate((id) => {
    for (const p of window.__bx.state().doc.pages)
      for (const e of p.elements) if (e.id === id) return e.text;
  }, id);
}
export async function fromTemplate(page, name) {
  await page.goto(URL + "#/templates");
  await sleep(1200);
  await page.getByText(name).first().click();
  await page.getByRole("button", { name: "使用此模板创建" }).click();
  await page.waitForFunction(() => window.__bx?.state()?.doc, null, { timeout: 30000 });
  await sleep(2500);
}
export async function exportVia(page, menuItem, button, file) {
  await page.getByRole("button", { name: /^导出/ }).last().click();
  await page.getByRole("button", { name: menuItem }).click();
  await sleep(1500);
  const dl = page.waitForEvent("download", { timeout: 120000 }).then((d) => ({ d }));
  await page.locator("[role=dialog]").getByRole("button", { name: button }).click();
  const failed = page
    .locator("[role=dialog]")
    .getByText(/失败/)
    .waitFor({ timeout: 120000 })
    .then(() => ({ d: null }));
  let result;
  try {
    result = await Promise.race([dl, failed]);
  } catch (error) {
    await page.screenshot({ path: `${OUT}/export-failure.png` }).catch(() => {});
    console.error("Export dialog at failure:", await page.locator("[role=dialog]").innerText().catch(() => "unavailable"));
    throw error;
  }
  const { d } = result;
  if (!d) throw new Error(await page.locator("[role=dialog]").innerText());
  await page.locator("[role=dialog]").getByText(/PDF 已生成|图片已保存|已将.*打包/).waitFor();
  const text = await page.locator("[role=dialog]").innerText();
  await d.saveAs(file);
  await page.keyboard.press("Escape");
  await page.locator("[role=dialog]").waitFor({ state: "hidden" });
  return text;
}
