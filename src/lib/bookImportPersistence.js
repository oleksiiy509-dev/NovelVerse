import { isSupabaseConfigured, supabase } from "./supabase.js";
import { planChapterMerge } from "./bookImportMerge.js";
import { MAX_IMPORT_BATCH_SIZE } from "./chapterImportQueue.js";
export { MAX_IMPORT_BATCH_SIZE } from "./chapterImportQueue.js";

export async function importChaptersIntoNovel(novelId, importedChapters, existingNumbers = []) {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured. Configure Studio before importing chapters.");
  if (!novelId) throw new Error("Open a novel before importing chapters.");
  const { additions, skipped } = planChapterMerge(importedChapters, existingNumbers);
  const chapters = additions.map(({ number, title, content }) => ({
    number, title: title?.trim() || `Chapter ${number}`, content,
  }));
  const { data, error } = await supabase.rpc("import_novel_chapters", {
    target_novel_id: novelId, import_chapters: chapters,
  });
  if (error) throw error;
  const result = typeof data === "string" ? JSON.parse(data) : data;
  return { ...result, skipped: Number(result.skipped || 0) + skipped };
}

export async function importChapterBatch(novelId, chapters) {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured. Configure Studio before importing chapters.");
  if (!novelId) throw new Error("Open a novel before importing chapters.");
  if (!Array.isArray(chapters) || chapters.length === 0) return { added: 0, skipped: 0, totalChapters: 0 };
  if (chapters.length > MAX_IMPORT_BATCH_SIZE) throw new Error(`An import batch cannot exceed ${MAX_IMPORT_BATCH_SIZE} chapters.`);
  const payload = chapters.map(({ number, title, content }) => ({
    number, title: title?.trim() || `Chapter ${number}`, content,
  }));
  const { data, error } = await supabase.rpc("import_novel_chapters", {
    target_novel_id: novelId, import_chapters: payload,
  });
  if (error) throw error;
  return typeof data === "string" ? JSON.parse(data) : data;
}

export async function mergeImportedNovels(targetNovelId, sourceNovelId) {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured.");
  if (!targetNovelId || !sourceNovelId || String(targetNovelId) === String(sourceNovelId)) throw new Error("Choose two different novels.");
  const { data, error } = await supabase.rpc("merge_novels", {
    target_novel_id: targetNovelId, source_novel_id: sourceNovelId,
  });
  if (error) throw error;
  return typeof data === "string" ? JSON.parse(data) : data;
}
