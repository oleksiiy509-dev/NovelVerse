const draftKey = (novelId) => `novelverse:chapter-import-draft:${novelId}`;

function browserStorage(storage) {
  return storage === undefined ? globalThis.localStorage : storage;
}

export function loadChapterImportDraft(novelId, storage) {
  if (!novelId) return null;
  try {
    const value = browserStorage(storage)?.getItem(draftKey(novelId));
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function saveChapterImportDraft(novelId, book, storage) {
  if (!novelId || !book) return false;
  try {
    const persistedBook = book.metadata?.cover?.startsWith("blob:")
      ? { ...book, metadata: { ...book.metadata, cover: "" } }
      : book;
    browserStorage(storage)?.setItem(draftKey(novelId), JSON.stringify(persistedBook));
    return true;
  } catch {
    // Import drafts are an optional convenience. Storage restrictions or quota
    // exhaustion must never interrupt the actual Supabase import.
    return false;
  }
}

export function clearChapterImportDraft(novelId, storage) {
  if (!novelId) return false;
  try {
    browserStorage(storage)?.removeItem(draftKey(novelId));
    return true;
  } catch {
    return false;
  }
}
