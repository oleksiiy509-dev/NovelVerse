# Phase 1 Security Report

## Controls reviewed

- Frontend deployment guidance prohibits server/service-role secrets in Vite variables. Supabase authorization uses RLS and trusted `app_metadata`, not client-editable `user_metadata`.
- The worker uses bearer authentication outside explicit public health/provider routes, allow-listed development CORS origins, body size limits, rate limits, and non-root containers.
- Worker responses now add no-referrer and restrictive permissions headers. Internal cache paths are no longer returned in synthesis metadata. Unexpected server exceptions return a generic message and a correlation ID instead of implementation detail.
- CI uses read-only repository permissions and locked dependency installation.

## Operator requirements and residual risk

Set a high-entropy `TOKEN`; never deploy `change-me`. Terminate TLS at a trusted reverse proxy, restrict worker network ingress, rotate provider credentials, scan images/dependencies, and centralize logs with access controls and redaction. Process-local rate limits do not defend a horizontally scaled public endpoint. Public `/health` and `/providers` expose limited operational/provider availability by design; restrict them at the gateway if that information is sensitive.

No secret values were added. Dependency vulnerability status is environment- and date-sensitive and should be checked in CI with the organization's approved scanner and remediation policy.
