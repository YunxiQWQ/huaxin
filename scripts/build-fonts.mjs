// Builds the self-hosted Chinese font subsets in public/fonts.
// Usage: node scripts/build-fonts.mjs <source-dir> [face-id]
// The source dir must contain the original OFL font files listed in FONTS (see README).
import fs from "node:fs";
import path from "node:path";
import subsetFont from "subset-font";
import fontkit from "@pdf-lib/fontkit";
import { createHash } from "node:crypto";

const src = process.argv[2] || "/tmp/fontsrc";
const out = path.resolve("public/fonts");
const manifestFile = path.join(out, "manifest-v1.530.json");
fs.mkdirSync(out, { recursive: true });

// id, source file, file weight axis value, output file
const FONTS = [
  { id: "noto-sans-sc-400", file: "NotoSansSC.ttf", wght: 400 },
  { id: "noto-sans-sc-700", file: "NotoSansSC.ttf", wght: 700 },
  { id: "noto-serif-sc-400", file: "NotoSerifSC.ttf", wght: 400 },
  { id: "noto-serif-sc-700", file: "NotoSerifSC.ttf", wght: 700 },
  { id: "noto-serif-sc-900", file: "NotoSerifSC.ttf", wght: 900 },
  // Preserve the official original (including its reserved font names).
  {
    id: "lxgw-wenkai-400",
    file: "LXGWWenKai.ttf",
    original: true,
    output: "lxgw-wenkai-v1.530-400.ttf",
  },
  { id: "ma-shan-zheng-400", file: "MaShanZheng.ttf" },
  { id: "zcool-xiaowei-400", file: "ZCOOLXiaoWei.ttf" },
];

function range(a, b) {
  let s = "";
  for (let c = a; c <= b; c++) s += String.fromCodePoint(c);
  return s;
}

// 通用规范汉字表 (8105) + GB2312 + punctuation / symbols used in Chinese publishing.
const tgscc = fs
  .readFileSync(path.resolve("scripts/fonts/tgscc-8105.txt"), "utf8")
  .replace(/\s/g, "");
let gb = "";
const dec = new TextDecoder("gb18030");
for (let a = 0xa1; a <= 0xf7; a++)
  for (let b = 0xa1; b <= 0xfe; b++) {
    const c = dec.decode(new Uint8Array([a, b]));
    if (c.length === 1 && c !== "\uFFFD") gb += c;
  }
const extra =
  range(0x20, 0x7e) +
  range(0xa0, 0x17f) +
  range(0x2000, 0x206f) +
  range(0x2100, 0x215f) +
  range(0x2160, 0x218f) +
  range(0x2190, 0x21ff) +
  range(0x2200, 0x22ff) +
  range(0x2460, 0x24ff) +
  range(0x2500, 0x257f) +
  range(0x25a0, 0x25ff) +
  range(0x2600, 0x26ff) +
  range(0x3000, 0x303f) +
  range(0x3040, 0x30ff) +
  range(0x3200, 0x32ff) +
  range(0xfe10, 0xfe1f) +
  range(0xfe30, 0xfe4f) +
  range(0xff00, 0xffef) +
  range(0x0391, 0x03c9);
const charset = [...new Set([...tgscc, ...gb, ...extra])].join("");
console.log("charset size", [...charset].length);

const only = process.argv[3];
if (only && !FONTS.some((f) => f.id === only)) throw new Error(`Unknown face: ${only}`);
const manifest = only ? JSON.parse(fs.readFileSync(manifestFile, "utf8")) : { fonts: {} };
manifest.generated = new Date().toISOString();
for (const f of FONTS.filter((f) => !only || f.id === only)) {
  const buf = fs.readFileSync(path.join(src, f.file));
  const opts = { targetFormat: "sfnt" };
  if (f.wght) opts.variationAxes = { wght: f.wght };
  const sub = f.original ? buf : await subsetFont(buf, charset, opts);
  const file = f.output ?? `${f.id}.ttf`;
  fs.writeFileSync(path.join(out, file), sub);
  const font = fontkit.create(sub);
  const missing = [...charset].filter(
    (ch) => /\p{Script=Han}/u.test(ch) && !font.hasGlyphForCodePoint(ch.codePointAt(0)),
  );
  manifest.fonts[f.id] = {
    file,
    bytes: sub.length,
    glyphs: font.numGlyphs,
    missingHan: missing.join(""),
  };
  if (f.original) {
    const ranges = [];
    for (const cp of [...font.characterSet].sort((a, b) => a - b)) {
      const last = ranges[ranges.length - 1];
      if (last && cp === last[1] + 1) last[1] = cp;
      else ranges.push([cp, cp]);
    }
    Object.assign(manifest.fonts[f.id], {
      version: font.version,
      original: true,
      sha256: createHash("sha256").update(buf).digest("hex"),
      ranges,
    });
  }
  console.log(
    f.id,
    (sub.length / 1024 / 1024).toFixed(2) + "MB",
    "glyphs",
    font.numGlyphs,
    "missing han",
    missing.length,
  );
}
fs.writeFileSync(path.join(out, "charset.txt"), charset);
fs.writeFileSync(manifestFile, JSON.stringify(manifest));
for (const l of fs.readdirSync(src).filter((n) => n.startsWith("OFL-")))
  fs.writeFileSync(
    path.join(out, l),
    fs.readFileSync(path.join(src, l), "utf8").replace(/[ \t]+$/gm, ""),
  );
