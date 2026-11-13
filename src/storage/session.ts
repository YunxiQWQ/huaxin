import { useSyncExternalStore } from "react";
import type { Doc } from "../model/types";
import {
  commit,
  getState,
  hasState,
  loadEditor,
  subscribe as subscribeEditor,
} from "../editor/store";
import {
  ConflictError,
  TAB_ID,
  addVersion,
  createProject,
  getVersion,
  loadProject,
  saveProject,
  setLastProject,
} from "./projects";
import { db, describeStorageError, isQuotaError } from "./db";
import { pageDisplayList } from "../render/displayList";
import { renderPageToCanvas } from "../render/canvasRender";
import { uid } from "../model/units";

export type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";
export interface SaveStatus {
  state: SaveState;
  at?: number;
  error?: string;
  quota?: boolean;
  conflictReason?: string;
  lastVersionAt?: number;
}

const DEBOUNCE = 900;
const MAX_WAIT = 5000;
export const VERSION_INTERVAL = 5 * 60 * 1000;

let status: SaveStatus = { state: "idle" };
const statusListeners = new Set<() => void>();
function setStatus(s: Partial<SaveStatus>) {
  status = { ...status, ...s };
  statusListeners.forEach((l) => l());
}
export function useSaveStatus() {
  return useSyncExternalStore(
    (l) => {
      statusListeners.add(l);
      return () => statusListeners.delete(l);
    },
    () => status,
  );
}
export function getSaveStatus() {
  return status;
}

const channel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("banxin-projects") : null;

class Session {
  projectId = "";
  rev = 0;
  lastSavedDoc: Doc | null = null;
  private timer: number | undefined;
  private firstPendingAt = 0;
  private writing: Promise<void> | null = null;
  private again = false;
  private unsub: (() => void) | null = null;
  private versionTimer: number | undefined;
  lastVersionAt = Date.now();
  lastVersionDoc: Doc | null = null;
  private thumbPage: unknown = null;
  private thumbTimer: number | undefined;

  start(doc: Doc, rev: number) {
    this.stop();
    this.projectId = doc.id;
    this.rev = rev;
    this.lastSavedDoc = doc;
    this.lastVersionDoc = doc;
    this.lastVersionAt = Date.now();
    this.thumbPage = null;
    setStatus({
      state: "saved",
      at: doc.updatedAt,
      error: undefined,
      quota: false,
      conflictReason: undefined,
      lastVersionAt: undefined,
    });
    setLastProject(doc.id);
    let prevDoc = doc;
    this.unsub = subscribeEditor(() => {
      if (!hasState()) return;
      const d = getState().doc;
      if (d !== prevDoc) {
        prevDoc = d;
        this.schedule();
      }
    });
    this.versionTimer = window.setInterval(() => this.maybeAutoVersion(), 30_000);
    this.scheduleThumb();
  }

  stop() {
    this.unsub?.();
    this.unsub = null;
    clearTimeout(this.timer);
    clearInterval(this.versionTimer);
    clearTimeout(this.thumbTimer);
    this.timer = undefined;
  }

  get dirty() {
    return hasState() && getState().doc !== this.lastSavedDoc;
  }

  private schedule() {
    if (status.state === "conflict") return;
    const now = Date.now();
    if (!this.timer) this.firstPendingAt = now;
    clearTimeout(this.timer);
    const wait = Math.max(0, Math.min(DEBOUNCE, MAX_WAIT - (now - this.firstPendingAt)));
    this.timer = window.setTimeout(() => {
      this.timer = undefined;
      void this.save();
    }, wait);
  }

  /** Persist the current document; writes are serialised so an older snapshot never overwrites a newer one. */
  save(): Promise<void> {
    if (this.writing) {
      this.again = true;
      return this.writing;
    }
    if (!hasState() || status.state === "conflict") return Promise.resolve();
    const doc = getState().doc;
    if (doc.id !== this.projectId || doc === this.lastSavedDoc) return Promise.resolve();
    setStatus({ state: "saving" });
    this.writing = (async () => {
      try {
        this.rev = await saveProject(doc, this.lastSavedDoc, this.rev);
        this.lastSavedDoc = doc;
        channel?.postMessage({ type: "saved", id: doc.id, rev: this.rev, tab: TAB_ID });
        setStatus({ state: "saved", at: Date.now(), error: undefined, quota: false });
        this.scheduleThumb();
      } catch (e) {
        if (e instanceof ConflictError) {
          setStatus({
            state: "conflict",
            conflictReason:
              "此作品已在另一个标签页或窗口中被修改。为避免互相覆盖，本页已暂停自动保存。",
          });
        } else {
          console.error(e);
          setStatus({ state: "error", error: describeStorageError(e), quota: isQuotaError(e) });
        }
      }
    })();
    return this.writing.finally(() => {
      this.writing = null;
      if (this.again) {
        this.again = false;
        if (status.state === "saved" && this.dirty) return this.save();
      }
    });
  }

