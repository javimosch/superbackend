---
description: SuperBackend Systems Framework (modular, interconnected, AI-assisted configuration)
---

# SuperBackend Systems Framework — Plan

## Goal
Create a **first-class “Systems Framework”** for SuperBackend so features are delivered as **modular systems** that can:
- Plug into the runtime cleanly (lifecycle + dependency graph)
- Interoperate (events + shared capabilities)
- Expose configuration in a consistent, schema-driven way
- Support **AI-assisted configuration** (safe, validated, auditable)
- Stay **developer-friendly** (clear contracts, minimal boilerplate)

This plan is **inspired by existing patterns in this repo** (middleware composition root, service registry in `index.js`, JSON-config + global settings, rate limiter registry/bootstrap, workflow engine, LLM service).

## Why now (problems to solve)
- Today, “systems” exist as a mix of **services**, **routes**, **models**, **admin pages**, and **schedulers** wired manually in `src/middleware.js`.
- Cross-system integration is implicit (direct imports) rather than explicit (contracts/capabilities).
- Config exists in multiple shapes (env vars, `GlobalSetting`, `JsonConfig`) without a single framework.
- Some systems already behave like plugins (rate limiter registry, cron scheduler start, console manager bootstrap). We should generalize this.

## Guiding principles
- **Modular**: each system is isolated, optional, and can be enabled/disabled.
- **Interconnected by contracts**: systems talk via capability interfaces + an event bus, not direct reach-in.
- **Schema-driven config**: every system has an explicit config schema + defaults.
- **Developer-first**: minimal ceremony to add a system; strong runtime validation and error messages.
- **Flexible + powerful**: supports sync/async hooks, ordering, dependency requirements (inspired by hook/plugin systems).
- **Safe config changes**: validation, preview, diff, and audit trail.

---

# Proposed Architecture

## 1) Core concept: a `System`
A **System** is a package/module that can provide:
- **Capabilities** (services APIs exposed to other systems)
- **Routes** (Express routers)
- **Admin surfaces** (admin endpoints / optional UI pages)
- **Background tasks** (cron jobs, schedulers, workers)
- **Middleware hooks** (contribute to the global middleware pipeline)

### System manifest (contract)
Each system exports a manifest object (or factory) with:
- `id`: stable string identifier (e.g. `rate_limiter`, `llm`, `workflows`)
- `version`
- `requires`: list of system ids (hard deps)
- `optional`: list of system ids (soft deps)
- `configSchema`: JSON-schema-like definition (or `zod`-like if you choose later)
- `defaults`: default config
- `lifecycle`: hooks (see below)
- `capabilities`: provided APIs
- `events`: events emitted/consumed

This is conceptually similar to Architect-style `consumes/provides` and hook ordering systems.

## 2) System Kernel (runtime)
Introduce an internal **System Kernel** responsible for:
- **Discovery**: load built-in systems + user-added systems
- **Dependency graph**: topological sort using `requires`
- **Lifecycle orchestration**: run hooks in a deterministic order
- **Capability registry**: systems register APIs and consume APIs from other systems
- **Event bus**: cross-system events with optional ordering and async support
- **Config provider**: unified config resolution (env + DB)

### Lifecycle hooks
Standard hooks (all optional):
- `register(kernel)`
  - declare capabilities, events, config schema
- `boot(kernel)`
  - fast init that doesn’t require DB
- `start(kernel)`
  - async init; can require DB/redis/etc
- `mountHttp(kernel, appRouter)`
  - attach routes and middlewares
- `stop(kernel)`
  - graceful shutdown

Hook ordering:
- primary ordering: dependency graph (`requires` first)
- secondary ordering: explicit `before/after` constraints per hook (optional)

## 3) Capabilities: “what a system provides”
A capability is a **named interface** exposed via the kernel, e.g.:
- `config`: access to resolved typed config
- `llm`: calling models; prompt registry
- `rateLimiter`: register limiters; evaluate; admin metrics
- `workflows`: run workflows; validate nodes
- `storage`: file/object storage
- `audit`: emit audit events

Capabilities should be registered as:
- `kernel.provide('llm', llmService)`
- `kernel.require('llm')` to consume

This allows systems to play together without importing internal files.

## 4) Events: “how systems coordinate”
Add a kernel event bus (Node `EventEmitter`-like, but supports async handlers):
- `kernel.emit('user.created', { userId })`
- `kernel.on('user.created', async (evt) => ...)`

Recommended conventions:
- Events are namespaced: `domain.action` or `system.event`
- Event payloads are JSON-serializable
- Emitters must never assume a listener exists

Use cases:
- `billing.subscription.updated` triggers `notifications` and `audit`
- `workflow.execution.failed` triggers `error_capture`
- `assets.uploaded` triggers `seo` or `webhooks`

## 5) Unified configuration system
Today you have:
- Env vars
- `GlobalSetting` (string/json/encrypted)
- `JsonConfig` (large structured configs with caching)

