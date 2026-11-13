import { useCallback, useEffect, useRef, useState } from "react";
import {
  Copy,
  Download,
  FileUp,
  FolderOpen,
  HardDrive,
  LayoutTemplate,
  MoreHorizontal,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  WifiOff,
} from "lucide-react";
import { AppHeader } from "./Shell";
import { Button, Menu, MenuItem, Modal, ProgressBar, formatBytes, formatTime } from "../ui/kit";
import { NewDocDialog } from "./NewDocDialog";
import {
  collectGarbage,
  deleteProject,
  duplicateProject,
  listProjects,
  loadProject,
  renameProject,
} from "../storage/projects";
import { storageEstimate, type ProjectRecord } from "../storage/db";
import { importProjectFile, openProject, setRoute } from "../app/actions";
import { toast } from "../ui/toast";
import { sizeLabel } from "../model/sizes";
import { buildProjectPackage, PROJECT_EXT } from "../io/projectFile";
import { safeFileName, saveBlob } from "../io/download";
import { cacheAllFonts, offlineStatus } from "./offline";
import { CATEGORY_NAMES } from "../templates";

export function Workbench() {
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [renaming, setRenaming] = useState<ProjectRecord | null>(null);
  const [deleting, setDeleting] = useState<ProjectRecord | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  const [off, setOff] = useState<{ sw: boolean; fontsCached: number; fontsTotal: number } | null>(
    null,
  );
  const [fontProgress, setFontProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setProjects(await listProjects());
    } catch (e: any) {
      toast("error", `无法读取本机作品库：${e?.message ?? e}`);
      setProjects([]);
    }
    setEst(await storageEstimate());
    setOff(await offlineStatus());
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const doImport = async (f: File) => {
    setImportMsg("正在读取工程文件…");
    await importProjectFile(f, setImportMsg);
    setImportMsg(null);
    void refresh();
  };

  const download = async (p: ProjectRecord) => {
    const loaded = await loadProject(p.id);
    if (!loaded) return;
    const { blob } = await buildProjectPackage(loaded.doc);
    await saveBlob(blob, `${safeFileName(p.name)}${PROJECT_EXT}`, {
      description: "版心工程文件",
      accept: { "application/zip": [PROJECT_EXT] },
    });
  };

  return (
    <div className="flex h-full flex-col">
      <AppHeader
        right={
          <>
            <Button onClick={() => fileRef.current?.click()}>
              <FileUp size={15} /> 导入工程
            </Button>
            <Button variant="primary" onClick={() => setNewOpen(true)}>
              <Plus size={15} /> 新建作品
            </Button>
          </>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept={`${PROJECT_EXT},.zip`}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void doImport(f);
        }}
      />
      <main
        className="bx-scroll min-h-0 flex-1 overflow-auto"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f && /\.(bxproj|zip)$/i.test(f.name)) void doImport(f);
        }}
      >
        <div className="mx-auto max-w-[1240px] px-8 py-8">
          <div className="mb-7 grid grid-cols-[1fr_auto] items-end gap-6">
            <div>
              <h1 className="text-[26px] font-semibold tracking-tight">本机作品</h1>
              <p className="mt-1.5 max-w-[620px] text-[13px] leading-relaxed text-ink-2">
                作品、图片和历史版本只保存在当前浏览器的本网站存储中，不会上传到服务器。换电脑或换浏览器时，请在编辑器中“下载工程文件”，再到新环境中导入。
              </p>
            </div>
            <div className="flex gap-2.5">
              <div className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-[12px] text-ink-2">
                <HardDrive size={15} className="text-mute" />
                {est ? (
                  <span>
                    已用 <b className="font-medium text-ink">{formatBytes(est.usage)}</b> / 可用约{" "}
                    {formatBytes(est.quota)}
                  </span>
                ) : (
                  "存储信息不可用"
                )}
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-[12px] text-ink-2">
                {off?.sw ? (
                  <ShieldCheck size={15} className="text-ok" />
                ) : (
                  <WifiOff size={15} className="text-mute" />
                )}
                {off ? (
                  <span>
                    {off.sw ? "程序已离线缓存" : "离线缓存未启用"} · 字体 {off.fontsCached}/
                    {off.fontsTotal}
                  </span>
                ) : (
                  "…"
                )}
                {off && off.fontsCached < off.fontsTotal && (
                  <button
                    className="ml-1 font-medium text-accent hover:underline disabled:opacity-50"
                    disabled={fontProgress !== null}
                    onClick={async () => {
                      try {
                        await cacheAllFonts((d, t) => setFontProgress(d / t));
                        toast("ok", "全部字体已缓存，可离线使用");
                      } catch {
                        toast("error", "字体下载失败，请检查网络");
                      }
                      setFontProgress(null);
                      setOff(await offlineStatus());
                    }}
                  >
                    {fontProgress !== null
                      ? `缓存中 ${Math.round(fontProgress * 100)}%`
                      : "缓存全部字体"}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-5">
            <button
              onClick={() => setNewOpen(true)}
              className="group flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-line-2 bg-white/60 text-ink-2 transition-colors hover:border-accent hover:text-accent"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-shell group-hover:bg-accent-soft">
                <Plus size={22} />
              </span>
              <span className="text-[14px] font-medium">空白新建</span>
              <span className="text-[11.5px] text-mute">自定义尺寸、页数与页边距</span>
            </button>
            <button
              onClick={() => setRoute({ view: "templates" })}
              className="group flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-xl border border-line bg-white text-ink-2 transition-colors hover:border-accent hover:text-accent"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-shell group-hover:bg-accent-soft">
                <LayoutTemplate size={20} />
              </span>
              <span className="text-[14px] font-medium">从模板新建</span>
              <span className="text-[11.5px] text-mute">报纸 · 校刊 · 画册 · 手册</span>
            </button>
            {projects?.map((p) => (
              <article key={p.id} className="group flex flex-col">
                <button
                  onClick={() => void openProject(p.id)}
                  className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl border border-line bg-desk/60 p-4 transition-shadow hover:shadow-lg"
                  title="打开作品"
                >
                  {p.thumbnail ? (
                    <img src={p.thumbnail} alt="" className="max-h-full max-w-full shadow-md" />
                  ) : (
                    <div
                      className="flex items-center justify-center bg-white text-[12px] text-mute shadow-md"
                      style={{
                        aspectRatio: `${p.pageSize.width}/${p.pageSize.height}`,
                        width: p.pageSize.width >= p.pageSize.height ? "100%" : undefined,
                        height: p.pageSize.width < p.pageSize.height ? "100%" : undefined,
                      }}
                    >
                      生成缩略图中…
                    </div>
                  )}
                  <span className="absolute top-2.5 left-2.5 rounded bg-black/55 px-1.5 py-0.5 text-[10.5px] text-white">
                    {CATEGORY_NAMES[p.kind] ?? "作品"}
                  </span>
                </button>
                <div className="mt-2.5 flex items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium" title={p.name}>
                      {p.name}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-mute">
                      {p.pageCount} 页 · {formatTime(p.updatedAt)}
                    </div>
                    <div className="text-[11px] text-mute/80 tabular-nums">
                      {sizeLabel(p.pageSize.width, p.pageSize.height)}
                    </div>
                  </div>
                  <Menu
                    trigger={(_, toggle) => (
                      <button
                        onClick={toggle}
                        className="rounded p-1 text-mute hover:bg-black/5 hover:text-ink"
                        aria-label="更多操作"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        <MenuItem
                          icon={<FolderOpen size={14} />}
                          onClick={() => (close(), void openProject(p.id))}
                        >
                          打开
                        </MenuItem>
                        <MenuItem
                          icon={<Pencil size={14} />}
                          onClick={() => (close(), setRenaming(p))}
                        >
                          重命名
                        </MenuItem>
                        <MenuItem
                          icon={<Copy size={14} />}
                          onClick={async () => {
                            close();
                            await duplicateProject(p.id);
                            toast("ok", `已复制“${p.name}”`);
                            void refresh();
                          }}
                        >
                          复制
                        </MenuItem>
                        <MenuItem
                          icon={<Download size={14} />}
                          onClick={() => (close(), void download(p))}
                        >
                          下载工程文件
                        </MenuItem>
                        <div className="my-1 h-px bg-line" />
                        <MenuItem
                          icon={<Trash2 size={14} />}
                          danger
                          onClick={() => (close(), setDeleting(p))}
                        >
                          删除
                        </MenuItem>
                      </>
                    )}
                  </Menu>
                </div>
              </article>
            ))}
          </div>
          {projects && projects.length === 0 && (
            <div className="mt-8 rounded-xl border border-line bg-white px-6 py-5 text-[13px] leading-relaxed text-ink-2">
              还没有作品。可以从<b className="text-ink">“青禾校园报 · 四版”</b>或
              <b className="text-ink">“山居茶事 · 电子画册”</b>
              模板开始，替换稿件和图片即可快速成刊；也可以拖入 .bxproj 工程文件继续编辑。
            </div>
          )}
        </div>
      </main>

      <NewDocDialog open={newOpen} onClose={() => setNewOpen(false)} />
      <RenameDialog
        project={renaming}
        onClose={() => setRenaming(null)}
        onDone={async (name) => {
          if (renaming) await renameProject(renaming.id, name);
          setRenaming(null);
          void refresh();
        }}
      />
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="删除作品"
        width={420}
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>取消</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!deleting) return;
                await deleteProject(deleting.id);
                await collectGarbage().catch(() => undefined);
                toast("ok", `已删除“${deleting.name}”`);
                setDeleting(null);
                void refresh();
              }}
            >
              删除
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink-2">
          确定删除“<b className="text-ink">{deleting?.name}</b>
          ”吗？作品及其全部历史版本将从本机移除，且无法恢复。如需保留，请先下载工程文件。
        </p>
      </Modal>
      <Modal
        open={importMsg !== null}
        onClose={() => undefined}
        closable={false}
        title="导入工程"
        width={380}
      >
        <p className="mb-3 text-[13px] text-ink-2">{importMsg}</p>
        <ProgressBar value={0.6} />
      </Modal>
    </div>
  );
}

function RenameDialog({
  project,
  onClose,
  onDone,
}: {
  project: ProjectRecord | null;
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const [name, setName] = useState("");
  useEffect(() => setName(project?.name ?? ""), [project]);
  return (
    <Modal
      open={!!project}
      onClose={onClose}
      title="重命名"
      width={400}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => onDone(name.trim())}>
            确定
          </Button>
        </>
      }
    >
      <input
        className="h-9 w-full rounded-md border border-line px-3 text-[14px] outline-none focus:border-accent"
        value={name}
        autoFocus
        onFocus={(e) => e.target.select()}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && name.trim() && onDone(name.trim())}
      />
    </Modal>
  );
}
