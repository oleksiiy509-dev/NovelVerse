import { firstChapterWithSegments, loadSavedVoiceDirector } from "./voiceDirectorStorage.js";

/** Open Audio Production from the one director persisted by Voice Direction. */
export function openAudioProduction(book, storage = globalThis.localStorage) {
  const director = loadSavedVoiceDirector(book?.id, storage);
  const chapter = director ? firstChapterWithSegments(book?.chapters, director.segments) : undefined;
  return { director, chapter, segments: director?.segments || [] };
}

export function audioProductionBlockers({ chapter, segments = [], worker = {} }) {
  const chapterSegments = segments.filter((segment) => String(segment.chapterId) === String(chapter?.id));
  return [
    !chapter && "No chapter is selected.",
    chapter && !chapterSegments.length && "No narration segments are assigned to this chapter.",
    chapterSegments.some((segment) => typeof segment.text !== "string" || !segment.text.length) && "Every narration segment must contain chapter text.",
    worker.label === "Offline" && `Local voice worker is offline: ${worker.detail}`,
    worker.label === "Error" && `Local voice worker health check failed: ${worker.detail}`,
  ].filter(Boolean);
}

export function startChapterRender(render, payload) {
  return render(payload);
}
