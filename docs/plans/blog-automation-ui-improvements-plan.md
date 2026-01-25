---
description: Plan improvements for the admin blog automation UI (picker reuse, prompt visibility, and UX clarity)
---

# Plan: Blog automation UI improvements

## Context
The admin page `GET /admin/blog-automation` provides multi-config blog automation configuration (form + advanced JSON). The runtime error `Uncaught ReferenceError: loadStyleGuide is not defined` indicates a missing function definition while event handlers are binding to it.

This plan covers improvements requested for:
- LLM provider/model UX (autocomplete select) via reusing the existing partial `views/partials/llm-provider-model-picker.ejs`.
- Splitting generation configuration into `Research` / `TextGeneration` / `ImageGeneration`.
- Moving key actions into the Configuration tab.
- Improving topic behavior transparency.
- Adding an extra image prompt instruction field.
- Showing computed prompts used by blog generation and image generation.

## Goals
- Fix the runtime JS error in the admin automation page.
- Reuse the standard provider/model picker partial so provider/models behave consistently across admin.
- Make configuration semantics (topics + prompts) understandable without reading backend code.

## Non-goals
- Changing the automation pipeline logic beyond wiring new config fields into prompts.
- Replacing the EJS admin UI with a SPA.

## Proposed changes

### 1) Fix: `loadStyleGuide` runtime error
**Problem**
- `admin-blog-automation.ejs` binds:
  - `btn-load-style` -> `loadStyleGuide`
  - `btn-save-style` -> `saveStyleGuide`
  - initial `loadStyleGuide()` call
- But the functions are not defined, causing a hard runtime failure.

**Plan**
- Add `loadStyleGuide()` and `saveStyleGuide()` implementations in `admin-blog-automation.ejs`.
- Ensure they call existing admin endpoints:
  - `GET /api/admin/blog-automation/style-guide`
  - `PUT /api/admin/blog-automation/style-guide`

**Implemented**
- Added `loadStyleGuide()` / `saveStyleGuide()` in `views/admin-blog-automation.ejs`.

### 2) Provider/Model inputs: reuse `llm-provider-model-picker.ejs`
**Current**
- The form uses plain `<input>` fields:
  - `cfg-research-providerKey`, `cfg-research-model`
  - `cfg-generation-providerKey`, `cfg-generation-model`

**Requested**
- Provider/Models should be autocomplete select.
- Use the partial `views/partials/llm-provider-model-picker.ejs`.
- Split into:
  - Research provider/model
  - TextGeneration provider/model
  - ImageGeneration provider/model

**Plan**
- Replace the raw inputs with 3 instances of the picker partial.
- After the HTML is rendered, call `window.__llmProviderModelPicker.init({ apiBase, providerInputId, modelInputId })` for each instance.
- Decide what `apiBase` is:
  - Option A: use same-origin (empty base) and pass `apiBase: ''`.
  - Option B: derive from `window.location.origin`.

**Implemented**
- Replaced provider/model fields with `views/partials/llm-provider-model-picker.ejs`.
- Picker init uses `apiBase = <baseUrl>`.

### 3) Config schema: split `generation` into text vs image
**Current config**
- `research: { providerKey, model, temperature, maxTokens }`
- `generation: { providerKey, model, temperature, maxTokens }`
- `images.cover: { providerKey, model }`, `images.inline: { providerKey, model }`

**Requested**
- 3 sections:
  - Research
  - TextGeneration
  - ImageGeneration

**Plan (schema)**
- Keep compatibility with current stored configs but extend normalized config shape:
  - Introduce `textGeneration` as the canonical name.
  - Keep reading legacy `generation` (mapped into `textGeneration`).
  - For images:
    - Introduce `imageGeneration` defaults (provider/model) used when per-asset (cover/inline) is not explicitly set.

**Implemented**
- `textGeneration` and `imageGeneration` are normalized, with backwards compatibility mapping from legacy `generation`.
- Update normalize/validate helpers to produce a stable shape.

**Backend prompt usage**
- Update `blogAutomation.service.js` to use:
  - `cfg.textGeneration` for idea + post generation.
  - `cfg.imageGeneration` as default for images (unless cover/inline override).

### 4) Move actions and per-config override into Configuration tab
**Requested**
- `Run Now` should be inside the Configuration tab and only visible if a config is selected.
- Per-config style guide override should also be within the Configuration tab.

**Plan**
- UI:
  - Move the `Run Now` button from page header into the Configuration tab header area.
  - Add a small state indicator when no config is selected.
  - Move the per-config override block from the Style Guide tab into the Configuration tab.
- Keep Style Guide tab for global style guide only.

**Implemented**
- `Run Now` is now inside Configuration (only visible when a config is selected).
- Per-config style guide override UI moved into Configuration.
- Global style guide remains in its own tab.

### 5) Topics JSON field: add clarity and usage explanations
**Current**
- Topics are edited via JSON textarea with only a short tooltip.

**Requested**
- Add info texts about how topics influence iteration behavior.

**Plan**
- Add an inline explainer below the textarea covering:
  - How weighted random selection works.
  - How `keywords` are used (or not used) today.
  - How `runsPerDayLimit` and `maxPostsPerRun` interact with topic selection.
  - Provide the example structure and note that `key` should be stable.

### 6) Image generation: extra instruction field
**Requested**
- Add a field to enrich image generation system prompt.

**Plan**
- Add config field:
  - `images.promptExtraInstruction` (string)
- Backend: append this to the image prompt building logic.

**Implemented**
- Added `images.promptExtraInstruction` to defaults, normalization, UI form field, and prompt builder.

### 7) Show computed prompts (readonly)
**Requested**
- Show computed system prompt used for blog generation and image generation.

**Plan options**
- Option A (client-side preview):
  - Reconstruct prompt strings in the UI using the selected config and current style guide.
  - Pros: no new endpoint.
  - Cons: risks drifting from backend logic.

- Option B (server-side preview endpoint) (recommended):
  - Add admin endpoint:
    - `POST /api/admin/blog-automation/configs/:id/preview-prompts`
  - Response contains:
    - `postPrompt` (string)
    - `imageCoverPrompt` (string)
    - `imageInlinePrompt` (string)
    - and possibly the `ctx` preview (without running external calls)
  - Backend uses the same functions that build prompts for real runs.

**Implemented**
- Added `POST /api/admin/blog-automation/configs/:id/preview-prompts`.
- UI shows readonly post + cover + inline prompt previews.

## Decisions (locked)
- Image generation uses shared defaults (`imageGeneration`) with optional per-kind overrides (`images.cover` / `images.inline`).
- Prompt preview uses a server-side endpoint: `POST /api/admin/blog-automation/configs/:id/preview-prompts`.
- Global style guide stays in its own tab.
- `keywords[]` remains flexible, prompt-oriented input (no strict semantics enforced).

## Rollout / milestones
- Fix runtime error and stabilize UI JS.
- Replace provider/model inputs with picker partial and add third section.
- Move Run Now + per-config override into Configuration tab.
- Add topics explanatory texts and image extra instruction.
- Implement prompt preview (decision-dependent).

