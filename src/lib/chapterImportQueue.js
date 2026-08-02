import { chapterNumber } from "./bookImportMerge.js";
export const DEFAULT_IMPORT_BATCH_SIZE = 100;
export const MAX_IMPORT_BATCH_SIZE = 100;

export function normalizeBatchSize(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_IMPORT_BATCH_SIZE;
  return Math.max(1, Math.min(MAX_IMPORT_BATCH_SIZE, Math.floor(number)));
}

export function prepareQueuedChapters(chapters = [], reservedNumbers = []) {
  const seen = new Set(reservedNumbers.map(Number));
  const additions = [];
  let skipped = 0;
  chapters.forEach((chapter, index) => {
    const number = chapterNumber(chapter, index);
    if (seen.has(number)) { skipped += 1; return; }
    seen.add(number);
    additions.push({ number, title: chapter.title, content: chapter.content });
  });
  return { additions, skipped, numbers: [...seen] };
}

export const compareImportFiles = (left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });

export function createQueueFiles(files = []) {
  return [...files].sort(compareImportFiles).map((file, index) => ({
    id: `${Date.now()}-${index}-${file.name}`, name: file.name, file, status: "queued", detected: 0,
    added: 0, skipped: 0, failed: 0, durationMs: 0, completedBatches: 0, totalBatches: 0, chapters: null, error: "",
  }));
}

export function importPreview(files = [], currentChapterCount = 0) {
  const totals = queueTotals(files);
  return {
    current: currentChapterCount,
    detected: totals.detected,
    duplicates: totals.skipped,
    additions: Math.max(0, totals.detected - totals.skipped),
    finalTotal: currentChapterCount + Math.max(0, totals.detected - totals.skipped),
  };
}

export function queueTotals(files = []) {
  return files.reduce((totals, file) => ({
    detected: totals.detected + file.detected, added: totals.added + file.added,
    skipped: totals.skipped + file.skipped, failed: totals.failed + file.failed,
    completed: totals.completed + (file.status === "completed" ? 1 : 0),
    failedFiles: totals.failedFiles + (file.status === "failed" ? 1 : 0),
  }), { detected: 0, added: 0, skipped: 0, failed: 0, completed: 0, failedFiles: 0 });
}

export function estimateRemaining(startedAt, completedChapters, totalChapters) {
  if (!startedAt || !completedChapters || totalChapters <= completedChapters) return 0;
  return ((Date.now() - startedAt) / completedChapters) * (totalChapters - completedChapters);
}

export function formatDuration(milliseconds = 0) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}
