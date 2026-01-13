# Plan: Headless CMS – Advanced JSON Model Config + AI-assisted Model Builder

## Goal
Define headless CMS models faster by enabling:

1. **Advanced mode**: create/update a headless model definition via a raw JSON config (with validation + preview).
2. **Optional AI assistance**: a simple chat that proposes the JSON config, supports follow-ups to refine it, and requires explicit approval before saving.

This plan leverages the existing LLM system:

- `src/services/llm.service.js` (`call` / `callAdhoc`)
- `src/controllers/adminLlm.controller.js` and the admin LLM config UI

And targets the existing Headless CMS model definition contract:

- Model definition persistence: `src/models/HeadlessModelDefinition.js`
- Business logic + validation: `src/services/headlessModels.service.js`
- Admin CRUD endpoints: `src/controllers/adminHeadless.controller.js`

## Non-goals (for first iteration)
- Multi-tenant isolation beyond existing admin/basic-auth boundaries.
- Automatic migrations beyond current `ensureAutoMigration()` behavior.
- Complex relational schema modelling (many-to-many, polymorphic relations).

## Decisions (locked-in)
- Chat history is **client-only per page session** (lost on full refresh).
- AI assistance supports **both create and update** flows.
- AI can propose **multiple model changes in one proposal** (e.g. create a new model and update an existing model to reference it).
- Internal/server-owned fields in JSON input are **ignored with warnings** (not treated as errors).
- Additional schema capabilities are planned and implemented **before** AI assistance.
- Schema extensions to implement before AI:
  - model-level `indexes`
  - arrays of references
  - string `minLength` / `maxLength`
- Multi-model apply is **best-effort** (no transaction requirement).
- Updates are expressed as **patch ops** (not full replacement).
- A single proposal may contain **forward references** (create + update that references created model).

## Current model definition shape (authoritative)
As implemented today, a model definition is:

- `codeIdentifier`: `/^[a-z][a-z0-9_]*$/`
- `displayName`: required
- `description`: optional
- `fields`: array of `{ name, type, required, unique, default, validation, refModelCode }`

Supported field `type` values (as of `toMongooseField()`):

- `string`, `number`, `boolean`, `date`
- `object`, `array`
- `ref` / `reference` (requires `refModelCode`)
- `ref[]` / `ref_array` / `refarray` (requires `refModelCode`)

Supported `validation` keys (as of `toMongooseField()`):

- `min`, `max`, `enum`, `match`, `minLength`, `maxLength`

Model-level indexes are supported via:

- `indexes: [{ fields: { fieldName: 1 }, options: { unique?: true, sparse?: true, name?: string } }]`

## Phase 1 — Advanced JSON mode (no AI)

### Outcome
In the `/admin/headless` model editor, users can switch to an **Advanced** tab/mode and:

- paste/edit a full model definition JSON
- validate it server-side
- preview parsed/normalized result
- save it via the existing create/update endpoints

Users can still use the existing “manual” schema editor.

### API additions
Add a *validation-only* endpoint to avoid “trial saves”:

- `POST /api/admin/headless/models/validate`

Implemented in:

- `src/controllers/adminHeadless.controller.js` (`validateModelDefinition`)
- `src/routes/adminHeadless.routes.js`

Request:

```json
{
  "definition": {
    "codeIdentifier": "posts",
    "displayName": "Posts",
    "description": "Blog posts",
    "fields": [
      {"name": "title", "type": "string", "required": true},
      {"name": "published", "type": "boolean", "default": false},
      {"name": "author", "type": "ref", "refModelCode": "users"}
    ]
  }
}
```

Response (example):

```json
{
  "valid": true,
  "normalized": { "..." },
  "warnings": ["..."]
}
```

Validation strategy:

- Reuse existing validation paths where possible:
  - `normalizeCodeIdentifier()`
  - `toMongooseField()`
- Add extra “advanced mode” validations:
  - unique field names
  - disallow reserved names: `_id`, `_headlessModelCode`, `_headlessSchemaVersion`
  - validate `validation.match` is a valid regex (or define allowed regex string format)
  - optional warnings:
    - `unique: true` on nullable fields
    - unsupported validation keys ignored
    - ignore server-owned fields if present (warn): `version`, `fieldsHash`, `previousFields`, `isActive`, timestamps

### Admin UI changes
In `/admin/headless`:

- Add a mode toggle:
  - **Simple** (existing UI)
  - **Advanced (JSON)**
- Advanced mode contains:
  - JSON editor textarea
  - “Validate” button (calls `/validate`)
  - “Save” button (calls existing create/update endpoints)
  - “Load from existing” button to prefill JSON from current model
  - show warnings / field-level errors clearly

### Backward compatibility
- Saving via advanced mode uses the same create/update endpoints, so existing consumers remain unchanged.

## Phase 2 — AI-assisted Model Builder (optional)

### Outcome
From the model creation page, users can choose:

- **Manual**: use existing editor
- **Advanced JSON**: paste JSON directly
- **AI assist**: chat -> proposed JSON -> approve -> save

### Core UX
- A chat panel with:
  - message history (simple, chronological)
  - “Clear history” action (resets chat state)
  - “Use current JSON as context” always on (if a draft JSON exists)
  - “Apply proposal to editor” (copies the proposed JSON into advanced editor)

Principle: AI never directly persists model definitions. Only proposes JSON.

### API additions
All endpoints are admin/basic-auth.

