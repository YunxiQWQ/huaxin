import { useEffect, useState, type ReactNode } from "react";
import {
  Circle,
  Eye,
  EyeOff,
  FileText,
  Frame,
  ImagePlus,
  Images,
  Layers,
  LayoutTemplate,
  Lock,
  Minus,
  ShieldAlert,
  Shapes,
  Square,
  Type,
  Unlock,
  Image as ImageIcon,
  CircleAlert,
  TriangleAlert,
  Info,
  RefreshCw,
} from "lucide-react";
import { currentPage, getState, setUI, useEditor, type EditorUI } from "../store";
import {
  gotoPage,
  insertPages,
  select,
  toggleHidden,
  toggleLock,
  moveElementToIndex,
  applyPreset,
} from "../commands";
import { PagesPanel } from "./PagesPanel";
import {
  addEmptyImageFrame,
  addImagesFromFiles,
  addShape,
  addTextBox,
  IMAGE_ACCEPT,
  pickFiles,
  placeAsset,
  SAMPLE_TEXT,
} from "../create";
import { useAssetUrl, useFontEpoch } from "../../render/PageView";
import { cssFamily, getFamily } from "../../fonts/registry";
import { ptToMm } from "../../model/units";
import { Button, cx } from "../../ui/kit";
import { CATEGORY_NAMES, TEMPLATES, type TemplateDef } from "../../templates";
import { TemplatePreview, applyTemplate, useTemplateFonts } from "../../views/TemplateCenter";
import { ScaledPage } from "../../render/PageView";
import { templateDoc } from "../../templates";
import { templatePagesForInsert } from "../../templates/instantiate";
import { checkDoc, type Issue } from "../../io/preflight";
import { canvasApi } from "../canvas/Canvas";
import { elementTypeName, shapeName } from "../../model/defaults";
import { toast } from "../../ui/toast";
import type { PageElement } from "../../model/types";

const TABS: { id: EditorUI["leftTab"]; label: string; icon: ReactNode }[] = [
  { id: "pages", label: "页面", icon: <FileText size={18} /> },
  { id: "templates", label: "模板", icon: <LayoutTemplate size={18} /> },
  { id: "assets", label: "素材", icon: <Images size={18} /> },
  { id: "text", label: "文字", icon: <Type size={18} /> },
  { id: "shapes", label: "形状", icon: <Shapes size={18} /> },
  { id: "layers", label: "图层", icon: <Layers size={18} /> },
  { id: "issues", label: "检查", icon: <ShieldAlert size={18} /> },
];

export function LeftSide() {
  const tab = useEditor((s) => s.leftTab);
  return (
    <div className="flex shrink-0">
      <nav className="flex w-[60px] flex-col items-center gap-0.5 border-r border-line bg-white py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setUI({ leftTab: t.id })}
            className={cx(
              "flex h-[52px] w-[52px] flex-col items-center justify-center gap-1 rounded-lg text-[11px] transition-colors",
              tab === t.id
                ? "bg-accent-soft text-accent"
                : "text-ink-2 hover:bg-shell hover:text-ink",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </nav>
      <div className="flex w-[232px] flex-col border-r border-line bg-white">
        {tab === "pages" && <PagesPanel />}
        {tab === "templates" && <TemplatesPanel />}
        {tab === "assets" && <AssetsPanel />}
        {tab === "text" && <TextPanel />}
        {tab === "shapes" && <ShapesPanel />}
        {tab === "layers" && <LayersPanel />}
        {tab === "issues" && <IssuesPanel />}
      </div>
    </div>
  );
}

function PanelHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="shrink-0 border-b border-line px-3 py-2.5">
      <div className="text-[12.5px] font-semibold">{title}</div>
      {children && <div className="mt-1 text-[11px] leading-relaxed text-mute">{children}</div>}
    </div>
  );
}

