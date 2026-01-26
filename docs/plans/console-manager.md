# Console Manager Plan

## Goal
Introduce a new **Console Manager** subsystem that overrides the global `console` methods (after the existing `src/services/consoleOverride.service.js` override) to:

- Auto-register each new `console.debug/log/info/warn/error` call as a **Console Entry** (unique hash, upsert).
- Allow admins to bulk **disable/enable** entries.
  - **disabled** => message is not shown in stdout/stderr
  - **enabled** => message is shown in stdout/stderr
- Optionally persist log occurrences into:
  - **Cache** (existing cache layer)
  - **DB** (async, low-footprint; must not impact runtime)
- Expose an **Admin UI** dedicated view with sub-tabs:
  - **Entries** (bulk enable/disable, tags, tag filtering)
  - **Logs** (paginated, filterable table of DB-persisted logs)

All configuration must leverage the existing **JSON Configs** system.

---

## Non-goals (initial scope)
- Not a full replacement for structured logging libraries.
- No heavy log indexing/search engine.
- No guaranteed persistence/delivery (best-effort, async).

---

## Key Requirements Recap
- **Global effect:** affects all stdout/stderr because it overrides global console.
- **Override order:** Console Manager override must be applied **after** the current override from `src/services/consoleOverride.service.js`.
- **Auto-register:** first time we see a distinct log “shape”, create/upsert a Console Entry.
- **Enablement control:** per-entry enable/disable.
- **Persistence flags:**
  - Flag: persist occurrence in Cache (default: disabled)
  - Flag: persist occurrence in DB (default: disabled)
  - Flag: new auto-registered entries enabled by default (default: enabled)
  - Flag: warn/errors persisted in cache/db by default (default: disabled)

---

## Proposed Architecture

### 1. Data model

#### 1.1 ConsoleEntry (Mongo)
A small collection of “log templates” / “signatures” that can be enabled/disabled and tagged.

- **hash** (string, unique, indexed)
- **method** (enum: `debug|log|info|warn|error`, indexed)
- **messageTemplate** (string, trimmed/normalized)
- **topFrame** (string, optional; helps disambiguate similar messages)
- **enabled** (boolean)
- **tags** (array of strings, indexed)
- **firstSeenAt**, **lastSeenAt**
- **countTotal** (number, optional)
- **lastSample** (object: compact representation of last args; optional)
- **persistToCache** (boolean; entry-level override)
- **persistToDb** (boolean; entry-level override)

Notes:
- `persistToCache`/`persistToDb` are optional overrides. If missing, fall back to global config defaults.
- Keep schema minimal to maintain low footprint.

#### 1.2 ConsoleLog (Mongo) (only if DB persistence enabled)
Append-only records (or capped/TTL) used by the Admin UI “Logs” tab.

- **createdAt** (timestamp)
- **entryHash** (indexed)
- **method**
- **message** (short string)
- **argsPreview** (string or compact JSON)
- **requestId** (if available via async-local/request middleware; optional)
- **tagsSnapshot** (optional; denormalized for easy filtering)

Retention plan:
- Add TTL index (configurable) to prevent unbounded growth.

---

### 2. Entry hashing / upsert strategy
Goal: “Same log line shape” should map to the same entry.

Proposed hash inputs (sha256 -> first 32 chars, consistent with `errorLogger` style):
- `method`
- `normalizedMessage`
- `topFrame` (optional but recommended)

Where:
- **normalizedMessage** uses a similar approach to `src/services/errorLogger.js` (`normalizeMessage`) to reduce cardinality:
  - Replace UUIDs/ObjectIds/large numbers with placeholders
  - Trim whitespace
  - Cap length

- **topFrame** extraction can reuse a simplified version of `extractTopFrame` from `errorLogger`.

Upsert behavior:
- `findOneAndUpdate({ hash }, { $setOnInsert: {...defaults}, $set:{lastSeenAt}, $inc:{countTotal:1} })`
- Only store small `lastSample` (and cap sizes) to avoid heavy writes.

---

### 3. Configuration (JSON Configs)
Create a dedicated JSON config, e.g. slug `console-manager`.

Proposed shape:
```json
{
  "enabled": true,
  "defaultEntryEnabled": true,
  "defaults": {
    "persist": {
      "cache": false,
      "db": false,
      "warnErrorToCacheDb": false
    }
  },
  "db": {
    "enabled": false,
    "ttlDays": 7,
    "sampleRatePercent": 100
  },
  "cache": {
    "enabled": false,
    "ttlSeconds": 3600,
    "namespace": "console-manager"
  },
  "performance": {
    "maxArgChars": 2000,
    "maxArgsSerialized": 5
  }
}
```

