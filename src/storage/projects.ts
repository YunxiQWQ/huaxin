import {
  db,
  setMeta,
  type PageRecord,
  type ProjectRecord,
  type VersionKind,
  type VersionRecord,
} from "./db";
import type { Doc, Page } from "../model/types";
import { uid } from "../model/units";

export const TAB_ID = uid("tab");
export const MAX_VERSIONS = 12;

export class ConflictError extends Error {
  constructor(public storedRev: number) {
    super("此作品已在其他标签页中被修改");
    this.name = "ConflictError";
  }
}

function recordFromDoc(doc: Doc, rev: number, thumbnail?: string): ProjectRecord {
  const { pages, ...rest } = doc;
  return {
    ...rest,
    pageIds: pages.map((p) => p.id),
    pageCount: pages.length,
    rev,
    writer: TAB_ID,
    thumbnail,
  };
}

export async function listProjects(): Promise<ProjectRecord[]> {
  const all = await (await db()).getAll("projects");
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadProject(id: string): Promise<{ doc: Doc; rev: number } | null> {
  const d = await db();
  const tx = d.transaction(["projects", "pages"]);
  const rec = await tx.objectStore("projects").get(id);
  if (!rec) return null;
  const pageRecs = await tx.objectStore("pages").index("projectId").getAll(id);
  const byId = new Map(pageRecs.map((p) => [p.id, p.page]));
  const pages = rec.pageIds.map((pid) => byId.get(pid)).filter(Boolean) as Page[];
  const { pageIds: _a, pageCount: _b, rev, writer: _w, thumbnail: _t, ...rest } = rec;
  return { doc: { ...rest, pages }, rev };
}

export async function getProjectRev(id: string): Promise<number | null> {
  const rec = await (await db()).get("projects", id);
  return rec ? rec.rev : null;
}

/** Create a brand-new project record (fails if the id exists). */
export async function createProject(doc: Doc, thumbnail?: string): Promise<number> {
  const d = await db();
  const tx = d.transaction(["projects", "pages"], "readwrite");
  await tx.objectStore("projects").add(recordFromDoc(doc, 1, thumbnail));
  for (const p of doc.pages)
    await tx.objectStore("pages").put({ projectId: doc.id, id: p.id, page: p });
  await tx.done;
  return 1;
}

/**
 * Save only what changed since `prev` (pages compared by identity).
 * Throws ConflictError if another tab has written a newer revision.
 */
export async function saveProject(
  doc: Doc,
  prev: Doc | null,
  baseRev: number,
  thumbnail?: string,
): Promise<number> {
  const d = await db();
  const tx = d.transaction(["projects", "pages"], "readwrite");
  const projects = tx.objectStore("projects");
  const pages = tx.objectStore("pages");
  const stored = await projects.get(doc.id);
  if (stored && stored.rev !== baseRev) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new ConflictError(stored.rev);
  }
  const rev = (stored?.rev ?? 0) + 1;
  await projects.put(recordFromDoc(doc, rev, thumbnail ?? stored?.thumbnail));
  const prevPages = new Map((prev?.pages ?? []).map((p) => [p.id, p]));
  const full = !prev || !stored;
  for (const p of doc.pages)
    if (full || prevPages.get(p.id) !== p)
      await pages.put({ projectId: doc.id, id: p.id, page: p } satisfies PageRecord);
  const keep = new Set(doc.pages.map((p) => p.id));
  const oldIds = full ? (stored?.pageIds ?? []) : [...prevPages.keys()];
  for (const id of oldIds) if (!keep.has(id)) await pages.delete([doc.id, id]);
  await tx.done;
  return rev;
}

export async function renameProject(id: string, name: string) {
  const d = await db();
  const tx = d.transaction("projects", "readwrite");
  const rec = await tx.store.get(id);
  if (!rec) return;
  rec.name = name;
  rec.updatedAt = Date.now();
  rec.rev += 1;
  rec.writer = TAB_ID;
  await tx.store.put(rec);
  await tx.done;
}

export async function duplicateProject(id: string): Promise<string | null> {
  const loaded = await loadProject(id);
  if (!loaded) return null;
  const rec = await (await db()).get("projects", id);
  const now = Date.now();
  const doc: Doc = {
    ...loaded.doc,
    id: uid("d"),
    name: `${loaded.doc.name} 副本`,
    createdAt: now,
    updatedAt: now,
  };
  await createProject(doc, rec?.thumbnail);
  return doc.id;
}

export async function deleteProject(id: string) {
  const d = await db();
  const tx = d.transaction(["projects", "pages", "versions"], "readwrite");
  await tx.objectStore("projects").delete(id);
  for (const k of await tx.objectStore("pages").index("projectId").getAllKeys(id))
    await tx.objectStore("pages").delete(k);
  for (const k of await tx.objectStore("versions").index("projectId").getAllKeys(id))
    await tx.objectStore("versions").delete(k);
  await tx.done;
}

export async function setLastProject(id: string | null) {
  await setMeta("lastProjectId", id);
}

// ---- versions ----
export async function listVersions(projectId: string): Promise<Omit<VersionRecord, "doc">[]> {
  const all = await (await db()).getAllFromIndex("versions", "projectId", projectId);
  return all.map(({ doc: _d, ...v }) => v).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getVersion(id: string) {
  return (await db()).get("versions", id);
}

export async function addVersion(
  doc: Doc,
  kind: VersionKind,
  label: string,
): Promise<VersionRecord> {
  const d = await db();
  const v: VersionRecord = {
    id: uid("v"),
    projectId: doc.id,
    createdAt: Date.now(),
    kind,
    label,
    pageCount: doc.pages.length,
    doc,
  };
  const tx = d.transaction("versions", "readwrite");
  await tx.store.put(v);
  const all = await tx.store.index("projectId").getAll(doc.id);
  all.sort((a, b) => b.createdAt - a.createdAt);
  for (const old of all.slice(MAX_VERSIONS)) await tx.store.delete(old.id);
  await tx.done;
  return v;
}

/** Delete assets no longer referenced by any project, page, version, or the given live ids. */
export async function collectGarbage(liveIds: Iterable<string> = []) {
  const d = await db();
  const used = new Set<string>(liveIds);
  const addDoc = (pages: Page[]) => {
    for (const p of pages)
      for (const el of p.elements) if (el.type === "image" && el.assetId) used.add(el.assetId);
  };
  const tx = d.transaction(["pages", "versions", "assets"], "readwrite");
  for (const pr of await tx.objectStore("pages").getAll()) addDoc([pr.page]);
  for (const v of await tx.objectStore("versions").getAll()) addDoc(v.doc.pages);
  let removed = 0;
  // assets imported recently may belong to unsaved work in another tab; keep them for a while
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  let cursor = await tx.objectStore("assets").openCursor();
  while (cursor) {
    if (!used.has(cursor.key) && cursor.value.createdAt < cutoff) {
      await cursor.delete();
      removed++;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return removed;
}
