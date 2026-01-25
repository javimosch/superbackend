---
description: AI assistance for Pages SSR context blocks (generate/propose + manual apply/test)
---

# Pages Context Blocks AI Assistance

## Overview
The Page Builder admin UI includes an AI assistant to help create and edit Pages SSR context blocks:
- `context.db_query`
- `context.service_invoke`

The assistant generates a **single block proposal** as strict JSON. Admins manually apply the proposal to a Page and can manually test it using the built-in test endpoints.

## Admin UI
Location:
- Page Builder → **Blocks** → **Context Blocks**

Capabilities:
- Generate a new `context.*` block from a prompt.
- Propose edits to a selected existing `context.*` block.
- Apply proposal:
  - If a `context.*` block is selected, apply replaces its `type/props`.
  - Otherwise, apply adds a new `context.*` block to the current page.
- Test proposal:
  - Runs against the existing admin test endpoints.
  - Supports optional `mockContext` JSON.

Block selection:
- Blocks in the Page editor are selectable (click) and the selected block is highlighted.

## AI endpoints
All endpoints are basic-auth protected and rate-limited via `aiOperationsLimiter`.

- `POST /api/admin/pages/ai/context-blocks/generate`
  - Request body:
    - `prompt` (string, required)
    - `blockType` (`context.db_query` | `context.service_invoke`, required)
    - `providerKey` (string, optional)
    - `model` (string, optional)
  - Response:
    - `proposal` ({ type, props })
    - `warnings` (string[])

- `POST /api/admin/pages/ai/context-blocks/propose`
  - Request body:
    - `prompt` (string, required)
    - `currentBlock` ({ type, props }, required)
    - `providerKey` (string, optional)
    - `model` (string, optional)
  - Response:
    - `proposal` ({ type, props })
    - `warnings` (string[])

## JSON contract
AI responses must be a single JSON object:
```json
{ "type": "context.db_query|context.service_invoke", "props": {} }
```

Validation is enforced server-side:
- `type` must be one of the supported `context.*` block types.
- `props` must be an object.
- `props.cache` and `props.timeout` are validated for shape when provided.

## LLM defaults
The assistant reuses the existing Blocks AI default resolution:
- Resolver system keys:
  - `pageBuilder.blocks.generate`
  - `pageBuilder.blocks.propose`
- Legacy global settings keys:
  - `pageBuilder.blocks.ai.providerKey`
  - `pageBuilder.blocks.ai.model`

UI requests may override provider/model per call.

## Prompt context
The system prompt includes:
- Available `$ctx` roots (`params`, `query`, `auth`, `session`, `vars`, `pageContext`)
- Block prop schemas for each supported context block type
- Examples
- A preview list of invokable helper namespaces:
  - `helpers.services.<serviceName>.*`
  - `helpers.models.<ModelName>.*`
  - `helpers.mongoose.*`

A denylist of high-risk service namespaces is also included.

## Testing
The UI test action calls:
- If editing a saved Page: `POST /api/admin/pages/pages/:id/test-block`
- Otherwise: `POST /api/admin/pages/test-block`

Both support:
- `block`: the proposed `{ type, props }`
- `mockContext`: optional object merged into page context for the test run
