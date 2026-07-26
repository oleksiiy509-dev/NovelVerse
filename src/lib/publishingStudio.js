export const PUBLISHING_STATUSES = Object.freeze([
  "Drafts", "In Production", "Ready For Review", "Ready To Publish", "Published", "Archived",
]);

export const PRODUCTION_STAGES = Object.freeze([
  "Character Analysis", "Voice Assignment", "Narration", "Production", "Sound Design", "Rendering", "Mixing", "Export",
]);

export const ADMIN_ACTIONS = Object.freeze(["publish", "delete", "regenerate", "archive", "rollback"]);

export function canUsePublishingStudio(user) {
  return Boolean(user && (user.role === "admin" || user.app_metadata?.role === "admin" || user.user_metadata?.role === "admin" || user.user_metadata?.is_admin === true));
}

export function assertAdmin(user, action = "access Publishing Studio") {
  if (!canUsePublishingStudio(user)) throw new Error(`Administrator permission required to ${action}.`);
  return true;
}

export function createPublishingStore(storage = globalThis.localStorage) {
  const key = "novelverse.publishingStudio.v1";
  const memory = new Map();
  const target = storage || { getItem: (name) => memory.get(name) || null, setItem: (name, value) => memory.set(name, value) };
  const initial = { novels: [], jobs: [], reports: [], publications: [], cacheRevision: 0, searchRevision: 0 };
  return {
    read() { try { return { ...initial, ...(JSON.parse(target.getItem(key)) || {}) }; } catch { return { ...initial }; } },
    write(value) { target.setItem(key, JSON.stringify(value)); return value; },
    clear() { target.setItem(key, JSON.stringify(initial)); return { ...initial }; },
  };
}

const id = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const copy = (value) => JSON.parse(JSON.stringify(value));

