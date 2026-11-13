import type { Doc, Page, PageElement, TextElement, TextStyle } from "../model/types";
import { commit, currentPage, getState, setUI } from "./store";
import { uid } from "../model/units";
import { newPage } from "../model/defaults";
import { aabb, selectionBounds } from "./geometry";
import { sanitizeAssets, sanitizeElement } from "../io/validate";

// ---- low-level immutable helpers ----
export function mapPage(doc: Doc, pageId: string, fn: (p: Page) => Page): Doc {
  let changed = false;
  const pages = doc.pages.map((p) => {
    if (p.id !== pageId) return p;
    const n = fn(p);
    if (n !== p) changed = true;
    return n;
  });
  return changed ? { ...doc, pages } : doc;
}

export function mapElements(
  doc: Doc,
  pageId: string,
  ids: Iterable<string>,
  fn: (e: PageElement) => PageElement,
): Doc {
  const set = new Set(ids);
  return mapPage(doc, pageId, (p) => {
    let changed = false;
    const elements = p.elements.map((e) => {
      if (!set.has(e.id)) return e;
      const n = fn(e);
      if (n !== e) changed = true;
      return n;
    });
    return changed ? { ...p, elements } : p;
  });
}

export function updateElement(
  id: string,
  patch: Partial<PageElement> | ((e: PageElement) => Partial<PageElement>),
  merge?: string,
) {
  const s = getState();
  commit(
    (d) =>
      mapElements(
        d,
        s.pageId,
        [id],
        (e) => ({ ...e, ...(typeof patch === "function" ? patch(e) : patch) }) as PageElement,
      ),
    { merge },
  );
}

export function updateElements(
  ids: string[],
  fn: (e: PageElement) => Partial<PageElement>,
  merge?: string,
) {
  const s = getState();
  commit((d) => mapElements(d, s.pageId, ids, (e) => ({ ...e, ...fn(e) }) as PageElement), {
    merge,
  });
}

export function updateTextStyle(ids: string[], patch: Partial<TextStyle>, merge?: string) {
  updateElements(ids, (e) => (e.type === "text" ? { style: { ...e.style, ...patch } } : {}), merge);
}

// ---- selection ----
/** Expand a set of ids so that grouped elements are selected together. */
export function expandGroups(page: Page, ids: string[]): string[] {
  const groups = new Set(
    page.elements.filter((e) => ids.includes(e.id) && e.groupId).map((e) => e.groupId!),
  );
  if (!groups.size) return ids;
  const out = new Set(ids);
  for (const e of page.elements) if (e.groupId && groups.has(e.groupId)) out.add(e.id);
  return [...out];
}

export function select(ids: string[], additive = false) {
  const s = getState();
  const page = currentPage(s);
  let next = expandGroups(page, ids);
  if (additive) {
    const cur = new Set(s.selection);
    const allIn = next.every((id) => cur.has(id));
    if (allIn) next.forEach((id) => cur.delete(id));
    else next.forEach((id) => cur.add(id));
    next = [...cur];
  }
  setUI({
    selection: next,
    editingId: null,
    cropId: s.cropId && next.includes(s.cropId) ? s.cropId : null,
  });
}

export function selectAll() {
  const page = currentPage();
  setUI({
    selection: page.elements.filter((e) => !e.locked && !e.hidden).map((e) => e.id),
    editingId: null,
    cropId: null,
  });
}

export function gotoPage(pageId: string) {
  setUI({ pageId, selection: [], editingId: null, cropId: null });
}

// ---- element operations ----
export function addElements(els: PageElement[], pageId = getState().pageId) {
  commit((d) => mapPage(d, pageId, (p) => ({ ...p, elements: [...p.elements, ...els] })), {
    ui: { pageId, selection: els.map((e) => e.id), editingId: null, cropId: null },
  });
}

