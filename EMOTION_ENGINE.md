# NovelVerse AI Emotion Engine v1

The Emotion Engine performs deterministic, local sentence analysis. It stores the original sentence text and source offsets alongside expressive metadata; it never rewrites chapter content.

## Metadata

Every sentence receives an emotion (`neutral`, `happy`, `sad`, `angry`, `fear`, `surprise`, `suspense`, `mystery`, `excitement`, or `calm`), intensity from 0–100, pitch/rate/pause modifiers, emphasis, breathing, energy, and whisper level. Context flags identify emotional climaxes, tense dialogue, internal monologue, battles, comedy, romance, and horror.

## Timeline, preview, and overrides

Emotion Studio plots sentence intensity in source order. Selecting a point opens its metadata editor and browser Speech Synthesis preview. An edit marks the sentence as a manual override. Stable sentence identifiers let overrides survive re-analysis while unchanged sentences keep the source text and offsets produced by the current chapter.

Saved metadata uses the versioned local-storage key `novelverse.emotions.v1:<chapter-id>`. The report summarizes emotion distribution, context counts, average intensity, the peak, and manual override count.

## Known limitations

- v1 uses transparent English keyword and punctuation heuristics rather than a hosted language model.
- Browser Speech Synthesis approximates pitch, rate, and energy; final provider support for pauses, breathing, emphasis, and whispering varies.
- Moving or editing a sentence changes its stable identifier, so its previous override is intentionally not applied to different source text.
- Metadata is stored per browser. Server synchronization can be added in a later schema version.
