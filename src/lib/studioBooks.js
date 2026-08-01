import { isSupabaseConfigured, supabase } from "./supabase.js";
import { mapSupabaseBookRecord } from "./bookManagementCore.js";

const defaults = { chapters: [], coverUrl: "", status: "Draft" };

export async function loadStudioBooks() {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured");
  const { data, error } = await supabase
    .from("novels")
    .select("*, chapters(*)")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => mapSupabaseBookRecord(row, defaults));
}

export async function setStudioBooksStatus(ids, status) {
  const { error } = await supabase.from("novels").update({ status, updated_at: new Date().toISOString() }).in("id", ids);
  if (error) throw error;
}

export async function deleteStudioBooks(ids) {
  const { error } = await supabase.from("novels").delete().in("id", ids);
  if (error) throw error;
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
  const chapters = book.chapters.map((chapter, index) => ({
    novel_id: data.id, title: chapter.title, content: chapter.content,
    position: index + 1, audio_status: "Missing", audio_url: null,
  }));
  const result = await supabase.from("chapters").insert(chapters);
  if (result.error) throw result.error;
}
