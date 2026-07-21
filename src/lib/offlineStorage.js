const DB_NAME = "novelverse-offline";
const DB_VERSION = 2;
const CHAPTERS = "chapters";
const PROGRESS = "progressQueue";
const FALLBACK_CHAPTERS_KEY = "novelverse:offline:fallback:chapters";
const FALLBACK_PROGRESS_KEY = "novelverse:offline:fallback:progress";
export const OFFLINE_RECORD_VERSION = 2;

let dbPromise;
let idbBroken = false;

function unavailable(message = "Офлайн-сховище недоступне у цьому браузері.") {
  const error = new Error(message);
  error.code = "IDB_UNAVAILABLE";
  return error;
}

export function isIndexedDBAvailable() {
  return !idbBroken && typeof window !== "undefined" && "indexedDB" in window;
}

export function openOfflineDB() {
  if (!isIndexedDBAvailable()) return Promise.reject(unavailable());
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || unavailable());
    request.onblocked = () => reject(unavailable("Оновлення офлайн-сховища заблоковано іншою вкладкою."));
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
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  }).catch((error) => {
    idbBroken = true;
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(storeName, mode, action) {
  if (!isIndexedDBAvailable()) throw unavailable();
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || unavailable());
    Promise.resolve(action(store)).then((value) => { result = value; }).catch((error) => { transaction.abort(); reject(error); });
  });
}

