# UI Components AI Assistance

## Overview
UI Components AI Assistance adds an admin-only workflow for generating and iterating on UI component `html`, `css`, `js`, and `usageMarkdown` using the configured LLM providers.

The system is modeled after the Virtual EJS “Vibe” pattern:
- Admin UI collects `providerKey`, `model`, and a natural language prompt.
- Backend calls `llm.service.callAdhoc`.
- The LLM returns a strict machine-parseable patch format.
- Backend applies patches to compute proposed field updates and returns them to the UI.
- UI applies proposed fields into the editor and requires a manual Save.

## Admin API (basic auth)
### Propose edits
- `POST /api/admin/ui-components/ai/components/:code/propose`

Request body:
- `prompt` (string)
- `providerKey` (string, optional)
- `model` (string, optional)
- `targets` (object with booleans: `html`, `css`, `js`, `usageMarkdown`)
- `mode` (`minimal` | `rewrite`)

Response:
- `proposal.fields`: computed next values for `html`, `css`, `js`, `usageMarkdown`
- `proposal.patch`: raw patch text
- `proposal.warnings`: warning messages derived from JS scanning

## Provider/model defaults
Defaults are resolved in this order:
1. Explicit `providerKey`/`model` from request body.
2. GlobalSettings:
   - `uiComponents.ai.providerKey`
   - `uiComponents.ai.model`
3. Environment variables:
   - `DEFAULT_LLM_PROVIDER_KEY`
   - `DEFAULT_LLM_MODEL`
4. Service fallback model.

## Patch format
The LLM must return only FIELD patch blocks:

- `FIELD: <fieldName>`
- One or more SEARCH/REPLACE blocks:
  - `<<<<<<< SEARCH`
  - `=======`
  - `>>>>>>> REPLACE`

Fallback:
- If exact matching is not feasible, the LLM can use `SEARCH` content `__FULL__` to replace the entire field.

## Safety and warnings
- The backend does not execute component JS.
- Basic JS guardrails are implemented as **warnings only** (e.g. presence of `eval(`, `fetch(`, `document.cookie`, `Function(`).

## Audit logging
AI proposal generation produces an audit event:
- `action`: `uiComponents.ai.propose`
- `entityType`: `UiComponent`
- `entityId`: component code
- `meta`: providerKey/model, targets, mode, warnings, patch preview (truncated)

## Admin UI integration
The UI Components admin page includes an **AI Assist** panel:
- Provider dropdown populated from `GET /api/admin/llm/config`
- Model input, prompt input, targets and mode
- Propose → preview patch/warnings → Apply into editor fields → manual Save
