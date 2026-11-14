/// <reference lib="es2022.intl" />
import { useEffect, useLayoutEffect, useRef } from "react";
import type { TextElement } from "../../model/types";
import { breakMerge, redo, setUI, undo } from "../store";
import { updateElement } from "../commands";
import { cssFamily, resolveFace } from "../../fonts/registry";
import { computeLayout, normalizeText } from "../../layout/textLayout";
import { ITALIC_SKEW } from "../../render/primitives";
import { useFontEpoch } from "../../render/PageView";
import { ptToMm } from "../../model/units";
import { charWidthEm } from "../../layout/measure";

type Caret = { anchor: number; focus: number };

function readCaret(root: HTMLElement): Caret | null {
  const selection = window.getSelection();
  if (
    !selection?.anchorNode ||
    !selection.focusNode ||
    !root.contains(selection.anchorNode) ||
    !root.contains(selection.focusNode)
  )
    return null;
  const offset = (node: Node, index: number) => {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.setEnd(node, index);
    return range.toString().length;
  };
  return {
    anchor: offset(selection.anchorNode, selection.anchorOffset),
    focus: offset(selection.focusNode, selection.focusOffset),
  };
}

function restoreCaret(root: HTMLElement, caret: Caret) {
  const length = root.textContent?.length ?? 0;
  const point = (position: number): [Node, number] => {
    const pos = Math.max(0, Math.min(length, position));
    const lines = [...root.querySelectorAll<HTMLElement>("[data-line-start]")];
    const line = lines
      .filter(
        (span) => Number(span.dataset.lineStart) <= pos && Number(span.dataset.lineEnd) >= pos,
      )
      .pop();
    if (line?.firstChild?.nodeType === Node.TEXT_NODE)
      return [line.firstChild, pos - Number(line.dataset.lineStart)];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null,
      consumed = 0;
    while ((node = walker.nextNode())) {
      const size = node.textContent?.length ?? 0;
      if (consumed + size >= pos) return [node, pos - consumed];
      consumed += size;
    }
    return [root, root.childNodes.length];
  };
  const [anchor, a] = point(caret.anchor),
    [focus, f] = point(caret.focus);
  window.getSelection()?.setBaseAndExtent(anchor, a, focus, f);
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
function adjacentBoundary(text: string, position: number, forward: boolean) {
  let previous = 0;
  for (const segment of graphemes.segment(text)) {
    const end = segment.index + segment.segment.length;
    if (forward && end > position) return end;
    if (!forward && end >= position) return segment.index;
    previous = end;
  }
  return forward ? text.length : previous;
}

/** Edits the same positioned lines used by the canvas/PDF. Browser composition stays
 * native; confirmed edits update the document and reflow without a floating input. */
export function TextEditor({ el, zoom }: { el: TextElement; zoom: number }) {
  const root = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const finished = useRef(false);
  const navigationX = useRef<number | null>(null);
  const source = useRef(normalizeText(el.text));
  const committed = useRef(normalizeText(el.text));
  const painted = useRef("");
  const current = useRef(el);
  current.current = el;
  const epoch = useFontEpoch();
  const geometry = JSON.stringify([
    el.style,
    el.w,
    el.h,
    el.columns,
    el.columnGap,
    el.padding,
    el.verticalAlign,
    zoom,
    epoch,
  ]);

  const paint = (text: string, caret: Caret | null) => {
    const host = root.current;
    if (!host || composing.current) return;
    const frame = current.current;
    const layout = computeLayout({ ...frame, text });
    const fragment = document.createDocumentFragment();
    const { face, synthBold } = resolveFace(frame.style.fontFamily, frame.style.fontWeight);
    let consumed = 0;
    let lastX = frame.padding * zoom,
      lastY = frame.padding * zoom;
    const gap = (value: string) => {
      if (!value) return;
      const span = document.createElement("span");
      span.dataset.sourceGap = "";
      // Source separators and overflow stay in the editable text without introducing
      // an alternative browser layout or expanding the frame over nearby articles.
      Object.assign(span.style, {
        position: "absolute",
        left: `${lastX}px`,
        top: `${lastY}px`,
        width: "1px",
        height: `${layout.lineBox * zoom}px`,
        overflow: "hidden",
        fontSize: "0px",
        color: "transparent",
      });
      span.textContent = value;
      fragment.append(span);
    };
    for (const line of layout.lines) {
      gap(text.slice(consumed, line.start));
      const span = document.createElement("span");
      span.dataset.lineStart = String(line.start);
      span.dataset.lineEnd = String(line.end);
      Object.assign(span.style, {
        position: "absolute",
        left: `${line.x * zoom}px`,
        top: `${(line.baseline - layout.ascent) * zoom}px`,
        height: `${(layout.ascent + layout.descent) * zoom}px`,
        lineHeight: `${(layout.ascent + layout.descent) * zoom}px`,
        fontSize: `${layout.fontSize * zoom}px`,
        fontFamily: cssFamily(frame.style.fontFamily),
        fontWeight: String(synthBold ? 700 : face.weight),
        letterSpacing: `${line.spacing * zoom}px`,
        transform: frame.style.italic ? `skewX(${-Math.atan(ITALIC_SKEW)}rad)` : "none",
        transformOrigin: `0 ${layout.ascent * zoom}px`,
      });
      span.append(document.createTextNode(text.slice(line.start, line.end)));
      if (line.start === line.end) span.append(document.createElement("br"));
      fragment.append(span);
      consumed = line.end;
      lastX = Math.min(frame.w * zoom - 1, (line.x + line.drawWidth) * zoom);
      lastY = (line.baseline - layout.ascent) * zoom;
    }
    gap(text.slice(consumed));
    host.replaceChildren(fragment);
    source.current = text;
    painted.current = geometry + text;
    if (caret) restoreCaret(host, caret);
  };

  const push = (text: string, caret: Caret | null) => {
    navigationX.current = null;
    const next = normalizeText(text);
    paint(next, caret);
    if (next !== committed.current) {
      committed.current = next;
      updateElement(el.id, { text: next }, `type:${el.id}`);
    }
  };

  const replace = (
    insert: string,
    selection = readCaret(root.current!) ?? {
      anchor: source.current.length,
      focus: source.current.length,
    },
  ) => {
    const start = Math.min(selection.anchor, selection.focus),
      end = Math.max(selection.anchor, selection.focus);
    const value = normalizeText(insert);
    const next = source.current.slice(0, start) + value + source.current.slice(end);
    push(next, { anchor: start + value.length, focus: start + value.length });
  };

  // Absolutely positioned layout lines need source-aware keyboard navigation:
  // native vertical movement treats these spans as a single browser line.
  const navigate = (key: string, extend: boolean, whole: boolean) => {
    const host = root.current!,
      caret = readCaret(host);
    if (!caret) return;
    const text = source.current,
      frame = current.current;
    const layout = computeLayout({ ...frame, text });
    const focusNode = window.getSelection()?.focusNode;
    const focusLine = (
      focusNode?.nodeType === Node.ELEMENT_NODE ? (focusNode as Element) : focusNode?.parentElement
    )?.closest<HTMLElement>("[data-line-start]");
    let index = layout.lines.findIndex(
      (line) => focusLine && line.start === Number(focusLine.dataset.lineStart),
    );
    if (index < 0)
      layout.lines.forEach((line, i) => {
        if (line.start <= caret.focus) index = i;
      });
    const line = layout.lines[index];
    let next = caret.focus;
    if (key === "ArrowLeft" || key === "ArrowRight") {
      next =
        !extend && caret.anchor !== caret.focus
          ? key === "ArrowLeft"
            ? Math.min(caret.anchor, caret.focus)
            : Math.max(caret.anchor, caret.focus)
          : adjacentBoundary(text, caret.focus, key === "ArrowRight");
    } else if (key === "Home" || key === "End") {
      const nextBreak = text.indexOf("\n", caret.focus);
      next = whole
        ? key === "Home"
          ? 0
          : text.length
        : line && caret.focus <= line.end
          ? key === "Home"
            ? line.start
            : line.end
          : key === "Home"
            ? text.lastIndexOf("\n", caret.focus - 1) + 1
            : nextBreak < 0
              ? text.length
              : nextBreak;
    } else if (line) {
      const width = (value: string) =>
        [...value].reduce(
          (sum, ch) =>
            sum +
            charWidthEm(frame.style.fontFamily, frame.style.fontWeight, ch) * layout.fontSize +
            line.spacing,
          0,
        );
      const relativeX = (l: typeof line) =>
        l.x - frame.padding - l.col * (layout.colWidth + frame.columnGap);
      const goal =
        navigationX.current ??
        relativeX(line) + width(text.slice(line.start, Math.min(line.end, caret.focus)));
      navigationX.current = goal;
      const target =
        layout.lines[
          Math.max(0, Math.min(layout.lines.length - 1, index + (key === "ArrowDown" ? 1 : -1)))
        ];
      let x = relativeX(target),
        distance = Infinity;
      next = target.start;
      for (const segment of graphemes.segment(text.slice(target.start, target.end))) {
        if (Math.abs(x - goal) < distance) {
          distance = Math.abs(x - goal);
          next = target.start + segment.index;
        }
        for (const ch of segment.segment)
          x +=
            charWidthEm(frame.style.fontFamily, frame.style.fontWeight, ch) * layout.fontSize +
            target.spacing;
      }
      if (Math.abs(x - goal) < distance) next = target.end;
    }
    if (key !== "ArrowUp" && key !== "ArrowDown") navigationX.current = null;
    restoreCaret(host, { anchor: extend ? caret.anchor : next, focus: next });
  };

  const beforeInput = (event: InputEvent) => {
    if (composing.current || event.isComposing || !event.cancelable) return;
    const kind = event.inputType;
    if (kind === "historyUndo" || kind === "historyRedo") {
      event.preventDefault();
      kind === "historyUndo" ? undo() : redo();
    } else if (kind === "insertParagraph" || kind === "insertLineBreak") {
      event.preventDefault();
      replace("\n");
    } else if (kind === "insertText" && event.data !== null) {
      event.preventDefault();
      replace(event.data);
    } else if (kind === "deleteContentBackward" || kind === "deleteContentForward") {
      event.preventDefault();
      const caret = readCaret(root.current!);
      if (!caret) return;
      if (caret.anchor === caret.focus) {
        const next = adjacentBoundary(source.current, caret.focus, kind === "deleteContentForward");
        replace("", { anchor: caret.focus, focus: next });
      } else replace("", caret);
    }
  };
  const inputHandler = useRef(beforeInput);
  inputHandler.current = beforeInput;
  useEffect(() => {
    const host = root.current!;
    const handler = (event: Event) => inputHandler.current(event as InputEvent);
    host.addEventListener("beforeinput", handler);
    return () => host.removeEventListener("beforeinput", handler);
  }, []);

  useLayoutEffect(() => {
    if (composing.current) return;
    const text = normalizeText(el.text);
    committed.current = text;
    if (painted.current !== geometry + text) paint(text, readCaret(root.current!));
  }, [el.text, geometry]);

  useLayoutEffect(() => {
    breakMerge();
    const host = root.current!;
    host.focus({ preventScroll: true });
    restoreCaret(host, { anchor: source.current.length, focus: source.current.length });
    return () => breakMerge();
  }, []);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    if (!composing.current) push(root.current?.textContent ?? source.current, null);
    setUI({ editingId: null });
  };

  const { face, synthBold } = resolveFace(el.style.fontFamily, el.style.fontWeight);

  return (
    <div
      ref={root}
      data-texteditor
      className="bx-inline-editor"
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-label="画布文字编辑"
      aria-multiline="true"
      spellCheck={false}
      style={{
        position: "absolute",
        left: el.x * zoom,
        top: el.y * zoom,
        width: el.w * zoom,
        height: el.h * zoom,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        transformOrigin: "center",
        opacity: el.opacity,
        pointerEvents: "auto",
        zIndex: 5,
        background: "transparent",
        color: el.style.color,
        caretColor: el.style.color,
        fontFamily: cssFamily(el.style.fontFamily),
        fontSize: ptToMm(el.style.fontSize) * zoom,
        fontWeight: synthBold ? 700 : face.weight,
        lineHeight: el.style.lineHeight,
        outline: "1px solid #2b59c3",
        overflow: "clip",
        cursor: "text",
      }}
      onPointerDown={(event) => {
        navigationX.current = null;
        event.stopPropagation();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onInput={() => {
        if (!composing.current) push(root.current!.textContent ?? "", readCaret(root.current!));
      }}
      onCompositionStart={() => {
        breakMerge();
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
        push(root.current!.textContent ?? "", readCaret(root.current!));
        breakMerge();
      }}
      onPaste={(event) => {
        if (composing.current) return;
        event.preventDefault();
        replace(event.clipboardData.getData("text/plain"));
      }}
      onCopy={(event) => {
        if (composing.current) return;
        const caret = readCaret(root.current!);
        if (!caret) return;
        event.preventDefault();
        event.clipboardData.setData(
          "text/plain",
          source.current.slice(
            Math.min(caret.anchor, caret.focus),
            Math.max(caret.anchor, caret.focus),
          ),
        );
      }}
      onCut={(event) => {
        if (composing.current) return;
        const caret = readCaret(root.current!);
        if (!caret) return;
        event.preventDefault();
        event.clipboardData.setData(
          "text/plain",
          source.current.slice(
            Math.min(caret.anchor, caret.focus),
            Math.max(caret.anchor, caret.focus),
          ),
        );
        replace("", caret);
      }}
      onDrop={(event) => {
        if (composing.current) return;
        const text = event.dataTransfer.getData("text/plain");
        if (text) {
          event.preventDefault();
          event.stopPropagation();
          replace(text);
        }
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        const mod = event.ctrlKey || event.metaKey;
        if (
          !event.altKey &&
          (/^(Home|End)$/.test(event.key) ||
            (!mod && /^Arrow(Left|Right|Up|Down)$/.test(event.key)))
        ) {
          event.preventDefault();
          navigate(event.key, event.shiftKey, mod);
        } else if (event.key === "Escape" || (mod && event.key === "Enter")) {
          event.preventDefault();
          finish();
          root.current?.blur();
        } else if (mod && /^(z|y)$/i.test(event.key)) {
          event.preventDefault();
          event.key.toLowerCase() === "y" || event.shiftKey ? redo() : undo();
        }
      }}
      onBlur={finish}
    />
  );
}
