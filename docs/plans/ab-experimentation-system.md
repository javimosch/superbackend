---
description: Generic A/B experimentation system (API + WS) for SuperBackend
---

# Goals

Create a generic experimentation (A/B/C/…) system that:

- Lets client apps **fetch assignment + configuration** via **HTTP API** and optionally **WebSocket**.
- Lets client apps **report events/outcomes** (conversions, revenue, latency, custom metrics) with enough metadata to compute experiment metrics over time.
- Provides an **admin UI** to view metrics, monitor health, and **auto-pick a winner** after a configured period.
- Exposes the **current winner** (and/or the current active variant) via API/WS.

# Constraints / leverage existing SuperBackend primitives

This plan explicitly reuses existing infrastructure:

- **JSON Configs**: `src/models/JsonConfig.js`, `src/services/jsonConfigs.service.js`
- **Global settings**: `src/services/globalSettings.service.js`
- **Crons**: `src/models/CronJob.js`, `src/services/cronScheduler.service.js` (DB-backed, admin UI exists)
- **Cache layer**: `src/services/cacheLayer.service.js`
- **Webhooks**: `src/models/Webhook.js`, `src/services/webhook.service.js`
- **WebSocket pattern**: `src/services/terminalsWs.service.js` attaches a `ws` server on Node `upgrade` under a fixed path.
- **Auth options**: Bearer JWT (`src/middleware/auth.js`) and Headless API tokens (`src/middleware/headlessApiTokenAuth.js`)

# Key concept: split “assignment/config delivery” from “analytics aggregation”

To keep the system generic and scalable:

- **Online path (hot)**: assignment/config fetch + result ingestion.
- **Offline path (cold)**: periodic aggregation + winner selection (cron), with caching of “winner snapshot”.

# Domain model (proposed)

## 1) Experiment
Represents an A/B test definition and rollout.

- `code` (string, unique per org)
- `name`, `description`
- `organizationId` (nullable for global experiments)
- `status`: `draft | running | paused | completed`
- `startedAt`, `endsAt` (or `evaluationPeriodDays`)
- `assignment`
  - `unit`: `anonId | userId | orgId | custom` (custom means client provides `subjectId`)
  - `sticky`: boolean (default true)
  - `salt`: string (default random)
- `variants`: array
  - `key`: `A|B|C|...` (string)
  - `weight`: number (traffic split)
  - `configRef`: reference to config payload
- `primaryMetric` and optional `secondaryMetrics`
  - metric definitions for aggregation (see “Metrics”)
- `winnerPolicy`
  - `mode`: `manual | automatic`
  - `pickAfterMs`: number
  - `minAssignments`: number
  - `minConversions`: number
  - `objective`: `maximize | minimize`
  - `statMethod`: `simple_rate | bayesian_beta` (start with simple, upgrade later)
  - `overrideWinnerVariantKey`: optional

## 2) Config payload representation (reuse JsonConfig)
Each variant’s “config” should be a JSON document.

Options:

- **Option A (recommended)**: Use existing `JsonConfig` as the authoritative store, and variants reference it by `slug`/`alias`.
  - Pro: admin editing + caching already exists.
  - Con: JsonConfig isn’t org-scoped today; we can encode org in slug/alias conventions or add a wrapper model later.

- **Option B**: Experiment stores raw JSON for each variant.
  - Pro: simplest dependency.
  - Con: duplicates config tooling and caching.

Plan assumes **Option A** to leverage existing service.

## 3) Assignment storage (sticky bucketing)
To ensure users stay in the same variant:

- Store `ExperimentAssignment` documents keyed by:
  - `experimentId`
  - `subjectKey` (normalized string: e.g. `user:123`, `anon:abcd`, `org:...`)

Fields:

- `variantKey`
- `assignedAt`
- `context` (optional: appVersion/platform)

Caching:

- Cache lookup in `cacheLayer.service` (namespace `experiments.assignments`).

## 4) Event ingestion (results dataset)
Clients report events/outcomes.

Two storage strategies:

- **Raw events (append-only)**: `ExperimentEvent` collection.
  - Pro: flexible, auditable, supports re-aggregation.
  - Con: can grow quickly.