export function deleteSelection() {
  const s = getState();
  const ids = new Set(
    s.selection.filter((id) => !currentPage(s).elements.find((e) => e.id === id)?.locked),
  );
  if (!ids.size) return;
  commit(
    (d) =>
      mapPage(d, s.pageId, (p) => ({ ...p, elements: p.elements.filter((e) => !ids.has(e.id)) })),
    {
      ui: { selection: [], editingId: null, cropId: null },
    },
  );
}

function cloneElements(els: PageElement[], offset: number): PageElement[] {
  const groupMap = new Map<string, string>();
  return els.map((e) => {
    let groupId = e.groupId;
    if (groupId) {
      if (!groupMap.has(groupId)) groupMap.set(groupId, uid("g"));
      groupId = groupMap.get(groupId);
    }
    return {
      ...structuredClone(e),
      id: uid(e.type[0]),
      x: e.x + offset,
      y: e.y + offset,
      groupId,
      locked: false,
    };
  });
}

export function duplicateSelection() {
  const s = getState();
  const page = currentPage(s);
  const sel = page.elements.filter((e) => s.selection.includes(e.id));
  if (!sel.length) return;
  addElements(cloneElements(sel, 5));
}

// ---- clipboard (also exchanged with system clipboard as JSON) ----
export const CLIP_MIME = "application/x-banxin-elements";
export function serializeSelection(): string | null {
  const s = getState();
  const els = currentPage(s).elements.filter((e) => s.selection.includes(e.id));
  if (!els.length) return null;
  return JSON.stringify({
    kind: "banxin-elements",
    elements: els,
    assets: Object.fromEntries(
      els.flatMap((e) =>
        e.type === "image" && e.assetId && s.doc.assets[e.assetId]
          ? [[e.assetId, s.doc.assets[e.assetId]]]
          : [],
      ),
    ),
  });
}

export function pasteSerialized(json: string, sameSpot: boolean): boolean {
  let data: any;
  try {
    data = JSON.parse(json);
  } catch {
    return false;
  }
  if (data?.kind !== "banxin-elements" || !Array.isArray(data.elements)) return false;
  // clipboard content is untrusted: re-validate through the project import sanitizer
  const els = (data.elements as unknown[])
    .map((e) => sanitizeElement(e))
    .filter(Boolean) as PageElement[];
  if (!els.length) return false;
  const clones = cloneElements(els, sameSpot ? 0 : 5);
  const assets = sanitizeAssets(data.assets);
  commit(
    (d) => {
      const newAssets = { ...d.assets };
      for (const e of clones)
        if (e.type === "image" && e.assetId && assets[e.assetId] && !newAssets[e.assetId])
          newAssets[e.assetId] = assets[e.assetId];
      return mapPage({ ...d, assets: newAssets }, getState().pageId, (p) => ({
        ...p,
        elements: [...p.elements, ...clones],
      }));
    },
    { ui: { selection: clones.map((e) => e.id), editingId: null, cropId: null } },
  );
  return true;
}

// ---- grouping / locking / order ----
export function groupSelection() {
  const s = getState();
  if (s.selection.length < 2) return;
  const gid = uid("g");
  updateElements(s.selection, () => ({ groupId: gid }));
}

export function ungroupSelection() {
  const s = getState();
  updateElements(s.selection, () => ({ groupId: undefined }));
}

export function toggleLock(ids = getState().selection) {
  const page = currentPage();
  const els = page.elements.filter((e) => ids.includes(e.id));
  const lock = !els.every((e) => e.locked);
  updateElements(ids, () => ({ locked: lock }));
  if (lock) setUI({ selection: [] });
}

export function toggleHidden(ids: string[]) {
  const page = currentPage();
  const hide = !page.elements.filter((e) => ids.includes(e.id)).every((e) => e.hidden);
  updateElements(ids, () => ({ hidden: hide }));
}

