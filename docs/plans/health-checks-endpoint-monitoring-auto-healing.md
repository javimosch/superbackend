# Plan: Health Checks — Endpoint monitoring & auto-healing

Status: **DRAFT** (analysis + plan only; no implementation)

Last updated: **2026-01-23**

## 0) Context: what exists today (relevant anchors)

- **Health endpoint already exists**: `GET /health` is defined in `src/middleware.js` and returns:
  - `status: "ok"`
  - `mode: "middleware"`
  - `database: "connected"|"disconnected"` (based on `mongoose.connection.readyState`).

- **Cron scheduler exists** (`src/services/cronScheduler.service.js`) and is started after Mongo connects (see `src/middleware.js`).
  - Models: `CronJob` + `CronExecution`.
  - Supported tasks: **script** (via scripts runner) and **http** (via `fetch`).

- **Notifications system exists** (docs + admin routes), which we can reuse for alerting.

- **Console override writes to a repo-local log**: `stdout.log` exists and the console override service logs there (per stdout.log tail).

This plan proposes a new **Health Checks module** that feels like the Cron module (admin UI + admin API + scheduler), but adds health-specific semantics: evaluation, incidents, alerting, and optional auto-healing.

---

## 1) Goals / non-goals

### Goals
1. **Monitor HTTP endpoints** (internal and/or external) on a schedule.
2. **Persist run history** (latency, status code, excerpted body, timing).
3. **Detect incidents** using configurable thresholds (e.g., N consecutive failures).
4. **Alert** (in-app + optional email) when incidents open/resolve/escalate.
5. **Auto-heal (optional + guarded)** by dispatching configured remediation actions (HTTP call and/or existing Script runner).
6. Provide a **basic-auth admin UI** similar to `/admin/crons`.

### Non-goals (initially)
- Full Prometheus/OpenTelemetry metric export.
- Public status page + subscriber management (could be Phase 2/3).
- Process-level restart from within the same Node process (we can *request* a restart via an external webhook/orchestrator, but not restart ourselves safely).

---

## 2) Product shape (what the user/admin can do)

### Admin user stories
- Create health check: “Ping `https://api.example.com/healthz` every minute; expect 200; max latency 1s.”
- View overview dashboard: healthy/warning/critical checks, open incidents, last run times.
- Drill into a check: view last N runs, charts (basic), and current incident state.
- Trigger a check manually.
- Enable/disable checks.
- Configure alert policy (notify on open/resolved; only after N fails; escalation).
- Configure remediation (auto-heal) for a check:
  - After incident opens, wait X seconds; attempt up to M times with backoff.
  - Remediation action options:
    - HTTP request (e.g., to Coolify/Render/your orchestrator)
    - Run ScriptDefinition (reuse Scripts module)

---

## 3) Recommended architecture

### 3.1 Components
- `healthChecksScheduler.service.js`
  - Loads enabled checks on startup.
  - Schedules them using `node-cron` (same approach as `cronScheduler.service.js`).
  - Executes checks and records runs.
  - Updates incident state machine.

- `healthChecks.service.js`
  - Core business logic:
    - Normalize/check input
    - Execute a check (HTTP/script)
    - Evaluate results
    - Transition incidents
    - Enqueue notifications
    - Dispatch remediation actions

- `adminHealthChecks.controller.js` + `adminHealthChecks.routes.js`
  - Mirrors patterns from `adminCrons.controller.js` and `adminCrons.routes.js`.

- `admin-health-checks.ejs`
  - Mirrors the style/layout of existing admin pages.

### 3.2 Reuse vs duplication: how to leverage existing Cron runner
Health checks are very close to Cron “http” and “script” tasks, but have extra semantics.

**Recommendation:** keep Health Checks as its own module/models for clarity, but **refactor execution helpers** out of Cron so both systems share:
- `runHttpTask({ method, url, headers, body, auth, timeoutMs })`
- `runScriptTask({ scriptId, envOverrides, timeoutMs })`

This avoids duplicating fetch/script-running code while preserving a clean separation between:
- “cron jobs” (automation tasks)
- “health checks” (monitoring + incidents + alerting + remediation)

(Plan only; exact refactor depends on your preference.)

---

## 4) Data model proposal (Mongo / Mongoose)

### 4.1 HealthCheck
Collection: `health_checks`

Key fields:
- `name`, `description`
- `enabled`
- `schedule`:
  - `cronExpression` (5-field)
  - `timezone` (default UTC)
  - `nextRunAt`
- `checkType`: `'http' | 'script' | 'internal'`

