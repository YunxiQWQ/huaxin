import type { PageDL, DLItem } from "./displayList";
import { ITALIC_SKEW, dashArray, strokeInsets } from "./displayList";
import { assetBitmap } from "../storage/assets";
import type { Stroke } from "../model/types";

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  if (r > 0) ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  else ctx.rect(x, y, w, h);
}

function strokeShape(ctx: CanvasRenderingContext2D, s: Stroke, path: (inset: number) => void) {
  for (const { inset, width } of strokeInsets(s)) {
    path(inset);
    ctx.lineWidth = width;
    ctx.strokeStyle = s.color;
    ctx.setLineDash(dashArray(s, width) ?? []);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

/**
 * Render a page display list onto a canvas. `scale` = device px per mm.
 * Uses the same layout lines as the editor and the PDF exporter.
 */
export async function renderPageToCanvas(
  dl: PageDL,
  scale: number,
  opts: { full: boolean; canvas?: HTMLCanvasElement | OffscreenCanvas },
): Promise<HTMLCanvasElement | OffscreenCanvas> {
  const W = Math.max(1, Math.round(dl.width * scale));
  const H = Math.max(1, Math.round(dl.height * scale));
  const canvas = opts.canvas ?? document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  (ctx as any).textRendering = "optimizeSpeed";
  (ctx as any).fontKerning = "none";
  // preload bitmaps
  const ids = new Set<string>();
  for (const g of dl.groups) for (const it of g.items) if (it.t === "image") ids.add(it.assetId);
  const bitmaps = new Map<string, ImageBitmap | null>();
  await Promise.all([...ids].map(async (id) => bitmaps.set(id, await assetBitmap(id, opts.full))));

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = dl.background;
  ctx.fillRect(0, 0, dl.width, dl.height);
  for (const g of dl.groups) {
    ctx.save();
    ctx.globalAlpha = g.opacity;
    ctx.translate(g.x + g.w / 2, g.y + g.h / 2);
    ctx.rotate((g.rotation * Math.PI) / 180);
    ctx.translate(-g.w / 2, -g.h / 2);
    for (const it of g.items) drawItem(ctx, it, scale, bitmaps);
    ctx.restore();
  }
  for (const b of bitmaps.values()) if (opts.full) b?.close();
  return canvas;
}

function drawItem(
  ctx: CanvasRenderingContext2D,
  it: DLItem,
  scale: number,
  bitmaps: Map<string, ImageBitmap | null>,
) {
  switch (it.t) {
    case "rect":
      if (it.fill) {
        ctx.fillStyle = it.fill;
        roundRect(ctx, it.x, it.y, it.w, it.h, it.r);
        ctx.fill();
      }
      if (it.stroke)
        strokeShape(ctx, it.stroke, (i) =>
          roundRect(ctx, it.x + i, it.y + i, it.w - 2 * i, it.h - 2 * i, Math.max(0, it.r - i)),
        );
      break;
    case "ellipse": {
      const path = (i: number) => {
        ctx.beginPath();
        ctx.ellipse(
          it.x + it.w / 2,
          it.y + it.h / 2,
          Math.max(0, it.w / 2 - i),
          Math.max(0, it.h / 2 - i),
          0,
          0,
          Math.PI * 2,
        );
      };
      if (it.fill) {
        ctx.fillStyle = it.fill;
        path(0);
        ctx.fill();
      }
      if (it.stroke) strokeShape(ctx, it.stroke, path);
      break;
    }
    case "line": {
      const s = it.stroke;
      const parts = s.dash === "double" ? [-s.width / 3, s.width / 3] : [0];
      const lw = s.dash === "double" ? s.width / 3 : s.width;
      const len = Math.hypot(it.x2 - it.x1, it.y2 - it.y1) || 1;
      const nx = -(it.y2 - it.y1) / len;
      const ny = (it.x2 - it.x1) / len;
      for (const off of parts) {
        ctx.beginPath();
        ctx.moveTo(it.x1 + nx * off, it.y1 + ny * off);
        ctx.lineTo(it.x2 + nx * off, it.y2 + ny * off);
        ctx.lineWidth = lw;
        ctx.strokeStyle = s.color;
        ctx.setLineDash(dashArray(s, lw) ?? []);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      break;
    }
    case "image": {
      const bmp = bitmaps.get(it.assetId);
      ctx.save();
      roundRect(ctx, it.clip.x, it.clip.y, it.clip.w, it.clip.h, it.clip.r);
      ctx.clip();
      if (bmp) ctx.drawImage(bmp, it.dest.x, it.dest.y, it.dest.w, it.dest.h);
      else {
        ctx.fillStyle = "#e4e1da";
        ctx.fillRect(it.clip.x, it.clip.y, it.clip.w, it.clip.h);
      }
      ctx.restore();
      break;
    }
    case "placeholder":
      break;
    case "text": {
      ctx.save();
      ctx.translate(it.x, it.baseline);
      if (it.italic) ctx.transform(1, 0, -ITALIC_SKEW, 1, 0, 0);
      ctx.scale(1 / scale, 1 / scale);
      const px = it.size * scale;
      ctx.font = `${it.synthBold ? 700 : it.weight} ${px}px "${it.familyCss}", ${it.fallback}`;
      (ctx as any).letterSpacing = `${it.spacing * scale}px`;
      ctx.fillStyle = it.color;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(it.text, 0, 0);
      ctx.restore();
      break;
    }
  }
}
