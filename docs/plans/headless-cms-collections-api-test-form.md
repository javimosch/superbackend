# Plan: Headless CMS “Collections APIs” Execute Test Form + Audited Responses

## Goal

Improve the **Headless CMS Admin UI** (tab: **APIs**) by adding a **test form** that can execute the currently-shown cURL examples **from the browser**, while:

- Avoiding a raw JSON textarea (prefer field-based inputs)
- Dynamically generating inputs based on the endpoint needs (path/query/body schema)
- Logging the test execution to the **audit system**, including the response as metadata

## Current state (what exists)

- Admin UI is rendered by `views/admin-headless.ejs`.
- The **APIs tab** currently shows **cURL examples** (`renderCurlExamples()`) and supports copy-to-clipboard.
- API tokens are managed in the same page; token values are cached in `localStorage` (`TOKEN_CACHE_KEY`).
- Audit logging exists via:
  - `src/services/auditLogger.js` (`logAudit`, `auditMiddleware`)
  - `src/models/AuditEvent.js` which already supports `meta: mongoose.Schema.Types.Mixed`

Conclusion: **Audit “metadata” is already supported** in the schema via `AuditEvent.meta`.

## Decisions (locked)

- Body builder for complex fields: **(B)** allow per-field JSON input for `object`, `array`, and `ref[]` (no global raw JSON textarea). Each such input includes an inline example schema.
- Execution should be **as real as possible**: run the real `/api/headless/*` endpoints (not a mock).
- Audit response capture size: **10KB**, with sanitization/redaction and truncation.

## Proposed UX changes (Admin UI)

### Add “Test request” panel inside APIs tab

Under the cURL blocks, add a new panel:

- **Operation selector**: `list | create | update | delete`
- **Model selector**: uses the selected model in the UI; fallback to input if no model selected
- **Token selector**: uses selected token (if cached); otherwise prompt for token value (never auto-persist unless user chooses)

### Dynamic variable inputs

#### 1) Path variables

- For `update` and `delete`: require `id`

UI:
- `ID` input shown only for ops that need it

#### 2) Query params (for list)

Create a small “Query parameters” section:

- `limit` (number)
- `skip` (number)
- `filter` (structured builder)
- `sort` (structured builder)
- `populate` (comma-separated string)

Notes:
- `filter`/`sort` are currently JSON strings in the public API; we’ll build them via key/value UI and then serialize.
- Initially, support “flat object” (no nested builder) to keep scope reasonable.

#### 3) Body payload (create/update)

Generate a form from the selected model’s `fields`:

- For each field (except reserved/server-owned), render an input matching `type`:
  - `string` -> text
  - `number` -> number
  - `boolean` -> checkbox
  - `date` -> datetime-local (converted to ISO)
  - `object` -> limited builder (phase 2) or omit initially
  - `array` -> repeated inputs (phase 2) or omit initially
  - `ref` / `ref[]` -> string input of referenced id(s)

Rules:
- Use `required`, `default` as hints
- Allow “(unset)” so update can send partial payloads

## How execution will work (important)

### Do NOT execute arbitrary curl directly in the browser

Instead, add a **server-side admin endpoint** that executes the request in a controlled way.

Reason:
- Browser cannot safely execute `curl`
- Avoid exposing internal URLs / SSRF risks
- Ensure consistent auditing (including response)

### New endpoint (admin-only)

Add an admin route (basic-auth protected), e.g.:

- `POST /api/admin/headless/collections-api-test`

Request body (conceptual):

```json
{
  "op": "list|create|update|delete",
  "modelCode": "posts",
  "pathVars": { "id": "..." },
  "query": { "limit": 10, "skip": 0, "filter": {"a":1}, "sort": {"createdAt":-1}, "populate": "..." },
  "body": { "title": "Hello" },
  "auth": { "type": "bearer", "token": "..." }
}
```

