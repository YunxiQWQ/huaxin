import { useSyncExternalStore } from "react";
import type { Doc, Page, PageElement } from "../model/types";

export interface EditorUI {
  pageId: string;
  selection: string[];
  editingId: string | null;
  cropId: string | null;
  /** screen px per mm */
  zoom: number;
  showRulers: boolean;
  showGuides: boolean;
  showMargins: boolean;
  snap: boolean;
  leftTab: "pages" | "templates" | "assets" | "text" | "shapes" | "layers" | "issues";
}

export interface EditorState extends EditorUI {
  doc: Doc;
  canUndo: boolean;
  canRedo: boolean;
  /** document object at the last project-file download (or load) */
  fileSavedDoc: Doc | null;
}

type Listener = () => void;

const HISTORY_LIMIT = 200;
const MERGE_WINDOW = 1200;

let state: EditorState | null = null;
const listeners = new Set<Listener>();
let past: Doc[] = [];
let future: Doc[] = [];
let lastMerge: { key: string; time: number } | null = null;

function emit() {
  listeners.forEach((l) => l());
}

export function getState(): EditorState {
  if (!state) throw new Error("editor not loaded");
  return state;
}
export function hasState() {
  return state !== null;
}

export function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function set(patch: Partial<EditorState>) {
  state = { ...getState(), ...patch };
  emit();
}

export function loadEditor(doc: Doc, ui?: Partial<EditorUI>) {
  past = [];
  future = [];
  lastMerge = null;
  const prev = state;
  state = {
    doc,
    pageId: doc.pages[0]?.id ?? "",
    selection: [],
    editingId: null,
    cropId: null,
    zoom: prev?.zoom ?? 2,
    showRulers: prev?.showRulers ?? true,
    showGuides: prev?.showGuides ?? true,
    showMargins: prev?.showMargins ?? true,
    snap: prev?.snap ?? true,
    leftTab: prev?.leftTab ?? "pages",
    canUndo: false,
    canRedo: false,
    fileSavedDoc: doc,
    ...ui,
  };
  emit();
}

export function unloadEditor() {
  state = null;
  past = [];
  future = [];
  emit();
}

export function setUI(patch: Partial<EditorUI>) {
  set(patch);
}

/** Replace the document without touching history (e.g. after restoring from storage). */
export function replaceDocSilently(doc: Doc) {
  set({ doc });
}

export function markFileSaved() {
  set({ fileSavedDoc: getState().doc });
}

function sanitizeUI(doc: Doc, s: EditorState): Partial<EditorState> {
  const page = doc.pages.find((p) => p.id === s.pageId) ?? doc.pages[0];
  const ids = new Set(page?.elements.map((e) => e.id));
  return {
    pageId: page?.id ?? "",
    selection: s.selection.filter((id) => ids.has(id)),
    editingId: s.editingId && ids.has(s.editingId) ? s.editingId : null,
    cropId: s.cropId && ids.has(s.cropId) ? s.cropId : null,
  };
}

/**
 * Apply a document change and record it in history.
 * Consecutive changes with the same merge key inside a short window become one undo step.
 */
export function commit(
  fn: (doc: Doc) => Doc,
  opts: { merge?: string; ui?: Partial<EditorUI> } = {},
) {
  const s = getState();
  const next = fn(s.doc);
  if (next === s.doc) {
    if (opts.ui) set(opts.ui);
    return;
  }
  const now = Date.now();
  const merging =
    opts.merge && lastMerge && lastMerge.key === opts.merge && now - lastMerge.time < MERGE_WINDOW;
  if (!merging) {
    past.push(s.doc);
    if (past.length > HISTORY_LIMIT) past.shift();
  }
  lastMerge = opts.merge ? { key: opts.merge, time: now } : null;
  future = [];
  const doc = { ...next, updatedAt: now };
  const merged = { ...s, ...opts.ui, doc };
  state = { ...merged, ...sanitizeUI(doc, merged), canUndo: past.length > 0, canRedo: false };
  emit();
}

export function breakMerge() {
  lastMerge = null;
}

export function undo() {
  const s = getState();
  const prev = past.pop();
  if (!prev) return;
  future.push(s.doc);
  lastMerge = null;
  const merged = { ...s, doc: prev };
  state = { ...merged, ...sanitizeUI(prev, merged), canUndo: past.length > 0, canRedo: true };
  emit();
}

export function redo() {
  const s = getState();
  const next = future.pop();
  if (!next) return;
  past.push(s.doc);
  lastMerge = null;
  const merged = { ...s, doc: next };
  state = { ...merged, ...sanitizeUI(next, merged), canUndo: true, canRedo: future.length > 0 };
  emit();
}

/** Asset ids referenced anywhere in undo/redo history (kept alive during GC). */
export function historyAssetIds(): Set<string> {
  const ids = new Set<string>();
  const docs = state ? [state.doc, ...past, ...future] : [];
  for (const d of docs)
    for (const p of d.pages)
      for (const e of p.elements) if (e.type === "image" && e.assetId) ids.add(e.assetId);
  return ids;
}

export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getState()));
}

// ---- helpers ----
export function currentPage(s: EditorState = getState()): Page {
  return s.doc.pages.find((p) => p.id === s.pageId) ?? s.doc.pages[0];
}

export function selectedElements(s: EditorState = getState()): PageElement[] {
  const page = currentPage(s);
  const set = new Set(s.selection);
  return page.elements.filter((e) => set.has(e.id));
}
