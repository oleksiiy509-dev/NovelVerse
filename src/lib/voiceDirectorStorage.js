import { directorStorageKey, parseDirectorJson } from "./voiceDirectorLocal.js";

export const EMPTY_DIRECTOR = Object.freeze({ version: 1, characters: [], segments: [] });
export const DIRECTOR_SAVED_EVENT = "novelverse:voice-director-saved";

/** Returns the persisted director, or null when Voice Direction has never saved one. */
export function loadSavedVoiceDirector(bookId, storage = globalThis.localStorage) {
  if (!bookId || !storage) return null;
  try {
    const saved = storage.getItem(directorStorageKey(bookId));
    return saved ? parseDirectorJson(saved) : null;
  } catch {
    return null;
  }
}

export function loadVoiceDirector(bookId, storage = globalThis.localStorage) {
  return loadSavedVoiceDirector(bookId, storage) || EMPTY_DIRECTOR;
}

export function saveVoiceDirector(bookId, director, storage = globalThis.localStorage, eventTarget = globalThis) {
  if (!bookId || !storage) return;
  const saved = { ...director, updatedAt: new Date().toISOString() };
  storage.setItem(directorStorageKey(bookId), JSON.stringify(saved));
  eventTarget?.dispatchEvent?.(new Event(DIRECTOR_SAVED_EVENT));
  return saved;
}

export function removeVoiceDirector(bookId, storage = globalThis.localStorage, eventTarget = globalThis) {
  if (!bookId || !storage) return;
  storage.removeItem(directorStorageKey(bookId));
  eventTarget?.dispatchEvent?.(new Event(DIRECTOR_SAVED_EVENT));
}

export function subscribeToVoiceDirector(bookId, listener, eventTarget = globalThis) {
  if (!eventTarget?.addEventListener) return () => {};
  const refresh = () => listener(loadSavedVoiceDirector(bookId));
  const refreshFromStorage = (event) => {
    if (!event.key || event.key === directorStorageKey(bookId)) refresh();
  };
  eventTarget.addEventListener(DIRECTOR_SAVED_EVENT, refresh);
  eventTarget.addEventListener("storage", refreshFromStorage);
  return () => {
    eventTarget.removeEventListener(DIRECTOR_SAVED_EVENT, refresh);
    eventTarget.removeEventListener("storage", refreshFromStorage);
  };
}

export function firstChapterWithSegments(chapters = [], segments = []) {
  const assigned = new Set(segments.map((segment) => String(segment.chapterId)));
  return chapters.find((chapter) => assigned.has(String(chapter.id)));
}
