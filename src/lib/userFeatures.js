import { getTelegramLocalUser } from "./telegram";

export async function getCurrentUser(supabase) {
  const { data } = await supabase.auth.getUser();
  return data?.user || getTelegramLocalUser() || null;
}

export function userKey(userId, name) {
  return `novelverse:${userId || "guest"}:${name}`;
}

export function readList(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

export function writeList(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export async function readCloudBackedList(key, cloudGetItem) {
  const local = readList(key);
  const cloudValue = await cloudGetItem?.(key);
  if (!cloudValue) return local;
  try {
    const cloud = JSON.parse(cloudValue);
    if (Array.isArray(cloud)) {
      writeList(key, cloud);
      return cloud;
    }
  } catch {
    return local;
  }
  return local;
}

export async function writeCloudBackedList(key, value, cloudSetItem) {
  writeList(key, value);
  await cloudSetItem?.(key, JSON.stringify(value));
}

export function readObject(key, fallback = {}) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

export function saveOfflineChapter(chapter) {
  if (!chapter?.id) return;
  const cache = readObject("novelverse:offlineChapters");
  cache[chapter.id] = { ...chapter, cached_at: new Date().toISOString() };
  localStorage.setItem("novelverse:offlineChapters", JSON.stringify(cache));
}

export function getOfflineChapter(chapterId) {
  return readObject("novelverse:offlineChapters")[chapterId] || null;
}

export async function syncReadingProgress(supabase, user, payload, cloudSetItem) {
  const record = { ...payload, user_id: user?.id, updated_at: new Date().toISOString() };
  const local = readObject(userKey(user?.id, "readingProgress"));
  local[payload.novel_id] = record;
  localStorage.setItem(userKey(user?.id, "readingProgress"), JSON.stringify(local));
  await cloudSetItem?.(userKey(user?.id, "readingProgress"), JSON.stringify(local));

  if (!user) return { data: record, error: null };

  return supabase
    .from("reading_progress")
    .upsert(record, { onConflict: "user_id,novel_id" });
}

export async function addReadingHistory(supabase, user, payload) {
  const entry = { ...payload, user_id: user?.id, read_at: new Date().toISOString() };
  const key = userKey(user?.id, "history");
  const history = readList(key).filter((item) => item.chapter_id !== payload.chapter_id);
  writeList(key, [entry, ...history].slice(0, 50));

  if (!user) return { data: entry, error: null };

  return supabase.from("reading_history").insert(entry);
}