export type OrderOp = "front" | "back" | "forward" | "backward";
export function reorder(op: OrderOp, ids = getState().selection) {
  const s = getState();
  const set = new Set(ids);
  commit((d) =>
    mapPage(d, s.pageId, (p) => {
      const els = [...p.elements];
      if (op === "front")
        return {
          ...p,
          elements: [...els.filter((e) => !set.has(e.id)), ...els.filter((e) => set.has(e.id))],
        };
      if (op === "back")
        return {
          ...p,
          elements: [...els.filter((e) => set.has(e.id)), ...els.filter((e) => !set.has(e.id))],
        };
      if (op === "forward") {
        for (let i = els.length - 2; i >= 0; i--)
          if (set.has(els[i].id) && !set.has(els[i + 1].id))
            [els[i], els[i + 1]] = [els[i + 1], els[i]];
      } else {
        for (let i = 1; i < els.length; i++)
          if (set.has(els[i].id) && !set.has(els[i - 1].id))
            [els[i], els[i - 1]] = [els[i - 1], els[i]];
      }
      return { ...p, elements: els };
    }),
  );
}

export function moveElementToIndex(id: string, index: number) {
  const s = getState();
  commit((d) =>
    mapPage(d, s.pageId, (p) => {
      const els = p.elements.filter((e) => e.id !== id);
      const el = p.elements.find((e) => e.id === id);
      if (!el) return p;
      els.splice(Math.max(0, Math.min(els.length, index)), 0, el);
      return { ...p, elements: els };
    }),
  );
}

// ---- align & distribute ----
export type AlignOp = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export function alignSelection(op: AlignOp, toPage = false) {
  const s = getState();
  const page = currentPage(s);
  const sel = page.elements.filter((e) => s.selection.includes(e.id) && !e.locked);
  if (!sel.length) return;
  const ref =
    toPage || sel.length === 1
      ? { x: 0, y: 0, w: s.doc.pageSize.width, h: s.doc.pageSize.height }
      : selectionBounds(sel)!;
  // grouped elements move as one unit
  const units = groupUnits(sel);
  const moves = new Map<string, { dx: number; dy: number }>();
  for (const u of units) {
    const b = selectionBounds(u)!;
    let dx = 0,
      dy = 0;
    if (op === "left") dx = ref.x - b.x;
    if (op === "hcenter") dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
    if (op === "right") dx = ref.x + ref.w - (b.x + b.w);
    if (op === "top") dy = ref.y - b.y;
    if (op === "vcenter") dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
    if (op === "bottom") dy = ref.y + ref.h - (b.y + b.h);
    for (const e of u) moves.set(e.id, { dx, dy });
  }
  updateElements([...moves.keys()], (e) => ({
    x: e.x + moves.get(e.id)!.dx,
    y: e.y + moves.get(e.id)!.dy,
  }));
}

function groupUnits(els: PageElement[]): PageElement[][] {
  const map = new Map<string, PageElement[]>();
  for (const e of els) {
    const k = e.groupId ?? e.id;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(e);
  }
  return [...map.values()];
}

export function distributeSelection(axis: "h" | "v") {
  const s = getState();
  const sel = currentPage(s).elements.filter((e) => s.selection.includes(e.id) && !e.locked);
  const units = groupUnits(sel).map((u) => ({ u, b: selectionBounds(u)! }));
  if (units.length < 3) return;
  const key = axis === "h" ? "x" : "y";
  const size = axis === "h" ? "w" : "h";
  units.sort((a, b) => a.b[key] - b.b[key]);
  const start = units[0].b[key];
  const end = Math.max(...units.map((x) => x.b[key] + x.b[size]));
  const total = units.reduce((t, x) => t + x.b[size], 0);
  const gap = (end - start - total) / (units.length - 1);
  let cur = start;
  const moves = new Map<string, number>();
  for (const x of units) {
    const d = cur - x.b[key];
    for (const e of x.u) moves.set(e.id, d);
    cur += x.b[size] + gap;
  }
  updateElements([...moves.keys()], (e) =>
    axis === "h" ? { x: e.x + moves.get(e.id)! } : { y: e.y + moves.get(e.id)! },
  );
}

