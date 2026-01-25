---
description: Plan changes for blog automation configuration UI (form + advanced JSON) and multi-configuration support
---

# Plan: Blog automation config UI (form + advanced JSON) + multi-config support

## Context
Today, blog automation is configured as a single JSON blob in `GlobalSetting`:

- `blog.automation.config` (JSON)
- `blog.automation.styleGuide` (string)

Admin UI (`/admin/blog-automation`) is currently a JSON textarea.
Cron scheduling is bootstrapped as a single HTTP CronJob that calls:

- `POST /api/internal/blog/automation/run` with body `{ "trigger": "scheduled" }`

## Goals
- Add a **form-based configuration editor** for blog automation.
  - Keep the raw JSON editor as an **Advanced** option.
  - UX requirements:
    - Autocomplete/select inputs where the values already exist in the system.
    - Info texts + tooltips explaining fields, defaults, and consequences.
- Add **multiple automation configurations** (e.g. “Micro-exits weekly”, “Ops tips daily”, “SaaS growth biweekly”), each with its own schedule.

## Plan lock-in decisions
- `configId` is **required** for running automation (admin + internal). Avoid “default config” semantics.
- Cron ownership is managed by the existing **Cron system**; blog automation config changes reconcile CronJobs.
- Style guide is **global + optional per-config override**.
- “Types” are implicit via topics/category/tags/author defaults.
- Deleting a config deletes the associated CronJob (with a destructive confirmation in UI).

## Non-goals
- Changing the generation pipeline logic beyond routing it to the selected config.
- Changing the core CronScheduler design.
- Building a full UI framework; the admin UI remains EJS + vanilla JS.

## Proposed design

### 1) Data model / storage
Introduce a multi-config structure stored in global settings.

#### New settings
- `blog.automation.configs` (JSON)
  - Shape: `{ version: 1, items: BlogAutomationConfig[] }`
- Keep existing:
  - `blog.automation.styleGuide` (string) as a **global default** style guide.

#### BlogAutomationConfig (proposed shape)
Each config is independently schedulable and runnable:

- `id` (string, generated; stable)
- `name` (string)
- `enabled` (boolean)
- `schedule` (object)
  - `managedBy`:
    - `cronScheduler` (preferred; creates/updates CronJob)
    - `manualOnly`
  - `cronExpression` (string)
  - `timezone` (string)
- `limits` (object)
  - `runsPerDayLimit`
  - `maxPostsPerRun`
  - `dedupeWindowDays`
- `content` (object)
  - `topics[]` (same as today: `{ key, label, weight, keywords[] }`)
  - `defaultCategory` (string, optional)
  - `defaultTags[]` (string[], optional)
  - `defaultAuthorName` (string, optional)
- `citations` (object) (same as today)
- `research` (object) (same as today)
- `generation` (object) (same as today)
- `images` (object) (same as today)
- `dryRun` (boolean)
- `styleGuideOverride` (string, optional)

Backwards compatibility:
- If `blog.automation.configs` is missing, the system should treat `blog.automation.config` as the legacy single config and expose it as a single-item list in UI/API.
- On first save from the new UI, migrate into `blog.automation.configs` (and optionally keep writing `blog.automation.config` for a short period if needed; preference: stop writing legacy key once migrated).

### 2) API changes
Current endpoints are single-config:

- `GET/PUT /api/admin/blog-automation/config`

Proposed additions:

- `GET /api/admin/blog-automation/configs`
  - Returns `{ items: BlogAutomationConfig[], legacyMigrated: boolean }`
- `POST /api/admin/blog-automation/configs`
  - Create new config
- `PUT /api/admin/blog-automation/configs/:id`
  - Update config
- `DELETE /api/admin/blog-automation/configs/:id`
  - Delete config

Keep existing endpoint as compatibility:
- `GET/PUT /api/admin/blog-automation/config`
  - Could map to a “default config” (either the first enabled, or an explicit `defaultConfigId`).
  - Alternatively return 409 with guidance once multi-config is enabled. (Needs decision.)

Runs:
- `POST /api/admin/blog-automation/run-now`
  - Body: `{ configId: string }` (**required**)

Internal cron:
- `POST /api/internal/blog/automation/run`
  - Body: `{ trigger, configId }` (`configId` required)
  - Token auth remains unchanged.

### 3) CronScheduler integration
Today there is one “Blog: Automation (generate drafts)” CronJob.

With multi-config, create one CronJob per automation config when `schedule.managedBy=cronScheduler`:

- Name format (proposal): `Blog: Automation - <config.name>`
- Task: HTTP `POST /api/internal/blog/automation/run`
- Body: `{ "trigger": "scheduled", "configId": "..." }`
- Auth: bearer token from `blog.internalCronToken`

Bootstrap changes (implemented):
- Ensure default `blog.automation.configs` exists (migrates from legacy `blog.automation.config` if needed)
- Reconcile CronJobs per config:
  - create/update for cron-managed configs
  - delete when config is removed or switched to manual-only

### 4) Admin UI changes (EJS)
Current UI has 3 tabs: Configuration (JSON), Style Guide, Run History.

Proposed UI structure:

- Top-level: configuration selector
  - Left sidebar (or top dropdown) listing configs:
    - Name
    - Enabled badge
    - Schedule summary
    - Quick actions: Run now, Duplicate, Delete
  - “New configuration” button

- Main panel tabs for the selected config:
  - **Form** (default)
    - Sections:
      - Enable + schedule
      - Limits/guardrails
      - Content defaults (category/tags/author)
      - Topics (table with add/remove)
      - Research (provider/model/temp/maxTokens)
      - Generation (provider/model/temp/maxTokens)
      - Images (namespace/visibility/cover/inline)
      - Citations
      - Dry run
    - Tooltips on each section header and most fields
    - Inline validation and helpful error messaging
  - **Advanced (JSON)**
    - JSON editor for the selected config
    - “Reset to defaults” action for this config
    - “Validate JSON” action (client-side JSON parse + server-side schema validation)

- Style Guide
  - Global default style guide
  - Optional per-config override (toggle + textarea)

- Run History
  - Filter by config

Autocomplete/select guidelines:
- Provider/model selects:
  - Populate from existing LLM providers/models available in the system (same as current provider/model picker behavior)
- Category/tags/author selects:
  - Pull suggestions from existing `BlogPost` values:
    - distinct `category`
    - distinct `tags`
    - distinct `authorName`
  - Offer freeform entry but autocomplete from existing

### 5) Validation
Server-side validation is required because JSON can be edited directly.

Approach:
- Add a validation function that:
  - merges defaults
  - clamps numeric ranges
  - ensures arrays are arrays
  - enforces required keys (`id`, `name`)
  - validates cron expression/timezone format if cron-managed

### 6) Testing plan (future)
(Not implementing now; this is planning only.)

- Unit tests:
  - config migration legacy -> multi
  - cron job creation/update for configs
  - run-now routes accept configId
  - internal route selects correct config

## Open questions (need your decisions)
All open questions have been resolved via the plan lock-in decisions above.

## Rollout plan (implementation later)
- Phase 1: Add multi-config storage + admin APIs + internal route support for `configId`
- Phase 2: Cron sync per config (bootstrap + reconcile)
- Phase 3: Admin UI form editor + advanced JSON tab + autocomplete sources