- **Direct counters**: increment aggregated counters on write.
  - Pro: fast reads.
  - Con: less flexible, harder to correct.

Plan: start with **raw events + periodic aggregation** (cron), with retention controls.

`ExperimentEvent` fields:

- `experimentId`, `variantKey`
- `organizationId`
- `subjectKey`
- `eventKey` (string; e.g. `exposure`, `conversion`, `purchase`, `latency_ms`)
- `value` (number; default 1)
- `ts` (Date)
- `meta` (object: country, platform, appVersion, etc)

## 5) Aggregated metrics
Materialize per day/hour buckets for fast UI.

`ExperimentMetricBucket` fields:

- `experimentId`, `variantKey`
- `bucketStart` (Date)
- `bucketMs` (e.g. 1h or 1d)
- `counters` (object):
  - `exposures`
  - `conversions`
  - `sum`
  - `sumSq` (optional for variance)

Note: metrics should be general enough to support:

- **Rate metrics**: conversions/exposures
- **Sum metrics**: total revenue
- **Average metrics**: latency (sum/count)

# API surface (proposed)

## Authentication
Support two modes (similar to other subsystems):

- **Public client apps**: JWT Bearer (user-auth) *or* anonymous id (`x-anon-id` pattern similar to feature flags).
- **Server-to-server / headless**: Headless API token middleware (`headlessApiTokenAuth`).

Open question: should ingestion endpoints require headless token only to avoid abuse?

## Read: get assignment + config

`GET /api/experiments/:code/assignment`

Inputs:

- Subject identity:
  - `x-anon-id` and/or authenticated `req.user` (JWT)
  - optionally `subjectId` if we support `assignment.unit=custom`
- Optional `context`: `appVersion`, `platform`, etc

Returns:

- `experimentCode`
- `variantKey`
- `config` (resolved JSON)
- `assignedAt`
- `winner`: { `variantKey`, `decidedAt`, `policy` } (if available)

Caching:

- Cache assignment result per `experimentCode + subjectKey`.

## Write: report events/outcomes

`POST /api/experiments/:code/events`

Body examples:

- Single:
  - `{ "eventKey": "conversion", "value": 1, "ts": "...", "variantKey": "A" }`
- Batch:
  - `{ "events": [ ... ] }`

Server behavior:

- Validate `variantKey` belongs to experiment.
- If `variantKey` omitted, server can infer from stored assignment.
- Store `ExperimentEvent`.

Rate limiting:

- Reuse rate limiter service (pattern used in log/error reporting).

## Read: winner

`GET /api/experiments/:code/winner`

Returns:

- `status`: `running|completed|paused`
- `winnerVariantKey` (nullable)
- `decidedAt` (nullable)
- `metricsSummary` (optional)

# WebSocket surface (proposed)

Follow the existing `ws` pattern (`server.on('upgrade')`) rather than socket.io.

## WS path

- `/api/experiments/ws`

## Auth

- Use Bearer token OR `x-api-token`/`x-api-key` in headers.
- For browsers, if headers are hard: allow query param `token` (less ideal) or rely on cookie for anon.

## Messages

Client -> server:

- `{ "type": "subscribe", "experimentCode": "..." }`
- `{ "type": "unsubscribe", "experimentCode": "..." }`

Server -> client:

- `{ "type": "winner", "experimentCode": "...", "winnerVariantKey": "B", "decidedAt": "..." }`
- `{ "type": "metrics", "experimentCode": "...", "summary": {...} }` (optional)

Implementation detail:

- When winner changes (cron picks / manual override), broadcast to subscribers.

# Winner selection (cron-driven)

Use the existing Cron system rather than adding a bespoke scheduler.

## Strategy

- Nightly/hourly cron:
  - Aggregate raw events into metric buckets.
  - Evaluate winner for experiments in `running` status.
  - If `winnerPolicy.mode=automatic` and criteria met:
    - mark experiment winner.
    - optionally set experiment status to `completed`.

## Metrics evaluation (v1)

Start simple and deterministic:

- Primary metric `conversion_rate = conversions / exposures`
- Winner = variant with max conversion_rate
- Guardrails:
  - `minAssignments` and/or `minExposures`
  - `minConversions`
  - optional `minDelta` (absolute)

