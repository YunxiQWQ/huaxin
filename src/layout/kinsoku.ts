// 中文禁则：行首禁用（不可出现在行首）与行尾禁用（不可出现在行尾）字符
export const NO_START = new Set([
  ..."!%),.:;?]}¢°·’”\"'†‡›℃∶、。〃〆〕〗〞﹚﹜！＂％＇），．：；？］｝～–—…‥〉》」』】〙〟｠»ヽヾーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎ々〻‐゠〜‼⁇⁈⁉・",
]);
export const NO_END = new Set([..."([{£¥‘“〈《「『【〔〖〝﹙﹛＄（［｛￡￥〘｟«"]);

const CJK_RE =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef\u2010-\u2027\u2030-\u205e\u2e80-\u2eff\u3200-\u32ff]/u;

export function isCJK(ch: string) {
  return CJK_RE.test(ch);
}
export function isSpace(ch: string) {
  return ch === " " || ch === "\u00a0" || ch === "\t";
}
