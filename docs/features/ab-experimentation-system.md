# A/B experimentation system

## Overview

This feature provides a generic experimentation system (A/B/C/...) that supports:

- Fetching a subject’s variant assignment and variant config via HTTP.
- Reporting experiment events/outcomes over time.
- Aggregating events into time buckets for analysis.
- Automatic winner selection based on experiment policy.
- Realtime winner updates via WebSocket.
- Optional webhook emission when the winner changes.

## Data model

## Experiment (`experiments`)

- **organizationId**: `ObjectId | null` (null = global)
- **code**: string (unique per organizationId)
- **status**: `draft | running | paused | completed`
- **variants[]**:
  - **key**: string
  - **weight**: number
  - **configSlug**: string (references JsonConfig by `slug` or `alias`)
- **primaryMetric** / **secondaryMetrics[]**:
  - **kind**: `count | sum | avg | rate`
  - **key**: metric/event key (for non-rate)
  - **numeratorEventKey** / **denominatorEventKey** (for rate)
  - **objective**: `maximize | minimize`
- **winnerPolicy**:
  - **mode**: `manual | automatic`
  - **pickAfterMs**
  - **minAssignments**
  - **minExposures**
  - **minConversions**
  - **overrideWinnerVariantKey**
- **winnerVariantKey**, **winnerDecidedAt**, **winnerReason**

## ExperimentAssignment (`experiment_assignments`)

Sticky assignment per experiment+subject.

- **experimentId**
- **organizationId**
- **subjectKey**: normalized string including org scope
- **variantKey**
- **assignedAt**
- **context**

## ExperimentEvent (`experiment_events`)

Append-only event/outcome ingestion.

- **experimentId**
- **organizationId**
- **subjectKey**
- **variantKey**
- **eventKey**
- **value**
- **ts**
- **meta**

## ExperimentMetricBucket (`experiment_metric_buckets`)

Materialized metric buckets for analysis.

- **experimentId**
- **organizationId**
- **variantKey**
- **metricKey**
- **bucketStart**
- **bucketMs**
- **count**, **sum**, **sumSq**, **min**, **max**

## APIs

## Public (JWT + RBAC)

Mounted at `/api/experiments`:

- `GET /api/experiments/:code/assignment`
  - Inputs: `subjectId` and `orgId` (via `x-org-id` or `?orgId=`)
  - Output: assigned `variantKey`, resolved `config` (from JsonConfig), winner snapshot

- `POST /api/experiments/:code/events`
  - Inputs: `subjectId`, body with either a single event or `{ events: [] }`
  - Stores `ExperimentEvent` records

- `GET /api/experiments/:code/winner`
  - Output: winner snapshot

Authorization:

- RBAC rights:
  - `experiments:read`
  - `experiments:events:write`

## Admin API

Mounted at `/api/admin/experiments`:

- CRUD on `Experiment`
- Metrics endpoint: `GET /api/admin/experiments/:id/metrics`

Authorization:

- JWT + `experiments:admin`, or Basic-auth superadmin bypass.

## Internal (Cron)

Mounted at `/api/internal/experiments` and protected by an internal bearer token:

- `POST /api/internal/experiments/aggregate/run`
- `POST /api/internal/experiments/retention/run`

The internal bearer token is stored in global settings under:

- `experiments.internalCronToken`

## WebSocket

- Endpoint: `/api/experiments/ws`
- Subscribe message: `{ "type": "subscribe", "experimentCode": "..." }`
- Winner event: `{ "type": "winner", "experimentCode": "...", "winnerVariantKey": "..." }`

## Cron jobs

Cron jobs are created/ensured at startup:

- `Experiments: Aggregate + Evaluate Winner`
- `Experiments: Retention Cleanup`

## Webhooks

Supported webhook events:

- `experiment.winner_changed`
- `experiment.status_changed`

## Configuration

Global settings:

- `EXPERIMENT_EVENTS_RETENTION_DAYS` (default 30)
- `EXPERIMENT_METRICS_RETENTION_DAYS` (default 180)
