import { supabase } from "./supabase";
import { requireAdmin, slugify } from "./admin";

export const DEFAULT_COVER = "/src/assets/default-cover.svg";
export const PAGE_SIZE = 12;
export const STATUS_OPTIONS = ["Draft", "Ongoing", "Completed", "Hiatus"];
export const splitList = (value = "") => String(value).split(",").map((x) => x.trim()).filter(Boolean);
export const joinList = (items = []) => [...new Set(items.map((x) => String(x).trim()).filter(Boolean))].join(", ");
export const normalize = (value = "") => String(value ?? "").toLowerCase();
export const adminError = (error, fallback = "Action failed") => error?.message || error?.details || error?.hint || fallback;

export async function assertAdmin() {
  const access = await requireAdmin(supabase);
  if (!access.allowed) throw new Error(access.error?.message || "Admin access is required for this action.");
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

export async function duplicateSlugExists(slug, novelId) {
  if (!slug) return false;
  let query = supabase.from("novels").select("id").eq("slug", slug).limit(1);
  if (novelId) query = query.neq("id", novelId);
  const { data, error } = await query;
  if (error) throw new Error(adminError(error, "Could not check duplicate slug."));
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
