# Health Checks

## What it is

Health Checks is an admin-managed monitoring system that:

- Runs scheduled checks (HTTP or Script) via `node-cron`
- Stores run history (latency, status code, reason)
- Opens/incidents and resolves them based on consecutive failure/success thresholds
- Sends notifications (in-app/email/both) to configured recipients
- Optionally executes auto-heal (remediation) actions
- Exposes an optional public (unauthenticated) status summary endpoint

The base `/health` endpoint (`GET /health`) still exists separately and reports SuperBackend process + DB connectivity.

---

## Admin UI

- Route: `${adminPath}/health-checks`
- Auth: admin basic auth

UI is intentionally minimal:
- List checks
- Create/edit checks (HTTP or Script)
- Trigger a check manually
- Enable/disable checks
- View run history
- Toggle the public status endpoint

File: `views/admin-health-checks.ejs`

Navigation entry: `views/partials/dashboard/nav-items.ejs`

---

## Admin API

Base: `/api/admin/health-checks` (basic auth)

### Config
- `GET /config`
  - Returns whether the public status endpoint is enabled
- `PUT /config`
  - Body: `{ "publicStatusEnabled": boolean }`

### Checks
- `GET /` list checks
- `POST /` create check
- `GET /:id` get check
- `PUT /:id` update check
- `DELETE /:id` delete check

### Scheduling controls
- `POST /:id/enable`
- `POST /:id/disable`
- `POST /:id/trigger` (manual run)

### History
- `GET /:id/runs` (paginated)
- `GET /:id/incidents` (paginated)
- `POST /:id/incidents/:incidentId/acknowledge`
- `POST /:id/incidents/:incidentId/resolve`

---

## Public status endpoint (optional)

Base: `/api/health-checks`

- `GET /status`

### Content types

The status endpoint supports two output modes:

- **JSON** (default)
- **HTML UI** (Tailwind CDN + DaisyUI CDN)

You can request HTML via:

- `Accept: text/html`, or
- query string: `?view=ui` (also accepts `?format=html`)

This endpoint is **disabled by default**.

When disabled, it returns `404`.

Enable it via:
- Health Checks UI toggle, or
- Global Setting key `healthChecks.publicStatusEnabled`.

The response returns an overall status plus per-check summary **without leaking secrets**.

---

## Secrets and encrypted storage

HTTP auth secrets are not stored directly in HealthCheck documents.

Instead:
- HealthCheck stores references to encrypted Global Settings keys:
  - `httpAuth.tokenSettingKey` for bearer
  - `httpAuth.passwordSettingKey` for basic
- The secret values are stored as `GlobalSetting.type = "encrypted"`.

Encryption key requirement:
- `SUPERBACKEND_ENCRYPTION_KEY` (or legacy `SAASBACKEND_ENCRYPTION_KEY`) must be configured to use encrypted settings.

---

## Scheduling & execution

- The scheduler starts after MongoDB connects in `src/middleware.js`.
- Enabled checks are loaded from Mongo on startup.

Check execution (high level):
- Create `HealthCheckRun(status=running)`
- Execute HTTP or Script
- Evaluate outcome (expected status codes, max latency, optional body regex)
- Update streak counters on `HealthCheck`
- Open/escalate/resolve incidents
- Optionally notify and attempt auto-heal

---

## Incident lifecycle

Incidents are created/resolved based on streaks:
- `consecutiveFailuresToOpen`
- `consecutiveSuccessesToResolve`

Acknowledge is a first-class incident state.
- When acknowledged, notifications are suppressed (resolve notifications still send).

---

## Auto-heal (remediation)

Auto-heal is optional per check.

Supported action types:
- HTTP
- Script (ScriptDefinition)
- notify_only

Guardrails:
- cooldown between attempts
- max attempts per incident

---

## Retention cleanup (seeded)

On startup, a bootstrap runs to seed:

- A cleanup ScriptDefinition:
  - `codeIdentifier`: `health-checks-cleanup-history`
  - Deletes `health_check_runs` older than 30 days (default)
  - Retention can be overridden via env var `HEALTHCHECKS_RETENTION_DAYS`

- A CronJob (disabled by default):
  - Name: `Health Checks: Cleanup run history`
  - Weekly schedule: `0 3 * * 0` (UTC)

Bootstrap: `src/services/healthChecksBootstrap.service.js`