Server performs:
- Validates `op` and required inputs
- Builds the corresponding internal request to the **public** Headless API:
  - `GET /api/headless/:modelCode`
  - `POST /api/headless/:modelCode`
  - `PUT /api/headless/:modelCode/:id`
  - `DELETE /api/headless/:modelCode/:id`
- Executes via in-process call (preferred) or via HTTP loopback (acceptable)

Preferred execution strategy:
- **In-process**: call the same service/controller functions used by public endpoints (avoids SSRF entirely).
- If not easily reusable, fallback to loopback `fetch` to `baseUrl` but enforce:
  - Only allow relative paths starting with `/api/headless/`
  - No arbitrary host

## Final implementation

### Admin UI (APIs tab)

Implemented in:

- `views/admin-headless.ejs`

Adds a **Test request** panel that:

- Supports operations: `list`, `create`, `update`, `delete`
- Dynamically generates a **body payload form** from the selected model fields
- Uses per-field JSON inputs for complex types (`object`, `array`, `ref[]`) and displays example schema text inline
- Includes query param inputs (`limit`, `skip`, `populate`) plus simple builders for `filter` and `sort`
- Shows response status, duration, and JSON response body

### Backend execution endpoint

Implemented in:

- `src/routes/adminHeadless.routes.js`
- `src/controllers/adminHeadless.controller.js` (`executeCollectionsApiTest`)

Behavior:

- Validates `op`, `modelCode`, required `id` (for update/delete), and token
- Builds the correct path under `/api/headless/:modelCode` (and `/:id` when required)
- Performs **loopback HTTP** request to the same running server using `axios`, preserving mount prefix
- Returns the real downstream response body back to the browser

### Audit logging

- Uses `src/services/auditLogger.js` (`logAudit`, `scrubObject`) to create an audit event
- Action: `headless.collections_api_test`
- Stores request summary + response summary in `meta`
- Sanitizes nested structures and truncates the stored response body metadata to **10KB**

## Auditing requirements

Each test execution must log an audit event.

### Audit event shape

Use `auditLogger.logAudit()` (preferred, has scrubbing) with:

- `action`: `headless.collections_api_test`
- `entityType`: `headless_collection`
- `entityId`: `modelCode` (and possibly include `id` in meta for update/delete)
- `outcome`: `success|failure`
- `meta`: include request + response summary

Example `meta` fields:

- `op`, `modelCode`
- `request`:
  - `path`
  - `method`
  - `query`
  - `body` (scrubbed)
- `response`:
  - `status`
  - `headers` (subset)
  - `body` (truncated, scrubbed)
  - `durationMs`

### Redaction and size limits

Because responses can be large or sensitive:

- Truncate stored response body to a fixed limit (e.g. 10–50KB)
- Leverage existing `auditLogger` scrubbing for sensitive keys (`token`, `authorization`, etc.)
- Store only a header allowlist (e.g. `content-type`, `content-length`, request-id)

## UI: presenting execution results

In the Admin UI:

- Add an “Execute” button
- Show a result panel:
  - HTTP status
  - Duration
  - Pretty-printed JSON response (read-only)
  - Copy response button

Also show errors clearly:
- Validation errors (missing ID, invalid number)
- API errors returned by server

## Open questions (need your decision)

1. **Scope of body builder**: For `object` and `array` fields, do you want:
   - (A) Phase 1: omit / disable with a note
   - (B) Phase 1: simple JSON textarea only for those specific fields

2. **Execution strategy**: Prefer in-process handler reuse or loopback HTTP?
   - In-process is safer but might require refactoring controllers/services.

3. **Audit retention / size**: What response body max size do you want stored in audit meta?

## Milestones

1. UI: add test panel + dynamic form generation for path/query/body
2. Backend: add admin endpoint to execute the test request safely
3. Audit: add audit logging with response metadata + truncation/redaction
4. Minimal tests / manual verification checklist
