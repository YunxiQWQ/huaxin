import { memo, useEffect, useSyncExternalStore } from "react";
import type { Page, PageElement, Stroke } from "../model/types";
import { elementItems, ITALIC_SKEW, dashArray, strokeInsets, type DLItem } from "./displayList";
import { fontEpoch, subscribeFonts } from "../fonts/loader";
import { cachedAssetUrl, loadAssetUrl, subscribeAssetUrls } from "../storage/assets";
import { ImageOff, ImagePlus } from "lucide-react";

/** DOM render resolution: px per mm. The view is scaled with a CSS transform. */
export const K = 8;

export function useFontEpoch() {
  return useSyncExternalStore(subscribeFonts, fontEpoch);
}

export function useAssetUrl(id: string | null): string | null | undefined {
  const url = useSyncExternalStore(subscribeAssetUrls, () => (id ? cachedAssetUrl(id) : null));
  useEffect(() => {
    if (id && url === undefined) loadAssetUrl(id);
  }, [id, url]);
  return url;
}

function SvgStroke({
  s,
  w,
  h,
  r,
  kind,
}: {
  s: Stroke;
  w: number;
  h: number;
  r: number;
  kind: "rect" | "ellipse";
}) {
  return (
    <>
      {strokeInsets(s).map(({ inset, width }, i) => {
        const dash = dashArray(s, width);
        const common = {
          fill: "none",
          stroke: s.color,
          strokeWidth: width * K,
          strokeDasharray: dash ? dash.map((d) => d * K).join(" ") : undefined,
        };
        return kind === "rect" ? (
          <rect
            key={i}
            x={inset * K}
            y={inset * K}
            width={Math.max(0, (w - 2 * inset) * K)}
            height={Math.max(0, (h - 2 * inset) * K)}
            rx={Math.max(0, r - inset) * K}
            {...common}
          />
        ) : (
          <ellipse
            key={i}
            cx={(w / 2) * K}
            cy={(h / 2) * K}
            rx={Math.max(0, w / 2 - inset) * K}
            ry={Math.max(0, h / 2 - inset) * K}
            {...common}
          />
        );
      })}
    </>
  );
}

function ImageItem({ it }: { it: Extract<DLItem, { t: "image" }> }) {
  const url = useAssetUrl(it.assetId);
  return (
    <div
      style={{
        position: "absolute",
        left: it.clip.x * K,
        top: it.clip.y * K,
        width: it.clip.w * K,
        height: it.clip.h * K,
        overflow: "hidden",
        borderRadius: it.clip.r * K,
        background: url ? undefined : "#e4e1da",
      }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            left: (it.dest.x - it.clip.x) * K,
            top: (it.dest.y - it.clip.y) * K,
            width: it.dest.w * K,
            height: it.dest.h * K,
            maxWidth: "none",
            userSelect: "none",
          }}
        />
      ) : url === "" ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[#9a5b4b]"
          style={{ fontSize: 24 }}
        >
          <ImageOff size={48} />
          <span>图片缺失</span>
        </div>
      ) : null}
    </div>
  );
}

