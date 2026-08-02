import { isSupabaseConfigured, supabase } from "./supabase.js";
import { planChapterMerge } from "./bookImportMerge.js";

export async function saveImportedBookDraft(book) {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured. Configure Studio before saving a draft.");
  const metadata = book?.metadata || {};
  const title = metadata.title?.trim();
  const author = metadata.author?.trim();
  if (!title) throw new Error("A title is required.");
  if (!author || author === "Unknown author") throw new Error("An author is required to identify this novel.");

  // Normalize and de-duplicate the file before sending it. The database RPC
  // repeats the duplicate check atomically against chapters already persisted.
  const { additions } = planChapterMerge(book.chapters, []);
  const chapters = additions.map(({ number, title: chapterTitle, content }) => ({
    number, title: chapterTitle?.trim() || `Chapter ${number}`, content,
  }));
  const { data, error } = await supabase.rpc("import_novel_chapters", {
    import_title: title,
    import_author: author,
    import_description: metadata.description?.trim() || "",
    import_language: metadata.language === "Unknown" ? "" : metadata.language?.trim() || "",
    import_chapters: chapters,
  });
  if (error) throw error;
  const result = typeof data === "string" ? JSON.parse(data) : data;
  return { novelId: result.novelId, added: result.added, skipped: book.chapters.length - result.added, created: result.created };
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
