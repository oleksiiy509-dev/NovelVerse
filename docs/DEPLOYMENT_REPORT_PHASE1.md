# Phase 1 Deployment Report

The new GitHub Actions release gate installs from lockfiles and verifies frontend lint, build, and tests plus worker lint, build, and tests on Node 22. Workflow permissions are read-only, runs are timeout-bounded, and superseded branch runs are cancelled.

The worker container runs as a non-root user, persists only its disposable cache, restarts unless stopped, and now probes `/ready`. Deploy with rolling replacement: start a candidate, wait for readiness, route traffic, signal the old instance, and allow the configured drain deadline before force removal. Pin deployed image digests, retain the previous known-good digest, and roll back on readiness, error-rate, or latency regression.

Production promotion still requires manual checks outside CI: apply and verify database migrations in staging; validate Supabase RLS with reader/admin JWTs; confirm backups and a recent restore drill; scan dependencies/container; verify required secrets; and run post-deployment application, Telegram, worker, and provider smoke tests.
