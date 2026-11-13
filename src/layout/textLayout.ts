import type { TextElement, TextStyle } from "../model/types";
import { ptToMm } from "../model/units";
import { charWidthEm, fontMetricsEm } from "./measure";
import { fontEpoch } from "../fonts/loader";
import { NO_END, NO_START, isCJK, isSpace } from "./kinsoku";

export interface LayoutLine {
  col: number;
  /** mm from the element frame's left edge */
  x: number;
  /** line box top, mm from frame top */
  y: number;
  /** baseline, mm from frame top */
  baseline: number;
  text: string;
  /** natural width, mm (without trailing letter spacing) */
  width: number;
  /** spacing added after each character, mm (letter spacing + justification) */
  spacing: number;
  /** visual width including spacing */
  drawWidth: number;
  start: number;
  end: number;
}

export interface TextLayout {
  lines: LayoutLine[];
  overflow: boolean;
  /** source index of the first character that did not fit */
  overflowAt: number;
  fontSize: number;
  lineBox: number;
  ascent: number;
  descent: number;
  colWidth: number;
  /** height used by the tallest column including padding, mm */
  usedHeight: number;
}

type LayoutInput = Pick<
  TextElement,
  "text" | "style" | "w" | "h" | "columns" | "columnGap" | "padding" | "verticalAlign"
>;

interface Unit {
  chars: string[];
  idx: number[];
  w: number[];
  kind: "cjk" | "word" | "space";
}

const EPS = 0.001;

function buildUnits(chars: string[], idx: number[], widths: number[]): Unit[] {
  const units: Unit[] = [];
  let cur: Unit | null = null;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (isSpace(ch)) {
      cur = null;
      units.push({ chars: [ch], idx: [idx[i]], w: [widths[i]], kind: "space" });
    } else if (isCJK(ch) || NO_START.has(ch) || NO_END.has(ch)) {
      // opening punctuation glues to the following word; closing to the previous one
      if (cur && NO_START.has(ch) && !isCJK(ch)) {
        cur.chars.push(ch);
        cur.idx.push(idx[i]);
        cur.w.push(widths[i]);
        continue;
      }
      cur = null;
      units.push({ chars: [ch], idx: [idx[i]], w: [widths[i]], kind: "cjk" });
    } else {
      if (!cur) {
        cur = { chars: [], idx: [], w: [], kind: "word" };
        units.push(cur);
      }
      cur.chars.push(ch);
      cur.idx.push(idx[i]);
      cur.w.push(widths[i]);
    }
  }
  return units;
}

const first = (u: Unit) => u.chars[0];
const last = (u: Unit) => u.chars[u.chars.length - 1];

interface RawLine {
  chars: string[];
  idx: number[];
  w: number[];
  lastOfPara: boolean;
  firstOfPara: boolean;
  paraEnd: number;
}

