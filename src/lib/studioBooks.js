import { isSupabaseConfigured, supabase } from "./supabase.js";
import { mapSupabaseBookRecord } from "./bookManagementCore.js";
import { distinctChaptersByNumber, fetchChapterContent, fetchChapterMetadataPages } from "./chapterQueries.js";
import { deleteNovels } from "./novelDeletion.js";

const defaults = { chapters: [], coverUrl: "", status: "Draft" };

export async function loadStudioBooks() {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured");
  const [{ data, error }, chapters] = await Promise.all([
    supabase.from("novels").select("*").order("updated_at", { ascending: false }),
    fetchChapterMetadataPages(supabase),
  ]);
  if (error) throw error;
  return (data || []).map((row) => mapSupabaseBookRecord({
    ...row,
    chapters: distinctChaptersByNumber(chapters.filter((chapter) => String(chapter.novel_id) === String(row.id))),
  }, defaults));
}

export async function setStudioBooksStatus(ids, status) {
  const { error } = await supabase.from("novels").update({ status, updated_at: new Date().toISOString() }).in("id", ids);
  if (error) throw error;
}

export async function deleteStudioBooks(ids) {
  await deleteNovels(ids);
}

export async function duplicateStudioBook(book) {
  const { data, error } = await supabase.from("novels").insert({
    title: `${book.title} (Copy)`, author: book.author, description: book.description,
    genres: book.genres, tags: book.tags, language: book.language,
    age_rating: book.ageRating, status: "Draft", cover_url: book.coverUrl || null,
    banner_url: book.bannerUrl || null,
  }).select("id").single();
  if (error) throw error;
  if (!book.chapters.length) return;
  const sourceChapters = await Promise.all(book.chapters.map((chapter) => Object.hasOwn(chapter, "content") ? chapter : fetchChapterContent(supabase, chapter.id)));
  const chapters = sourceChapters.map((chapter, index) => ({
    novel_id: data.id, number: index + 1, title: chapter.title, content: chapter.content,
    position: index + 1, audio_status: "Missing", audio_url: null,
  }));
  const result = await supabase.from("chapters").insert(chapters);
  if (result.error) throw result.error;
}
