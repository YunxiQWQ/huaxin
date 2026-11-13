import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { currentPage, getState, setUI, useEditor, commit, breakMerge } from "../store";
import { PageContent, K } from "../../render/PageView";
import {
  aabb,
  corners,
  intersects,
  resizeFrame,
  rotatePoint,
  selectionBounds,
  snapRect,
  HANDLES,
  type Handle,
  type Pt,
  type Rect,
  type SnapTargets,
} from "../geometry";
import { mapElements, select, updatePage } from "../commands";
import type { ImageElement, PageElement, TextElement } from "../../model/types";
import { layoutOf } from "../../layout/textLayout";
import { Rulers, RULER } from "./Rulers";
import { TextEditor } from "./TextEditor";
import { addImagesFromFiles, IMAGE_ACCEPT, pickFiles, placeAsset, replaceImage } from "../create";
import { getAsset, loadAssetUrl } from "../../storage/assets";
import { Plus, Lock } from "lucide-react";
import { importProjectFile } from "../../app/actions";

type Drag =
  | {
      kind: "move";
      start: Pt;
      origins: Map<string, { x: number; y: number }>;
      bounds: Rect;
      moved: boolean;
      merge: string;
      sx: number;
      sy: number;
    }
  | { kind: "resize"; id: string; handle: Handle; start: PageElement; merge: string }
  | { kind: "rotate"; id: string; center: Pt; merge: string }
  | { kind: "marquee"; start: Pt; additive: boolean; base: string[] }
  | { kind: "pan"; sx: number; sy: number; sl: number; st: number }
  | { kind: "crop"; id: string; start: Pt; crop0: ImageElement["crop"]; merge: string }
  | { kind: "guide"; axis: "x" | "y"; index: number | null; merge: string };

let dragSeq = 0;

export function fitZoom(cw: number, ch: number) {
  const d = getState().doc;
  return Math.max(0.2, Math.min((cw - 96) / d.pageSize.width, (ch - 96) / d.pageSize.height));
}

export const canvasApi: {
  fit?: () => void;
  zoomTo?: (z: number) => void;
  reveal?: (id: string) => void;
} = {};

