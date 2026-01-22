# UI Components AI assistance plan (ref-saasbackend)

## Goal
Add AI assistance to the **UI Components** admin editor so you can iteratively improve a component’s `html`, `css`, `js`, and `usageMarkdown` with fast, safe, auditable changes.

This should leverage the existing LLM infrastructure (`/admin-llm` config + `src/services/llm.service.js`) and copy the successful interaction pattern from **Virtual EJS Vibe coding**.

## Non-goals (v1)
- Automatic publishing to production without explicit human confirmation.
- Running untrusted JS server-side.
- Full visual builder.

## Reference pattern to reuse (Virtual EJS)
Virtual EJS AI assistance uses:
- Admin UI collects: `providerKey`, `model`, prompt
- Endpoint: `POST /api/admin/ejs-virtual/vibe`
- Service:
  - builds strict system prompt
  - calls `llmService.callAdhoc({ providerKey, model, messages, promptKeyForAudit })`
  - enforces a **machine-parseable patch format**
  - validates and applies patch
  - creates audit events

We’ll mirror this exactly, but for a single entity: `UiComponent`.

## UX / Admin UI changes
Location: `ref-saasbackend/views/admin-ui-components.ejs`

### New “AI Assist” panel
Add a right-side panel (or modal) available when editing a component.

Inputs:
- `providerKey` (string)
- `model` (string)
- `prompt` (textarea)
- Optional toggles:
  - Target fields: `html`, `css`, `js`, `usageMarkdown` (checkboxes)
  - Strictness level: “minimal diff” vs “rewrite”
  - Output mode: “propose patch” (default) vs “auto-apply” (disabled by default)

Actions:
- **Propose**: sends current component + prompt to server, receives patch proposal.
- **Preview**: shows diff and updated fields (no save).
- **Apply**: applies patch into editor fields; user still clicks **Save** to persist (locked-in).

### Persistence of settings
Store `providerKey` + `model` in `localStorage` similarly to Virtual EJS.

### Suggested iteration workflow
- Start from an existing component or blank fields.
- Ask AI for a change.
- Preview diff.
- Apply into editor.
- Save component (existing save API).

## Backend API design (basic auth)
We will keep basic-auth protection for admin AI endpoints.

### New endpoint: propose patch
- `POST /api/admin/ui-components/ai/components/:code/propose`

Request body:
```json
{
  "prompt": "Make the toast animate in from the bottom and add close button",
  "providerKey": "openrouter",
  "model": "x-ai/grok-code-fast-1",
  "targets": { "html": true, "css": true, "js": true, "usageMarkdown": true },
  "mode": "minimal" 
}
```

Response:
```json
{
  "component": { "code": "toast", "version": 7 },
  "proposal": {
    "patch": "FIELD: html\n<<<<<<< SEARCH\n...\n=======\n...\n>>>>>>> REPLACE\n...",
    "fields": {
      "html": "<div>...",
      "css": ".toast{...}",
      "js": "return {...}",
      "usageMarkdown": "..."
    }
  },
  "providerKey": "openrouter",
  "model": "x-ai/grok-code-fast-1"
}
```

Notes:
- We should return both:
  - **parsed updated fields** (`proposal.fields`) for easy UI fill
  - **raw patch text** for audit/debug

### Optional endpoint: apply proposal server-side (v2)
In v1, apply in UI only, then use existing save.

If needed later:
- `POST /api/admin/ui-components/ai/components/:code/apply`
  - would validate current version and write to DB

## LLM prompting strategy
### Structured patch format (field patches)
Instead of multi-file patches, we use multi-field patches.

Format:
```
FIELD: html
<<<<<<< SEARCH
[exact text]
=======
[replacement]
>>>>>>> REPLACE

FIELD: css
<<<<<<< SEARCH
...
=======
...
>>>>>>> REPLACE

FIELD: js
...
```

Rules:
- Only `FIELD:` sections, and only the target fields.
- SEARCH must match exactly against the current field content.
- Include enough context for uniqueness.
- No extra prose outside patch blocks.

### System prompt (template)
- You are a code editor assistant modifying a UI component.
- You can edit `html`, `css`, `js`, and `usageMarkdown`.
- Output ONLY patch blocks.
- Do not introduce external dependencies.
- For JS:
  - Must return an object of functions.
  - Must use `templateRootEl` for DOM lookups.
  - Must not reference `document.querySelector` without scoping.

### Context provided to the model
- Component metadata: `code`, `name`, `version`
- Current fields: `html`, `css`, `js`, `usageMarkdown`
- SDK contract snippet:
  - JS executed as `new Function('api','templateRootEl','props', js)`
  - Use `api.unmount()` and avoid leaking intervals/timeouts

### Model/provider defaults
Match Virtual EJS:
- Resolve provider/model by:
  - request body override
  - global setting `uiComponents.ai.providerKey` / `uiComponents.ai.model` (locked-in)
  - env `DEFAULT_LLM_PROVIDER_KEY` / `DEFAULT_LLM_MODEL` (fallback)
  - fallback model (explicit, same style as Virtual EJS)

## Validation & safety model
### Input validation
- `prompt` required, max length (e.g. 4k)
- Target field selection required (at least one)
- Max field sizes returned (e.g. 200KB total)

### Patch validation
- Must parse at least one `FIELD:` section.
- Only allowed fields.
- SEARCH must match exactly.
- Apply patches to get next fields.
- Reject if patch output tries to modify disallowed fields.

### Output safety
We are not executing JS server-side.
We only store it.

Optional lightweight checks (v1+):
- Emit warnings only for obvious red flags (locked-in), e.g.:
  - `fetch(` to unknown origins (allowlist?)
  - `eval(`
  - `Function(` inside component code (since we already wrap)
  - `document.cookie`

### Rate limiting
Admin-only, but still recommended:
- Per-IP or per-basic-auth actor: N requests/minute.

### Audit logging
Leverage existing audit models:
- Create an AuditEvent for proposal generation:
  - action: `uiComponents.ai.propose`
  - entityType: `UiComponent`
  - entityId: component code
  - meta: providerKey, model, targets, mode
  - store patch text length + hashes (avoid storing entire JS if too large)

Optionally store “before/after” fields in audit meta with truncation.

## Implementation milestones (later)
1) Add service `uiComponentsAi.service.js`
- resolve defaults
- build prompts
- call `llmService.callAdhoc`
- parse/apply patches

2) Add controller + route
- `adminUiComponentsAi.controller.js`
- mount under `/api/admin/ui-components/ai`

3) Update admin UI
- add AI panel
- preview/apply in client

4) Optional: add LLM prompt templates to `/admin-llm` prompts
- (or keep this flow adhoc, like Virtual EJS)

## Open questions to lock in
1) **Apply strategy (v1):** locked-in as apply into editor + manual Save.
2) **JS guardrails:** locked-in as warnings only.
3) **Defaults location:** locked-in as GlobalSettings (`uiComponents.ai.*`) with env fallback.
4) **Diff mode:** locked-in as SEARCH/REPLACE with fallback to full-field replacement.
5) **Provider/model UI:** locked-in as provider dropdown (at least provider) fed by `/api/admin/llm/config`.