function TemplatesPanel() {
  const [preview, setPreview] = useState<TemplateDef | null>(null);
  const [busy, setBusy] = useState(false);
  useTemplateFonts(TEMPLATES.map((t) => t.id));
  return (
    <>
      <PanelHead title="模板">使用模板会新建独立作品；也可以把模板页面插入当前作品。</PanelHead>
      <div className="bx-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {TEMPLATES.map((t) => {
          const d = templateDoc(t.id);
          const sc = Math.min(96 / t.width, 120 / t.height);
          return (
            <button
              key={t.id}
              onClick={() => setPreview(t)}
              className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-shell"
            >
              <div className="flex h-[124px] w-[100px] shrink-0 items-center justify-center rounded bg-desk/70">
                <ScaledPage page={d.pages[0]} width={t.width} height={t.height} scale={sc} />
              </div>
              <div className="min-w-0">
                <div className="text-[12.5px] leading-snug font-medium">{t.name}</div>
                <div className="mt-1 text-[11px] text-mute">
                  {CATEGORY_NAMES[t.category]} · {d.pages.length} 页
                </div>
                <div className="text-[11px] text-mute tabular-nums">
                  {t.width} × {t.height} mm
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <TemplatePreview
        t={preview}
        onClose={() => setPreview(null)}
        actions={(t, close) => (
          <>
            <div className="mr-auto text-[12px] text-mute">当前作品已自动保存在本机。</div>
            <Button
              disabled={busy}
              onClick={async () => {
                const s = getState();
                const td = templateDoc(t.id);
                const sameSize =
                  Math.abs(td.pageSize.width - s.doc.pageSize.width) < 0.5 &&
                  Math.abs(td.pageSize.height - s.doc.pageSize.height) < 0.5;
                if (
                  !sameSize &&
                  !window.confirm(
                    `模板尺寸（${td.pageSize.width} × ${td.pageSize.height} mm）与当前作品（${s.doc.pageSize.width} × ${s.doc.pageSize.height} mm）不同，插入后版面可能超出页面。仍要插入吗？`,
                  )
                )
                  return;
                setBusy(true);
                try {
                  const { pages, assets } = await templatePagesForInsert(
                    t.id,
                    td.pages.map((_, i) => i),
                  );
                  insertPages(
                    pages,
                    assets,
                    s.doc.pages.findIndex((p) => p.id === s.pageId),
                  );
                  toast("ok", `已插入 ${pages.length} 个模板页面`);
                  close();
                } catch (e: any) {
                  toast("error", e?.message ?? "插入失败");
                }
                setBusy(false);
              }}
            >
              插入全部页面到当前作品
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await applyTemplate(t);
                setBusy(false);
                if (ok) close();
              }}
            >
              以此模板新建作品
            </Button>
          </>
        )}
      />
    </>
  );
}

function AssetsPanel() {
  const assets = useEditor((s) => s.doc.assets);
  const list = Object.values(assets);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PanelHead title="素材">
        图片只保存在本机浏览器，不会上传。可拖入画布，或拖到图框上替换。
      </PanelHead>
      <div className="shrink-0 space-y-1.5 border-b border-line p-3">
        <Button
          className="w-full"
          variant="primary"
          disabled={busy}
          onClick={async () => {
            const files = await pickFiles(IMAGE_ACCEPT, true);
            if (!files.length) return;
            setBusy(true);
            await addImagesFromFiles(files);
            setBusy(false);
          }}
        >
          <ImagePlus size={15} /> {busy ? "正在导入…" : "从本机选择图片"}
        </Button>
        <Button className="w-full" onClick={addEmptyImageFrame}>
          <Frame size={14} /> 添加空图框
        </Button>
      </div>
      <div className="bx-scroll grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-3">
        {list.map((a) => (
          <AssetTile key={a.id} id={a.id} name={a.name} onClick={() => placeAsset(a)} />
        ))}
        {!list.length && (
          <div className="col-span-2 py-8 text-center text-[11.5px] leading-relaxed text-mute">
            本作品还没有图片。也可以直接把图片文件拖到画布上。
          </div>
        )}
      </div>
    </>
  );
}

function AssetTile({ id, name, onClick }: { id: string; name: string; onClick: () => void }) {
  const url = useAssetUrl(id);
  return (
    <button
      title={`${name}\n点击放入页面，或拖到画布`}
      onClick={onClick}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("application/x-banxin-asset", id)}
      className="group relative aspect-square overflow-hidden rounded-md bg-shell ring-1 ring-line hover:ring-accent"
    >
      {url ? (
        <img src={url} alt={name} className="h-full w-full object-cover" draggable={false} />
      ) : (
        <ImageIcon className="m-auto text-mute" size={20} />
      )}
    </button>
  );
}

