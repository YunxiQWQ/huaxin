import { useRef, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { useEditor } from "../store";
import { addPage, deletePage, duplicatePage, gotoPage, movePage } from "../commands";
import { ScaledPage } from "../../render/PageView";
import { useThumbnail } from "../../render/thumbs";
import type { Doc, Page } from "../../model/types";
import { cx, IconBtn, Button } from "../../ui/kit";
import { overflowIssues } from "../../io/preflight";
import { toast } from "../../ui/toast";

const TW = 150;

export function PagesPanel() {
  const doc = useEditor((s) => s.doc);
  const pageId = useEditor((s) => s.pageId);
  const cur = doc.pages.findIndex((p) => p.id === pageId);
  const [dragFrom, setDragFromState] = useState<number | null>(null);
  const [dropAt, setDropAtState] = useState<number | null>(null);
  // refs avoid stale closures between rapid dragover/drop events
  const fromRef = useRef<number | null>(null);
  const atRef = useRef<number | null>(null);
  const setDragFrom = (v: number | null) => ((fromRef.current = v), setDragFromState(v));
  const setDropAt = (v: number | null) => ((atRef.current = v), setDropAtState(v));
  const overflowPages = new Set(overflowIssues(doc).map((i) => i.pageIndex));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line px-3 py-2">
        <Button size="sm" variant="default" onClick={() => addPage()}>
          <Plus size={14} /> 新增页面
        </Button>
        <span className="ml-auto text-[11px] text-mute">共 {doc.pages.length} 页</span>
      </div>
      <div className="bx-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {doc.pages.map((p, i) => (
          <div key={p.id}>
            {dropAt === i && dragFrom !== null && <div className="mb-2 h-0.5 rounded bg-accent" />}
            <div
              draggable
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/x-banxin-page", String(i));
              }}
              onDragOver={(e) => {
                if (fromRef.current === null) return;
                e.preventDefault();
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = fromRef.current;
                let at = atRef.current;
                if (from !== null) {
                  if (at === null) {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    at = e.clientY < r.top + r.height / 2 ? i : i + 1;
                  }
                  movePage(from, at > from ? at - 1 : at);
                }
                setDragFrom(null);
                setDropAt(null);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDropAt(null);
              }}
              onClick={() => gotoPage(p.id)}
              className={cx(
                "group relative mb-3 flex cursor-pointer flex-col items-center rounded-lg p-2 transition-colors",
                p.id === pageId ? "bg-accent-soft ring-1 ring-accent/60" : "hover:bg-shell",
                dragFrom === i && "opacity-40",
              )}
            >
              <Thumb doc={doc} page={p} live={Math.abs(i - cur) <= 1} />
              <div className="mt-1.5 flex w-full items-center justify-between px-0.5">
                <span className="text-[11.5px] text-ink-2 tabular-nums">
                  第 {i + 1} 页
                  {overflowPages.has(i) && (
                    <span
                      className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-danger align-middle"
                      title="此页有文字溢出"
                    />
                  )}
                </span>
                <span className="flex opacity-0 transition-opacity group-hover:opacity-100">
                  <IconBtn
                    label="在后面新增页面"
                    onClick={(e) => (e.stopPropagation(), addPage(i))}
                  >
                    <Plus size={13} />
                  </IconBtn>
                  <IconBtn
                    label="复制页面"
                    onClick={(e) => (e.stopPropagation(), duplicatePage(p.id))}
                  >
                    <Copy size={13} />
                  </IconBtn>
                  <IconBtn
                    label="删除页面"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (doc.pages.length <= 1) return toast("info", "至少需要保留一页");
                      if (
                        p.elements.length &&
                        !window.confirm(
                          `删除第 ${i + 1} 页及其上的 ${p.elements.length} 个对象？可用撤销恢复。`,
                        )
                      )
                        return;
                      deletePage(p.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </IconBtn>
                </span>
              </div>
            </div>
          </div>
        ))}
        {dropAt === doc.pages.length && dragFrom !== null && (
          <div className="h-0.5 rounded bg-accent" />
        )}
        <div className="pb-2 text-center text-[11px] text-mute">拖动缩略图调整页序</div>
      </div>
    </div>
  );
}

function Thumb({ doc, page, live }: { doc: Doc; page: Page; live: boolean }) {
  const { width: W, height: H } = doc.pageSize;
  const scale = Math.min(TW / W, 180 / H);
  const url = useThumbnail(doc, page, Math.round(W * scale), !live);
  if (live) return <ScaledPage page={page} width={W} height={H} scale={scale} />;
  return (
    <div
      style={{
        width: W * scale,
        height: H * scale,
        background: page.background,
        boxShadow: "0 1px 3px rgba(0,0,0,.12), 0 8px 24px -12px rgba(0,0,0,.25)",
      }}
    >
      {url && <img src={url} alt="" className="h-full w-full" draggable={false} />}
    </div>
  );
}
