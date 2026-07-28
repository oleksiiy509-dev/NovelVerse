import { isSupabaseConfigured, supabase } from "./supabase.js";
import { mapSupabaseBookRecord } from "./bookManagementCore.js";
export { duplicateChapter, reorderChapters, validateBook } from "./bookManagementCore.js";

export const BOOK_STATUSES = ["Draft", "Review", "Scheduled", "Published", "Archived"];
export const TRANSLATION_STATUSES = ["Not started", "In progress", "Review", "Complete"];
export const LANGUAGES = ["English", "Ukrainian", "Russian", "Spanish", "French", "German", "Japanese"];
export const AGE_RATINGS = ["All ages", "7+", "13+", "16+", "18+"];
const STORE_KEY = "novelverse.book-management.v1";

export const seedBooks = [{
  id: "horizon", title: "The Last Horizon", author: "Mira Voss", description: "A starship cartographer discovers a border that should not exist.",
  genres: ["Science Fiction", "Adventure"], tags: ["space opera", "found family"], language: "English", ageRating: "13+", status: "Review",
  coverUrl: "", bannerUrl: "", scheduledAt: "", versions: [{ id: "en", language: "English", status: "Complete" }, { id: "uk", language: "Ukrainian", status: "In progress" }],
  chapters: [
    { id: "ch-1", title: "The Signal", content: "<p>The signal arrived before the stars went dark.</p>", audioStatus: "Ready", audioUrl: "", updatedAt: "2026-07-28T09:30:00.000Z" },
    { id: "ch-2", title: "Beyond the Map", content: "<p>Mara traced the impossible line with one finger.</p>", audioStatus: "Missing", audioUrl: "", updatedAt: "2026-07-28T10:00:00.000Z" },
  ],
}];

export function createBook(overrides = {}) {
  return { id: crypto.randomUUID(), title: "Untitled book", author: "", description: "", genres: [], tags: [], language: "English", ageRating: "13+", status: "Draft", coverUrl: "", bannerUrl: "", scheduledAt: "", versions: [{ id: crypto.randomUUID(), language: "English", status: "Not started" }], chapters: [], ...overrides };
}

export function normalizeBook(book) {
  return { ...createBook(), ...book, genres: book.genres || [], tags: book.tags || [], versions: book.versions || [], chapters: (book.chapters || []).map((chapter, index) => ({ audioStatus: "Missing", audioUrl: "", content: "", ...chapter, order: index + 1 })) };
}

export function mapSupabaseBook(row) {
  return mapSupabaseBookRecord(row, createBook());
}


function readLocal() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null") || seedBooks; } catch { return seedBooks; } }
function writeLocal(books) { localStorage.setItem(STORE_KEY, JSON.stringify(books)); return books; }

export async function loadManagedBooks() {
  if (!isSupabaseConfigured) return readLocal();
  const { data, error } = await supabase.from("books").select("*, chapters(*), book_languages(*)").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapSupabaseBook);
}

export async function saveManagedBook(book, allBooks) {
  if (!isSupabaseConfigured) return writeLocal(allBooks);
  const payload = { id: book.id, title: book.title, author: book.author, description: book.description, genres: book.genres, tags: book.tags, language: book.language, age_rating: book.ageRating, status: book.status, cover_url: book.coverUrl, banner_url: book.bannerUrl, scheduled_at: book.scheduledAt || null, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("books").upsert(payload); if (error) throw error;
  const chapters = book.chapters.map((item, index) => ({ id: item.id, book_id: book.id, title: item.title, content: item.content, position: index + 1, audio_status: item.audioStatus, audio_url: item.audioUrl || null }));
  if (chapters.length) { const result = await supabase.from("chapters").upsert(chapters); if (result.error) throw result.error; }
  const chapterIds = chapters.map(({ id }) => id);
  const existingChapters = await supabase.from("chapters").select("id").eq("book_id", book.id);
  if (existingChapters.error) throw existingChapters.error;
  const removedChapterIds = (existingChapters.data || []).map(({ id }) => id).filter((id) => !chapterIds.includes(id));
  if (removedChapterIds.length) { const result = await supabase.from("chapters").delete().in("id", removedChapterIds); if (result.error) throw result.error; }

  const versions = book.versions.map((item) => ({ id: item.id, book_id: book.id, language: item.language, status: item.status }));
  if (versions.length) { const result = await supabase.from("book_languages").upsert(versions); if (result.error) throw result.error; }
  const versionIds = versions.map(({ id }) => id);
  const existingVersions = await supabase.from("book_languages").select("id").eq("book_id", book.id);
  if (existingVersions.error) throw existingVersions.error;
  const removedVersionIds = (existingVersions.data || []).map(({ id }) => id).filter((id) => !versionIds.includes(id));
  if (removedVersionIds.length) { const result = await supabase.from("book_languages").delete().in("id", removedVersionIds); if (result.error) throw result.error; }
  return allBooks;
}

export async function deleteManagedBook(id, remaining) {
  if (!isSupabaseConfigured) return writeLocal(remaining);
  const { error } = await supabase.from("books").delete().eq("id", id); if (error) throw error; return remaining;
}

export async function uploadBookAsset(bookId, kind, file) {
  if (!isSupabaseConfigured) return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Unable to read image"));
    reader.readAsDataURL(file);
  });
  const path = `${bookId}/${kind}-${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from("book-assets").upload(path, file, { upsert: true }); if (error) throw error;
  return supabase.storage.from("book-assets").getPublicUrl(path).data.publicUrl;
}