/** Break a paragraph into lines for the given available width (first line may be indented). */
function breakParagraph(
  units: Unit[],
  colW: number,
  indentW: number,
  ls: number,
  paraEnd: number,
  fs: number,
): RawLine[] {
  const out: RawLine[] = [];
  let i = 0;
  let firstLine = true;
  if (units.length === 0)
    return [{ chars: [], idx: [], w: [], lastOfPara: true, firstOfPara: true, paraEnd }];
  while (i < units.length) {
    // skip leading spaces on wrapped lines
    if (!firstLine) while (i < units.length && units[i].kind === "space") i++;
    if (i >= units.length) break;
    const avail = colW - (firstLine ? indentW : 0);
    let width = 0;
    let count = 0;
    let j = i;
    for (; j < units.length; j++) {
      const u = units[j];
      let uw = 0;
      for (const w of u.w) uw += w + ls;
      const trailingIsSpace = u.kind === "space";
      const next = width + uw;
      // a trailing space never forces a break
      if (next - ls > avail + EPS && !trailingIsSpace) break;
      width = next;
      count += u.chars.length;
    }
    let b = j;
    if (j < units.length) {
      if (j === i) {
        // a single unit is wider than the column: split a word by characters, else take it whole
        const u = units[i];
        if (u.kind === "word" && u.chars.length > 1) {
          let w = 0;
          let k = 0;
          while (k < u.chars.length && w + u.w[k] <= avail + EPS) {
            w += u.w[k] + ls;
            k++;
          }
          k = Math.max(1, k);
          const head: Unit = {
            chars: u.chars.slice(0, k),
            idx: u.idx.slice(0, k),
            w: u.w.slice(0, k),
            kind: "word",
          };
          const tail: Unit = {
            chars: u.chars.slice(k),
            idx: u.idx.slice(k),
            w: u.w.slice(k),
            kind: "word",
          };
          units.splice(i, 1, head, tail);
        }
        b = i + 1;
      } else {
        // 推入：闭合标点略超出行宽时，整行轻微收紧以容纳它（最多约 0.08 字/间隙）
        const u = units[j];
        if (
          u.kind === "cjk" &&
          NO_START.has(first(u)) &&
          !(j + 1 < units.length && NO_START.has(first(units[j + 1])))
        ) {
          const over = width + u.w[0] - avail;
          if (over <= Math.min(fs, 0.08 * fs * count)) {
            b = j + 1;
          }
        }
        // 禁则处理：行首不得出现闭合标点，行尾不得出现开启标点（推出式）
        if (b === j) {
          let k = b;
          while (k > i + 1 && (NO_START.has(first(units[k])) || NO_END.has(last(units[k - 1]))))
            k--;
          if (k > i + 1 || !(NO_START.has(first(units[k])) || NO_END.has(last(units[k - 1]))))
            b = k;
        } else if (b < units.length && NO_END.has(last(units[b - 1]))) b = j;
      }
    }
    const line: RawLine = {
      chars: [],
      idx: [],
      w: [],
      lastOfPara: b >= units.length,
      firstOfPara: firstLine,
      paraEnd,
    };
    for (let k = i; k < b; k++) {
      line.chars.push(...units[k].chars);
      line.idx.push(...units[k].idx);
      line.w.push(...units[k].w);
    }
    // trim trailing spaces
    while (line.chars.length && isSpace(line.chars[line.chars.length - 1])) {
      line.chars.pop();
      line.idx.pop();
      line.w.pop();
    }
    out.push(line);
    i = b;
    firstLine = false;
  }
  if (out.length) out[out.length - 1].lastOfPara = true;
  return out;
}

export function normalizeText(t: string) {
  return t.replace(/\r\n?/g, "\n").replace(/\t/g, "  ");
}

/** 整理稿件：去掉空行、行首手工缩进空格和行尾空白（缩进由“首行缩进”控制）。 */
export function tidyManuscript(t: string) {
  return normalizeText(t)
    .split("\n")
    .map((l) => l.replace(/^[ \u3000\u00a0]+/, "").replace(/[ \u3000\u00a0]+$/, ""))
    .filter((l) => l.length > 0)
    .join("\n");
}