HTTP check config:
- `httpMethod`, `httpUrl`
- `httpHeaders[]`
- `httpAuth` (bearer/basic/none)
- `timeoutMs`

Script check config:
- `scriptId` (ref ScriptDefinition)
- `scriptEnv[]`
- `timeoutMs`

Evaluation policy:
- `expectedStatusCodes` (default: `[200]`)
- `maxLatencyMs` (optional)
- `bodyMustMatch` / `bodyMustNotMatch` (optional regex or substring policy)
- `failureThreshold`:
  - `consecutiveFailuresToOpen` (default e.g. 3)
  - `consecutiveSuccessesToResolve` (default e.g. 2)
- `retry`:
  - `retries` (default 0)
  - `retryDelayMs` (default 0)

Alert policy:
- `notifyOnOpen` / `notifyOnResolve` / `notifyOnEscalation`
- `notificationChannels`: `in_app | email | both`
- `notifyAdminUserIds[]` (optional, else broadcast to admins)

Remediation policy (auto-heal):
- `autoHealEnabled` (default false)
- `autoHeal`:
  - `cooldownMs` (min time between attempts)
  - `maxAttemptsPerIncident`
  - `backoffPolicy` (fixed/exponential)
  - `actions[]` (ordered)
    - action type: `http | script | notify_only`
    - action payload: (url/method/headers/auth) OR (scriptId/env)

Operational fields:
- `lastRunAt`, `lastStatus` (`healthy|unhealthy|unknown`)
- `currentIncidentId` (nullable)

### 4.2 HealthCheckRun
Collection: `health_check_runs`

- `healthCheckId`
- `status`: `healthy|unhealthy|timed_out|error`
- Timing:
  - `startedAt`, `finishedAt`, `durationMs`
- HTTP results (if applicable):
  - `httpStatusCode`, `responseHeaders` (optional), `responseBodySnippet` (capped)
- Error fields:
  - `errorMessage`

Indexes:
- `{ healthCheckId: 1, startedAt: -1 }`
- `{ status: 1, startedAt: -1 }`

### 4.3 HealthIncident
Collection: `health_incidents`

- `healthCheckId`
- `status`: `open|acknowledged|resolved`
- `severity`: `warning|critical`
- `openedAt`, `acknowledgedAt`, `resolvedAt`
- `lastSeenAt`
- `consecutiveFailureCount`, `consecutiveSuccessCount`
- `lastRunId`
- `summary` / `lastError`

### 4.4 AutoHealAttempt
Collection: `health_autoheal_attempts`

- `healthCheckId`, `incidentId`
- `attemptNumber`
- `startedAt`, `finishedAt`, `status` (`succeeded|failed`)
- `actionResults[]` with per-action output/error

---

## 5) Execution & incident state machine

### 5.1 Run execution
For each scheduled run:
1. Create `HealthCheckRun(status=running)` (or `startedAt` only).
2. Execute check (HTTP or script).
3. Record outcome + duration.
4. Feed outcome into incident logic.

### 5.2 Incident logic (default)
- If run is unhealthy:
  - Increment failure streak; reset success streak.
  - If no incident and failure streak >= `consecutiveFailuresToOpen` → **open incident**.
- If run is healthy:
  - Reset failure streak; increment success streak.
  - If incident open/acknowledged and success streak >= `consecutiveSuccessesToResolve` → **resolve incident**.

### 5.3 Auto-heal trigger
- Only if `autoHealEnabled=true`.
- Trigger after incident opens (or on escalation) with guardrails:
  - cool down between attempts
  - maximum attempts per incident
  - optional “wait X seconds after open before first attempt”

---

## 6) Admin API surface (proposal)

All routes basic-auth protected, consistent with existing admin modules.

Base: `/api/admin/health-checks`

- `GET /` list checks (include lastStatus/lastRunAt/currentIncident)
- `POST /` create
- `GET /:id` get
- `PUT /:id` update
- `DELETE /:id` delete
- `POST /:id/enable`
- `POST /:id/disable`
- `POST /:id/trigger` (manual run)
- `GET /:id/runs` (paginated)
- `GET /:id/incidents` (paginated)
- `POST /:id/incidents/:incidentId/acknowledge`
- `POST /:id/incidents/:incidentId/resolve` (manual)
- `POST /:id/auto-heal/trigger` (manual remediation)

Optional (later): `/api/admin/health-checks/overview` for dashboard counts.

---

## 7) Admin UI surface (proposal)