function Item({ it }: { it: DLItem }) {
  switch (it.t) {
    case "rect": {
      const fillOnly = it.fill && !it.stroke && it.r === 0;
      if (fillOnly)
        return (
          <div
            style={{
              position: "absolute",
              left: it.x * K,
              top: it.y * K,
              width: it.w * K,
              height: it.h * K,
              background: it.fill!,
            }}
          />
        );
      return (
        <svg
          style={{ position: "absolute", left: it.x * K, top: it.y * K, overflow: "visible" }}
          width={it.w * K}
          height={it.h * K}
        >
          {it.fill && (
            <rect x={0} y={0} width={it.w * K} height={it.h * K} rx={it.r * K} fill={it.fill} />
          )}
          {it.stroke && <SvgStroke s={it.stroke} w={it.w} h={it.h} r={it.r} kind="rect" />}
        </svg>
      );
    }
    case "ellipse":
      return (
        <svg
          style={{ position: "absolute", left: it.x * K, top: it.y * K, overflow: "visible" }}
          width={it.w * K}
          height={it.h * K}
        >
          {it.fill && (
            <ellipse
              cx={(it.w / 2) * K}
              cy={(it.h / 2) * K}
              rx={(it.w / 2) * K}
              ry={(it.h / 2) * K}
              fill={it.fill}
            />
          )}
          {it.stroke && <SvgStroke s={it.stroke} w={it.w} h={it.h} r={0} kind="ellipse" />}
        </svg>
      );
    case "line": {
      const s = it.stroke;
      const parts = s.dash === "double" ? [-s.width / 3, s.width / 3] : [0];
      const lw = s.dash === "double" ? s.width / 3 : s.width;
      const len = Math.hypot(it.x2 - it.x1, it.y2 - it.y1) || 1;
      const nx = -(it.y2 - it.y1) / len;
      const ny = (it.x2 - it.x1) / len;
      const dash = dashArray(s, lw);
      return (
        <svg
          style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
          width={1}
          height={1}
        >
          {parts.map((off, i) => (
            <line
              key={i}
              x1={(it.x1 + nx * off) * K}
              y1={(it.y1 + ny * off) * K}
              x2={(it.x2 + nx * off) * K}
              y2={(it.y2 + ny * off) * K}
              stroke={s.color}
              strokeWidth={lw * K}
              strokeDasharray={dash ? dash.map((d) => d * K).join(" ") : undefined}
            />
          ))}
        </svg>
      );
    }
    case "image":
      return <ImageItem it={it} />;
    case "placeholder":
      return (
        <div
          className="flex flex-col items-center justify-center text-[#8a8478]"
          style={{
            position: "absolute",
            left: it.x * K,
            top: it.y * K,
            width: it.w * K,
            height: it.h * K,
            borderRadius: it.r * K,
            background:
              "repeating-linear-gradient(45deg,#ece9e2,#ece9e2 12px,#e4e0d7 12px,#e4e0d7 24px)",
            fontSize: Math.min(28, it.w * K * 0.08),
          }}
        >
          <ImagePlus size={Math.min(64, it.w * K * 0.2)} strokeWidth={1.5} />
          <span style={{ marginTop: 8 }}>双击或拖入图片</span>
        </div>
      );
    case "text":
      return (
        <span
          style={{
            position: "absolute",
            left: it.x * K,
            top: (it.baseline - it.ascent) * K,
            height: (it.ascent + it.descent) * K,
            lineHeight: `${(it.ascent + it.descent) * K}px`,
            fontSize: it.size * K,
            fontFamily: `"${it.familyCss}", ${it.fallback}`,
            fontWeight: it.synthBold ? 700 : it.weight,
            letterSpacing: it.spacing * K,
            color: it.color,
            transform: it.italic ? `skewX(${-Math.atan(ITALIC_SKEW)}rad)` : undefined,
            transformOrigin: `0 ${it.ascent * K}px`,
          }}
        >
          {it.text}
        </span>
      );
  }
}

export const ElementView = memo(function ElementView({
  el,
  editor,
  epoch: _epoch,
  editing,
}: {
  el: PageElement;
  editor?: boolean;
  epoch: number;
  editing?: boolean;
}) {
  const items = elementItems(el, { editor });
  return (
    <div
      data-el={editor ? el.id : undefined}
      style={{
        position: "absolute",
        left: el.x * K,
        top: el.y * K,
        width: el.w * K,
        height: el.h * K,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        opacity: el.opacity,
        pointerEvents: editor && el.locked ? "none" : undefined,
      }}
    >
      {items.map((it, i) => (editing && it.t === "text" ? null : <Item key={i} it={it} />))}
    </div>
  );
});

export const PageContent = memo(function PageContent({
  page,
  width,
  height,
  editor,
  editingId,
}: {
  page: Page;
  width: number;
  height: number;
  editor?: boolean;
  editingId?: string | null;
}) {
  const epoch = useFontEpoch();
  return (
    <div
      className="bx-page"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: width * K,
        height: height * K,
        background: page.background,
        overflow: "hidden",
      }}
    >
      {page.elements.map((el) =>
        el.hidden ? null : (
          <ElementView
            key={el.id}
            el={el}
            editor={editor}
            epoch={epoch}
            editing={el.id === editingId}
          />
        ),
      )}
    </div>
  );
});

/** Static page at an arbitrary on-screen scale (px per mm). */
export function ScaledPage({
  page,
  width,
  height,
  scale,
  className,
  shadow = true,
}: {
  page: Page;
  width: number;
  height: number;
  scale: number;
  className?: string;
  shadow?: boolean;
}) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: width * scale,
        height: height * scale,
        overflow: "hidden",
        background: page.background,
        boxShadow: shadow
          ? "0 1px 3px rgba(0,0,0,.12), 0 8px 24px -12px rgba(0,0,0,.25)"
          : undefined,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `scale(${scale / K})`,
          transformOrigin: "0 0",
        }}
      >
        <PageContent page={page} width={width} height={height} />
      </div>
    </div>
  );
}
