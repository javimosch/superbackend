# Plan: Centralized LLM Provider/Model Resolution Across AI Systems

## Context / problem
Multiple subsystems perform LLM completions, but each currently resolves `providerKey` / `model` differently (per-feature global settings keys, env vars, and in some cases hardcoded OpenRouter usage).

Goals:
- Centralize provider/model selection so any subsystem can resolve it consistently.
- Keep behavior **backwards compatible**: existing per-system settings and envs must still work as fallbacks.
- Provide an admin UI in the LLM section to manage:
  - Predefined models per provider
  - Global default provider + model
  - Per-system default provider + model overrides
- Provide a **common UI picker** (EJS partial + JS) that any “Ask AI” system can embed.

Decisions (locked):
- Direct OpenAI SDK usage is considered an error: migrate those call sites to the existing `llm.service` immediately.
- Predefined models are **suggestions only** (autocomplete behavior). No enforcement.

Non-goals (for this phase):
- Changing how providers are configured (baseUrl/apiKey). We reuse existing `llm.providers` provider config.
- Removing legacy per-feature settings/envs.

---

## 2.6 SystemKey naming (proposed)

These `systemKey` values are intended to be stable, human-readable, and map 1:1 to a user-facing “system” in the admin UI.

Proposed mapping:

| System | Proposed `systemKey` | Current legacy defaults keys |
|---|---|---|
| Page Builder → Blocks AI | `pageBuilder.blocksAi` | `pageBuilder.blocks.ai.providerKey`, `pageBuilder.blocks.ai.model` |
| EJS Virtual Codebase → Vibe | `ejsVirtual.vibe` | `ejsVirtual.ai.providerKey`, `ejsVirtual.ai.model` |
| UI Components → AI Propose | `uiComponents.proposeEdit` | `uiComponents.ai.providerKey`, `uiComponents.ai.model` |
| Headless → AI Model Builder | `headless.aiModelBuilder` | `headless.aiProviderKey`, `headless.aiModel` |
| Workflow Engine → LLM node | `workflow.llmNode` | (none; currently node-level `provider/model`) |
| SEO Config → AI | `seoConfig.ai` | (uses OpenRouter-specific helpers today) |
| i18n → AI Translation | `i18n.aiTranslation` | `i18n.ai.model` (apiKey from `i18n.ai.openrouter.apiKey` / `ai.openrouter.apiKey`) |

If you want these to align with audit event action names, we can alternatively choose keys like `pageBuilder.blocks.ai.generate` / `pageBuilder.blocks.ai.propose` etc., but that may be overly granular.

## 1) Inventory: current LLM-using systems and current resolution

### A) Central LLM service (`src/services/llm.service.js`)
- **Purpose**: OpenAI-compatible chat completions via configured providers.
- **Config sources**:
  - `GlobalSetting` JSON:
    - `llm.providers` (provider configs)
    - `llm.prompts` (prompt templates)
  - Encrypted per-provider keys:
    - `llm.provider.{providerKey}.apiKey`
- **Model selection**:
  - In `call(promptKey, ...)`: `runtimeOptions.model || prompt.model || provider.defaultModel`
  - In `callAdhoc(...)`: `model || runtimeOptions.model || provider.defaultModel || 'google/gemini-2.5-flash-lite'`
- **Note**: The service itself does not define a “global default provider/model for all systems”; it just executes a request with a providerKey/model passed in.

### B) Page Builder Blocks AI (`src/services/blockDefinitionsAi.service.js`)
- Resolves defaults:
  1. UI-provided `providerKey`/`model`
  2. Global settings:
     - `pageBuilder.blocks.ai.providerKey`
     - `pageBuilder.blocks.ai.model`
  3. Env:
     - `DEFAULT_LLM_PROVIDER_KEY`
     - `DEFAULT_LLM_MODEL`
  4. Hard default model: `x-ai/grok-code-fast-1`

### C) EJS Virtual Codebase “vibe” (`src/services/ejsVirtual.service.js`)
- Same resolution pattern:
  - `ejsVirtual.ai.providerKey`, `ejsVirtual.ai.model` then env, then hard default model.

