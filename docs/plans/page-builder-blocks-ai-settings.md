---
description: page builder - blocks ai settings sub-tab (provider/model)
---

# Goal
Add a **Settings** sub-tab under **Page Builder → Blocks** to configure which **LLM providerKey** and **model** the Blocks AI Assistant uses.

# Locked-in decisions
- Settings are **global** (GlobalSetting), not per-tenant.
- Provider selection is **restricted** to enabled providers returned by `GET /api/admin/llm/config`.
- This config applies to **Blocks AI only** (separate from Virtual EJS vibe settings).

# Current State

## Where Blocks AI defaults come from
`src/services/blockDefinitionsAi.service.js` resolves provider/model in this order:
1. UI request overrides (`providerKey`, `model` in the AI endpoint request body)
2. Global settings:
   - `pageBuilder.blocks.ai.providerKey`
   - `pageBuilder.blocks.ai.model`
3. Environment fallback:
   - `DEFAULT_LLM_PROVIDER_KEY`
   - `DEFAULT_LLM_MODEL`
4. Hardcoded final model fallback (currently `x-ai/grok-code-fast-1`)

So the persistence mechanism already exists: **GlobalSetting**.

## Existing admin APIs we can reuse
- Global settings CRUD (basic auth):
  - `GET /api/admin/settings/:key`
  - `PUT /api/admin/settings/:key`
  - `POST /api/admin/settings` (create if missing)
- LLM providers registry (basic auth):
  - `GET /api/admin/llm/config` (returns providers + prompts)

# Proposed UX

## Location
Page Builder admin view: `views/admin-pages.ejs`

- Existing: top-level tab “Blocks” (already present)
- Add **sub-tabs** inside Blocks panel:
  - **Definitions** (default; existing table CRUD)
  - **Settings** (new)

## Settings sub-tab UI
A small card with:
- **Provider key**
  - Preferred: a `<select>` populated from `GET /api/admin/llm/config` providers keys (filtered to enabled).
  - Fallback: plain text input if providers cannot be loaded.
- **Model**
  - Plain text input.
  - Optionally show provider’s defaultModel as a hint if available.
- **Save** button
- Read-only help text describing fallback order.

## Behavior
On opening Blocks → Settings:
- Load current effective settings:
  - `GET /api/admin/settings/pageBuilder.blocks.ai.providerKey`
  - `GET /api/admin/settings/pageBuilder.blocks.ai.model`
- If key does not exist (404), treat as empty.

On Save:
- If setting exists: `PUT /api/admin/settings/:key`.
- If setting missing: `POST /api/admin/settings` to create with:
  - `type: "string"`
  - `description`: explain it controls Blocks AI provider/model

# Backend Plan
No new backend endpoints are strictly required.

If we want a cleaner UI experience, we can optionally add a small helper endpoint under the Page Builder routes, but default plan is to reuse existing settings + llm config APIs.

# Validation Rules
- `providerKey`
  - required if user wants Blocks AI to work without env vars
  - if using select: must match an enabled provider in `/api/admin/llm/config`
- `model`
  - optional (empty means fallback to env/default)

# Security
- Both `/api/admin/settings/*` and `/api/admin/llm/config` are basic-auth protected.
- No secrets are stored here; provider apiKeys remain managed in the LLM admin page.

# Rollout / Backward Compatibility
- If settings are unset, Blocks AI keeps working via env defaults exactly as today.
- UI should handle missing endpoints gracefully (render inputs, show message, do not crash).

# Final implementation

## UI
Implemented in `views/admin-pages.ejs`:
- Blocks tab now has sub-tabs:
  - Definitions
  - Settings
- Settings form:
  - Provider select populated from `GET /api/admin/llm/config` (enabled only)
  - Model text input
  - Save button

## Persistence keys
Saved as GlobalSetting (string) keys:
- `pageBuilder.blocks.ai.providerKey`
- `pageBuilder.blocks.ai.model`

## APIs used
- Read provider list:
  - `GET /api/admin/llm/config`
- Read settings:
  - `GET /api/admin/settings/:key` (treat 404 as empty)
- Save settings:
  - `POST /api/admin/settings` (create if missing)
  - `PUT /api/admin/settings/:key` (update)

# Open Questions (need lock-in)
1. Should this be **global** only (GlobalSetting), or do you want **per-tenant** Blocks AI settings?
2. Should Provider be restricted to keys returned by `/api/admin/llm/config` (recommended), or allow free-form provider keys?
3. Do you want this settings UI to also control **EJS Virtual vibe** defaults (currently `ejsVirtual.ai.providerKey/model`), or keep them separate?
