import { useEffect, useRef, useState } from "react";
import type { TextElement } from "../../model/types";
import { setUI } from "../store";
import { updateElement } from "../commands";
import { cssFamily } from "../../fonts/registry";
import { layoutOf, normalizeText } from "../../layout/textLayout";
import { ptToMm } from "../../model/units";

/**
 * In-place editor for a text frame. The draft lives locally while an IME composition is in
 * progress and is committed to the document only when composition ends, so pinyin input,
 * candidate selection and shortcuts never interfere with the layout or undo history.
 */
export function TextEditor({ el, zoom }: { el: TextElement; zoom: number }) {
  const [draft, setDraft] = useState(el.text);
  const composing = useRef(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const elRef = useRef(el);
  elRef.current = el;

  useEffect(() => {
    const t = ref.current!;
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  }, []);
  // external changes (e.g. from the inspector) while not typing
  useEffect(() => {
    if (!composing.current && el.text !== draft && document.activeElement !== ref.current)
      setDraft(el.text);
  }, [el.text]);

  const push = (v: string) => {
    if (v !== elRef.current.text) updateElement(el.id, { text: v }, `type:${el.id}`);
  };

  const fsPx = Math.max(13, ptToMm(el.style.fontSize) * zoom);
  const w = Math.max(260, el.w * zoom);
  const h = Math.max(140, el.h * zoom);
  const layout = layoutOf(el);
  const overflowChars = layout.overflow
    ? [...el.text.slice(layout.overflowAt).replace(/\s/g, "")].length
    : 0;

  return (
    <div
      data-texteditor
      className="bx-pop"
      style={{
        position: "absolute",
        left: el.x * zoom,
        top: el.y * zoom,
        width: w,
        height: h + 26,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        transformOrigin: `${(el.w * zoom) / 2}px ${(el.h * zoom) / 2}px`,
        pointerEvents: "auto",
        zIndex: 5,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex h-[26px] items-center justify-between rounded-t-md bg-accent px-2 text-[11px] text-white">
        <span>编辑文字 · {el.columns > 1 ? `${el.columns} 栏连续排版` : "单栏"} · Esc 完成</span>
        <span
          className={
            overflowChars ? "rounded bg-white px-1.5 font-medium text-danger" : "opacity-80"
          }
        >
          {overflowChars ? `溢出约 ${overflowChars} 字` : `${[...el.text].length} 字`}
        </span>
      </div>
      <textarea
        ref={ref}
        value={draft}
        spellCheck={false}
        className="block w-full resize-none rounded-b-md border-2 border-t-0 border-accent bg-white/[.98] p-2 outline-none"
        style={{
          height: h,
          fontFamily: cssFamily(el.style.fontFamily),
          fontSize: fsPx,
          lineHeight: 1.65,
          color: el.style.color,
          fontWeight: el.style.fontWeight,
          boxShadow: "0 10px 30px -10px rgba(0,0,0,.35)",
        }}
        onChange={(e) => {
          const v = normalizeText(e.target.value);
          setDraft(v);
          if (!composing.current && !(e.nativeEvent as InputEvent).isComposing) push(v);
        }}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={(e) => {
          composing.current = false;
          const v = normalizeText((e.target as HTMLTextAreaElement).value);
          setDraft(v);
          push(v);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === "Escape") {
            e.preventDefault();
            push(draft);
            setUI({ editingId: null });
          }
          e.stopPropagation();
        }}
        onBlur={() => push(draft)}
      />
    </div>
  );
}