### D) UI Components AI (`src/services/uiComponentsAi.service.js`)
- Same resolution pattern:
  - `uiComponents.ai.providerKey`, `uiComponents.ai.model` then env, then hard default model.

### E) Workflow engine LLM node (`src/services/workflow.service.js`)
- Uses per-node fields:
  - `node.provider || 'openrouter'`
  - `node.model || 'minimax/minimax-m2.1'`
- No global settings lookup currently.

### F) Headless AI Model Builder (`src/controllers/adminHeadless.controller.js`)
- Resolves defaults:
  - Global settings: `headless.aiProviderKey`, `headless.aiModel`
  - Env: `HEADLESS_AI_PROVIDER_KEY`, `HEADLESS_AI_MODEL`
  - Hard defaults: `openrouter`, `google/gemini-2.5-flash-lite`

### G) SEO Config AI (`src/controllers/adminSeoConfig.controller.js` + `src/services/seoConfig.service.js`)
- Uses OpenAI SDK directly with OpenRouter baseURL.
- Key/model sources:
  - `getSeoconfigOpenRouterApiKey()` (missing from this doc; defined in `seoConfig.service.js` further down the file)
  - `getSeoconfigOpenRouterModel()`
- Provider is effectively hardcoded to `openrouter`.

### H) i18n AI translation (`src/controllers/adminI18n.controller.js`)
- Uses OpenAI SDK directly with OpenRouter baseURL.
- Key/model sources:
  - API key from global settings:
    - `i18n.ai.openrouter.apiKey` fallback to `ai.openrouter.apiKey`
  - Model from global settings:
    - `i18n.ai.model` default `google/gemini-2.5-flash-lite`
- Provider hardcoded to `openrouter`.
- Stores attribution fields in `I18nEntry`: `lastAiProvider`, `lastAiModel`.

---

## 2) Design: centralized provider/model registry + resolution

### 2.1 Central settings keys
Introduce **one canonical namespace** for provider/model defaults:

- **Global default** (used when a system has no override):
  - `llm.defaults.providerKey`
  - `llm.defaults.model`

- **Per-system default overrides**:
  - `llm.systemDefaults.<systemKey>.providerKey`
  - `llm.systemDefaults.<systemKey>.model`

Where `systemKey` is a stable identifier, e.g.:
- `pageBuilder.blocks`
- `ejsVirtual.vibe`
- `uiComponents.ai`
- `workflow.llmNode`
- `headless.aiModelBuilder`
- `seoConfig`
- `i18n`

### 2.2 Model suggestions / “predefined models” per provider
Add a provider model registry to global settings:
- `llm.providerModels.<providerKey>` => JSON array of model IDs (strings)

Example:
```json
["google/gemini-2.5-flash-lite","openai/gpt-4.1-mini","anthropic/claude-3.5-sonnet"]
```

Notes:
- This is for **UI autocomplete/suggestions**, not enforcement.
- For OpenRouter, optionally fetch remote model list in the admin UI (see 2.5).

Storage shape decision pending (choose one):
- A) Keep `llm.providerModels.<providerKey>` (one global setting per provider)
- B) Use a single `llm.providerModels` JSON map: `{ [providerKey]: string[] }`

### 2.3 Resolution precedence
Define a single backend function `resolveLlmProviderModel({ systemKey, uiProviderKey, uiModel })` that returns `{ providerKey, model, sourceMeta }`.

Proposed precedence:
1. **UI-provided** values (request body/query): `uiProviderKey`, `uiModel`
2. **Per-system centralized defaults**:
   - `llm.systemDefaults.<systemKey>.providerKey`
   - `llm.systemDefaults.<systemKey>.model`
3. **Global centralized defaults**:
   - `llm.defaults.providerKey`
   - `llm.defaults.model`
4. **Legacy per-system settings** (backwards compatible), for systems that currently have them:
   - `pageBuilder.blocks.ai.*`, `ejsVirtual.ai.*`, `uiComponents.ai.*`, `headless.*`, `i18n.ai.*`, `seoconfig.*` etc.
5. **Legacy env vars**:
   - `DEFAULT_LLM_PROVIDER_KEY`, `DEFAULT_LLM_MODEL`
   - `HEADLESS_AI_PROVIDER_KEY`, `HEADLESS_AI_MODEL`
