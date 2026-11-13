import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AssetMeta, Doc, Page } from "../model/types";

export interface ProjectRecord extends Omit<Doc, "pages"> {
  pageIds: string[];
  pageCount: number;
  rev: number;
  writer: string;
  thumbnail?: string;
}

export interface PageRecord {
  projectId: string;
  id: string;
  page: Page;
}

export interface AssetRecord extends AssetMeta {
  blob: Blob;
  preview: Blob | null;
  createdAt: number;
}

export type VersionKind = "auto" | "manual" | "restore-backup" | "conflict-backup";

export interface VersionRecord {
  id: string;
  projectId: string;
  createdAt: number;
  kind: VersionKind;
  label: string;
  pageCount: number;
  doc: Doc;
}

interface BXSchema extends DBSchema {
  projects: { key: string; value: ProjectRecord };
  pages: { key: [string, string]; value: PageRecord; indexes: { projectId: string } };
  assets: { key: string; value: AssetRecord };
  versions: { key: string; value: VersionRecord; indexes: { projectId: string } };
  meta: { key: string; value: { key: string; value: unknown } };
}

let dbp: Promise<IDBPDatabase<BXSchema>> | null = null;

export function db() {
  if (!dbp)
    dbp = openDB<BXSchema>("banxin-local", 1, {
      upgrade(d) {
        d.createObjectStore("projects", { keyPath: "id" });
        const pages = d.createObjectStore("pages", { keyPath: ["projectId", "id"] });
        pages.createIndex("projectId", "projectId");
        d.createObjectStore("assets", { keyPath: "id" });
        const v = d.createObjectStore("versions", { keyPath: "id" });
        v.createIndex("projectId", "projectId");
        d.createObjectStore("meta", { keyPath: "key" });
      },
      blocking() {
        // another tab wants to upgrade; let it
        dbp?.then((x) => x.close());
        dbp = null;
      },
    });
  return dbp;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get("meta", key))?.value as T | undefined;
}
export async function setMeta(key: string, value: unknown) {
  await (await db()).put("meta", { key, value });
}

export function isQuotaError(e: unknown) {
  const err = e as { name?: string; message?: string };
  return err?.name === "QuotaExceededError" || /quota/i.test(err?.message ?? "");
}

export function describeStorageError(e: unknown) {
  if (isQuotaError(e)) return "浏览器为本网站分配的存储空间不足";
  const err = e as { name?: string; message?: string };
  if (err?.name === "InvalidStateError") return "浏览器存储不可用（可能处于隐私模式或已被清除）";
  return err?.message || "未知存储错误";
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e) return null;
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}
