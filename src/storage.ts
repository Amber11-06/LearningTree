import { blankData, parseData, type Data } from "./domain";
import { parseCoursePackage, type CoursePackage } from "./course-package";

export const STORAGE_KEY = "learning-tree:v1";
const MIGRATED_KEY = "learning-tree:sqlite-migrated";
export const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
export interface Workspace {
  data: Data | null;
  revision: number;
  updatedAt: string | null;
}
export class BackendError extends Error {
  code: string;
  constructor(message: string, code = "backend_error") {
    super(message);
    this.code = code;
  }
}
export class LegacyDataError extends Error {}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new BackendError(
      "无法连接后端，修改尚未确认保存。请启动完整应用（npm run dev）后重试。",
      "connection_error",
    );
  }
  if (response.status === 401) {
    throw new BackendError("登录已过期，请重新登录。", "unauthorized");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new BackendError(
      "后端未返回有效数据，请确认 FastAPI 与 PostgreSQL 已启动。",
      "connection_error",
    );
  }
  if (!response.ok) {
    const error = payload as { error?: string; code?: string };
    throw new BackendError(
      error.error ?? `请求失败（${response.status}）`,
      error.code,
    );
  }
  return payload;
}
function workspace(payload: unknown): Workspace {
  if (!payload || typeof payload !== "object")
    throw new BackendError("工作区响应格式错误。");
  const value = payload as Workspace;
  if (
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !(value.updatedAt === null || typeof value.updatedAt === "string")
  )
    throw new BackendError("工作区版本信息不正确。");
  return { ...value, data: value.data === null ? null : parseData(value.data) };
}
export async function fetchWorkspace(): Promise<Workspace> {
  return workspace(await request("/api/workspace"));
}
export function readLegacyData(): Data | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    return parseData(JSON.parse(raw));
  } catch {
    throw new LegacyDataError(
      "发现旧浏览器数据，但格式无法读取。原文已保留，请先下载原始数据，或跳过迁移使用数据库。",
    );
  }
}
export function markLegacyMigrated() {
  try {
    localStorage.setItem(MIGRATED_KEY, "true");
  } catch {
    /* The PostgreSQL workspace remains authoritative. */
  }
}
export async function loadData(skipLegacy = false): Promise<Workspace> {
  const current = await fetchWorkspace();
  if (current.data !== null) return current;
  let migrated = false;
  try {
    migrated = localStorage.getItem(MIGRATED_KEY) === "true";
  } catch {
    /* Browser storage is optional. */
  }
  const legacy = skipLegacy || migrated ? null : readLegacyData();
  try {
    const saved = await saveData(legacy ?? blankData(), current.revision);
    if (legacy) markLegacyMigrated();
    return saved;
  } catch (error) {
    if (error instanceof BackendError && error.code === "revision_conflict")
      return fetchWorkspace();
    throw error;
  }
}
export async function saveData(
  data: Data,
  expectedRevision: number,
): Promise<Workspace> {
  const valid = parseData(data);
  const serialized = JSON.stringify(valid);
  if (new Blob([serialized]).size > MAX_BACKUP_BYTES)
    throw new Error("内容超过 32 MB，请先导出备份并拆分内容。");
  return workspace(
    await request("/api/workspace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision, data: valid }),
    }),
  );
}
export async function saveCoursePackage(
  pack: CoursePackage,
  expectedRevision: number,
): Promise<Workspace> {
  return workspace(
    await request("/api/course-packages/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision, package: pack }),
    }),
  );
}
export async function readCourseFile(file: File): Promise<CoursePackage> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error("课程包不能超过 32 MB");
  return parseCoursePackage(JSON.parse(await file.text()));
}
export async function exampleCourse(): Promise<CoursePackage> {
  return parseCoursePackage(await request("/api/course-packages/example"));
}
export async function readBackup(file: File): Promise<Data> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error("备份文件不能超过 32 MB");
  return parseData(JSON.parse(await file.text()));
}
export function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
