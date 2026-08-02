export function chapterNumber(chapter, index = 0) {
  const explicit = Number(chapter?.number);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  const match = String(chapter?.title || "").match(/(?:chapter|chap(?:ter)?\.?|глава|розділ|частина)\s*#?\s*(\d+)/i);
  return match ? Number(match[1]) : index + 1;
}

export function planChapterMerge(chapters = [], existingNumbers = []) {
  const seen = new Set(existingNumbers.map(Number).filter(Number.isFinite));
  const additions = [];
  let skipped = 0;
  chapters.forEach((chapter, index) => {
    const number = chapterNumber(chapter, index);
    if (seen.has(number)) { skipped += 1; return; }
    seen.add(number);
    additions.push({ ...chapter, number });
  });
  additions.sort((left, right) => left.number - right.number);
  return { additions, skipped };
}
