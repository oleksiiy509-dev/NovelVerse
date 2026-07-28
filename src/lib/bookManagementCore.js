export function duplicateChapter(chapter) {
  return { ...chapter, id: crypto.randomUUID(), title: `${chapter.title} (copy)`, audioStatus: "Missing", audioUrl: "", updatedAt: new Date().toISOString() };
}
export function reorderChapters(chapters, from, to) {
  if (to < 0 || to >= chapters.length || from === to) return chapters;
  const next = [...chapters]; const [chapter] = next.splice(from, 1); next.splice(to, 0, chapter);
  return next.map((item, index) => ({ ...item, order: index + 1 }));
}
export function validateBook(book) {
  const errors = {};
  if (!book.title?.trim()) errors.title = "Title is required";
  if (!book.author?.trim()) errors.author = "Author is required";
  if (book.status === "Scheduled" && !book.scheduledAt) errors.scheduledAt = "Choose a publication date";
  if (book.status === "Published") {
    if (!book.description?.trim()) errors.description = "Description is required to publish";
    if (!book.genres?.length) errors.genres = "Choose at least one genre to publish";
    if (!book.coverUrl) errors.coverUrl = "A cover is required to publish";
    if (!book.chapters?.length) errors.chapters = "Import at least one chapter to publish";
    if (book.chapters?.some((chapter) => chapter.audioStatus !== "Ready" || !chapter.audioUrl)) errors.audio = "Generate audio for every chapter before publishing";
  }
  return errors;
}

export function mapSupabaseBookRecord(row, defaults) {
  return {
    ...defaults,
    ...row,
    ageRating: row.age_rating,
    coverUrl: row.cover_url || "",
    bannerUrl: row.banner_url || "",
    scheduledAt: row.scheduled_at || "",
    genres: row.genres || [],
    tags: row.tags || [],
    versions: (row.book_languages || []).map((version) => ({ id: version.id, language: version.language, status: version.status })),
    chapters: [...(row.chapters || [])]
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map((chapter, index) => ({
        id: chapter.id,
        title: chapter.title,
        content: chapter.content || "",
        audioStatus: chapter.audio_status || "Missing",
        audioUrl: chapter.audio_url || "",
        updatedAt: chapter.updated_at || row.updated_at,
        order: index + 1,
      })),
  };
}