Upgrade path:

- Add Bayesian Beta-Binomial for conversion rates.
- Add sequential testing / p-value controls.

## Caching the winner

- Cache winner snapshot per experiment in `cacheLayer.service` (namespace `experiments.winner`).
- Invalidate cache on:
  - admin update
  - cron evaluation run

# Webhooks integration

Emit events using existing `WebhookService.emit`:

- `experiment.winner_changed`
- `experiment.status_changed`
- `experiment.metrics_threshold_reached` (optional)

Note: `Webhook` model currently has a fixed enum list; we will need to extend it to include experiment events when implementing.

# Admin UI requirements (high level)

A new admin section under `/admin` similar to other tooling (crons/cache/json-configs).

Pages:

- Experiments list
  - filter by org, status
  - quick view: winner, start/end, primary metric

- Experiment detail
  - definition editor (variants, weights, config refs)
  - metrics charts (bucketed)
  - assignment counts
  - manual override winner + force variant
  - audit trail

- Health/ops
  - event ingestion volume
  - aggregation lag

# Data retention & scale

- Raw events retention policy:
  - global default via `GlobalSetting` (e.g. `EXPERIMENT_EVENTS_RETENTION_DAYS`)
  - cron to delete old raw events

- Aggregated buckets retention:
  - longer retention, smaller size

# Locked decisions (confirmed)

1. **Tenancy**: experiments support **both global and per-organization** use.
2. **Identity / stickiness**: assignment uses a **client-provided subject id**, combined with `orgId` when per-organization.
3. **Security / auth**: allow **normal JWT** access, with authorization enforced via the existing **RBAC** system (`requireRight`).
4. **Metrics scope**: support **as much as possible** in v1 (rate + sum + average numeric metrics), while keeping aggregation bucketed.
5. **Winner policy behavior**: when a winner is chosen, keep the experiment **running**, but set `status=completed` and expose `winnerVariantKey`.

# Milestone plan (implementation phases)

1. **Core models + APIs**
   - Experiment CRUD (admin)
   - Assignment endpoint
   - Event ingestion endpoint

2. **Aggregation + winner cron**
   - metric buckets
   - automatic winner selection
   - cached winner endpoint

3. **Realtime updates**
   - WS subscribe + broadcast winner changes
   - webhook events

4. **Admin UI**
   - list/detail + charts
   - manual override

# Implementation notes (final)

## Core files

- Models:
  - `src/models/Experiment.js`
  - `src/models/ExperimentAssignment.js`
  - `src/models/ExperimentEvent.js`
  - `src/models/ExperimentMetricBucket.js`

- Services:
  - `src/services/experiments.service.js`
  - `src/services/experimentsAggregation.service.js`
  - `src/services/experimentsRetention.service.js`
  - `src/services/experimentsWs.service.js`
  - `src/services/experimentsCronsBootstrap.service.js`

- Controllers:
  - `src/controllers/experiments.controller.js`
  - `src/controllers/adminExperiments.controller.js`
  - `src/controllers/internalExperiments.controller.js`

- Routes:
  - `src/routes/experiments.routes.js`
  - `src/routes/adminExperiments.routes.js`
  - `src/routes/internalExperiments.routes.js`

- Middleware:
  - `src/middleware/internalExperimentsCronAuth.js`

## Endpoints

- Public (JWT + RBAC):
  - `GET /api/experiments/:code/assignment`
  - `POST /api/experiments/:code/events`
  - `GET /api/experiments/:code/winner`

- Admin:
  - `/api/admin/experiments/*`

- Internal cron:
  - `POST /api/internal/experiments/aggregate/run`
  - `POST /api/internal/experiments/retention/run`

## Runtime wiring

- Mounted in `src/middleware.js`:
  - `/api/experiments`
  - `/api/admin/experiments`
  - `/api/internal/experiments`

- WebSocket attachment in `router.attachWs(server)`:
  - `/api/experiments/ws`

- Startup cron bootstrap (after DB connect):
  - `require('./services/experimentsCronsBootstrap.service').bootstrap()`

