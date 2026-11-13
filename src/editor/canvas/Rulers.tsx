import { useEffect, useRef } from "react";
import type { Rect } from "../geometry";

export const RULER = 20;

function pickStep(zoom: number) {
  for (const s of [1, 2, 5, 10, 20, 50, 100, 200, 500]) if (s * zoom >= 46) return s;
  return 1000;
}

export function Rulers({
  scroller,
  padX,
  padY,
  zoom,
  W,
  H,
  selection,
  onStartGuide,
}: {
  scroller: React.RefObject<HTMLDivElement | null>;
  padX: number;
  padY: number;
  zoom: number;
  W: number;
  H: number;
  selection: Rect | null;
  onStartGuide: (axis: "x" | "y", e: React.PointerEvent) => void;
}) {
  const top = useRef<HTMLCanvasElement>(null);
  const left = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      for (const [cv, horizontal] of [
        [top.current, true],
        [left.current, false],
      ] as const) {
        if (!cv) continue;
        const len = horizontal ? sc.clientWidth : sc.clientHeight;
        cv.width = len * dpr;
        cv.height = RULER * dpr;
        cv.style.width = `${len}px`;
        cv.style.height = `${RULER}px`;
        const ctx = cv.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#fbfaf8";
        ctx.fillRect(0, 0, len, RULER);
        const origin = horizontal ? padX - sc.scrollLeft : padY - sc.scrollTop;
        const size = horizontal ? W : H;
        // page extent
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(origin, 0, size * zoom, RULER);
        if (selection) {
          ctx.fillStyle = "rgba(43,89,195,.14)";
          const a = horizontal ? selection.x : selection.y;
          const b = horizontal ? selection.w : selection.h;
          ctx.fillRect(origin + a * zoom, 0, b * zoom, RULER);
        }
        const step = pickStep(zoom);
        const minor = step / (step >= 10 ? 10 : 5);
        const startMm = Math.floor(-origin / zoom / minor) * minor;
        const endMm = (len - origin) / zoom;
        ctx.strokeStyle = "#a9a69f";
        ctx.fillStyle = "#76736c";
        ctx.font = "9px system-ui, sans-serif";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let mm = startMm; mm <= endMm; mm += minor) {
          const r = Math.round(mm / minor) * minor;
          const pos = Math.round(origin + r * zoom) + 0.5;
          const major = Math.abs(r / step - Math.round(r / step)) < 1e-6;
          const half = !major && Math.abs((r * 2) / step - Math.round((r * 2) / step)) < 1e-6;
          const t = major ? RULER - 1 : half ? 7 : 4;
          // vertical ruler canvas is rotated 90°, so its ticks grow from the top edge (screen right)
          const base = horizontal ? RULER : 0;
          ctx.moveTo(pos, base);
          ctx.lineTo(pos, horizontal ? base - t : base + t);
          if (major) ctx.fillText(String(Math.round(r)), pos + 2, horizontal ? 9 : RULER - 3);
        }
        ctx.stroke();
        ctx.fillStyle = "#e4e2dd";
        ctx.fillRect(0, horizontal ? RULER - 1 : 0, len, 1);
      }
    };
    draw();
    sc.addEventListener("scroll", draw);
    const ro = new ResizeObserver(draw);
    ro.observe(sc);
    return () => {
      sc.removeEventListener("scroll", draw);
      ro.disconnect();
    };
  }, [scroller, padX, padY, zoom, W, H, selection?.x, selection?.y, selection?.w, selection?.h]);

  return (
    <>
      <div
        className="absolute top-0 left-0 z-10 flex items-center justify-center border-r border-b border-line bg-[#fbfaf8] text-[9px] text-mute"
        style={{ width: RULER, height: RULER }}
      >
        mm
      </div>
      <canvas
        ref={top}
        className="absolute top-0 z-10 cursor-row-resize"
        style={{ left: RULER }}
        title="从标尺向下拖出水平参考线"
        onPointerDown={(e) => onStartGuide("y", e)}
      />
      <div
        className="absolute z-10 overflow-hidden"
        style={{ top: RULER, left: 0, width: RULER, bottom: 0 }}
      >
        <canvas
          ref={left}
          className="absolute top-0 left-0 origin-top-left cursor-col-resize"
          style={{ transform: `translateX(${RULER}px) rotate(90deg)` }}
          title="从标尺向右拖出垂直参考线"
          onPointerDown={(e) => onStartGuide("x", e)}
        />
      </div>
    </>
  );
}
