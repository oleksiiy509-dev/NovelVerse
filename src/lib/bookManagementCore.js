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
  return errors;
}
