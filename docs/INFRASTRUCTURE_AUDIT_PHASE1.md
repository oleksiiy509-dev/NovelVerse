# Release Program Phase 1 — Infrastructure Audit

Date: 2026-07-27

## Executive summary

The browser application remains a static Vite deployment backed by Supabase. The local voice worker was the principal long-running process and therefore the focus of Phase 1 hardening. This phase adds bounded work admission, graceful termination, cache lifecycle controls, structured diagnostics, readiness reporting, and a reproducible CI gate without introducing user-facing behavior.

## Reliability and queue management

- Synthesis now runs through an in-process bounded queue. Concurrency, pending capacity, and job timeout are configurable; overload fails quickly with `queue_full` rather than allowing unbounded memory growth.
- The worker stops accepting queued work on `SIGTERM`/`SIGINT`, stops accepting connections, and has a forced shutdown deadline. Orchestrators should remove the instance through `/ready` before termination.
- This queue is intentionally node-local and non-durable. Production jobs that must survive host loss should remain in the existing Supabase-backed audio job pipeline; do not treat the preview worker cache as a job ledger.
- Cached audio is looked up before provider invocation. Writes use temporary files plus atomic rename, reducing partial artifacts after crashes.

## Storage and recovery

- Startup pruning applies maximum age and byte limits. The cache remains disposable and should be mounted on a dedicated volume with disk alerts.
- Generated source content and database state remain authoritative in Supabase. Cache loss affects latency only.
- Recovery runbook: stop routing traffic, inspect `/health` and structured logs using `requestId`, verify provider configuration, replace/restart the worker, then confirm `/ready` and a synthetic preview. Never repair corrupt cache entries in place; delete them and regenerate.

## Database review

The production-readiness migration enables RLS on commercial data, uses trusted JWT `app_metadata` for admin checks, and adds indexes for entitlement, billing, notification, listening, redemption, and reading-progress access paths. Before release, apply migrations to staging and capture `EXPLAIN (ANALYZE, BUFFERS)` for each hot query with production-like cardinality. Track unused/duplicate indexes and table/index bloat quarterly through Supabase/Postgres statistics.

## Backup strategy

1. Enable Supabase point-in-time recovery where the selected plan supports it; otherwise schedule daily logical backups with `supabase db dump`/`pg_dump` to encrypted, versioned object storage in a separate account or project.
2. Retain 7 daily, 5 weekly, and 12 monthly copies. Encrypt in transit and at rest, restrict restore credentials, and alert on missing or unexpectedly small artifacts.
3. Back up schema and roles separately from data. Do not include secrets in repository artifacts or CI logs.
4. Perform a quarterly restore into an isolated project. Validate row counts, RLS policies, storage-object references, authentication integration, and application smoke tests; record recovery time and recovery point achieved.
5. Configure object-storage versioning/lifecycle for irreplaceable uploaded assets. Do not back up the voice cache.

## Remaining risks

- A multi-replica or restart-safe worker queue requires a durable broker and idempotent job records.
- Rate limiting is process-local; deploy an edge/gateway limiter before exposing multiple replicas publicly.
- Backup enablement and restore drills require operator access and cannot be verified from source control.