// ---- pages ----
export function addPage(afterIndex?: number) {
  const s = getState();
  const p = newPage();
  const idx = afterIndex ?? s.doc.pages.findIndex((x) => x.id === s.pageId);
  commit(
    (d) => {
      const pages = [...d.pages];
      pages.splice(idx + 1, 0, p);
      return { ...d, pages };
    },
    { ui: { pageId: p.id, selection: [], editingId: null, cropId: null } },
  );
}

export function duplicatePage(pageId: string) {
  const s = getState();
  const idx = s.doc.pages.findIndex((x) => x.id === pageId);
  if (idx < 0) return;
  const src = s.doc.pages[idx];
  const copy: Page = {
    ...structuredClone(src),
    id: uid("p"),
    elements: cloneElements(src.elements, 0),
  };
  commit(
    (d) => {
      const pages = [...d.pages];
      pages.splice(idx + 1, 0, copy);
      return { ...d, pages };
    },
    { ui: { pageId: copy.id, selection: [] } },
  );
}

export function deletePage(pageId: string) {
  const s = getState();
  if (s.doc.pages.length <= 1) return false;
  const idx = s.doc.pages.findIndex((x) => x.id === pageId);
  const nextPage = s.doc.pages[idx + 1] ?? s.doc.pages[idx - 1];
  commit((d) => ({ ...d, pages: d.pages.filter((p) => p.id !== pageId) }), {
    ui: { pageId: s.pageId === pageId ? nextPage.id : s.pageId, selection: [] },
  });
  return true;
}

export function movePage(from: number, to: number) {
  if (from === to) return;
  commit((d) => {
    const pages = [...d.pages];
    const [p] = pages.splice(from, 1);
    pages.splice(to, 0, p);
    return { ...d, pages };
  });
}

export function insertPages(pages: Page[], assets: Doc["assets"], afterIndex: number) {
  commit(
    (d) => {
      const list = [...d.pages];
      list.splice(afterIndex + 1, 0, ...pages);
      return { ...d, pages: list, assets: { ...d.assets, ...assets } };
    },
    { ui: { pageId: pages[0]?.id, selection: [] } },
  );
}

export function updatePage(pageId: string, patch: Partial<Page>, merge?: string) {
  commit((d) => mapPage(d, pageId, (p) => ({ ...p, ...patch })), { merge });
}

export function updateDoc(patch: Partial<Doc>, merge?: string) {
  commit((d) => ({ ...d, ...patch }), { merge });
}

// ---- styles ----
export function applyPreset(ids: string[], presetId: string) {
  const preset = getState().doc.textStyles.find((p) => p.id === presetId);
  if (!preset) return;
  updateElements(ids, (e) =>
    e.type === "text" ? { style: { ...preset.style }, styleId: preset.id } : {},
  );
}

/** Redefine a preset from an element's style and update every element linked to it. */
export function redefinePreset(presetId: string, style: TextStyle) {
  commit((d) => ({
    ...d,
    textStyles: d.textStyles.map((p) => (p.id === presetId ? { ...p, style: { ...style } } : p)),
    pages: d.pages.map((pg) =>
      pg.elements.some((e) => e.type === "text" && e.styleId === presetId)
        ? {
            ...pg,
            elements: pg.elements.map((e) =>
              e.type === "text" && e.styleId === presetId
                ? ({ ...e, style: { ...style } } as TextElement)
                : e,
            ),
          }
        : pg,
    ),
  }));
}

export function addPreset(name: string, style: TextStyle) {
  const id = uid("st");
  commit((d) => ({ ...d, textStyles: [...d.textStyles, { id, name, style: { ...style } }] }));
  return id;
}

export function elementBounds(e: PageElement) {
  return aabb(e);
}
