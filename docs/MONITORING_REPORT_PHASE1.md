# Phase 1 Monitoring Report

The worker exposes liveness at `/health`, readiness at `/ready`, authenticated JSON diagnostics at `/metrics`, and structured one-line JSON request logs. Responses carry `X-Request-Id`; a valid inbound ID is propagated for end-to-end correlation. Metrics include request/error/rate-limit/queue rejection/cache counters, aggregate latency, queue state, and uptime.

Recommended alerts: readiness failure for two intervals; 5xx rate above 2% for five minutes; any sustained queue saturation; p95 latency above the client timeout budget; cache or volume above 80%; restart loops; backup failure; and provider unavailability. Scrape/transform the JSON endpoint only on a protected network and ship stdout to centralized storage. Avoid high-cardinality labels such as full URLs, text, tokens, or user identifiers.

The endpoint is a process snapshot, not a durable time-series store. Counters reset on restart; production monitoring must collect them externally.
