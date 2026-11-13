import { useSyncExternalStore } from "react";
import type { Doc } from "../model/types";
import { getState, hasState, loadEditor, markFileSaved, unloadEditor } from "../editor/store";
import { session } from "../storage/session";
import { createProject, loadProject } from "../storage/projects";
import { ensureFontsForDoc, loadCoverage } from "../fonts/loader";
import { buildProjectPackage, PROJECT_EXT, readProjectPackage } from "../io/projectFile";
import { safeFileName, saveBlob } from "../io/download";
import { toast } from "../ui/toast";
import { describeStorageError } from "../storage/db";

export type Route =
  | { view: "workbench" }
  | { view: "templates" }
  | { view: "editor"; projectId: string }
  | { view: "loading" };

let route: Route = { view: "loading" };
const ls = new Set<() => void>();
export function setRoute(r: Route) {
  route = r;
  const hash =
    r.view === "editor"
      ? `#/edit/${r.projectId}`
      : r.view === "templates"
        ? "#/templates"
        : r.view === "workbench"
          ? "#/"
          : location.hash;
  if (location.hash !== hash) history.replaceState(null, "", hash);
  ls.forEach((l) => l());
}
export function useRoute() {
  return useSyncExternalStore(
    (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    () => route,
  );
}

/** Make sure the open work is safely stored before switching away from it. */
export async function flushCurrent(): Promise<boolean> {
  if (!hasState()) return true;
  const ok = await session.flush();
  if (ok) return true;
  const download = window.confirm(
    "当前作品未能保存到本机（浏览器存储不可用或空间不足）。\n\n建议先下载工程文件以免丢失。点击“确定”立即下载工程文件，点击“取消”留在当前作品。",
  );
  if (download) await downloadProjectFile();
  return false;
}

export async function openProject(id: string): Promise<boolean> {
  if (hasState() && getState().doc.id === id) {
    setRoute({ view: "editor", projectId: id });
    return true;
  }
  if (!(await flushCurrent())) return false;
  const loaded = await loadProject(id).catch((e) => {
    toast("error", `无法读取作品：${describeStorageError(e)}`);
    return null;
  });
  if (!loaded) {
    toast("error", "找不到该作品，可能已被删除");
    return false;
  }
  session.stop();
  loadEditor(loaded.doc);
  session.start(loaded.doc, loaded.rev);
  void ensureFontsForDoc(loaded.doc);
  void loadCoverage();
  setRoute({ view: "editor", projectId: id });
  return true;
}

export async function createAndOpen(doc: Doc): Promise<boolean> {
  if (!(await flushCurrent())) return false;
  try {
    await createProject(doc);
    navigator.storage?.persist?.().catch(() => undefined);
  } catch (e) {
    toast("error", `新建作品失败：${describeStorageError(e)}`);
    return false;
  }
  return openProject(doc.id);
}

export async function leaveEditor(to: Route = { view: "workbench" }) {
  if (!(await flushCurrent())) return;
  session.stop();
  unloadEditor();
  setRoute(to);
}

export async function importProjectFile(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<string | null> {
  try {
    const { doc, warnings } = await readProjectPackage(file, onProgress);
    if (!(await flushCurrent())) return null;
    await createProject(doc);
    await openProject(doc.id);
    toast(
      warnings.length ? "warn" : "ok",
      warnings.length
        ? `已导入为新作品“${doc.name}”。${warnings.join("；")}`
        : `已导入为新作品“${doc.name}”`,
      { ms: warnings.length ? 12000 : 4000 },
    );
    return doc.id;
  } catch (e: any) {
    toast("error", `导入失败：${e?.message || e}。当前作品未受影响。`);
    return null;
  }
}

export async function downloadProjectFile(): Promise<boolean> {
  if (!hasState()) return false;
  const doc = getState().doc;
  try {
    const { blob, missing } = await buildProjectPackage(doc);
    const ok = await saveBlob(blob, `${safeFileName(doc.name)}${PROJECT_EXT}`, {
      description: "画芯工程文件",
      accept: { "application/zip": [PROJECT_EXT] },
    });
    if (!ok) return false;
    // only mark as saved if the document did not change meanwhile
    if (getState().doc === doc) markFileSaved();
    toast(
      missing ? "warn" : "ok",
      missing
        ? `工程文件已保存，但有 ${missing} 张图片在本机缺失，未能打包`
        : "工程文件已保存到本机",
    );
    return true;
  } catch (e: any) {
    toast("error", `工程文件生成失败：${e?.message || e}`);
    return false;
  }
}
