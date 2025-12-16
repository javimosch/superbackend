# Job Queue + Background Workers (Sketch)

## Goal
Add a standard background job system to decouple slow/unstable work from request/response:
- Email sending
- Webhook delivery retries
- Scheduled cleanup jobs
- Usage aggregation

This should make other “mini-systems” easier to implement without blocking API requests.

## Non-goals (for v1)
- Full distributed workflow engine
- Exactly-once processing

## Design principles
- At-least-once execution
- Idempotent handlers
- Visibility into failures
- Simple local-dev mode

## Core concepts
- **Job**: record representing work to do.
- **Worker**: process that pulls jobs and executes handlers.
- **Retries**: exponential/backoff schedule.

## Data model (Mongoose)
### `Job`
- `type` (string, required, index)
- `payload` (Mixed, required)
- `status` (`queued` | `running` | `succeeded` | `failed`)
- `attempts` (number, default 0)
- `maxAttempts` (number, default 6)
- `runAt` (date, default now, index)
- `lockedAt` (date, optional)
- `lockedBy` (string, optional) (worker id)
- `lastError` (string, optional)
- `succeededAt` (date, optional)
- `failedAt` (date, optional)
- timestamps

Indexes:
- `{ status: 1, runAt: 1 }`
- `{ lockedAt: 1 }`

## Worker loop (sketch)
- Poll for due jobs: `status=queued AND runAt<=now`
- Atomically claim a job (findOneAndUpdate lock)
- Execute handler based on `type`
- On success: `status=succeeded`
- On error:
  - increment attempts
  - if attempts < max: set `status=queued` and `runAt` to next retry time
  - else `status=failed`

## API endpoints (sketch)
### Admin (Basic Auth)
- `GET /api/admin/jobs?status=failed&type=...`
- `POST /api/admin/jobs/:id/retry`
- `POST /api/admin/jobs/:id/cancel` (optional)

No user-facing endpoints required.

## Integration points
- Email system:
  - enqueue `email.send` with template + recipient
- Outbound webhooks:
  - enqueue `webhook.deliver` with event/subscription
- Cleanup:
  - enqueue periodic `maintenance.cleanup`

## Configuration
Environment variables (sketch):
- `JOBS_ENABLED=true|false`
- `JOBS_POLL_INTERVAL_MS=1000`
- `JOBS_WORKER_ID=<hostname>`

Local-dev fallback:
- if jobs disabled, execute inline (best-effort)

## Activity logging
Log job creation for critical flows (sampled):
- `job_enqueued`
- `job_failed` (admin visibility)

## Implementation outline (files)
- `src/models/Job.js`
- `src/services/jobQueue.service.js` (enqueue + claim + update)
- `src/workers/worker.js` (process loop)
- `src/controllers/adminJobs.controller.js`
- `src/routes/adminJobs.routes.js`

## Testing checklist
- Enqueue job -> appears in DB
- Worker claims and marks running
- Success -> succeeded
- Fail -> retries until maxAttempts then failed
- Retry endpoint re-queues failed job

## Open questions
- Do we want separate collections per job type?
- How do we prevent multiple workers from double-processing (locking strategy)?
- Do we need scheduled cron runner vs queue delay (`runAt`)?