Chat history is client-only, so the server API is stateless.

1) Send a message (follow-up):

- `POST /api/admin/headless/ai/model-builder/chat`

Implemented in:

- `src/controllers/adminHeadless.controller.js` (`aiModelBuilderChat`)
- `src/routes/adminHeadless.routes.js`

Environment variables:

- `HEADLESS_AI_PROVIDER_KEY` (default `openrouter`)
- `HEADLESS_AI_MODEL` (default `google/gemini-2.5-flash-lite`)

Request:

```json
{
  "message": "I need a model for blog posts with title, slug, body, status and author",
  "currentDefinition": { "... optional current JSON draft ..." },
  "history": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ]
}
```

Response:

```json
{
  "assistantMessage": "...human explanation...",
  "proposal": {
    "creates": [{ "...model definition JSON..." }],
    "updates": [{ "codeIdentifier": "posts", "patch": { "...partial updates..." } }]
  },
  "warnings": ["..."],
  "validation": { "valid": true, "errors": [] }
}
```

2) Clear history is client-side only (no API).

### Prompting design (uses existing `llm.service.callAdhoc`)
Use a **system-like instruction** embedded in the first message (since `callAdhoc` sends raw `messages`).

Base context should always include:

- **Current JSON config** (if any)
- **Cheat-sheet** (supported fields/types/validation keys)
- **Hard constraints**:
  - output must include a `proposal` JSON object with the authoritative schema
  - must not invent unsupported types
  - must not include server secrets
  - can propose multiple model operations using `{ creates: [], updates: [] }`

Recommended output format:

- Require the model to return **strict JSON** with keys:
  - `assistantMessage` (string)
  - `proposal` (object)
  - `questions` (array of strings)
  - `warnings` (array of strings)

If strict JSON is unreliable for your chosen provider/model, accept plain text but additionally run a “JSON extraction” pass (second LLM call) — only if needed.

### Validation + safety
- Always validate every `proposal.creates[]` and every `proposal.updates[].ops` by applying ops on top of the current definition in-memory and running the same validator.
- On invalid proposals:
  - return `valid:false` with errors
  - UI keeps the proposal but indicates it cannot be applied until fixed

### Provider selection
- Default to a configured provider (example matches existing workflow service default `openrouter`).
- Add a server-side config entry for the model-builder prompt:
  - store in existing `llm.prompts` config OR a dedicated headless-ai config key

### Audit logging
- Reuse `llm.service` audit event logging (`AuditEvent` model).
- Add additional metadata to audit entry (if feasible):
  - `feature: "headless.aiModelBuilder"`
  - `codeIdentifier` if present in proposal

## Phase 3 — Quality improvements

## Phase 0 (must happen before Phase 2) — Schema extensions

### Outcome
Expand the headless model definition language before adding AI, so the AI does not “invent” capabilities.

### Candidate extensions (to be confirmed)
- Add explicit `indexes` support at the model level (e.g. compound indexes, unique indexes).
- Extend field types (example set):
  - arrays of primitives with item typing
  - arrays of refs
  - richer object typing (nested schema) or explicitly keep objects untyped
- Extend validation surface:
  - string length constraints (`minLength`, `maxLength`)
  - number precision
  - date ranges
  - required + default interaction rules

### Migration implications
Define how these affect `ensureAutoMigration()` and whether index creation runs automatically or requires manual action.

Implemented behavior:

- Indexes are declared on the dynamic Mongoose schema and applied to the underlying Mongo collection using best-effort index creation when a dynamic model is loaded.

### Cheat-sheet source of truth
Create a single, maintained cheat-sheet text template generated from code constants (or keep it static initially):

- supported field types
- supported validation keys
- reserved field names
- examples

### Guardrails
- Enforce a maximum fields count per model (configurable) to prevent absurd payloads.
- Enforce max `history` messages length and/or token budget.
- Rate-limit AI endpoints (per IP / per admin session).

### Better follow-ups
- When the user asks a follow-up, pass:
  - the last valid proposal
  - the diff between current draft and last proposal (optional)

## Testing strategy

### Unit
- Validate endpoint:
  - accepts valid definitions
  - rejects invalid `codeIdentifier`
  - rejects unsupported types
  - requires `refModelCode` for `ref`
  - rejects reserved field names

### Integration
- Create model via advanced JSON -> `getDynamicModel()` can instantiate schema
- Update model and verify `version` increments + `ensureAutoMigration()` does not error

### Manual
- AI flow:
  - start with no draft, generate proposal, apply, validate, save
  - follow-up refines (e.g. add slug unique)
  - clear history after “bad path” and re-run with current JSON only

## Rollout / feature flag
Make AI assistance optional via config:

- `HEADLESS_AI_MODEL_BUILDER_ENABLED=true|false`

(Or store in `GlobalSetting`, consistent with other admin-config patterns.)

## Open questions (need answers before implementation)
Resolved:

- Patch ops implemented:
  - `setDisplayName`
  - `setDescription`
  - `addField`
  - `removeField`
  - `replaceField` (rename not supported)
  - `addIndex`
  - `removeIndex`
- Index creation timing: indexes are created best-effort when the model is loaded (no separate sync endpoint).
- Forward refs: creates are processed before updates and validation allows refs to models listed in `creates[]`.

Known limitations:

- Apply is best-effort; if a create fails, later updates referencing that model may fail validation or update.

