import {
  ChevronLeft,
  Redo2,
  Undo2,
  History,
  Eye,
  Download,
  FileDown,
  FileImage,
  Package,
  Check,
  Loader2,
  CircleAlert,
  PauseCircle,
  ChevronDown,
  Minus,
  Plus,
  Maximize2,
} from "lucide-react";
import { redo, undo, useEditor, getState } from "./store";
import { updateDoc } from "./commands";
import { useSaveStatus } from "../storage/session";
import { Button, IconBtn, Menu, MenuItem, cx } from "../ui/kit";
import { BrandMark } from "../views/Shell";
import { downloadProjectFile, leaveEditor } from "../app/actions";
import { canvasApi } from "./canvas/Canvas";
import { formatTime } from "../ui/kit";

export function TopBar({
  onExport,
  onHistory,
  onPreview,
  onStatus,
}: {
  onExport: (tab: "pdf" | "image" | "project") => void;
  onHistory: () => void;
  onPreview: () => void;
  onStatus: () => void;
}) {
  const name = useEditor((s) => s.doc.name);
  const canUndo = useEditor((s) => s.canUndo);
  const canRedo = useEditor((s) => s.canRedo);
  const zoom = useEditor((s) => s.zoom);
  const fileDirty = useEditor((s) => s.doc !== s.fileSavedDoc);
  const st = useSaveStatus();

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-white px-2.5">
      <button
        onClick={() => void leaveEditor()}
        className="flex h-8 items-center gap-1.5 rounded-md pr-2 pl-1 text-ink-2 hover:bg-shell"
        title="返回本机工作台（当前作品会先保存）"
      >
        <ChevronLeft size={16} />
        <BrandMark size={22} />
      </button>
      <input
        className="h-8 w-56 rounded-md border border-transparent bg-transparent px-2 text-[14px] font-medium outline-none hover:border-line focus:border-accent"
        value={name}
        onChange={(e) => updateDoc({ name: e.target.value }, "docname")}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label="作品名称"
      />
      <button
        onClick={onStatus}
        className={cx(
          "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px]",
          st.state === "error"
            ? "bg-danger/10 text-danger"
            : st.state === "conflict"
              ? "bg-warn/10 text-warn"
              : "text-mute hover:bg-shell",
        )}
        title="本机保存状态"
      >
        {st.state === "saving" && (
          <>
            <Loader2 size={13} className="animate-spin" /> 保存中…
          </>
        )}
        {(st.state === "saved" || st.state === "idle") && (
          <>
            <Check size={13} className="text-ok" /> 已在本机保存
            {st.at ? ` · ${formatTime(st.at).replace("今天 ", "")}` : ""}
          </>
        )}
        {st.state === "error" && (
          <>
            <CircleAlert size={13} /> 保存失败
          </>
        )}
        {st.state === "conflict" && (
          <>
            <PauseCircle size={13} /> 已暂停保存
          </>
        )}
      </button>
      <div className="mx-1 h-5 w-px bg-line" />
      <IconBtn label="撤销 Ctrl+Z" disabled={!canUndo} onClick={undo}>
        <Undo2 size={16} />
      </IconBtn>
      <IconBtn label="重做 Ctrl+Shift+Z" disabled={!canRedo} onClick={redo}>
        <Redo2 size={16} />
      </IconBtn>

      <div className="ml-auto flex items-center gap-1.5">
        <div className="mr-1 flex items-center rounded-md border border-line">
          <IconBtn label="缩小 Ctrl+-" onClick={() => canvasApi.zoomTo?.(getState().zoom / 1.2)}>
            <Minus size={14} />
          </IconBtn>
          <Menu
            align="right"
            trigger={(_, toggle) => (
              <button
                onClick={toggle}
                className="h-7 w-14 text-[12px] tabular-nums hover:bg-shell"
                title="缩放比例（相对 96dpi 实际尺寸）"
              >
                {Math.round((zoom / (96 / 25.4)) * 100)}%
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  icon={<Maximize2 size={14} />}
                  hint="Ctrl+0"
                  onClick={() => (close(), canvasApi.fit?.())}
                >
                  适应窗口
                </MenuItem>
                {[50, 75, 100, 150, 200, 300].map((p) => (
                  <MenuItem
                    key={p}
                    onClick={() => (close(), canvasApi.zoomTo?.((p / 100) * (96 / 25.4)))}
                  >
                    {p}%
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
          <IconBtn label="放大 Ctrl+=" onClick={() => canvasApi.zoomTo?.(getState().zoom * 1.2)}>
            <Plus size={14} />
          </IconBtn>
        </div>
        <Button variant="ghost" onClick={onHistory} title="历史版本">
          <History size={15} /> 历史版本
        </Button>
        <Button variant="ghost" onClick={onPreview} title="本地预览">
          <Eye size={15} /> 预览
        </Button>
        <Button
          variant="default"
          onClick={() => void downloadProjectFile()}
          className="relative"
          title={fileDirty ? "当前修改尚未下载为工程文件" : "工程文件已是最新"}
        >
          <Download size={15} /> 下载工程
          {fileDirty && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-seal ring-2 ring-white" />
          )}
        </Button>
        <Menu
          trigger={(_, toggle) => (
            <Button variant="primary" onClick={toggle}>
              <FileDown size={15} /> 导出 <ChevronDown size={14} />
            </Button>
          )}
        >
          {(close) => (
            <>
              <MenuItem icon={<FileDown size={14} />} onClick={() => (close(), onExport("pdf"))}>
                导出 PDF（可复制文字）
              </MenuItem>
              <MenuItem icon={<FileImage size={14} />} onClick={() => (close(), onExport("image"))}>
                导出图片（PNG / JPEG）
              </MenuItem>
              <MenuItem icon={<Package size={14} />} onClick={() => (close(), onExport("project"))}>
                下载工程文件
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
    </header>
  );
}