  /** Save immediately; resolves true when everything is on disk. */
  async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.writing) await this.writing;
    if (this.dirty) await this.save();
    return !this.dirty && status.state !== "error";
  }

  private async maybeAutoVersion() {
    if (!hasState()) return;
    const doc = getState().doc;
    if (doc === this.lastVersionDoc || Date.now() - this.lastVersionAt < VERSION_INTERVAL) return;
    await this.createVersion("auto", "自动备份");
  }

  async createVersion(kind: "auto" | "manual", label: string) {
    if (!hasState()) return false;
    const doc = getState().doc;
    try {
      await addVersion(doc, kind, label);
      this.lastVersionAt = Date.now();
      this.lastVersionDoc = doc;
      setStatus({ lastVersionAt: this.lastVersionAt });
      return true;
    } catch (e) {
      setStatus({
        state: "error",
        error: `历史版本保存失败：${describeStorageError(e)}`,
        quota: isQuotaError(e),
      });
      return false;
    }
  }

  /** Restore a version. The current content is first kept as a version, and the restore is undoable. */
  async restoreVersion(versionId: string) {
    const v = await getVersion(versionId);
    if (!v) throw new Error("找不到该历史版本");
    const cur = getState().doc;
    await addVersion(cur, "restore-backup", "恢复前自动保留");
    const restored: Doc = { ...v.doc, id: cur.id, name: cur.name };
    commit(() => restored);
    await this.flush();
  }

  private scheduleThumb() {
    if (!hasState()) return;
    const doc = getState().doc;
    const first = doc.pages[0];
    if (first === this.thumbPage) return;
    clearTimeout(this.thumbTimer);
    this.thumbTimer = window.setTimeout(async () => {
      const d = getState().doc;
      const p = d.pages[0];
      this.thumbPage = p;
      try {
        const url = await thumbnailDataUrl(d, 0, 360);
        const store = (await db()).transaction("projects", "readwrite").store;
        const rec = await store.get(d.id);
        if (rec) {
          rec.thumbnail = url;
          await store.put(rec);
        }
      } catch {
        /* thumbnails are best effort */
      }
    }, 2500);
  }

  // ---- conflicts ----
  async handleExternalSave(rev: number) {
    if (rev <= this.rev) return;
    if (!this.dirty && !this.writing) {
      // nothing local to lose: follow the other tab silently
      const loaded = await loadProject(this.projectId);
      if (loaded && hasState()) {
        const s = getState();
        loadEditor(loaded.doc, {
          pageId: loaded.doc.pages.some((p) => p.id === s.pageId) ? s.pageId : undefined,
          zoom: s.zoom,
        });
        this.start(loaded.doc, loaded.rev);
      }
      return;
    }
    setStatus({
      state: "conflict",
      conflictReason: "此作品已在另一个标签页中保存了更新内容。为避免覆盖，本页已暂停自动保存。",
    });
  }

  async resolveReload() {
    const cur = getState().doc;
    await addVersion(cur, "conflict-backup", "冲突时保留的本页内容").catch(() => undefined);
    const loaded = await loadProject(this.projectId);
    if (!loaded) throw new Error("作品已被删除");
    loadEditor(loaded.doc, { zoom: getState().zoom });
    this.start(loaded.doc, loaded.rev);
  }

  async resolveSaveAsCopy() {
    const cur = getState().doc;
    const now = Date.now();
    const copy: Doc = {
      ...cur,
      id: uid("d"),
      name: `${cur.name}（本页副本）`,
      createdAt: now,
      updatedAt: now,
    };
    const rev = await createProject(copy);
    loadEditor(copy, { pageId: getState().pageId, zoom: getState().zoom });
    this.start(copy, rev);
    return copy.id;
  }
}

export const session = new Session();

channel?.addEventListener("message", (e) => {
  const m = e.data;
  if (m?.type === "saved" && m.tab !== TAB_ID && m.id === session.projectId && hasState())
    void session.handleExternalSave(m.rev);
});

export async function thumbnailDataUrl(
  doc: Doc,
  pageIndex: number,
  widthPx: number,
): Promise<string> {
  const scale = widthPx / doc.pageSize.width;
  const c = await renderPageToCanvas(pageDisplayList(doc, doc.pages[pageIndex]), scale, {
    full: false,
  });
  return (c as HTMLCanvasElement).toDataURL("image/jpeg", 0.82);
}