### Proposal
Standardize on a **Config Provider** that resolves config as:
1. **Env** overrides (highest priority)
2. **GlobalSetting** for secrets/small flags
3. **JsonConfig** for structured documents
4. **Defaults** from system manifest

Each system declares:
- `configKey` (e.g. `system.console_manager`)
- `configSchema`
- `defaults`
- where it stores (global setting vs json config) depending on size/sensitivity

### Benefits
- Every system config is typed + validated
- Admin UI can auto-render forms based on schema
- AI assistant can propose patches with confidence

## 6) Admin integration
The repo already has a strong “admin surface” model:
- Admin pages under `views/`
- Admin endpoints under `/api/admin/*`
- `endpointRegistry` used for the admin test UI

### Proposal
Each system may contribute:
- `admin.endpoints`: metadata that can auto-extend `endpointRegistry`
- `admin.routes`: Express router mounted under `/api/admin/<system>`
- `admin.pages`: optional server-rendered EJS page metadata

Longer-term:
- A “Systems” admin page that lists systems, versions, enabled status, health.

## 7) AI-assisted configuration (first-class)
You already have:
- `llm.service` with provider/prompt registry stored in DB
- audit logging of LLM completions (`AuditEvent`)

### Proposed feature: “Config Assistant”
A system (e.g. `system_config_assistant`) that:
- Reads a system’s config schema + current config
- Accepts natural language goals (e.g. “Enable file manager at /files”) 
- Produces a **config patch** (JSON Patch or merge patch)
- Validates patch against schema
- Shows preview + diff
- Saves via existing services (`GlobalSetting`/`JsonConfig`)
- Writes an audit event: who changed what + why

#### Safety rules
- Never write secrets in plain text logs
- Always validate schema
- Always provide rollback (store previous config version)
- Rate limit AI endpoints (reuse `rateLimiter` patterns)

### Interfaces
- `POST /api/admin/systems/:id/ai/suggest-config`
- `POST /api/admin/systems/:id/ai/apply-config` (requires explicit confirmation)

## 8) Health and “system status”
Each system can optionally expose:
- `health.check()` returning status + signals
- `metrics` hooks (optional)

Kernel aggregates:
- `/health` already exists; extend to include per-system health

---

# Concrete initial “Systems” to ship (built-in)
These align with what already exists, but become explicit systems:
- `core_http` (Express mount root, error handling, request id)
- `database` (mongoose connection management)
- `global_settings` (GlobalSetting provider + caching)
- `json_configs` (JsonConfig provider + caching)
- `rate_limiter` (registry + config bootstrap + middleware)
- `llm` (providers/prompts + audit)
- `workflows` (workflow execution engine)
- `cron` (cron scheduler)
- `console_manager` (console override + retention cron)
- `admin` (admin UI pages + endpoint registry + auth)

---

# Plan (phased)

## Phase 0 — Plan lock-in
- Document the system manifest contract
- Decide which config format to standardize (JSON-schema vs lightweight custom schema)

## Phase 1 — Kernel skeleton (no big refactor)
- Introduce `SystemKernel`
- Allow registering systems and running lifecycle hooks
- Introduce capability registry + event bus
- Keep existing wiring in `src/middleware.js` but begin adapting one system at a time

## Phase 2 — Config Provider + schema validation
- Implement config resolution (env + db + defaults)
- Add per-system config key conventions
- Add schema validation on load + on save

## Phase 3 — Convert 2-3 existing systems to the framework
Start with low-risk, high-value:
- `rate_limiter` (already has registry + bootstrap patterns)
- `llm` (already has admin endpoints and auditing)
- `cron` (central scheduler)

## Phase 4 — AI Config Assistant MVP
- Create assistant endpoints for a single system first (e.g. `rate_limiter`)
- Implement: suggest -> validate -> preview -> apply
- Store audit logs

## Phase 5 — Admin “Systems” page
- List all systems, config status, health
- Provide “Enable/Disable”, “Edit config”, “AI assist” entry points

---

# Risks / Design constraints
- **Backward compatibility**: must not break the existing exported APIs in `index.js`.
- **Order of initialization**: some services assume DB is connected; kernel must support async start and clear ordering.
- **Config migration**: existing keys must keep working; new system config should support legacy locations.
- **Security**: AI assistant must be protected with admin auth + rate limits; secrets must remain encrypted.

---

# Open questions (please answer to lock plan)
1. Do you want “systems” to be **npm-installable plugins** (external packages), or only internal modules initially?
2. Preferred config schema approach:
   - JSON Schema
   - A small custom schema (like `{ type, required, default }`)
   - Something like `zod` (would add dependency)
3. Should the kernel expose an API for systems to add Express middleware/routes, or keep `src/middleware.js` as the only HTTP composition root?
4. Do you want multi-tenant config (per org) for some systems, or keep config global-only for now?
5. For the AI assistant: should it be able to directly write config, or only produce patches that a human applies?
