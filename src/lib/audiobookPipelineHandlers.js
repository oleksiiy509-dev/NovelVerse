import { createAudioStudioProjectFromChapter, mergeManualEdits } from "./aiAudioStudio.js";
import { createProductionPlan } from "./aiProductionEngine.js";
import { createSoundDesignPlan } from "./soundDesignEngine.js";
import { buildMixerProject, buildPreviewManifest } from "./audioMixer.js";

const progress = (update, value, result) => { update(value); return result; };

export function createAudiobookPipelineHandlers({ existingProject = null, existingMixerProject = null, renderVoices = null, renderFinalMix = null, exportMix = null } = {}) {
  return {
    "chapter-analysis": async ({ source, updateProgress }) => progress(updateProgress, 100, createAudioStudioProjectFromChapter(source)),
    "character-analysis": async ({ dependencies, updateProgress }) => progress(updateProgress, 100, dependencies["chapter-analysis"].registry),
    "narration-planning": async ({ dependencies, updateProgress }) => progress(updateProgress, 100, mergeManualEdits(dependencies["chapter-analysis"], existingProject)),
    "production-planning": async ({ dependencies, updateProgress }) => progress(updateProgress, 100, createProductionPlan(dependencies["narration-planning"], { previousPlan: existingProject?.productionPlan })),
    "sound-design": async ({ dependencies, updateProgress }) => progress(updateProgress, 100, createSoundDesignPlan(dependencies["production-planning"], dependencies["narration-planning"], { previousPlan: existingProject?.soundPlan, mixerProject: existingMixerProject })),
    "voice-rendering": async ({ dependencies, updateProgress, protectedState }) => renderVoices ? renderVoices(dependencies["narration-planning"], { updateProgress, protectedState }) : progress(updateProgress, 100, { project: dependencies["narration-planning"], rendered: false, warning: "Voice renderer was not configured." }),
    "mixer-preparation": async ({ dependencies, updateProgress }) => progress(updateProgress, 100, buildMixerProject(dependencies["voice-rendering"].project || dependencies["voice-rendering"], existingMixerProject)),
    "final-mix": async ({ dependencies, updateProgress }) => renderFinalMix ? renderFinalMix(dependencies["mixer-preparation"], { updateProgress }) : progress(updateProgress, 100, { mixerProject: dependencies["mixer-preparation"], manifest: buildPreviewManifest(dependencies["mixer-preparation"]), rendered: false }),
    export: async ({ dependencies, updateProgress }) => exportMix ? exportMix(dependencies["final-mix"], { updateProgress }) : progress(updateProgress, 100, { ...dependencies["final-mix"], exported: false }),
  };
}
