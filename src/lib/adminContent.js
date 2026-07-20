import { supabase } from "./supabase";
import { requireAdmin, slugify } from "./admin";

export const DEFAULT_COVER = "/src/assets/default-cover.svg";
export const PAGE_SIZE = 12;
export const STATUS_OPTIONS = ["Draft", "Ongoing", "Completed", "Paused"];
export const splitList = (value = "") => String(value ?? "").split(",").map((x) => x.trim()).filter(Boolean);
export const joinList = (items = []) => [...new Set(items.map((x) => String(x).trim()).filter(Boolean))].join(", ");
export const normalize = (value = "") => String(value ?? "").toLowerCase();
export const adminError = (error, fallback = "Action failed") => error?.message || error?.details || error?.hint || fallback;

export async function assertAdmin() {
  const access = await requireAdmin(supabase);
  if (!access.allowed) throw new Error(access.error?.message || "Your admin session expired. Please sign in again.");
  return access.user;
}

export async function adminWrite(action) {
  await assertAdmin();
  const result = await action();
  if (result?.error) throw new Error(adminError(result.error));
  return result;
}

export function makeSlug(title, current = "") {
  return current || slugify(title || "untitled-novel");
}

function missingColumnName(error) {
  const message = adminError(error, "");
  return message.match(/'([^']+)' column/)?.[1] || message.match(/column "([^"]+)"/)?.[1] || null;
}

export async function safeWrite(table, payload, applyQuery, required = []) {
  await assertAdmin();
  let next = Array.isArray(payload) ? payload.map((row) => ({ ...row })) : { ...payload };
  for (let attempts = 0; attempts < 8; attempts += 1) {
    if ((Array.isArray(next) && next.every((row) => Object.keys(row).length === 0)) || (!Array.isArray(next) && Object.keys(next).length === 0)) return { data: null, error: null, skipped: true };
    const result = await applyQuery(supabase.from(table), next);
    if (!result.error) return result;
    const column = missingColumnName(result.error);
    const hasColumn = Array.isArray(next) ? next.some((row) => column in row) : column in next;
    if (!column || required.includes(column) || !hasColumn) throw new Error(adminError(result.error));
    if (Array.isArray(next)) next = next.map((row) => { const copy = { ...row }; delete copy[column]; return copy; });
    else delete next[column];
  }
  throw new Error("Could not save because the database schema rejected optional fields.");
}

export async function optionalCount(table, configure = (q) => q) {
  const { count, error } = await configure(supabase.from(table).select("id", { count: "exact", head: true }));
  if (error) return { count: 0, available: false, error };
  return { count: count || 0, available: true, error: null };
}

export async function duplicateSlugExists(slug, novelId) {
  if (!slug) return false;
  let query = supabase.from("novels").select("id").eq("slug", slug).limit(1);
  if (novelId) query = query.neq("id", novelId);
  const { data, error } = await query;
  if (error) return false;
  return Boolean(data?.length);
}

export async function duplicateChapterNumberExists(novelId, number, chapterId) {
  let query = supabase.from("chapters").select("id").eq("novel_id", Number(novelId)).eq("number", Number(number)).limit(1);
  if (chapterId) query = query.neq("id", chapterId);
  const { data, error } = await query;
  if (error) throw new Error(adminError(error, "Could not check duplicate chapter numbers."));
  return Boolean(data?.length);
}

export function parseCsv(text = "") {
  const rows = [];
  let cell = ""; let row = []; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]; const next = text[i + 1];
    if (ch === '"' && quoted && next === '"') { cell += '"'; i += 1; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) { if (cell || row.length) rows.push([...row, cell]); row = []; cell = ""; if (ch === "\r" && next === "\n") i += 1; }
    else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

export function parseChapterImport(name, raw, splitIntoChapters) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".json")) {
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : parsed.chapters || [];
    return rows.map((r, i) => ({ number: Number(r.number || i + 1), title: r.title || `Chapter ${i + 1}`, content: r.content || r.text || "" }));
  }
  if (lower.endsWith(".csv")) {
    const rows = parseCsv(raw); const [header, ...body] = rows;
    const keys = header.map((h) => h.trim().toLowerCase());
    return body.map((r, i) => ({ number: Number(r[keys.indexOf("number")] || i + 1), title: r[keys.indexOf("title")] || `Chapter ${i + 1}`, content: r[keys.indexOf("content")] || r[keys.indexOf("text")] || "" }));
  }
  return splitIntoChapters(raw, name.replace(/\.[^.]+$/, "")).map((c, i) => ({ number: Number(c.number || i + 1), title: c.title, content: c.content }));
}

export function toCsv(rows) {
  const cols = ["id", "title", "author", "slug", "status", "genres", "tags", "rating", "views", "chapters"];
  const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  return [cols.join(","), ...rows.map((row) => cols.map((c) => esc(row[c])).join(","))].join("\n");
}

export function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