Resolution rules:
- If `enabled` is false => Console Manager does nothing and forwards to the current console implementation.
- For each emitted log:
  - Determine entry signature.
  - Upsert ConsoleEntry.
  - Evaluate **stdout output** based on `entry.enabled`.
  - Evaluate **persistence** based on entry overrides or global defaults.
  - `warnErrorToCacheDb` means: when a new entry is auto-registered and method is warn/error, default persistence can be turned on (still default is off).

Caching JSON config:
- Use existing `jsonConfigs.service.getJsonConfig('console-manager')` with a small cache TTL via JsonConfig’s `cacheTtlSeconds`.

---

## Runtime Integration Plan (override order)

### 1. Where to initialize
`src/middleware.js` currently does:
- `consoleOverride.init()` early
- then `hookConsoleError()` (overrides `console.error`)

Console Manager must be installed **after** `consoleOverride.init()`.

Recommended sequence:
1. `consoleOverride.init()` (existing)
2. `hookConsoleError()` (existing)
3. `consoleManager.init()` (new)

Rationale:
- When Console Manager wraps, it should wrap the *currently active* console methods (whatever they are at that moment), so it naturally composes “after”.

### Implementation notes (final)
- `consoleManager.init()` is invoked in `src/middleware.js` right after `hookConsoleError()`.
- Console Manager stores the then-current console methods (already wrapped by `consoleOverride` + `hookConsoleError`) as its previous implementation.
- When an entry is **disabled**:
  - stdout/stderr output is suppressed by not forwarding to the previous console method.
  - `console.error` **still records an occurrence** into the error aggregation layer (best-effort) so you can later decide whether to enable it.

### 2. What Console Manager overrides
Override all methods:
- `debug`, `log`, `info`, `warn`, `error`

Implementation principle:
- Console Manager stores a reference to the console methods at init time as its “previous” implementation.
- On each call:
  - Compute signature + upsert entry (async-safe)
  - If entry enabled => forward to previous method
  - If entry disabled => do not call previous method (suppresses stdout/stderr)
  - If persistence enabled => enqueue cache/db work (non-blocking)

### 3. Async / low footprint guarantees
- Never block the main call path.
- Use a lightweight in-process queue with:
  - bounded size
  - drop-on-overflow behavior (best-effort)
- Use `setImmediate` / microtask scheduling for DB writes.
- Optional sampling (`sampleRatePercent`) for persisted logs.

---

## Cache Persistence Plan (existing cache layer)
Use `src/services/cacheLayer.service`.

Namespace: `console-manager` (configurable).

Suggested keys:
- `entry:<hash>:count` => incremented count (store as number)
- `entry:<hash>:last` => last occurrence timestamp

TTL:
- configurable (`cache.ttlSeconds`)

Notes:
- Cache layer supports memory/redis and Mongo offload; we should keep values small and avoid high write amplification.

---

## DB Persistence Plan
Two DB concerns:

1. **Entries** are always stored/upserted in Mongo (needed for enable/disable + tags).
2. **Logs** are only stored if DB persistence enabled.

DB write strategy:
- `ConsoleEntry` upsert should be kept small and cheap (single doc per signature).
- `ConsoleLog` inserts should be async and sampled.
- TTL index on `ConsoleLog` to control growth.

---

## Admin API Plan
Add new admin routes similar to `adminCache.routes.js`.

Base path:
- `/api/admin/console-manager/*` (basic auth)

Endpoints (proposal):

### Entries
- `GET /api/admin/console-manager/entries`
  - Filters:
    - `method`, `enabled`, `q`, `tags` (multi)
    - pagination: `page`, `pageSize`
  - Sorting: `lastSeenAt`, `countTotal`

- `PUT /api/admin/console-manager/entries/bulk-enable`
  - Body: `{ hashes: [], enabled: true|false }`

- `PUT /api/admin/console-manager/entries/bulk-tags`
  - Body: `{ hashes: [], add: [], remove: [] }`

- `GET /api/admin/console-manager/tags`
  - Return known tags + counts for UI badge filters.

### Logs
- `GET /api/admin/console-manager/logs`
  - Filters:
    - `method`, `q`, `entryHash`, `tags` (multi)
    - pagination: `page`, `pageSize`

### Config (JSON Config helper)
Option A (preferred for consistency): manage config via existing JSON Configs UI.
Option B (nice UX): provide a small `GET/PUT /api/admin/console-manager/config` that reads/writes the JSON Config under the hood.

