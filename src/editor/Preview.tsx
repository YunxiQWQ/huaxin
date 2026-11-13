import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEditor } from "./store";
import { ScaledPage } from "../render/PageView";
import { useThumbnail } from "../render/thumbs";
import type { Doc, Page } from "../model/types";
import { cx } from "../ui/kit";

type Mode = "single" | "spread" | "book";

/** Book-style spreads: the first page stands alone on the right, then pairs. */
function spreadsOf(n: number): (number | null)[][] {
  const out: (number | null)[][] = [[null, 0]];
  for (let i = 1; i < n; i += 2) out.push([i, i + 1 < n ? i + 1 : null]);
  return out;
}

export function Preview({ onClose }: { onClose: () => void }) {
  const doc = useEditor((s) => s.doc);
  const startPage = useEditor((s) => s.doc.pages.findIndex((p) => p.id === s.pageId));
  const [mode, setMode] = useState<Mode>("spread");
  const [page, setPage] = useState(Math.max(0, startPage));
  const [zoomK, setZoomK] = useState(1);
  const [flip, setFlip] = useState<null | "next" | "prev">(null);
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 1000, h: 700 });
  const { width: W, height: H } = doc.pageSize;
  const n = doc.pages.length;
  const spreads = spreadsOf(n);
  const spreadIdx = spreads.findIndex((s) => s.includes(page));

  useLayoutEffect(() => {
    const el = stage.current!;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const perRow = mode === "single" ? 1 : 2;
  const fit = Math.min((box.w - 120) / (W * perRow), (box.h - 60) / H);
  const scale = Math.max(0.1, fit * zoomK);

  const go = (dir: 1 | -1) => {
    if (mode === "single") return setPage((p) => Math.max(0, Math.min(n - 1, p + dir)));
    const target = spreadIdx + dir;
    if (target < 0 || target >= spreads.length) return;
    if (mode === "book" && !flip) {
      setFlip(dir === 1 ? "next" : "prev");
      setTimeout(() => {
        setFlip(null);
        const sp = spreads[target];
        setPage((sp[0] ?? sp[1])!);
      }, 650);
      return;
    }
    const sp = spreads[target];
    setPage((sp[0] ?? sp[1])!);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ")
        (e.preventDefault(), go(1));
      if (e.key === "ArrowLeft" || e.key === "PageUp") (e.preventDefault(), go(-1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const P = ({ i }: { i: number | null }) =>
    i === null || i >= n ? (
      <div style={{ width: W * scale, height: H * scale }} />
    ) : (
      <ScaledPage page={doc.pages[i]} width={W} height={H} scale={scale} shadow={false} />
    );

  const cur = spreads[spreadIdx] ?? [null, 0];
  const next = spreads[spreadIdx + 1];
  const prev = spreads[spreadIdx - 1];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#2a2b2f] text-white"
      role="dialog"
      aria-modal
      aria-label="本地预览"
    >
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/10 px-4">
        <div className="text-[14px] font-medium">本地预览 · {doc.name}</div>
        <div
          className="ml-4 flex h-8 rounded-md bg-white/10 p-0.5"
          role="radiogroup"
          aria-label="预览方式"
        >
          {(
            [
              ["single", "单页"],
              ["spread", "跨页"],
              ["book", "整本翻阅"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cx(
                "rounded-[5px] px-3.5 text-[12.5px] transition-colors",
                mode === m ? "bg-white text-[#1d1e22]" : "text-white/70 hover:text-white",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1 text-[12px] text-white/70">
          <button
            className="rounded p-1.5 hover:bg-white/10"
            onClick={() => setZoomK((z) => Math.max(0.4, z / 1.2))}
            title="缩小"
          >
            <ZoomOut size={16} />
          </button>
          <button
            className="w-12 tabular-nums hover:text-white"
            onClick={() => setZoomK(1)}
            title="适应窗口"
          >
            {Math.round(zoomK * 100)}%
          </button>
          <button
            className="rounded p-1.5 hover:bg-white/10"
            onClick={() => setZoomK((z) => Math.min(5, z * 1.2))}
            title="放大"
          >
            <ZoomIn size={16} />
          </button>
          <span className="mx-3 tabular-nums">
            {mode === "single"
              ? `${page + 1} / ${n}`
              : cur
                  .filter((x) => x !== null && x < n)
                  .map((x) => x! + 1)
                  .join("–") + ` / ${n}`}
          </span>
          <button
            className="flex items-center gap-1 rounded-md bg-white/10 px-3 py-1.5 text-white hover:bg-white/20"
            onClick={onClose}
          >
            <X size={15} /> 关闭预览
          </button>
        </div>
      </div>
      <div ref={stage} className="bx-scroll relative min-h-0 flex-1 overflow-auto">
        <div
          className="flex min-h-full min-w-full items-center justify-center p-8"
          style={{ perspective: 2400 }}
        >
          {mode === "single" ? (
            <div className="shadow-2xl">
              <P i={page} />
            </div>
          ) : (
            <div className="relative flex shadow-2xl" style={{ transformStyle: "preserve-3d" }}>
              <div className="relative">
                {flip === "prev" && prev ? <P i={prev[0]} /> : <P i={cur[0]} />}
              </div>
              <div className="relative">
                {flip === "next" && next ? <P i={next[1]} /> : <P i={cur[1]} />}
                <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-black/15 to-transparent" />
              </div>
              {flip === "next" && next && (
                <div
                  className="absolute top-0 right-0"
                  style={{
                    width: W * scale,
                    height: H * scale,
                    transformOrigin: "left center",
                    animation: "bx-flip-next .65s ease-in-out forwards",
                    transformStyle: "preserve-3d",
                  }}
                >
                  <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
                    <P i={cur[1]} />
                  </div>
                  <div
                    className="absolute inset-0"
                    style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                  >
                    <P i={next[0]} />
                  </div>
                </div>
              )}
              {flip === "prev" && prev && (
                <div
                  className="absolute top-0 left-0"
                  style={{
                    width: W * scale,
                    height: H * scale,
                    transformOrigin: "right center",
                    animation: "bx-flip-prev .65s ease-in-out forwards",
                    transformStyle: "preserve-3d",
                  }}
                >
                  <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
                    <P i={cur[0]} />
                  </div>
                  <div
                    className="absolute inset-0"
                    style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                  >
                    <P i={prev[1]} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => go(-1)}
          className="fixed top-1/2 left-4 rounded-full bg-white/10 p-2.5 hover:bg-white/20"
          aria-label="上一页"
        >
          <ChevronLeft size={22} />
        </button>
        <button
          onClick={() => go(1)}
          className="fixed top-1/2 right-4 rounded-full bg-white/10 p-2.5 hover:bg-white/20"
          aria-label="下一页"
        >
          <ChevronRight size={22} />
        </button>
      </div>
      <div className="bx-scroll flex h-[118px] shrink-0 items-center gap-2.5 overflow-x-auto border-t border-white/10 px-4">
        {doc.pages.map((p, i) => (
          <StripThumb
            key={p.id}
            doc={doc}
            page={p}
            index={i}
            active={mode === "single" ? i === page : cur.includes(i)}
            onClick={() => setPage(i)}
          />
        ))}
      </div>
      <style>{`
        @keyframes bx-flip-next { from { transform: rotateY(0deg) } to { transform: rotateY(-180deg) } }
        @keyframes bx-flip-prev { from { transform: rotateY(0deg) } to { transform: rotateY(180deg) } }
      `}</style>
    </div>
  );
}

function StripThumb({
  doc,
  page,
  index,
  active,
  onClick,
}: {
  doc: Doc;
  page: Page;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  const h = 78;
  const w = (doc.pageSize.width / doc.pageSize.height) * h;
  const url = useThumbnail(doc, page, Math.round(w), true);
  return (
    <button onClick={onClick} className="flex shrink-0 flex-col items-center gap-1">
      <div
        className={cx(
          "overflow-hidden bg-white ring-2",
          active ? "ring-[#7ea0f0]" : "ring-transparent hover:ring-white/40",
        )}
        style={{ width: w, height: h, background: page.background }}
      >
        {url && <img src={url} alt="" className="h-full w-full" />}
      </div>
      <span className="text-[10.5px] text-white/60">{index + 1}</span>
    </button>
  );
}
