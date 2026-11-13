import { useMemo, useState } from "react";
import { TopBar } from "./TopBar";
import { LeftSide } from "./panels/LeftPanels";
import { Canvas } from "./canvas/Canvas";
import { Inspector } from "./panels/Inspector";
import { ExportDialog } from "./dialogs/ExportDialog";
import { HistoryDialog } from "./dialogs/HistoryDialog";
import { StatusDialog } from "./dialogs/StatusDialog";
import { Preview } from "./Preview";
import { useEditorShortcuts } from "./shortcuts";
import { useEditor } from "./store";
import { useSaveStatus } from "../storage/session";
import { downloadProjectFile } from "../app/actions";
import { CircleAlert, PauseCircle } from "lucide-react";
import { StatusBar } from "./StatusBar";

export function Editor() {
  const [exportTab, setExportTab] = useState<null | "pdf" | "image" | "project">(null);
  const [history, setHistory] = useState(false);
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState(false);
  const st = useSaveStatus();
  const docId = useEditor((s) => s.doc.id);
  const handlers = useMemo(
    () => ({ preview: () => setPreview(true), exportPdf: () => setExportTab("pdf") }),
    [],
  );
  useEditorShortcuts(!preview, handlers);

  return (
    <div className="flex h-full flex-col" key={docId}>
      <TopBar
        onExport={setExportTab}
        onHistory={() => setHistory(true)}
        onPreview={() => setPreview(true)}
        onStatus={() => setStatus(true)}
      />
      {st.state === "error" && (
        <div className="flex shrink-0 items-center gap-2 bg-danger px-4 py-1.5 text-[12.5px] text-white">
          <CircleAlert size={14} /> 本机保存失败：{st.error}
          。当前内容仍在页面中，请立即下载工程文件以免丢失。
          <button
            className="ml-2 rounded bg-white/20 px-2 py-0.5 font-medium hover:bg-white/30"
            onClick={() => void downloadProjectFile()}
          >
            下载工程文件
          </button>
          <button className="rounded px-2 py-0.5 hover:bg-white/20" onClick={() => setStatus(true)}>
            详情
          </button>
        </div>
      )}
      {st.state === "conflict" && (
        <div className="flex shrink-0 items-center gap-2 bg-warn px-4 py-1.5 text-[12.5px] text-white">
          <PauseCircle size={14} /> {st.conflictReason}
          <button
            className="ml-2 rounded bg-white/20 px-2 py-0.5 font-medium hover:bg-white/30"
            onClick={() => setStatus(true)}
          >
            处理
          </button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <LeftSide />
        <div className="flex min-w-0 flex-1 flex-col">
          <Canvas />
          <StatusBar />
        </div>
        <Inspector />
      </div>
      <ExportDialog
        open={exportTab !== null}
        tab={exportTab ?? "pdf"}
        onClose={() => setExportTab(null)}
      />
      <HistoryDialog open={history} onClose={() => setHistory(false)} />
      <StatusDialog open={status} onClose={() => setStatus(false)} />
      {preview && <Preview onClose={() => setPreview(false)} />}
    </div>
  );
}
