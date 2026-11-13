import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { Button, Label, Modal, ProgressBar, Segmented, cx } from "../../ui/kit";
import { getState, useEditor } from "../store";
import { checkDoc, type Issue } from "../../io/preflight";
import { parsePageRange, safeFileName, saveBlob } from "../../io/download";
import { exportPdf, type Progress } from "../../io/pdfExport";
import { exportImages } from "../../io/imageExport";
import { downloadProjectFile } from "../../app/actions";
import { locateIssue } from "../panels/LeftPanels";

type Tab = "pdf" | "image" | "project";

export function ExportDialog({
  open,
  tab: initial,
  onClose,
}: {
  open: boolean;
  tab: Tab;
  onClose: () => void;
}) {
  const doc = useEditor((s) => s.doc);
  const pageId = useEditor((s) => s.pageId);
  const [tab, setTab] = useState<Tab>(initial);
  const [range, setRange] = useState<"all" | "current" | "custom">("all");
  const [custom, setCustom] = useState("");
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [dpi, setDpi] = useState(150);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string; warnings?: string[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTab(initial);
      setResult(null);
      setProgress(null);
    }
  }, [open, initial]);

  const pages =
    range === "all"
      ? doc.pages.map((_, i) => i)
      : range === "current"
        ? [doc.pages.findIndex((p) => p.id === pageId)]
        : parsePageRange(custom, doc.pages.length);

  useEffect(() => {
    if (!open || !pages || tab === "project") return;
    let alive = true;
    setIssues(null);
    const t = setTimeout(
      () => checkDoc(getState().doc, pages).then((r) => alive && setIssues(r)),
      150,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [open, tab, range, custom, doc]);

  const run = async () => {
    if (!pages?.length) return;
    setBusy(true);
    setResult(null);
    const d = getState().doc;
    try {
      if (tab === "pdf") {
        const { blob, warnings } = await exportPdf(d, pages, setProgress);
        const ok = await saveBlob(blob, `${safeFileName(d.name)}.pdf`, {
          description: "PDF 文件",
          accept: { "application/pdf": [".pdf"] },
        });
        setResult(
          ok
            ? {
                ok: true,
                text: `PDF 已生成（${pages.length} 页，${(blob.size / 1024 / 1024).toFixed(1)} MB）。页面尺寸 ${d.pageSize.width} × ${d.pageSize.height} mm，文字可选择、搜索和复制。`,
                warnings,
              }
            : { ok: false, text: "已取消保存" },
        );
      } else if (tab === "image") {
        const { blob, ext, multi } = await exportImages(
          d,
          pages,
          { format, dpi, quality: 0.92 },
          setProgress,
        );
        const name = multi
          ? `${safeFileName(d.name)}_图片.zip`
          : `${safeFileName(d.name)}_第${pages[0] + 1}页.${ext}`;
        const ok = await saveBlob(
          blob,
          name,
          multi
            ? { description: "ZIP 压缩包", accept: { "application/zip": [".zip"] } }
            : {
                description: "图片",
                accept: { [format === "png" ? "image/png" : "image/jpeg"]: [`.${ext}`] },
              },
        );
        setResult(
          ok
            ? {
                ok: true,
                text: multi ? `已将 ${pages.length} 页打包为 ZIP 保存。` : "图片已保存。",
              }
            : { ok: false, text: "已取消保存" },
        );
      }
    } catch (e: any) {
      console.error(e);
      setResult({
        ok: false,
        text: `导出失败：${e?.message || e}。当前作品未受影响，处理后可重试。`,
      });
    }
    setProgress(null);
    setBusy(false);
  };

  const errors = issues?.filter((i) => i.level === "error") ?? [];
  const warns = issues?.filter((i) => i.level === "warning") ?? [];

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      closable={!busy}
      title="导出"
      width={600}
      footer={
        tab === "project" ? (
          <>
            <Button onClick={onClose}>关闭</Button>
            <Button
              variant="primary"
              onClick={async () => (await downloadProjectFile()) && onClose()}
            >
              下载工程文件
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>
              关闭
            </Button>
            <Button variant="primary" onClick={run} disabled={busy || !pages?.length}>
              {busy
                ? "正在导出…"
                : result && !result.ok
                  ? "重试导出"
                  : errors.length || warns.length
                    ? "仍然导出"
                    : `导出 ${tab === "pdf" ? "PDF" : "图片"}`}
            </Button>
          </>
        )
      }
    >
      <Segmented
        className="mb-4"
        value={tab}
        onChange={(v) => (setTab(v), setResult(null))}
        options={[
          { value: "pdf", label: "PDF" },
          { value: "image", label: "PNG / JPEG 图片" },
          { value: "project", label: "工程文件" },
        ]}
      />
      {tab === "project" ? (
        <div className="space-y-2 text-[13px] leading-relaxed text-ink-2">
          <p>
            工程文件（.bxproj）包含全部页面结构、可编辑文字、元素属性和使用到的图片，可在其他电脑或浏览器中导入后继续编辑。
          </p>
          <p className="text-[12px] text-mute">
            字体按名称记录；程序内置的开源字体由网站提供，不随工程打包。工程记录格式版本，便于今后升级兼容。
          </p>
        </div>
      ) : (
        <>
          <Label>导出页面</Label>
          <div className="mb-4 flex items-center gap-2">
            <Segmented
              className="w-64"
              value={range}
              onChange={setRange}
              options={[
                { value: "all", label: `全部（${doc.pages.length} 页）` },
                { value: "current", label: "当前页" },
                { value: "custom", label: "指定页" },
              ]}
            />
            {range === "custom" && (
              <input
                className={cx(
                  "h-7 flex-1 rounded-md border px-2 text-[12px] outline-none",
                  pages ? "border-line focus:border-accent" : "border-danger",
                )}
                placeholder="如 1-3,5"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
              />
            )}
          </div>
          {tab === "pdf" && (
            <div className="mb-4 rounded-lg bg-shell px-3 py-2.5 text-[12px] leading-relaxed text-ink-2">
              在浏览器中生成，保留页面顺序和实际尺寸（{doc.pageSize.width} × {doc.pageSize.height}{" "}
              mm）。中文以嵌入字体子集的真实文字输出，可选择、搜索和复制；换行、分栏与图片裁切与编辑画面一致。
            </div>
          )}
          {tab === "image" && (
            <div className="mb-4 grid grid-cols-2 gap-4">
              <div>
                <Label>格式</Label>
                <Segmented
                  value={format}
                  onChange={setFormat}
                  options={[
                    { value: "png", label: "PNG" },
                    { value: "jpeg", label: "JPEG" },
                  ]}
                />
              </div>
              <div>
                <Label>清晰度</Label>
                <Segmented
                  value={dpi}
                  onChange={setDpi}
                  options={[
                    { value: 96, label: "屏幕 96" },
                    { value: 150, label: "标准 150" },
                    { value: 300, label: "印刷 300" },
                  ]}
                />
              </div>
              <div className="col-span-2 text-[11.5px] text-mute">
                单页约 {Math.round((doc.pageSize.width / 25.4) * dpi)} ×{" "}
                {Math.round((doc.pageSize.height / 25.4) * dpi)} 像素；多页将打包为 ZIP。
              </div>
            </div>
          )}
          <Label>导出前检查</Label>
          <div className="bx-scroll max-h-44 overflow-auto rounded-lg border border-line">
            {issues === null && <div className="p-3 text-[12px] text-mute">正在检查…</div>}
            {issues && !errors.length && !warns.length && (
              <div className="flex items-center gap-2 p-3 text-[12px] text-ok">
                <CircleCheck size={14} /> 未发现文字溢出、图片缺失或字体问题
              </div>
            )}
            {[...errors, ...warns].map((i, k) => (
              <button
                key={k}
                className="flex w-full items-start gap-2 border-b border-line px-3 py-2 text-left text-[12px] last:border-0 hover:bg-shell"
                onClick={() => (locateIssue(i), onClose())}
                title="定位到此对象"
              >
                <span className={i.level === "error" ? "text-danger" : "text-warn"}>
                  {i.level === "error" ? <CircleAlert size={14} /> : <TriangleAlert size={14} />}
                </span>
                <span>
                  <span className="text-mute">第 {i.pageIndex + 1} 页 · </span>
                  {i.message}
                </span>
                <span className="ml-auto shrink-0 text-accent">定位</span>
              </button>
            ))}
          </div>
          {progress && (
            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-[12px] text-ink-2">
                <span>{progress.stage}…</span>
                <span className="tabular-nums">
                  {Math.round((progress.done / Math.max(1, progress.total)) * 100)}%
                </span>
              </div>
              <ProgressBar value={progress.done / Math.max(1, progress.total)} />
            </div>
          )}
          {result && (
            <div
              className={cx(
                "mt-4 rounded-lg px-3 py-2.5 text-[12.5px] leading-relaxed",
                result.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger",
              )}
            >
              {result.text}
              {result.warnings?.map((w) => (
                <div key={w} className="mt-1 flex items-start gap-1.5 text-warn">
                  <Info size={13} className="mt-0.5 shrink-0" /> {w}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
