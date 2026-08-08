import { isSupabaseConfigured, supabase } from "./supabase.js";
import { mapSupabaseBookRecord } from "./bookManagementCore.js";
import { fetchChapterContent, fetchChapterMetadataPages } from "./chapterQueries.js";
import { deleteNovels } from "./novelDeletion.js";
export { duplicateChapter, reorderChapters, validateBook } from "./bookManagementCore.js";

export const BOOK_STATUSES = ["Draft", "Review", "Scheduled", "Published", "Archived"];
export const TRANSLATION_STATUSES = ["Not started", "In progress", "Review", "Complete"];
export const LANGUAGES = ["English", "Ukrainian", "Russian", "Spanish", "French", "German", "Japanese"];
export const AGE_RATINGS = ["All ages", "7+", "13+", "16+", "18+"];
const STORE_KEY = "novelverse.book-management.v1";
const isClientUuid = (id) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

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
  const [{ data, error }, chapters] = await Promise.all([
    supabase.from("novels").select("*").order("updated_at", { ascending: false }),
    fetchChapterMetadataPages(supabase),
  ]);
  if (error) throw error;
  return (data || []).map((row) => mapSupabaseBook({ ...row, chapters: chapters.filter((chapter) => String(chapter.novel_id) === String(row.id)) }));
}

export async function loadManagedChapter(chapterId) {
  if (!isSupabaseConfigured) return null;
  return fetchChapterContent(supabase, chapterId);
}

/** Load chapter bodies omitted by the lightweight managed-book listing. */
export async function hydrateManagedChapters(chapters = [], loadChapter = loadManagedChapter) {
  return Promise.all(chapters.map(async (chapter) => {
    if (Object.hasOwn(chapter, "content") && typeof chapter.content === "string") return chapter;
    const loaded = await loadChapter(chapter.id);
    return loaded ? { ...chapter, ...loaded } : chapter;
  }));
}

export async function saveManagedBook(book, allBooks) {
  if (!isSupabaseConfigured) return writeLocal(allBooks);
  const payload = { title: book.title, author: book.author, description: book.description, genres: book.genres, tags: book.tags, language: book.language, age_rating: book.ageRating, status: book.status, cover_url: book.coverUrl, banner_url: book.bannerUrl, scheduled_at: book.scheduledAt || null, updated_at: new Date().toISOString() };
  const novelQuery = isClientUuid(book.id)
    ? supabase.from("novels").insert(payload).select("id").single()
    : supabase.from("novels").upsert({ id: book.id, ...payload }).select("id").single();
  const { data: savedNovel, error } = await novelQuery; if (error) throw error;
  book.id = savedNovel.id;
  const chapters = book.chapters.map((item, index) => ({ id: item.id, novel_id: book.id, number: index + 1, title: item.title, ...(Object.hasOwn(item, "content") ? { content: item.content } : {}), position: index + 1, audio_status: item.audioStatus, audio_url: item.audioUrl || null }));
  for (const [index, chapter] of chapters.entries()) {
    const chapterQuery = isClientUuid(chapter.id)
      ? supabase.from("chapters").insert({ ...chapter, id: undefined }).select("id").single()
      : supabase.from("chapters").update(chapter).eq("id", chapter.id).select("id").single();
    const result = await chapterQuery; if (result.error) throw result.error;
    chapter.id = result.data.id;
    book.chapters[index].id = result.data.id;
  }
  const chapterIds = chapters.map(({ id }) => id);
  const existingChapters = await fetchChapterMetadataPages(supabase, (query) => query.eq("novel_id", book.id));
  const removedChapterIds = existingChapters.map(({ id }) => id).filter((id) => !chapterIds.includes(id));
  if (removedChapterIds.length) { const result = await supabase.from("chapters").delete().in("id", removedChapterIds); if (result.error) throw result.error; }

  return allBooks;
}

export async function deleteManagedBook(id, remaining) {
  if (!isSupabaseConfigured) return writeLocal(remaining);
  await deleteNovels([id]);
  return remaining;
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
