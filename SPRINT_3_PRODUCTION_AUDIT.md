# Sprint 3 – Production Audit

## Issues found and fixed

| Area | Finding | Resolution |
| --- | --- | --- |
| Navigation | The route registry omitted `/admin/legacy` and `/admin/languages`, so route validation and consumers disagreed with the router. | Added both mounted routes to the canonical registry and regression coverage. |
| Broken buttons | Project Manager’s **Open** button had no action. | It now opens the pipeline view and starts the selected project, with status feedback. |
| Broken navigation | Offline items with no chapters navigated to `/reader/undefined`. | The reader action is disabled and explains that no chapter is available. |
| Loading states | Admin edit pages represented failed requests as permanent loading. | Added an explicit reusable loading/data/error state hook and retry UI. |
| Loading states | Pipeline launch could be invoked repeatedly with no progress feedback. | Added a busy state, disabled re-entry, and visible “Starting…” feedback. |
| Error states | Downloads silently converted storage failures into an empty library. | Storage/read/delete errors now render actionable error messages and retry UI. |
| Error states | Continue Reading silently hid backend/storage failures as an empty history. | Errors are now distinct from a legitimate empty state. |
| Accessibility | Reading progress was visual-only. | Added progressbar semantics, label, bounds, and current value. |
| Accessibility | Dynamic pipeline feedback was not announced. | Added a polite live status region and `aria-busy`. |
| Accessibility | Loading and retry surfaces lacked consistent status/alert semantics. | Added status, alert, busy, and loading labels where applicable. |
| Duplicate logic | Novel and chapter edit screens duplicated their Supabase loading logic. | Consolidated record retrieval, rejection handling, cleanup, and retry behavior in `useAdminRecord`. |
| Dead behavior | The no-op Project Manager button was effectively dead UI. | Connected it to the existing pipeline; no new feature was introduced. |
| Performance | Repeated pipeline clicks could enqueue duplicate concurrent work. | Busy-state guarding prevents duplicate launches from this screen. |
| Unused imports | The edit pages imported React state/effect and Supabase solely for duplicate inline loaders. | Removed those imports after consolidation. |
| UI consistency | Edit-page errors used browser alerts while other pages use in-page states. | Replaced alerts with the application’s `error-state` pattern and retry buttons. |

## Audit method

The audit covered the mounted route map, navigation targets, interactive JSX controls, asynchronous page loaders, status/error surfaces, accessibility semantics, repeated request behavior, and lint/test/build scripts. Existing lazy route loading, global render recovery, network status, not-found handling, and code-split page architecture were verified and retained.
