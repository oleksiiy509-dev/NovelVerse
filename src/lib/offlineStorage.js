const DB_NAME = "novelverse-offline";
const DB_VERSION = 1;
const CHAPTERS = "chapters";
const PROGRESS = "progressQueue";

let dbPromise;

function unavailable(message = "Офлайн-сховище недоступне у цьому браузері.") {
  const error = new Error(message);
  error.code = "IDB_UNAVAILABLE";
  return error;
}

export function isIndexedDBAvailable() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

export function openOfflineDB() {
  if (!isIndexedDBAvailable()) return Promise.reject(unavailable());
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || unavailable());
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHAPTERS)) {
        const chapters = db.createObjectStore(CHAPTERS, { keyPath: "chapter_id" });
        chapters.createIndex("novel_id", "novel_id", { unique: false });
        chapters.createIndex("novel_number", ["novel_id", "chapter_number"], { unique: false });
      }
      if (!db.objectStoreNames.contains(PROGRESS)) {
        const progress = db.createObjectStore(PROGRESS, { keyPath: "queue_id" });
        progress.createIndex("chapter_id", "chapter_id", { unique: false });
        progress.createIndex("novel_id", "novel_id", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

function tx(storeName, mode = "readonly") {
  return openOfflineDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function normalizeChapter(chapter, novel = {}) {
  const novelMeta = chapter.novel || novel || {};
  return {
    novel_id: chapter.novel_id || novelMeta.id,
    novel_title: novelMeta.title || chapter.novel_title || "NovelVerse",
    novel_author: novelMeta.author || chapter.novel_author || "",
    novel_cover_url: novelMeta.image || novelMeta.cover_url || chapter.novel_cover_url || "",
    chapter_id: chapter.id || chapter.chapter_id,
    id: chapter.id || chapter.chapter_id,
    chapter_number: Number(chapter.number ?? chapter.chapter_number ?? 0),
    number: Number(chapter.number ?? chapter.chapter_number ?? 0),
    chapter_title: chapter.title || chapter.chapter_title || `Глава ${chapter.number || chapter.chapter_number || ""}`,
    title: chapter.title || chapter.chapter_title || `Глава ${chapter.number || chapter.chapter_number || ""}`,
    content: chapter.content || "",
    downloaded_at: new Date().toISOString(),
  };
}

export async function saveDownloadedChapter(chapter, novel) {
  const record = normalizeChapter(chapter, novel);
  if (!record.chapter_id || !record.novel_id) throw new Error("Неможливо зберегти главу без ідентифікатора.");
  try {
    const store = await tx(CHAPTERS, "readwrite");
    await req(store.put(record));
    return record;
  } catch (error) {
    if (error?.name === "QuotaExceededError") throw new Error("Недостатньо місця для офлайн-завантаження. Видаліть старі глави та спробуйте ще раз.", { cause: error });
    throw error;
  }
}

export async function getDownloadedChapter(chapterId) {
  const store = await tx(CHAPTERS);
  return req(store.get(chapterId));
}

export async function deleteDownloadedChapter(chapterId) {
  const store = await tx(CHAPTERS, "readwrite");
  await req(store.delete(chapterId));
}

export async function getAllDownloadedChapters() {
  const store = await tx(CHAPTERS);
  return req(store.getAll());
}

export async function getDownloadedNovelChapters(novelId) {
  const store = await tx(CHAPTERS);
  const index = store.index("novel_id");
  const rows = await req(index.getAll(novelId));
  return rows.sort((a, b) => Number(a.chapter_number) - Number(b.chapter_number));
}

export async function deleteDownloadedNovel(novelId) {
  const rows = await getDownloadedNovelChapters(novelId);
  const store = await tx(CHAPTERS, "readwrite");
  await Promise.all(rows.map((row) => req(store.delete(row.chapter_id))));
}

export async function clearDownloads() {
  const store = await tx(CHAPTERS, "readwrite");
  await req(store.clear());
}

export function estimateBytes(rows = []) {
  return new Blob([JSON.stringify(rows)]).size;
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export async function getDownloadedNovels() {
  const rows = await getAllDownloadedChapters();
  const byNovel = new Map();
  rows.forEach((row) => {
    const item = byNovel.get(row.novel_id) || { novel_id: row.novel_id, title: row.novel_title, cover_url: row.novel_cover_url, chapters: [], size: 0 };
    item.chapters.push(row);
    item.size += estimateBytes([row]);
    byNovel.set(row.novel_id, item);
  });
  return [...byNovel.values()].map((item) => ({ ...item, chapter_count: item.chapters.length })).sort((a, b) => a.title.localeCompare(b.title));
}

export async function queueProgress(payload) {
  const queue_id = `${payload.user_id || "guest"}:${payload.novel_id}:${payload.chapter_id}`;
  const store = await tx(PROGRESS, "readwrite");
  await req(store.put({ ...payload, queue_id, updated_at: new Date().toISOString() }));
}

export async function getQueuedProgress() {
  const store = await tx(PROGRESS);
  return req(store.getAll());
}

export async function removeQueuedProgress(queueId) {
  const store = await tx(PROGRESS, "readwrite");
  await req(store.delete(queueId));
}