6. **Hard-coded defaults** (existing behavior per system), to avoid breaking changes.

Important invariant:
- If providerKey is still missing after all fallbacks, return a validation error consistent with existing services.

### 2.4 ProviderKey validation / enabled providers
- ProviderKey should correspond to an enabled provider in `llm.providers`.
- For backwards compatibility, we should **not hard-fail** if provider exists but is disabled; current behavior varies. Prefer:
  - Validation when actually calling LLM (`llm.service` already throws provider disabled/missing apiKey).
  - UI should only suggest enabled providers by default.

### 2.5 OpenRouter remote model list
Admin UI requirement:
- For `openrouter` provider only, allow fetching model list remotely for autocomplete.

Plan:
- Add an admin API endpoint (under admin LLM controller) to list models:
  - `GET /api/admin/admin-llm/openrouter/models`
- The endpoint uses the configured OpenRouter API key from `llm.provider.openrouter.apiKey` (or returns error if missing).
- Cache results in-memory with short TTL (e.g. 60s) to avoid rate limits.

---

## 3) Admin UI changes (LLM section)

### 3.1 New: “Global defaults” section
In the LLM admin UI view:
- Provider picker (autocomplete from configured providers)
- Model picker:
  - Suggestions from `llm.providerModels.<providerKey>`
  - If provider is `openrouter`: additionally allow remote list fetch

Persistence:
- Store selection in global settings:
  - `llm.defaults.providerKey`
  - `llm.defaults.model`

### 3.2 New: “Provider predefined models” section
Per providerKey:
- Editable list of models stored under `llm.providerModels.<providerKey>`.

### 3.3 New: “System defaults” section
For each known `systemKey`:
- Provider + model pickers
- “Use global defaults” toggle (implemented by clearing system keys)

Persistence:
- `llm.systemDefaults.<systemKey>.providerKey`
- `llm.systemDefaults.<systemKey>.model`

---

## 4) Shared UI component: Provider/Model picker partial

Add an EJS partial intended to be reused anywhere in admin pages that need “Ask AI” settings.

Characteristics:
- Renders provider + model picker.
- Accepts:
  - `systemKey`
  - `initialProviderKey`, `initialModel`
  - `saveEndpoint` (where to persist defaults)
- Uses existing admin JS patterns (no framework assumption).

The partial should:
- Load providers from existing LLM config endpoint (already exists: `GET /api/admin/admin-llm/config`).
- Load predefined models from a new endpoint (or embed in config response; decision below).
- For OpenRouter provider, optionally fetch remote list endpoint.

---

## 5) Transparent implementation strategy (future PR)

### 5.1 Backend
- Introduce a new service module, e.g. `src/services/llmDefaults.service.js`.
- Move all duplicated `resolveLlmDefaults(...)` logic (blocks/ejsVirtual/uiComponents/headless/...) to call the centralized resolver.
- For SEO config + i18n (currently using OpenAI SDK directly): migrate to `llmService.callAdhoc()` so provider handling is unified.

### 5.2 Frontend
- Update each “Ask AI” surface to use the shared partial.
- Keep allowing request-level overrides (UI-provided providerKey/model) to preserve current advanced usage.

### 5.3 Migration
- On first load, leave existing legacy settings as-is.
- Central resolver will read legacy keys as fallback, so no breaking change.
- Optionally, provide a one-time “Import legacy defaults” action in LLM admin UI to populate `llm.systemDefaults.*` from existing keys.

---

## 6) Open questions (need your decision before implementation)

1. Per-provider models storage shape: choose A or B (see section 2.2).

2. Confirm the `systemKey` list in section 2.6 (rename any keys now if desired).

3. Workflow LLM node: do you want an additional level of defaults?
   - A) Only node-level `provider/model` (current), plus centralized fallback when node-level is missing.
   - B) Add per-workflow defaults (e.g. `workflow.<workflowId>.llmDefaults.*`) (more complex).

4. Confirm env behavior: keep `DEFAULT_LLM_*` and `HEADLESS_AI_*` as last-resort fallbacks only (recommended).

---

## Completion status
This document is the plan only; implementation will follow after you confirm the open questions and desired precedence rules.