function readFallbackMap(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeFallbackMap(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function stripTags(value = "") {
  return String(value).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "");
}

export function sanitizeOfflineContent(content = "") {
  const textarea = typeof document !== "undefined" ? document.createElement("textarea") : null;
  const stripped = stripTags(content).split(String.fromCharCode(0)).join("");
  if (!textarea) return stripped;
  textarea.innerHTML = stripped;
  return textarea.value;
}

function normalizeChapter(chapter = {}, novel = {}) {
  const novelMeta = chapter.novel || novel || {};
  const chapterId = String(chapter.id || chapter.chapter_id || "");
  const novelId = String(chapter.novel_id || novelMeta.id || "");
  return {
    version: OFFLINE_RECORD_VERSION,
    novel_id: novelId,
    novel_title: String(novelMeta.title || chapter.novel_title || "NovelVerse"),
    novel_author: String(novelMeta.author || chapter.novel_author || ""),
    novel_cover_url: String(novelMeta.image || novelMeta.cover_url || chapter.novel_cover_url || ""),
    chapter_id: chapterId,
    id: chapterId,
    chapter_number: Number(chapter.number ?? chapter.chapter_number ?? 0),
    number: Number(chapter.number ?? chapter.chapter_number ?? 0),
    chapter_title: String(chapter.title || chapter.chapter_title || `Глава ${chapter.number || chapter.chapter_number || ""}`),
    title: String(chapter.title || chapter.chapter_title || `Глава ${chapter.number || chapter.chapter_number || ""}`),
    content: sanitizeOfflineContent(chapter.content || ""),
    downloaded_at: chapter.downloaded_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function validateDownloadedChapter(row) {
  return !!(row && row.chapter_id && row.novel_id && Number.isFinite(Number(row.chapter_number)) && typeof row.content === "string");
}

export async function saveDownloadedChapter(chapter, novel) {
  const record = normalizeChapter(chapter, novel);
  if (!validateDownloadedChapter(record)) throw new Error("Неможливо зберегти некоректну главу.");
  try {
    await withStore(CHAPTERS, "readwrite", async (store) => req(store.put(record)));
  } catch (error) {
    if (error?.name === "QuotaExceededError") throw new Error("Недостатньо місця для офлайн-завантаження. Видаліть старі глави та спробуйте ще раз.", { cause: error });
    const fallback = readFallbackMap(FALLBACK_CHAPTERS_KEY);
    fallback[record.chapter_id] = record;
    writeFallbackMap(FALLBACK_CHAPTERS_KEY, fallback);
  }
  return record;
}

export async function getDownloadedChapter(chapterId) {
  const id = String(chapterId);
  try {
    const row = await withStore(CHAPTERS, "readonly", (store) => req(store.get(id)));
    return validateDownloadedChapter(row) ? row : null;
  } catch {
    const row = readFallbackMap(FALLBACK_CHAPTERS_KEY)[id];
    return validateDownloadedChapter(row) ? row : null;
  }
}

export async function deleteDownloadedChapter(chapterId) {
  const id = String(chapterId);
  try { await withStore(CHAPTERS, "readwrite", (store) => req(store.delete(id))); } catch { /* fallback below */ }
  const fallback = readFallbackMap(FALLBACK_CHAPTERS_KEY); delete fallback[id]; writeFallbackMap(FALLBACK_CHAPTERS_KEY, fallback);
}

export async function getAllDownloadedChapters() {
  try {
    const rows = await withStore(CHAPTERS, "readonly", (store) => req(store.getAll()));
    return rows.filter(validateDownloadedChapter);
  } catch {
    return Object.values(readFallbackMap(FALLBACK_CHAPTERS_KEY)).filter(validateDownloadedChapter);
  }
}

export async function getDownloadedNovelChapters(novelId) {
  const id = String(novelId);
  const rows = await getAllDownloadedChapters();
  return rows.filter((row) => String(row.novel_id) === id).sort((a, b) => Number(a.chapter_number) - Number(b.chapter_number));
}

export async function deleteDownloadedNovel(novelId) {
  const rows = await getDownloadedNovelChapters(novelId);
  await Promise.all(rows.map((row) => deleteDownloadedChapter(row.chapter_id)));
}

export async function clearDownloads() {
  try { await withStore(CHAPTERS, "readwrite", (store) => req(store.clear())); } catch { /* fallback below */ }
  localStorage.removeItem(FALLBACK_CHAPTERS_KEY);
}

export function estimateBytes(rows = []) { return new Blob([JSON.stringify(rows)]).size; }
export function formatBytes(bytes = 0) { if (!bytes) return "0 КБ"; if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`; return `${(bytes / 1024 / 1024).toFixed(1)} МБ`; }

export async function estimateStorageUsage() {
  const localBytes = estimateBytes(await getAllDownloadedChapters());
  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    return { used: estimate.usage || localBytes, quota: estimate.quota || 0, offlineBytes: localBytes };
  }
  return { used: localBytes, quota: 0, offlineBytes: localBytes };
}

export async function getDownloadedNovels() {
  const rows = await getAllDownloadedChapters();
  const byNovel = new Map();
  rows.forEach((row) => {
    const key = String(row.novel_id);
    const item = byNovel.get(key) || { novel_id: key, title: row.novel_title, author: row.novel_author, cover_url: row.novel_cover_url, chapters: [], size: 0, downloaded_at: row.downloaded_at };
    item.chapters.push(row); item.size += estimateBytes([row]); if (row.downloaded_at < item.downloaded_at) item.downloaded_at = row.downloaded_at; byNovel.set(key, item);
  });
  return [...byNovel.values()].map((item) => ({ ...item, chapters: item.chapters.sort((a,b)=>a.chapter_number-b.chapter_number), chapter_count: item.chapters.length })).sort((a, b) => a.title.localeCompare(b.title));
}

export async function queueProgress(payload) {
  const queue_id = `${payload.user_id || "guest"}:${payload.novel_id}:${payload.chapter_id}`;
  const record = { ...payload, queue_id, updated_at: payload.updated_at || new Date().toISOString() };
  try { await withStore(PROGRESS, "readwrite", (store) => req(store.put(record))); } catch { const q = readFallbackMap(FALLBACK_PROGRESS_KEY); q[queue_id] = record; writeFallbackMap(FALLBACK_PROGRESS_KEY, q); }
}
export async function getQueuedProgress() { try { return await withStore(PROGRESS, "readonly", (store) => req(store.getAll())); } catch { return Object.values(readFallbackMap(FALLBACK_PROGRESS_KEY)); } }
export async function removeQueuedProgress(queueId) { try { await withStore(PROGRESS, "readwrite", (store) => req(store.delete(queueId))); } catch { /* fallback */ } const q = readFallbackMap(FALLBACK_PROGRESS_KEY); delete q[queueId]; writeFallbackMap(FALLBACK_PROGRESS_KEY, q); }
