# AI Audiobook Pipeline v1

The pipeline is a resumable, local-first orchestrator for the existing NovelVerse audio engines. It executes a directed acyclic graph and stores both the latest run state and every stage output. The Audio Studio exposes the graph, stage progress, controls, errors, cache hits, and the final execution report.

## Stage graph

```text
Chapter Analysis ─┬─> Character Analysis ─┐
                  └───────────────────────┴─> Narration Planning ─> Production Planning ─> Sound Design ─┐
                                             └──────────────────────────────> Voice Rendering ─────────┼─> Mixer Preparation ─> Final Mix ─> Export
```

## Cache and dependency tracking

Each stage receives a deterministic fingerprint of its configuration, dependency fingerprints, dependency outputs, and (for Chapter Analysis) source content. Cached outputs are stored under the pipeline/project, stage, and fingerprint. An unchanged completed stage is skipped. A changed source invalidates Chapter Analysis and its descendants; a stage configuration change naturally produces a new fingerprint only for that stage and its descendants. This permits cache reuse across reloads and process restarts.

## Recovery and preservation

Run snapshots are persisted after each progress or status update. A failed run can restart at the failed stage, while pause and resume stop safely between stages and cancel prevents later stages from starting. Full restart is an explicit force operation. Handlers receive a protected-state snapshot containing manual voice edits, mixer edits, asset assignments, locked scenes, and locked clips. Planning also uses the existing non-destructive merge and lock behavior.

The report records wall-clock execution time, completed, skipped, and regenerated stages, plus structured warnings and errors.

## Known limitations

- v1 orchestration and cache storage are browser-local; there is no cross-device or server-side job coordinator.
- Cancellation is cooperative between stages. A provider already processing a request must implement its own abort behavior to stop immediately.
- Default browser handlers create plans and manifests, but actual voice synthesis, final rendering, and file delivery require the existing renderer callbacks to be supplied.
- Cache eviction and storage quotas rely on browser storage policy; automatic least-recently-used cleanup is not included in v1.