### Implementation notes (final)
- Implemented in `src/routes/adminConsoleManager.routes.js`.
- Config endpoints:
  - `GET /api/admin/console-manager/config`
  - `PUT /api/admin/console-manager/config`
    - Persists via the JSON Configs system under the hood.
    - Applies **retroactive updates** for defaults to existing entries.

---

## Admin UI Plan
Add a dedicated admin view similar to `views/admin-cache.ejs` (Vue 3 + Tailwind CDN).

### Routing
- Add a new page route in `src/middleware.js`:
  - `router.get(
      `${adminPath}/console-manager`,
      basicAuth,
      render('admin-console-manager.ejs')
    )`

### Implementation notes (final)
- View implemented at `views/admin-console-manager.ejs`.
- Uses Vue 3 + Tailwind (CDN) like other admin pages.
- Adds nav item in `views/partials/dashboard/nav-items.ejs` under “Monitoring & AI”.

---

## Persistence & retention (final)

### Cache persistence
- Implemented through existing `src/services/cacheLayer.service.js`.
- Keys:
  - `entry:<hash>:count`
  - `entry:<hash>:last`
- Namespace + TTL are controlled by Console Manager config.

### DB logs persistence
- Persisted logs are stored in `console_logs`.
- Retention:
  - TTL index exists on `expiresAt`.
  - Additionally a daily retention cleanup CronJob is bootstrapped for robustness.

### Cron retention job
- A ScriptDefinition `console-manager-retention` is created/ensured.
- It runs as **node/host** (not vm2) so it can connect to Mongo using `MONGODB_URI`/`MONGO_URI`.
- A CronJob “Console Manager Retention” is created/ensured and scheduled daily.
- The job reads `db.ttlDays` from the Console Manager JSON Config (defaults to 7 days).

---

## Files added/modified (final)

### Added
- `src/models/ConsoleEntry.js`
- `src/models/ConsoleLog.js`
- `src/services/consoleManager.service.js`
- `src/routes/adminConsoleManager.routes.js`
- `views/admin-console-manager.ejs`

### Modified
- `src/middleware.js` (initialization + admin page + API route registration)
- `views/partials/dashboard/nav-items.ejs` (nav item)

- Add a nav item in `views/partials/dashboard/nav-items.ejs`:
  - Suggested section: **Monitoring & AI** (or **System & DevOps**)
  - `{ id: 'console-manager', label: 'Console Manager', path: adminPath + '/console-manager', icon: 'ti-terminal-2' }`

### UI Layout
Sub-tabs inside the page:

#### 1) Entries tab
- Table columns:
  - enabled toggle
  - method
  - messageTemplate
  - topFrame
  - lastSeenAt
  - countTotal
  - tags (badges)

- Bulk actions:
  - bulk enable
  - bulk disable
  - assign tags (add/remove)

- Filters:
  - search input (q)
  - method dropdown
  - enabled dropdown
  - tag badges (multi-select toggles)

#### 2) Logs tab
- Filterable / paginated table backed by `/api/admin/console-manager/logs`
- Filters:
  - method
  - q
  - tags
  - entryHash

---

## Open Questions (lock-in before implementation)
1. **Signature granularity:** should `topFrame` be part of the hash by default? (helps avoid collisions but increases cardinality)
2. **Config ownership:** do you want Console Manager config edited only through **JSON Configs** UI, or do you also want a dedicated config section in Console Manager UI?
3. **Persistence defaults:** when you say “warn/errors persisted by default (disabled by default)”, should that be:
   - only for *new* auto-registered warn/error entries, or
   - also retroactively applied to existing entries when toggled?
4. **DB log retention:** what default TTL is acceptable for `ConsoleLog` (7 days? 30 days?)
5. **Tag semantics:** should tags be purely manual, or do we want auto-tagging by path/module later?
6. **Suppression scope:** for disabled entries, should we suppress only stdout/stderr output, or also suppress the `errorCapture` error aggregation side effects for `console.error`?
   - If you want to keep error tracking even when stdout is silenced, we must ensure the manager forwards to the error hook but not to stdout/file, which requires a different wiring.

---

## Milestones
1. **Core runtime + config:** new consoleManager service with JSON config integration and entry upsert.
2. **Persistence:** cache counting + optional DB logs (async + TTL).
3. **Admin APIs:** list/update entries, tags, logs.
4. **Admin UI:** dedicated page with Entries/Logs sub-tabs.

---

## Completion Status
Plan only. No implementation done yet.