export function createNovel(input = {}) {
  return {
    id: input.id || id("novel"), title: input.title?.trim() || "Untitled novel", author: input.author?.trim() || "",
    description: input.description?.trim() || "", cover: input.cover || "", genres: input.genres || [], status: "Drafts",
    archivedFrom: null, chapters: [], versions: [], currentVersion: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

export function updateNovel(novel, changes) { return { ...novel, ...changes, id: novel.id, updatedAt: new Date().toISOString() }; }
export function archiveNovel(novel, user) { assertAdmin(user, "archive novels"); return { ...novel, archivedFrom: novel.status, status: "Archived", updatedAt: new Date().toISOString() }; }
export function restoreNovel(novel) { return { ...novel, status: novel.archivedFrom || "Drafts", archivedFrom: null, updatedAt: new Date().toISOString() }; }

export function addChapter(novel, input = {}) {
  const chapter = { id: input.id || id("chapter"), title: input.title?.trim() || `Chapter ${novel.chapters.length + 1}`, content: input.content || "", order: novel.chapters.length + 1, locked: false, published: false, approved: false, audio: input.audio || null, previousAudio: null, scenes: input.scenes || [], voices: input.voices || [], assets: input.assets || [], renderStatus: input.renderStatus || "pending" };
  return { ...novel, chapters: [...novel.chapters, chapter] };
}

export function updateChapter(novel, chapterId, changes) { return { ...novel, chapters: novel.chapters.map((chapter) => chapter.id === chapterId ? { ...chapter, ...changes, id: chapter.id } : chapter) }; }
export function reorderChapters(novel, chapterIds) {
  if (new Set(chapterIds).size !== novel.chapters.length || novel.chapters.some((chapter) => !chapterIds.includes(chapter.id))) throw new Error("Chapter order must contain every chapter exactly once.");
  return { ...novel, chapters: chapterIds.map((chapterId, index) => ({ ...novel.chapters.find((chapter) => chapter.id === chapterId), order: index + 1 })) };
}

export function qualityControl(novel) {
  const issues = [];
  if (!novel.chapters.length) issues.push({ code: "chapter_missing", message: "At least one chapter is required." });
  const titles = new Set();
  novel.chapters.forEach((chapter) => {
    if (titles.has(chapter.title.trim().toLowerCase())) issues.push({ code: "duplicate_chapter", chapterId: chapter.id, message: `Duplicate chapter: ${chapter.title}.` });
    titles.add(chapter.title.trim().toLowerCase());
    if (!chapter.audio) issues.push({ code: "audio_missing", chapterId: chapter.id, message: `${chapter.title} has no audio.` });
    if (chapter.assets?.some((asset) => !asset.available)) issues.push({ code: "asset_missing", chapterId: chapter.id, message: `${chapter.title} has missing assets.` });
    if (!chapter.voices?.length) issues.push({ code: "voice_missing", chapterId: chapter.id, message: `${chapter.title} has no assigned voices.` });
    if (chapter.renderStatus === "failed") issues.push({ code: "render_failed", chapterId: chapter.id, message: `${chapter.title} has a failed render.` });
  });
  if (!novel.title?.trim() || !novel.author?.trim() || !novel.description?.trim()) issues.push({ code: "metadata_invalid", message: "Title, author, and description are required." });
  return { passed: issues.length === 0, checkedAt: new Date().toISOString(), issues };
}

export async function generateAudiobook(novel, handlers = {}, user) {
  assertAdmin(user, "regenerate audiobooks");
  const job = { id: id("job"), status: "running", startedAt: new Date().toISOString(), stages: [] };
  let result = copy(novel);
  for (const name of PRODUCTION_STAGES) {
    const stage = { name, status: "running", startedAt: new Date().toISOString() }; job.stages.push(stage);
    try { result = await (handlers[name] || (async (value) => value))(result); Object.assign(stage, { status: "completed", finishedAt: new Date().toISOString() }); }
    catch (error) { Object.assign(stage, { status: "failed", error: error.message, finishedAt: new Date().toISOString() }); job.status = "failed"; job.finishedAt = new Date().toISOString(); return { novel: { ...result, status: "In Production" }, job }; }
  }
  job.status = "completed"; job.finishedAt = new Date().toISOString();
  return { novel: { ...result, status: "Ready For Review" }, job };
}

export function approveChapter(novel, chapterId) {
  const chapter = novel.chapters.find((item) => item.id === chapterId);
  if (!chapter) throw new Error("Chapter not found.");
  if (!chapter.audio) throw new Error("Chapter audio is required before approval.");
  return updateChapter(novel, chapterId, { approved: true, locked: true });
}

export function regenerateChapter(novel, chapterId, audio, user) {
  assertAdmin(user, "regenerate chapters");
  const chapter = novel.chapters.find((item) => item.id === chapterId);
  if (!chapter) throw new Error("Chapter not found.");
  if (chapter.locked) throw new Error("Unlock the chapter before regenerating it.");
  return updateChapter(novel, chapterId, { previousAudio: chapter.audio, audio, approved: false, renderStatus: "completed" });
}

export function publishNovel(novel, user) {
  assertAdmin(user, "publish");
  const quality = qualityControl(novel);
  if (!quality.passed) { const error = new Error("Quality control failed."); error.quality = quality; throw error; }
  if (novel.chapters.some((chapter) => !chapter.approved)) throw new Error("Every chapter must be approved before publishing.");
  const number = (novel.versions.at(-1)?.number || 0) + 1;
  const snapshot = copy({ ...novel, versions: [] });
  const version = { number, publishedAt: new Date().toISOString(), snapshot };
  return { novel: { ...novel, status: "Published", currentVersion: number, versions: [...novel.versions, version], chapters: novel.chapters.map((chapter) => ({ ...chapter, published: true })) }, version, quality, updates: ["catalog", "audiobook", "metadata", "search", "cache", "latest releases"] };
}

export function rollbackNovel(novel, versionNumber, user) {
  assertAdmin(user, "rollback");
  const version = novel.versions.find((item) => item.number === versionNumber);
  if (!version) throw new Error(`Version ${versionNumber} not found.`);
  return { ...copy(version.snapshot), versions: copy(novel.versions), currentVersion: versionNumber, status: "Published", updatedAt: new Date().toISOString() };
}

export function createReport(type, payload) { return { id: id("report"), type, createdAt: new Date().toISOString(), payload: copy(payload) }; }
export function diagnostics(state) { return { healthy: !state.jobs.some((job) => job.status === "failed"), failedJobs: state.jobs.filter((job) => job.status === "failed").length, novels: state.novels.length, reports: state.reports.length, checkedAt: new Date().toISOString() }; }
