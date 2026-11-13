import { useEffect } from "react";
import { currentPage, getState, redo, setUI, undo } from "./store";
import {
  CLIP_MIME,
  deleteSelection,
  duplicateSelection,
  gotoPage,
  groupSelection,
  pasteSerialized,
  reorder,
  selectAll,
  serializeSelection,
  toggleLock,
  ungroupSelection,
  updateElements,
  updateTextStyle,
} from "./commands";
import { canvasApi } from "./canvas/Canvas";
import { session } from "../storage/session";
import { toast } from "../ui/toast";
import { addImagesFromFiles, addTextBox } from "./create";
import type { TextElement } from "../model/types";

function isTyping(e: Event) {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return (
    t.isContentEditable ||
    t.tagName === "INPUT" ||
    t.tagName === "TEXTAREA" ||
    t.tagName === "SELECT"
  );
}

export function useEditorShortcuts(
  enabled: boolean,
  handlers: { preview: () => void; exportPdf: () => void },
) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      // never interfere with IME composition or text fields
      if (e.isComposing || e.keyCode === 229 || isTyping(e)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const s = getState();
      if (mod && k === "z" && !e.shiftKey) return (e.preventDefault(), undo());
      if ((mod && k === "z" && e.shiftKey) || (mod && k === "y"))
        return (e.preventDefault(), redo());
      if (mod && k === "s") {
        e.preventDefault();
        void session
          .createVersion("manual", "快捷键保存")
          .then((ok) => ok && toast("ok", "已保存到本机并生成历史版本"));
        void session.flush();
        return;
      }
      if (mod && k === "a") return (e.preventDefault(), selectAll());
      if (mod && k === "d") return (e.preventDefault(), duplicateSelection());
      if (mod && k === "g")
        return (e.preventDefault(), e.shiftKey ? ungroupSelection() : groupSelection());
      if (mod && k === "l") return (e.preventDefault(), toggleLock());
      if (mod && k === "p") return (e.preventDefault(), handlers.exportPdf());
      if (mod && (k === "=" || k === "+"))
        return (e.preventDefault(), canvasApi.zoomTo?.(s.zoom * 1.2));
      if (mod && k === "-") return (e.preventDefault(), canvasApi.zoomTo?.(s.zoom / 1.2));
      if (mod && k === "0") return (e.preventDefault(), canvasApi.fit?.());
      if (mod && k === "]") return (e.preventDefault(), reorder(e.shiftKey ? "front" : "forward"));
      if (mod && k === "[") return (e.preventDefault(), reorder(e.shiftKey ? "back" : "backward"));
      const texts = currentPage(s).elements.filter(
        (x) => s.selection.includes(x.id) && x.type === "text",
      ) as TextElement[];
      if (mod && texts.length && (k === "b" || k === "i" || k === "u")) {
        e.preventDefault();
        const st = texts[0].style;
        const ids = texts.map((t) => t.id);
        if (k === "b") updateTextStyle(ids, { fontWeight: st.fontWeight >= 700 ? 400 : 700 });
        if (k === "i") updateTextStyle(ids, { italic: !st.italic });
        if (k === "u") updateTextStyle(ids, { underline: !st.underline });
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace")
        return (e.preventDefault(), deleteSelection());
      if (e.key === "Escape") return setUI({ selection: [], editingId: null, cropId: null });
      if (e.key === "Enter" && texts.length === 1)
        return (e.preventDefault(), setUI({ editingId: texts[0].id }));
      if (e.key.startsWith("Arrow") && s.selection.length) {
        e.preventDefault();
        const d = e.shiftKey ? 5 : 0.5;
        const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
        const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
        const ids = currentPage(s)
          .elements.filter((x) => s.selection.includes(x.id) && !x.locked)
          .map((x) => x.id);
        updateElements(ids, (el) => ({ x: el.x + dx, y: el.y + dy }), "nudge");
        return;
      }
      if (e.key === "PageDown" || e.key === "PageUp") {
        const i = s.doc.pages.findIndex((p) => p.id === s.pageId);
        const n = s.doc.pages[i + (e.key === "PageDown" ? 1 : -1)];
        if (n) gotoPage(n.id);
      }
      if (k === "p" && !mod && e.shiftKey === false && e.altKey) handlers.preview();
    };
    const onCopy = (e: ClipboardEvent) => {
      if (isTyping(e)) return;
      const json = serializeSelection();
      if (!json) return;
      e.preventDefault();
      e.clipboardData?.setData(CLIP_MIME, json);
      e.clipboardData?.setData("text/plain", json);
      if (e.type === "cut") deleteSelection();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e) || document.querySelector('[role="dialog"]')) return;
      const dt = e.clipboardData;
      if (!dt) return;
      const internal = dt.getData(CLIP_MIME) || dt.getData("text/plain");
      if (
        internal &&
        internal.startsWith('{"kind":"banxin-elements"') &&
        pasteSerialized(internal, false)
      )
        return e.preventDefault();
      const files = [...dt.files].filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        const s = getState();
        const sel = currentPage(s).elements.find((x) => s.selection.includes(x.id));
        void addImagesFromFiles(
          files,
          undefined,
          sel?.type === "image" && !sel.locked ? sel.id : undefined,
        );
        return;
      }
      const text = dt.getData("text/plain");
      if (text.trim()) {
        e.preventDefault();
        addTextBox("body", text.replace(/\r\n?/g, "\n"));
        toast("info", "已将粘贴的稿件放入新的正文框");
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [enabled, handlers]);
}
