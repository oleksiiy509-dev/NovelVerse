# AI Brain

Phase 5 adds a provider-independent AI knowledge layer in `src/lib/aiBrain/`. The exported contract includes `analyzeChapter()`, `extractCharacters()`, `resolveAliases()`, `extractRelationships()`, `extractCharacterStates()`, `buildVoiceEvolution()` and `buildStoryContext()`.

No external LLM is connected. The local provider is deterministic and uses transparent rules so chapters can be analyzed offline and in tests. It produces character profiles, alias review candidates, relationship edges, append-only timeline states, compact story contexts and contradiction warnings.

## Pipeline

chapter text → entity detection → speaker/alias resolution → state extraction → relationship extraction → timeline update → cast update → Director input.

Low-confidence identity matches are written to a review queue instead of being merged automatically.