- Page: `${adminPath}/health-checks` (EJS)
  - Overview cards: total checks, healthy, unhealthy, open incidents, last 24h failures
  - Table: checks with last status, last run, next run, enable toggle
  - Per-check detail drawer/page:
    - run history
    - current incident
    - config (edit)
    - remediation config

Implementation pattern should mirror the existing `/admin/crons` and related API.

---

## 8) Security & safety considerations (important)

### SSRF / outbound HTTP risk
If Health Checks can call arbitrary URLs, this becomes an SSRF surface.

Mitigations to decide upfront:
- Allowlist domains (e.g., `HEALTHCHECK_URL_ALLOWLIST=example.com,api.example.com`).
- Block private IP ranges and `localhost` unless explicitly enabled.
- Cap response size for stored body snippets.

### Secret storage
- HTTP auth tokens/passwords should not be stored as plain text if possible.
- Recommend reusing existing encryption utilities (see `src/utils/encryption.js`) + `SUPERBACKEND_ENCRYPTION_KEY`.

### Multi-instance scheduling
Today, cron scheduler runs in-process; in multi-replica deployments this can lead to duplicate runs.

Options:
1. **Accept duplicates** (simplest; may be OK for health checks).
2. Add **Mongo-based leader election/lease** per health check run window.

---

## 9) Observability / logging

- Log run + incident transitions to existing logging (console override → `stdout.log`).
- Optionally add ActivityLog / AuditEvent entries for:
  - creating/updating checks
  - incident open/resolve
  - auto-heal attempts

---

## 10) Phased delivery plan (recommended)

### Phase 1 — MVP monitoring (no incidents)
- Models: HealthCheck, HealthCheckRun
- Scheduler: run checks and store history
- Admin API + basic UI list + manual trigger

### Phase 2 — Incidents
- Add HealthIncident model
- Incident state machine + UI

### Phase 3 — Alerting
- Integrate Notifications system (in-app + optional email)
- Add “notify on open/resolve” policy

### Phase 4 — Auto-healing
- Add remediation config + AutoHealAttempt model
- Guardrails + manual trigger

### Phase 5 — Multi-instance safety (if needed)
- Add leader/lease mechanism or dedupe strategy

---

## 11) Decisions locked in (2026-01-23)

1. **Scope**: health checks support **arbitrary external URLs** configured by an admin.
2. **Multi-instance**: **no** leader election / dedupe required.
3. **Remediation types**: auto-heal supports **HTTP actions + ScriptDefinitions**.
4. **Outbound URL allowlist**: not required (admin can point to any URL).
5. **Secret handling**: auth secrets are stored via **Global Settings (type=`encrypted`)** and referenced from HealthCheck docs.
6. **Recipients**: notifications are **customizable** per-check.
7. **Incident lifecycle**: acknowledge is first-class; acknowledgements **suppress notifications** (except resolve).
8. **Retention**: weekly cleanup script + a seeded CronJob (disabled by default) that deletes run history older than **30 days**.
9. **UI**: simple table + run history.
10. **Public status**: an unauthenticated status summary endpoint is required, **disabled by default**, toggleable from Health Checks UI via a Global Setting.

---

## 12) Implementation notes (as built)

### Key code paths
- Models:
  - `src/models/HealthCheck.js`
  - `src/models/HealthCheckRun.js`
  - `src/models/HealthIncident.js`
  - `src/models/HealthAutoHealAttempt.js`
- Core execution + incidents + notifications + auto-heal:
  - `src/services/healthChecks.service.js`
- Scheduler:
  - `src/services/healthChecksScheduler.service.js`
- Bootstrap (seeding public-status setting + cleanup script + cleanup cron):
  - `src/services/healthChecksBootstrap.service.js`

### Routes
- Admin API (basic auth):
  - `src/routes/adminHealthChecks.routes.js` mounted at `/api/admin/health-checks`
- Public status endpoint (gated):
  - `src/routes/healthChecksPublic.routes.js` mounted at `/api/health-checks`
  - `GET /api/health-checks/status`

### Admin UI
- `views/admin-health-checks.ejs` served at `${adminPath}/health-checks`
- Dashboard nav entry added in `views/partials/dashboard/nav-items.ejs`

### Startup wiring
- `src/middleware.js` starts:
  - cron scheduler
  - health checks scheduler
  - health checks bootstrap (seeding)

### Public status toggle
- Global setting key: `healthChecks.publicStatusEnabled` (type=`boolean`)

### Cleanup retention
- ScriptDefinition codeIdentifier: `health-checks-cleanup-history`
- Seeded CronJob name: `Health Checks: Cleanup run history` (disabled by default)