export function computeLayout(el: LayoutInput): TextLayout {
  const s: TextStyle = el.style;
  const fs = ptToMm(s.fontSize);
  const ls = s.letterSpacing * fs;
  const lineBox = fs * s.lineHeight;
  const m = fontMetricsEm(s.fontFamily, s.fontWeight);
  const ascent = m.ascent * fs;
  const descent = m.descent * fs;
  const baseOff = (lineBox - (ascent + descent)) / 2 + ascent;
  const pad = el.padding;
  const innerW = el.w - pad * 2;
  const innerH = el.h - pad * 2;
  const cols = Math.max(1, Math.round(el.columns));
  const gap = cols > 1 ? el.columnGap : 0;
  const colW = (innerW - gap * (cols - 1)) / cols;
  const spaceBefore = ptToMm(s.spaceBefore);
  const spaceAfter = ptToMm(s.spaceAfter);
  const indentW = s.indent * fs;

  const lines: LayoutLine[] = [];
  const text = el.text;
  let overflow = false;
  let overflowAt = text.length;
  let col = 0;
  let y = 0;
  const colHeights = new Array(cols).fill(0);

  if (colW < fs * 0.6 || innerH < 0) {
    return {
      lines,
      overflow: text.length > 0,
      overflowAt: 0,
      fontSize: fs,
      lineBox,
      ascent,
      descent,
      colWidth: Math.max(0, colW),
      usedHeight: 0,
    };
  }

  let pos = 0;
  const paras = text.split("\n");
  outer: for (let p = 0; p < paras.length; p++) {
    const para = paras[p];
    const chars: string[] = [];
    const idx: number[] = [];
    const widths: number[] = [];
    let off = pos;
    for (const ch of para) {
      chars.push(ch);
      idx.push(off);
      widths.push(charWidthEm(s.fontFamily, s.fontWeight, ch) * fs);
      off += ch.length;
    }
    const paraEnd = pos + para.length;
    const units = buildUnits(chars, idx, widths);
    const raw = breakParagraph(units, colW, indentW, ls, paraEnd, fs);
    if (p > 0 && y > EPS) y += spaceBefore;
    for (const r of raw) {
      if (y + lineBox > innerH + EPS) {
        col++;
        y = 0;
        if (col >= cols) {
          overflow = true;
          overflowAt = r.idx.length ? r.idx[0] : pos;
          break outer;
        }
      }
      const n = r.chars.length;
      let natural = 0;
      for (const w of r.w) natural += w;
      natural += Math.max(0, n - 1) * ls;
      const indent = r.firstOfPara && (s.align === "left" || s.align === "justify") ? indentW : 0;
      const avail = colW - indent;
      let x = indent;
      let spacing = ls;
      const squeeze = natural > avail + EPS && n > 1;
      if (squeeze) {
        // punctuation pushed into the line: tighten uniformly so the line fits exactly
        spacing = ls + (avail - natural) / (n - 1);
      } else if (s.align === "center") x = (colW - natural) / 2;
      else if (s.align === "right") x = colW - natural;
      else if (s.align === "justify" && !r.lastOfPara && n > 1 && natural < avail) {
        spacing = ls + (avail - natural) / (n - 1);
      }
      const drawWidth =
        squeeze || (s.align === "justify" && !r.lastOfPara && n > 1) ? avail : natural;
      lines.push({
        col,
        x: pad + col * (colW + gap) + x,
        y: pad + y,
        baseline: pad + y + baseOff,
        text: r.chars.join(""),
        width: natural,
        spacing,
        drawWidth,
        start: r.idx.length ? r.idx[0] : pos,
        end: r.idx.length ? r.idx[r.idx.length - 1] + r.chars[r.chars.length - 1].length : pos,
      });
      y += lineBox;
      colHeights[col] = Math.max(colHeights[col], y);
    }
    y += spaceAfter;
    pos = paraEnd + 1;
  }

  const used = Math.max(...colHeights);
  if (cols === 1 && el.verticalAlign !== "top" && !overflow) {
    const free = innerH - used;
    const dy = el.verticalAlign === "middle" ? free / 2 : free;
    if (dy > 0)
      for (const l of lines) {
        l.y += dy;
        l.baseline += dy;
      }
  }
  return {
    lines,
    overflow,
    overflowAt,
    fontSize: fs,
    lineBox,
    ascent,
    descent,
    colWidth: colW,
    usedHeight: used + pad * 2,
  };
}

const cache = new WeakMap<object, { epoch: number; layout: TextLayout }>();

/** Cached layout keyed by element identity (elements are immutable) and the font epoch. */
export function layoutOf(el: TextElement): TextLayout {
  const e = fontEpoch();
  const hit = cache.get(el);
  if (hit && hit.epoch === e) return hit.layout;
  const layout = computeLayout(el);
  cache.set(el, { epoch: e, layout });
  return layout;
}

/**
 * Smallest frame height that holds all text at the current width. For multi-column frames this
 * balances the columns (binary search on the height).
 */
export function fitHeight(el: TextElement): number {
  const single = computeLayout({ ...el, columns: 1, h: 100000, verticalAlign: "top" });
  if (el.columns <= 1) return Math.ceil(single.usedHeight * 10) / 10 + 0.2;
  let lo = single.lineBox + el.padding * 2;
  // upper bound: everything stacked in one column of the real column width
  let hi =
    single.usedHeight * Math.max(1, el.w / Math.max(1, single.colWidth / 1)) +
    single.lineBox * el.columns;
  while (computeLayout({ ...el, h: hi }).overflow && hi < 100000) hi *= 2;
  for (let k = 0; k < 40 && hi - lo > 0.1; k++) {
    const mid = (lo + hi) / 2;
    if (computeLayout({ ...el, h: mid }).overflow) lo = mid;
    else hi = mid;
  }
  return Math.ceil(hi * 10) / 10 + 0.2;
}