export function Canvas() {
  const s = useEditor((x) => x);
  const page = currentPage(s);
  const { doc, zoom } = s;
  const W = doc.pageSize.width;
  const H = doc.pageSize.height;
  const scroller = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [vp, setVp] = useState({ w: 800, h: 600 });
  const [snapLines, setSnapLines] = useState<{ axis: "x" | "y"; pos: number }[]>([]);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [guideDraft, setGuideDraft] = useState<{ axis: "x" | "y"; pos: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [space, setSpace] = useState(false);
  const zoomAnchor = useRef<{ mm: Pt; client: Pt } | null>(null);
  const ruler = s.showRulers ? RULER : 0;

  const pw = W * zoom;
  const ph = H * zoom;
  const padX = Math.max(80, (vp.w - pw) / 2);
  const padY = Math.max(64, (vp.h - ph) / 2);

  useLayoutEffect(() => {
    const el = scroller.current!;
    const ro = new ResizeObserver(() => setVp({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setVp({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // keep the point under the cursor fixed while zooming
  useLayoutEffect(() => {
    const a = zoomAnchor.current;
    const el = scroller.current;
    if (!a || !el) return;
    zoomAnchor.current = null;
    const r = el.getBoundingClientRect();
    el.scrollLeft = padX + a.mm.x * zoom - (a.client.x - r.left);
    el.scrollTop = padY + a.mm.y * zoom - (a.client.y - r.top);
  }, [zoom]);

  const fit = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setUI({ zoom: fitZoom(el.clientWidth, el.clientHeight) });
    requestAnimationFrame(() => {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      el.scrollTop = 0;
    });
  }, []);

  const zoomTo = useCallback((z: number, client?: Pt) => {
    const el = scroller.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const c = client ?? { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const pr = pageRef.current!.getBoundingClientRect();
    const cur = getState().zoom;
    zoomAnchor.current = { mm: { x: (c.x - pr.left) / cur, y: (c.y - pr.top) / cur }, client: c };
    setUI({ zoom: Math.max(0.2, Math.min(20, z)) });
  }, []);

  const reveal = useCallback(
    (id: string) => {
      const el = scroller.current;
      const e = currentPage().elements.find((x) => x.id === id);
      if (!el || !e) return;
      const b = aabb(e);
      const z = getState().zoom;
      el.scrollTo({
        left: padX + (b.x + b.w / 2) * z - el.clientWidth / 2,
        top: padY + (b.y + b.h / 2) * z - el.clientHeight / 2,
        behavior: "smooth",
      });
    },
    [padX, padY],
  );

  useEffect(() => {
    canvasApi.fit = fit;
    canvasApi.zoomTo = zoomTo;
    canvasApi.reveal = reveal;
  }, [fit, zoomTo, reveal]);

  // fit when a document is opened or the page size changes
  useEffect(() => {
    const t = setTimeout(fit, 30);
    return () => clearTimeout(t);
  }, [doc.id, W, H, fit]);

  // wheel: ctrl/cmd zooms around the cursor
  useEffect(() => {
    const el = scroller.current!;
    const h = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const z = getState().zoom * Math.exp(-e.deltaY * 0.0022);
        zoomTo(z, { x: e.clientX, y: e.clientY });
      }
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, [zoomTo]);

  // hold space to pan
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e) && !e.isComposing) {
        e.preventDefault();
        setSpace(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const toMM = (e: { clientX: number; clientY: number }): Pt => {
    const r = pageRef.current!.getBoundingClientRect();
    const z = getState().zoom;
    return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z };
  };

  const snapTargets = (exclude: Set<string>): SnapTargets => {
    const st = getState();
    const pg = currentPage(st);
    const m = st.doc.margins;
    const xs = [0, W / 2, W, m.left, W - m.right, ...pg.guides.x];
    const ys = [0, H / 2, H, m.top, H - m.bottom, ...pg.guides.y];
    for (const e of pg.elements) {
      if (exclude.has(e.id) || e.hidden) continue;
      const b = aabb(e);
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    return { xs, ys };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    const st = getState();
    const target = e.target as HTMLElement;
    if (target.closest("[data-texteditor]")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (e.button === 1 || space) {
      const el = scroller.current!;
      drag.current = {
        kind: "pan",
        sx: e.clientX,
        sy: e.clientY,
        sl: el.scrollLeft,
        st: el.scrollTop,
      };
      return;
    }
    const p = toMM(e);
    const merge = `drag${++dragSeq}`;
    const handle = target.closest("[data-handle]")?.getAttribute("data-handle");
    const pg = currentPage(st);
    if (handle === "rotate") {
      const el = pg.elements.find((x) => x.id === st.selection[0])!;
      drag.current = {
        kind: "rotate",
        id: el.id,
        center: { x: el.x + el.w / 2, y: el.y + el.h / 2 },
        merge,
      };
      return;
    }
    if (handle) {
      const el = pg.elements.find((x) => x.id === st.selection[0])!;
      drag.current = { kind: "resize", id: el.id, handle: handle as Handle, start: el, merge };
      return;
    }
    const guide = target.closest("[data-guide]")?.getAttribute("data-guide");
    if (guide) {
      const [axis, idx] = guide.split(":");
      drag.current = { kind: "guide", axis: axis as "x" | "y", index: Number(idx), merge };
      return;
    }
    const elId = target.closest("[data-el]")?.getAttribute("data-el");
    if (st.cropId && (elId === st.cropId || target.closest("[data-crop]"))) {
      const el = pg.elements.find((x) => x.id === st.cropId) as ImageElement;
      drag.current = { kind: "crop", id: el.id, start: p, crop0: el.crop, merge };
      return;
    }
    if (st.editingId) setUI({ editingId: null });
    if (st.cropId && elId !== st.cropId) setUI({ cropId: null });
    if (elId) {
      const el = pg.elements.find((x) => x.id === elId);
      if (!el) return;
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        select([elId], true);
      } else if (!st.selection.includes(elId)) select([elId]);
      const sel = getState().selection;
      const els = pg.elements.filter((x) => sel.includes(x.id) && !x.locked);
      if (!els.length) return;
      drag.current = {
        kind: "move",
        start: p,
        origins: new Map(els.map((x) => [x.id, { x: x.x, y: x.y }])),
        bounds: selectionBounds(els)!,
        moved: false,
        merge,
        sx: e.clientX,
        sy: e.clientY,
      };
      return;
    }
    // empty area: marquee
    drag.current = {
      kind: "marquee",
      start: p,
      additive: e.shiftKey,
      base: e.shiftKey ? st.selection : [],
    };
    if (!e.shiftKey) setUI({ selection: [], editingId: null, cropId: null });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) {
      const id = (e.target as HTMLElement).closest("[data-el]")?.getAttribute("data-el") ?? null;
      if (id !== hover) setHover(id);
      return;
    }
    const st = getState();
    const p = toMM(e);
    const threshold = 6 / st.zoom;
    if (d.kind === "pan") {
      const el = scroller.current!;
      el.scrollLeft = d.sl - (e.clientX - d.sx);
      el.scrollTop = d.st - (e.clientY - d.sy);
      return;
    }
    if (d.kind === "move") {
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;
      d.moved = true;
      let dx = p.x - d.start.x;
      let dy = p.y - d.start.y;
      if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
      let lines: { axis: "x" | "y"; pos: number }[] = [];
      if (st.snap && !e.altKey) {
        const r = snapRect(
          { ...d.bounds, x: d.bounds.x + dx, y: d.bounds.y + dy },
          snapTargets(new Set(d.origins.keys())),
          threshold,
        );
        dx += r.dx;
        dy += r.dy;
        lines = r.lines;
      }
      setSnapLines(lines);
      commit(
        (doc) =>
          mapElements(doc, st.pageId, d.origins.keys(), (el) => ({
            ...el,
            x: d.origins.get(el.id)!.x + dx,
            y: d.origins.get(el.id)!.y + dy,
          })),
        { merge: d.merge },
      );
      return;
    }
    if (d.kind === "resize") {
      const s0 = d.start;
      const keep = (s0.type === "image" && s0.keepRatio) !== e.shiftKey && d.handle.length === 2;
      let pt = p;
      let lines: { axis: "x" | "y"; pos: number }[] = [];
      if (st.snap && !e.altKey && !s0.rotation) {
        const t = snapTargets(new Set([s0.id]));
        const sx = snapRect({ x: p.x, y: p.y, w: 0, h: 0 }, t, threshold, { x: [0], y: [0] });
        pt = { x: p.x + sx.dx, y: p.y + sx.dy };
        lines = sx.lines;
      }
      setSnapLines(lines);
      const r = resizeFrame(s0, d.handle, pt, keep, 1);
      commit((doc) => mapElements(doc, st.pageId, [s0.id], (el) => resized(s0, r)), {
        merge: d.merge,
      });
      return;
    }
    if (d.kind === "rotate") {
      let a = (Math.atan2(p.y - d.center.y, p.x - d.center.x) * 180) / Math.PI + 90;
      if (a > 180) a -= 360;
      a = e.shiftKey ? Math.round(a / 15) * 15 : Math.round(a * 10) / 10;
      if (!e.shiftKey)
        for (const snapA of [0, 90, -90, 180, -180]) if (Math.abs(a - snapA) < 2) a = snapA;
      commit(
        (doc) =>
          mapElements(doc, st.pageId, [d.id], (el) => ({ ...el, rotation: a === -180 ? 180 : a })),
        { merge: d.merge },
      );
      return;
    }
    if (d.kind === "marquee") {
      const r = {
        x: Math.min(d.start.x, p.x),
        y: Math.min(d.start.y, p.y),
        w: Math.abs(p.x - d.start.x),
        h: Math.abs(p.y - d.start.y),
      };
      setMarquee(r);
      const hits = currentPage(st)
        .elements.filter((el) => !el.locked && !el.hidden && intersects(aabb(el), r))
        .map((el) => el.id);
      const ids = [...new Set([...d.base, ...hits])];
      const page2 = currentPage(st);
      const groups = new Set(
        page2.elements.filter((x) => ids.includes(x.id) && x.groupId).map((x) => x.groupId),
      );
      const full = page2.elements
        .filter((x) => ids.includes(x.id) || (x.groupId && groups.has(x.groupId)))
        .map((x) => x.id);
      setUI({ selection: full });
      return;
    }
    if (d.kind === "crop") {
      const el = currentPage(st).elements.find((x) => x.id === d.id) as ImageElement;
      const lp = rotatePoint(p, { x: el.x + el.w / 2, y: el.y + el.h / 2 }, -el.rotation);
      const ls = rotatePoint(d.start, { x: el.x + el.w / 2, y: el.y + el.h / 2 }, -el.rotation);
      let nx = d.crop0.x + (lp.x - ls.x);
      let ny = d.crop0.y + (lp.y - ls.y);
      nx = Math.min(0, Math.max(el.w - d.crop0.w, nx));
      ny = Math.min(0, Math.max(el.h - d.crop0.h, ny));
      commit(
        (doc) =>
          mapElements(
            doc,
            st.pageId,
            [d.id],
            (x) => ({ ...x, crop: { ...d.crop0, x: nx, y: ny } }) as ImageElement,
          ),
        { merge: d.merge },
      );
      return;
    }
    if (d.kind === "guide") {
      const pos = Math.round((d.axis === "x" ? p.x : p.y) * 2) / 2;
      setGuideDraft({ axis: d.axis, pos });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setSnapLines([]);
    setMarquee(null);
    breakMerge();
    if (d?.kind === "guide") {
      const st = getState();
      const pg = currentPage(st);
      const p = toMM(e);
      const pos = Math.round((d.axis === "x" ? p.x : p.y) * 2) / 2;
      const inside =
        d.axis === "x"
          ? pos > -2 && pos < W + 2 && p.y > -RULER / st.zoom
          : pos > -2 && pos < H + 2 && p.x > -RULER / st.zoom;
      const list = [...pg.guides[d.axis]];
      if (d.index !== null && d.index >= 0) list.splice(d.index, 1);
      if (inside) list.push(pos);
      updatePage(pg.id, { guides: { ...pg.guides, [d.axis]: list } });
      setGuideDraft(null);
    }
  };

  const onDoubleClick = async (e: React.MouseEvent) => {
    const st = getState();
    // pointer capture retargets dblclick to the scroller, so hit-test at the cursor position
    const hit = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find((n) => (n as HTMLElement).closest?.("[data-el]"));
    const id = (hit as HTMLElement | undefined)?.closest("[data-el]")?.getAttribute("data-el");
    const el = currentPage(st).elements.find((x) => x.id === id);
    if (!el || el.locked) return;
    if (el.type === "text") setUI({ editingId: el.id, selection: [el.id], cropId: null });
    else if (el.type === "image") {
      if (!el.assetId) {
        const files = await pickFiles(IMAGE_ACCEPT, false);
        if (files.length) await addImagesFromFiles(files, undefined, el.id);
      } else setUI({ cropId: st.cropId === el.id ? null : el.id, selection: [el.id] });
    }
  };

  const startGuide = (axis: "x" | "y", ev: React.PointerEvent) => {
    (scroller.current as HTMLElement).setPointerCapture(ev.pointerId);
    drag.current = { kind: "guide", axis, index: null, merge: `g${++dragSeq}` };
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const p = toMM(e);
    const assetId = e.dataTransfer.getData("application/x-banxin-asset");
    const targetId =
      (e.target as HTMLElement).closest("[data-el]")?.getAttribute("data-el") ?? undefined;
    const target = currentPage().elements.find((x) => x.id === targetId);
    if (assetId) {
      const rec = await getAsset(assetId);
      if (!rec) return;
      const { blob: _b, preview: _p, createdAt: _c, ...meta } = rec;
      if (target?.type === "image" && !target.locked) {
        replaceImage(target.id, meta);
      } else placeAsset(meta, p);
      return;
    }
    const files = [...e.dataTransfer.files];
    const proj = files.find((f) => /\.(bxproj)$/i.test(f.name));
    if (proj) {
      if (window.confirm(`将“${proj.name}”导入为新作品？当前作品会先自动保存。`))
        await importProjectFile(proj);
      return;
    }
    const imgs = files.filter(
      (f) => f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name),
    );
    if (imgs.length)
      await addImagesFromFiles(
        imgs,
        p,
        target?.type === "image" && !target.locked ? target.id : undefined,
      );
  };

  const selected = page.elements.filter((x) => s.selection.includes(x.id));
  const single = selected.length === 1 ? selected[0] : null;
  const editing = s.editingId
    ? (page.elements.find((x) => x.id === s.editingId) as TextElement | undefined)
    : undefined;
  const cropEl = s.cropId
    ? (page.elements.find((x) => x.id === s.cropId) as ImageElement | undefined)
    : undefined;
  const hoverEl =
    hover && !s.selection.includes(hover) ? page.elements.find((x) => x.id === hover) : null;

  return (
    <div className="relative min-h-0 min-w-0 flex-1 bg-desk">
      {s.showRulers && (
        <Rulers
          scroller={scroller}
          padX={padX}
          padY={padY}
          zoom={zoom}
          W={W}
          H={H}
          selection={selectionBounds(selected)}
          onStartGuide={startGuide}
        />
      )}
      <div
        ref={scroller}
        className="bx-scroll absolute overflow-auto outline-none"
        style={{
          left: ruler,
          top: ruler,
          right: 0,
          bottom: 0,
          cursor: space ? (drag.current?.kind === "pan" ? "grabbing" : "grab") : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onContextMenu={(e) => e.preventDefault()}
        data-canvas
      >
        <div style={{ position: "relative", width: pw + padX * 2, height: ph + padY * 2 }}>
          <div
            ref={pageRef}
            style={{
              position: "absolute",
              left: padX,
              top: padY,
              width: pw,
              height: ph,
              background: page.background,
              boxShadow: "0 1px 2px rgba(0,0,0,.12), 0 12px 32px -12px rgba(0,0,0,.28)",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                transform: `scale(${zoom / K})`,
                transformOrigin: "0 0",
              }}
            >
              <PageContent page={page} width={W} height={H} editor />
            </div>
          </div>
          {/* overlay */}
          <div
            style={{
              position: "absolute",
              left: padX,
              top: padY,
              width: pw,
              height: ph,
              pointerEvents: "none",
            }}
          >
            {s.showMargins && (
              <div
                style={{
                  position: "absolute",
                  left: doc.margins.left * zoom,
                  top: doc.margins.top * zoom,
                  width: (W - doc.margins.left - doc.margins.right) * zoom,
                  height: (H - doc.margins.top - doc.margins.bottom) * zoom,
                  border: "1px dashed rgba(196,72,160,.45)",
                }}
              />
            )}
            {s.showGuides &&
              (["x", "y"] as const).map((axis) =>
                page.guides[axis].map((g, i) => (
                  <div
                    key={`${axis}${i}`}
                    data-guide={`${axis}:${i}`}
                    title="拖动移动参考线，拖回标尺删除"
                    style={{
                      position: "absolute",
                      pointerEvents: "auto",
                      cursor: axis === "x" ? "ew-resize" : "ns-resize",
                      ...(axis === "x"
                        ? { left: g * zoom - 3, top: -padY, width: 7, height: ph + padY * 2 }
                        : { top: g * zoom - 3, left: -padX, height: 7, width: pw + padX * 2 }),
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        background: "#19a7ce",
                        ...(axis === "x"
                          ? { left: 3, top: 0, bottom: 0, width: 1 }
                          : { top: 3, left: 0, right: 0, height: 1 }),
                      }}
                    />
                  </div>
                )),
              )}
            {guideDraft && (
              <div
                style={{
                  position: "absolute",
                  background: "#19a7ce",
                  ...(guideDraft.axis === "x"
                    ? { left: guideDraft.pos * zoom, top: -padY, width: 1, height: ph + padY * 2 }
                    : { top: guideDraft.pos * zoom, left: -padX, height: 1, width: pw + padX * 2 }),
                }}
              />
            )}
            {hoverEl && <FrameOutline el={hoverEl} zoom={zoom} color="rgba(43,89,195,.55)" />}
            {selected.map((el) => (
              <FrameOutline key={el.id} el={el} zoom={zoom} color="#2b59c3" width={1.5} />
            ))}
            {selected
              .filter((el) => el.type === "text" && el.columns > 1)
              .map((el) => (
                <ColumnGuides key={`c${el.id}`} el={el as TextElement} zoom={zoom} />
              ))}
            {selected.length > 1 &&
              (() => {
                const b = selectionBounds(selected)!;
                return (
                  <div
                    style={{
                      position: "absolute",
                      left: b.x * zoom - 1,
                      top: b.y * zoom - 1,
                      width: b.w * zoom + 2,
                      height: b.h * zoom + 2,
                      border: "1px dashed #2b59c3",
                    }}
                  />
                );
              })()}
            {single && !single.locked && !s.editingId && <Handles el={single} zoom={zoom} />}
            {single?.locked && (
              <div
                className="flex items-center gap-1 rounded bg-ink px-1.5 py-0.5 text-[11px] text-white"
                style={{
                  position: "absolute",
                  left: aabb(single).x * zoom,
                  top: aabb(single).y * zoom - 22,
                }}
              >
                <Lock size={11} /> 已锁定
              </div>
            )}
            {cropEl && <CropOverlay el={cropEl} zoom={zoom} />}
            {page.elements.map((el) =>
              el.type === "text" && !el.hidden ? (
                <OverflowMark key={`o${el.id}`} el={el} zoom={zoom} />
              ) : null,
            )}
            {snapLines.map((l, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  background: "#e8458b",
                  ...(l.axis === "x"
                    ? { left: l.pos * zoom, top: -padY, width: 1, height: ph + padY * 2 }
                    : { top: l.pos * zoom, left: -padX, height: 1, width: pw + padX * 2 }),
                }}
              />
            ))}
            {marquee && (
              <div
                style={{
                  position: "absolute",
                  left: marquee.x * zoom,
                  top: marquee.y * zoom,
                  width: marquee.w * zoom,
                  height: marquee.h * zoom,
                  background: "rgba(43,89,195,.08)",
                  border: "1px solid rgba(43,89,195,.6)",
                }}
              />
            )}
            {editing && <TextEditor el={editing} zoom={zoom} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Apply a new frame to an element, adjusting image crop so the picture keeps covering the frame. */
function resized(s0: PageElement, r: Rect): PageElement {
  if (s0.type !== "image") return { ...s0, ...r };
  const c = s0.crop;
  const f = Math.max(r.w / s0.w, r.h / s0.h);
  const sx = r.w / s0.w;
  const sy = r.h / s0.h;
  let crop;
  if (Math.abs(sx - sy) < 1e-6) crop = { x: c.x * sx, y: c.y * sy, w: c.w * sx, h: c.h * sy };
  else {
    // keep the focal point (frame centre in image space) and scale uniformly
    const fcx = (s0.w / 2 - c.x) / c.w;
    const fcy = (s0.h / 2 - c.y) / c.h;
    let w = c.w * f;
    let h = c.h * f;
    const k = Math.max(1, r.w / w, r.h / h);
    w *= k;
    h *= k;
    let x = r.w / 2 - fcx * w;
    let y = r.h / 2 - fcy * h;
    x = Math.min(0, Math.max(r.w - w, x));
    y = Math.min(0, Math.max(r.h - h, y));
    crop = { x, y, w, h };
  }
  return { ...s0, ...r, crop } as ImageElement;
}

function FrameOutline({
  el,
  zoom,
  color,
  width = 1,
}: {
  el: PageElement;
  zoom: number;
  color: string;
  width?: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: el.x * zoom,
        top: el.y * zoom,
        width: el.w * zoom,
        height: el.h * zoom,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        outline: `${width}px solid ${color}`,
        outlineOffset: 0,
      }}
    />
  );
}

function ColumnGuides({ el, zoom }: { el: TextElement; zoom: number }) {
  const l = layoutOf(el);
  return (
    <div
      style={{
        position: "absolute",
        left: el.x * zoom,
        top: el.y * zoom,
        width: el.w * zoom,
        height: el.h * zoom,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      }}
    >
      {Array.from({ length: el.columns }, (_, c) => (
        <div
          key={c}
          style={{
            position: "absolute",
            top: el.padding * zoom,
            bottom: el.padding * zoom,
            left: (el.padding + c * (l.colWidth + el.columnGap)) * zoom,
            width: l.colWidth * zoom,
            background: "rgba(43,89,195,.05)",
            borderLeft: "1px dashed rgba(43,89,195,.35)",
            borderRight: "1px dashed rgba(43,89,195,.35)",
          }}
        />
      ))}
    </div>
  );
}

const CURSORS: Record<Handle, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

function Handles({ el, zoom }: { el: PageElement; zoom: number }) {
  const w = el.w * zoom;
  const h = el.h * zoom;
  const isLine = el.type === "shape" && el.shape === "line";
  const list = isLine ? (["w", "e"] as Handle[]) : HANDLES;
  return (
    <div
      style={{
        position: "absolute",
        left: el.x * zoom,
        top: el.y * zoom,
        width: w,
        height: h,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      }}
    >
      {list.map((hd) => {
        const x = hd.includes("w") ? 0 : hd.includes("e") ? w : w / 2;
        const y = hd.includes("n") ? 0 : hd.includes("s") ? h : h / 2;
        return (
          <div
            key={hd}
            data-handle={hd}
            style={{
              position: "absolute",
              left: x - 5,
              top: y - 5,
              width: 10,
              height: 10,
              background: "#fff",
              border: "1.5px solid #2b59c3",
              borderRadius: 2,
              pointerEvents: "auto",
              cursor: CURSORS[hd],
            }}
          />
        );
      })}
      <div
        style={{
          position: "absolute",
          left: w / 2,
          top: -24,
          width: 1,
          height: 18,
          background: "#2b59c3",
        }}
      />
      <div
        data-handle="rotate"
        title="旋转（按住 Shift 以 15° 步进）"
        style={{
          position: "absolute",
          left: w / 2 - 6,
          top: -32,
          width: 12,
          height: 12,
          borderRadius: 6,
          background: "#fff",
          border: "1.5px solid #2b59c3",
          pointerEvents: "auto",
          cursor: "grab",
        }}
      />
    </div>
  );
}

function CropOverlay({ el, zoom }: { el: ImageElement; zoom: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (el.assetId) loadAssetUrl(el.assetId).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [el.assetId]);
  const c = el.crop;
  // outside part of the image, drawn translucent with an even-odd hole for the frame
  const ox = -c.x;
  const oy = -c.y;
  const clip = `polygon(evenodd, 0 0, ${c.w * zoom}px 0, ${c.w * zoom}px ${c.h * zoom}px, 0 ${c.h * zoom}px, 0 0, ${ox * zoom}px ${oy * zoom}px, ${(ox + el.w) * zoom}px ${oy * zoom}px, ${(ox + el.w) * zoom}px ${(oy + el.h) * zoom}px, ${ox * zoom}px ${(oy + el.h) * zoom}px, ${ox * zoom}px ${oy * zoom}px)`;
  return (
    <div
      style={{
        position: "absolute",
        left: el.x * zoom,
        top: el.y * zoom,
        width: el.w * zoom,
        height: el.h * zoom,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      }}
    >
      {url && (
        <img
          data-crop
          src={url}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            left: c.x * zoom,
            top: c.y * zoom,
            width: c.w * zoom,
            height: c.h * zoom,
            maxWidth: "none",
            opacity: 0.38,
            clipPath: clip,
            pointerEvents: "auto",
            cursor: "move",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          left: c.x * zoom,
          top: c.y * zoom,
          width: c.w * zoom,
          height: c.h * zoom,
          border: "1px dashed #e8458b",
        }}
      />
      <div
        style={{ position: "absolute", inset: 0, outline: "2px solid #e8458b", cursor: "move" }}
      />
      <div className="absolute -top-6 left-0 rounded bg-[#e8458b] px-1.5 py-0.5 text-[11px] whitespace-nowrap text-white">
        裁切模式：拖动调整画面，右侧可缩放，Esc 退出
      </div>
    </div>
  );
}

function OverflowMark({ el, zoom }: { el: TextElement; zoom: number }) {
  const l = layoutOf(el);
  if (!l.overflow) return null;
  const br = corners(el)[2];
  return (
    <button
      title="文字溢出：点击选中并查看"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => {
        setUI({ selection: [el.id], editingId: null, cropId: null });
        window.dispatchEvent(new CustomEvent("bx:focus-text"));
      }}
      style={{
        position: "absolute",
        left: br.x * zoom - 8,
        top: br.y * zoom - 8,
        width: 16,
        height: 16,
        pointerEvents: "auto",
      }}
      className="flex items-center justify-center rounded-[3px] border border-white bg-danger text-white shadow"
    >
      <Plus size={12} strokeWidth={3} />
    </button>
  );
}
