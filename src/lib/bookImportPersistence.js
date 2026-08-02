import { isSupabaseConfigured, supabase } from "./supabase.js";
import { planChapterMerge } from "./bookImportMerge.js";

export async function importChaptersIntoNovel(novelId, importedChapters) {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured. Configure Studio before importing chapters.");
  if (!novelId) throw new Error("Open a novel before importing chapters.");
  const { additions, skipped: skippedInFile } = planChapterMerge(importedChapters, []);
  const chapters = additions.map(({ number, title, content }) => ({
    number, title: title?.trim() || `Chapter ${number}`, content,
  }));
  const { data, error } = await supabase.rpc("import_chapters_into_novel", {
    target_novel_id: Number(novelId), import_chapters: chapters,
  });
  if (error) throw error;
  const result = typeof data === "string" ? JSON.parse(data) : data;
  return { ...result, skipped: Number(result.skipped || 0) + skippedInFile };
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
