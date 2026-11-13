import { ChevronLeft, ChevronRight, Maximize2, Ruler, Magnet, Grid2x2 } from "lucide-react";
import { setUI, useEditor } from "./store";
import { gotoPage } from "./commands";
import { IconBtn } from "../ui/kit";
import { canvasApi } from "./canvas/Canvas";
import { sizeLabel } from "../model/sizes";

export function StatusBar() {
  const st = useEditor((x) => x);
  const s = {
    pages: st.doc.pages,
    pageId: st.pageId,
    size: st.doc.pageSize,
    rulers: st.showRulers,
    snap: st.snap,
    guides: st.showGuides,
    sel: st.selection.length,
  };
  const i = s.pages.findIndex((p) => p.id === s.pageId);
  return (
    <div className="flex h-8 shrink-0 items-center gap-1 border-t border-line bg-white px-2 text-[11.5px] text-ink-2">
      <IconBtn label="上一页 PageUp" disabled={i <= 0} onClick={() => gotoPage(s.pages[i - 1].id)}>
        <ChevronLeft size={14} />
      </IconBtn>
      <span className="w-16 text-center tabular-nums">
        {i + 1} / {s.pages.length}
      </span>
      <IconBtn
        label="下一页 PageDown"
        disabled={i >= s.pages.length - 1}
        onClick={() => gotoPage(s.pages[i + 1].id)}
      >
        <ChevronRight size={14} />
      </IconBtn>
      <span className="ml-2 text-mute tabular-nums">{sizeLabel(s.size.width, s.size.height)}</span>
      <span className="ml-3 text-mute">
        {s.sel
          ? `已选 ${s.sel} 个对象`
          : "双击文字编辑 · 双击图片裁切 · 空格拖动画布 · Ctrl+滚轮缩放"}
      </span>
      <div className="ml-auto flex items-center gap-0.5">
        <IconBtn label="标尺" active={s.rulers} onClick={() => setUI({ showRulers: !s.rulers })}>
          <Ruler size={14} />
        </IconBtn>
        <IconBtn label="参考线" active={s.guides} onClick={() => setUI({ showGuides: !s.guides })}>
          <Grid2x2 size={14} />
        </IconBtn>
        <IconBtn label="吸附" active={s.snap} onClick={() => setUI({ snap: !s.snap })}>
          <Magnet size={14} />
        </IconBtn>
        <IconBtn label="适应窗口 Ctrl+0" onClick={() => canvasApi.fit?.()}>
          <Maximize2 size={14} />
        </IconBtn>
      </div>
    </div>
  );
}
