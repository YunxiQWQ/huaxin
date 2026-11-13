// Production cache upgrade: versioned assets bypass legacy entries and retain other fonts.
import assert from "node:assert/strict";
process.env.BX_URL ||= "http://localhost:4173/";
const { open, OUT, log } = await import("./lib.mjs");
const { ctx, page, errors, external } = await open({
  profile: `${OUT}/cache-upgrade-${Date.now()}`,
});
try {
  await page.goto(process.env.BX_URL);
  await page.waitForFunction(() => navigator.serviceWorker?.controller?.state === "activated");
  const result = await page.evaluate(async () => {
    const legacy = await caches.open("banxin-runtime-v1");
    const url = (path) => new URL(path, location.href).href;
    await legacy.put(url("fonts/lxgw-wenkai-400.ttf"), new Response("STALE_FONT"));
    await legacy.put(url("fonts/manifest.json"), new Response("STALE_COVERAGE"));
    await legacy.put(url("fonts/unchanged-test.ttf"), new Response("PRESERVED_FONT"));
    const target = `${navigator.serviceWorker.controller.scriptURL}&probe=${Date.now()}`;
    const change = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("service worker did not update")), 30000);
      const handler = () => {
        if (navigator.serviceWorker.controller?.scriptURL !== target) return;
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener("controllerchange", handler);
        resolve();
      };
      navigator.serviceWorker.addEventListener("controllerchange", handler);
    });
    await navigator.serviceWorker.register(target, { updateViaCache: "none" });
    await change;
    const worker = navigator.serviceWorker.controller;
    if (worker.state !== "activated")
      await new Promise((resolve) => {
        const handler = () => {
          if (worker.state !== "activated") return;
          worker.removeEventListener("statechange", handler);
          resolve();
        };
        worker.addEventListener("statechange", handler);
      });
    const fontUrl = url("fonts/lxgw-wenkai-v1.530-400.ttf");
    const bytes = await (await fetch(fontUrl)).arrayBuffer();
    const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    const manifest = await (await fetch(url("fonts/manifest-v1.530.json"))).json();
    const preserved = await (
      await (await caches.open("banxin-runtime-v1")).match(url("fonts/unchanged-test.ttf"))
    ).text();
    return { sha, bytes: bytes.byteLength, preserved, record: manifest.fonts["lxgw-wenkai-400"] };
  });
  assert.equal(result.sha, "2d73eea94ad808999d90c0000c239a84a33b09d4bc6ab6c5b8bbf1eda8a7fc8b");
  assert.equal(result.preserved, "PRESERVED_FONT");
  assert.equal(result.record.sha256, result.sha);
  assert.equal(result.record.file, "lxgw-wenkai-v1.530-400.ttf");
  await page.waitForFunction(
    async () =>
      !!(await (
        await caches.open("banxin-runtime-v1")
      ).match(new URL("fonts/lxgw-wenkai-v1.530-400.ttf", location.href).href)),
  );
  await ctx.setOffline(true);
  const offlineBytes = await page.evaluate(
    async () =>
      (
        await (
          await fetch(new URL("fonts/lxgw-wenkai-v1.530-400.ttf", location.href))
        ).arrayBuffer()
      ).byteLength,
  );
  assert.equal(offlineBytes, result.bytes);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  log(
    "legacy font/coverage bypassed; unchanged fonts retained; official v1.530 online and offline passed",
    result.sha,
  );
} finally {
  await ctx.close();
}
