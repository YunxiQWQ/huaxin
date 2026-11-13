// Instantiate every template, run the layout check, export a PDF of each.
import { open, OUT, sleep, log, fromTemplate, exportVia } from "./lib.mjs";
import { inspectPdf, renderPdf } from "./files.mjs";
const NAMES = [
  "青禾校园报 · 四版",
  "山居茶事 · 电子画册",
  "青春纪 · 校刊",
  "新生入学指南 · 手册",
  "古镇行旅 · 横版画册",
];
const { ctx, page, errors } = await open({ profile: `${OUT}/profile-tpl` });
page.on("dialog", (d) => console.log("DIALOG:", d.type(), d.message().slice(0, 80)));
for (const [i, name] of NAMES.entries()) {
  await fromTemplate(page, name);
  await page.getByRole("button", { name: "检查", exact: true }).click();
  await sleep(2500);
  const issues = (await page.locator("aside, nav + div").first().innerText())
    .split("\n")
    .filter((l) => /第 \d+ 页 ·/.test(l) || /未发现问题/.test(l));
  const msg = await exportVia(page, /导出 PDF/, /导出 PDF|仍然导出/, `${OUT}/T${i}.pdf`);
  log(
    name,
    "| check:",
    issues.join(" ; ") || "(none listed)",
    "|",
    msg.split("\n").find((l) => /PDF 已生成|失败/.test(l)),
  );
  log("PDF inspection:", (await inspectPdf(`${OUT}/T${i}.pdf`)).summary);
  renderPdf(`${OUT}/T${i}.pdf`, `${OUT}/T${i}`);
}
log("errors:", errors.length ? errors.join("\n") : "none");
await ctx.close();