function TextPanel() {
  const presets = useEditor((s) => s.doc.textStyles);
  const sel = useEditor((s) => s.selection);
  const hasTextSel = currentPage().elements.some((e) => sel.includes(e.id) && e.type === "text");
  useFontEpoch();
  return (
    <>
      <PanelHead title="文字与样式">点击样式添加文本框。选中文本框时可将样式应用到所选。</PanelHead>
      <div className="bx-scroll min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {presets.map((p) => (
          <div key={p.id} className="group flex items-center gap-1 rounded-md hover:bg-shell">
            <button
              className="min-w-0 flex-1 px-2 py-1.5 text-left"
              onClick={() => addTextBox(p.id)}
              title="添加此样式的文本框"
            >
              <div
                className="truncate"
                style={{
                  fontFamily: cssFamily(p.style.fontFamily),
                  fontWeight: p.style.fontWeight,
                  fontSize: Math.min(22, Math.max(12, ptToMm(p.style.fontSize) * 2.2)),
                  color: p.style.color === "#ffffff" ? "#1d1e22" : p.style.color,
                  lineHeight: 1.3,
                }}
              >
                {p.name}
              </div>
              <div className="text-[10.5px] text-mute">
                {getFamily(p.style.fontFamily)?.name ?? p.style.fontFamily} · {p.style.fontSize}pt
              </div>
            </button>
            {hasTextSel && (
              <button
                className="mr-1 hidden rounded px-1.5 py-0.5 text-[11px] text-accent group-hover:block hover:bg-accent-soft"
                onClick={() => applyPreset(sel, p.id)}
              >
                应用
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="shrink-0 border-t border-line p-3">
        <Button
          className="w-full"
          onClick={async () => {
            let text = "";
            try {
              text = await navigator.clipboard.readText();
            } catch {
              /* permission denied */
            }
            if (!text.trim())
              return toast(
                "info",
                "剪贴板中没有文字。也可以先添加“正文”文本框，再在右侧“稿件内容”中粘贴。",
              );
            addTextBox("body", text.replace(/\r\n?/g, "\n"));
          }}
        >
          粘贴稿件为正文框
        </Button>
        <div className="mt-1.5 text-[10.5px] leading-relaxed text-mute">
          示例：{SAMPLE_TEXT.body.slice(0, 18)}…
        </div>
      </div>
    </>
  );
}

function ShapesPanel() {
  const item = (icon: ReactNode, label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg bg-shell text-[12px] text-ink-2 ring-1 ring-line hover:text-accent hover:ring-accent"
    >
      {icon}
      {label}
    </button>
  );
  return (
    <>
      <PanelHead title="形状">基础图形可用作色块、分隔线与边框。</PanelHead>
      <div className="grid grid-cols-2 gap-2 p-3">
        {item(<Square size={26} strokeWidth={1.5} />, "矩形", () => addShape("rect"))}
        {item(<Circle size={26} strokeWidth={1.5} />, "圆形", () => addShape("ellipse"))}
        {item(<Minus size={26} strokeWidth={1.5} />, "直线", () => addShape("line"))}
        {item(<Frame size={26} strokeWidth={1.5} />, "边框", () => addShape("frame"))}
        {item(<ImageIcon size={26} strokeWidth={1.5} />, "图框", addEmptyImageFrame)}
        {item(<Type size={26} strokeWidth={1.5} />, "文本框", () => addTextBox("body"))}
      </div>
    </>
  );
}

function elLabel(e: PageElement) {
  if (e.name) return e.name;
  if (e.type === "text") return e.text.replace(/\s+/g, " ").slice(0, 16) || "空文本框";
  if (e.type === "shape") return shapeName[e.shape];
  return elementTypeName[e.type];
}

function LayersPanel() {
  const s = useEditor((x) => x);
  const page = currentPage(s);
  const els = [...page.elements].reverse();
  const [drag, setDrag] = useState<string | null>(null);
  return (
    <>
      <PanelHead title="图层">
        上方的图层显示在前面。锁定的对象在画布上不可选中，可在此选择或解锁。
      </PanelHead>
      <div className="bx-scroll min-h-0 flex-1 overflow-y-auto p-1.5">
        {els.map((e) => (
          <div
            key={e.id}
            draggable
            onDragStart={() => setDrag(e.id)}
            onDragOver={(ev) => ev.preventDefault()}
            onDrop={() => {
              if (drag && drag !== e.id)
                moveElementToIndex(
                  drag,
                  page.elements.findIndex((x) => x.id === e.id),
                );
              setDrag(null);
            }}
            onClick={(ev) => select([e.id], ev.shiftKey)}
            className={cx(
              "group flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[12px]",
              s.selection.includes(e.id) ? "bg-accent-soft text-accent" : "hover:bg-shell",
              e.hidden && "opacity-50",
            )}
          >
            <span className="text-mute">
              {e.type === "text" ? (
                <Type size={13} />
              ) : e.type === "image" ? (
                <ImageIcon size={13} />
              ) : (
                <Square size={13} />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {elLabel(e)}
              {e.groupId && <span className="ml-1 text-[10px] text-mute">组</span>}
            </span>
            <button
              className={cx(
                "text-mute hover:text-ink",
                !e.locked && "opacity-0 group-hover:opacity-100",
              )}
              onClick={(ev) => (ev.stopPropagation(), toggleLock([e.id]))}
              title={e.locked ? "解锁" : "锁定"}
            >
              {e.locked ? <Lock size={13} /> : <Unlock size={13} />}
            </button>
            <button
              className={cx(
                "text-mute hover:text-ink",
                !e.hidden && "opacity-0 group-hover:opacity-100",
              )}
              onClick={(ev) => (ev.stopPropagation(), toggleHidden([e.id]))}
              title={e.hidden ? "显示" : "隐藏"}
            >
              {e.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        ))}
        {!els.length && (
          <div className="py-8 text-center text-[11.5px] text-mute">本页还没有对象</div>
        )}
      </div>
    </>
  );
}

export function locateIssue(i: Issue) {
  const s = getState();
  const page = s.doc.pages[i.pageIndex];
  if (!page) return;
  gotoPage(page.id);
  if (i.elementId) {
    setUI({ selection: [i.elementId] });
    setTimeout(() => canvasApi.reveal?.(i.elementId!), 60);
  }
}

function IssuesPanel() {
  const doc = useEditor((s) => s.doc);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const epoch = useFontEpoch();
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => checkDoc(doc).then((r) => alive && setIssues(r)), 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [doc, epoch]);
  const shown = issues?.filter((i) => i.level !== "info") ?? [];
  const infos = issues?.filter((i) => i.level === "info") ?? [];
  return (
    <>
      <PanelHead title="排版检查">
        检查文字溢出、图片缺失、字体缺失与缺字。点击条目定位到对应对象。
      </PanelHead>
      <div className="bx-scroll min-h-0 flex-1 overflow-y-auto p-2">
        {issues === null && (
          <div className="flex items-center gap-2 p-3 text-[12px] text-mute">
            <RefreshCw size={13} className="animate-spin" /> 正在检查…
          </div>
        )}
        {issues && !shown.length && (
          <div className="p-3 text-[12px] text-ok">未发现问题，可以导出。</div>
        )}
        {[...shown, ...infos].map((i, k) => (
          <button
            key={k}
            onClick={() => locateIssue(i)}
            className="flex w-full items-start gap-2 rounded-md p-2 text-left text-[12px] hover:bg-shell"
          >
            <span
              className={cx(
                "mt-0.5",
                i.level === "error"
                  ? "text-danger"
                  : i.level === "warning"
                    ? "text-warn"
                    : "text-mute",
              )}
            >
              {i.level === "error" ? (
                <CircleAlert size={14} />
              ) : i.level === "warning" ? (
                <TriangleAlert size={14} />
              ) : (
                <Info size={14} />
              )}
            </span>
            <span>
              <span className="text-mute">第 {i.pageIndex + 1} 页 · </span>
              {i.message}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
