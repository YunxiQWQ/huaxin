// Font subsetting with HarfBuzz (WebAssembly, MIT). pdf-lib's built-in TrueType subsetter
// drops outlines of many CJK glyphs, so fonts are subset here and embedded as-is.
import wasmUrl from "harfbuzzjs/dist/harfbuzz-subset.wasm?url";

type HB = Record<string, any> & { memory: WebAssembly.Memory };
let hbP: Promise<HB> | null = null;

function load(): Promise<HB> {
  if (!hbP)
    hbP = (async () => {
      const res = await fetch(wasmUrl);
      if (!res.ok) throw new Error("无法加载字体子集化组件");
      const { instance } = await WebAssembly.instantiate(await res.arrayBuffer());
      const ex = instance.exports as unknown as HB;
      ex._initialize?.();
      return ex;
    })();
  return hbP;
}

const HB_MEMORY_MODE_WRITABLE = 2;
const HB_SUBSET_FLAGS_NO_HINTING = 0x1;
const HB_SUBSET_SETS_DROP_TABLE_TAG = 3;
const tag = (t: string) => [...t].reduce((a, c) => (a << 8) + c.charCodeAt(0), 0) >>> 0;
// shaping tables are not used by the exporter (glyphs are placed one by one); dropping them
// also avoids parser failures in fontkit on pruned layout tables
const DROP = ["GSUB", "GPOS", "GDEF", "BASE", "JSTF", "STAT", "MATH"];

/** Return a TrueType font containing only the glyphs for `text` (glyph ids are renumbered). */
export async function subsetFont(font: ArrayBuffer, text: string): Promise<Uint8Array> {
  const hb = await load();
  const heap = () => new Uint8Array(hb.memory.buffer);
  const input = hb.hb_subset_input_create_or_fail();
  if (!input) throw new Error("字体子集化初始化失败");
  const ptr = hb.malloc(font.byteLength);
  heap().set(new Uint8Array(font), ptr);
  const blob = hb.hb_blob_create(ptr, font.byteLength, HB_MEMORY_MODE_WRITABLE, 0, 0);
  const face = hb.hb_face_create(blob, 0);
  hb.hb_blob_destroy(blob);
  hb.hb_subset_input_set_flags(
    input,
    hb.hb_subset_input_get_flags(input) | HB_SUBSET_FLAGS_NO_HINTING,
  );
  const drop = hb.hb_subset_input_set(input, HB_SUBSET_SETS_DROP_TABLE_TAG);
  for (const t of DROP) hb.hb_set_add(drop, tag(t));
  const unicodes = hb.hb_subset_input_unicode_set(input);
  for (const ch of new Set(text)) hb.hb_set_add(unicodes, ch.codePointAt(0));
  let subset = 0;
  try {
    subset = hb.hb_subset_or_fail(face, input);
  } finally {
    hb.hb_subset_input_destroy(input);
  }
  if (!subset) {
    hb.hb_face_destroy(face);
    hb.free(ptr);
    throw new Error("字体子集化失败，字体文件可能已损坏");
  }
  const out = hb.hb_face_reference_blob(subset);
  const offset = hb.hb_blob_get_data(out, 0);
  const len = hb.hb_blob_get_length(out);
  const bytes = heap().slice(offset, offset + len);
  hb.hb_blob_destroy(out);
  hb.hb_face_destroy(subset);
  hb.hb_face_destroy(face);
  hb.free(ptr);
  if (!len) throw new Error("字体子集化结果为空");
  // zero padding: fontkit reads a glyph header even for an empty last glyph, which overruns the
  // buffer when 'glyf' is the final table. Tables are addressed by offset/length, so this is safe.
  const padded = new Uint8Array(len + 64);
  padded.set(bytes);
  return padded;
}
