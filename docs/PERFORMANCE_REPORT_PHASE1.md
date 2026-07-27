# Phase 1 Performance Report

The prior render path called the provider even when an identical artifact already existed. It now checks the SHA-256-addressed cache first, eliminating repeat synthesis cost and latency. Queue concurrency prevents CPU-heavy synthesis from oversubscribing a host, while pending capacity bounds memory pressure. Cache age/size pruning bounds persistent disk growth.

Operators should baseline p50/p95/p99 request duration, queue depth, cache-hit ratio, provider duration, process RSS, event-loop lag, disk utilization, and error rate under representative text sizes. Initial queue defaults (2 active, 50 pending, 60-second timeout) are conservative, not universal targets. Tune concurrency against CPU cores and provider behavior; keep p95 queue wait below the client timeout and disk below 80%.

Database indexes in `202607270001_production_readiness.sql` cover known hot access paths. Index effectiveness must be validated in staging using production-like data and `EXPLAIN (ANALYZE, BUFFERS)`; source review alone cannot provide trustworthy latency numbers.
