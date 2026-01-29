# UI Components

## Overview
UI Components provides a project-scoped, backend-managed way to deliver small reusable UI widgets (HTML + JS + optional CSS) to external websites via a lightweight browser SDK.

The system supports:
- Projects identified by `projectId` (`^prj_[a-z0-9]{8,32}$`).
- Public vs private projects.
- Assigning specific components to a project.
- Fetching a project manifest and individual components via JSON endpoints.
- A browser SDK that injects `window.uiCmp` and `window.uiComponents`.

## Data model
### Collections
- `ui_components`
  - `code` (unique)
  - `name`
  - `html`, `css`, `js`
  - `usageMarkdown`, `api`
  - `version`
  - `isActive`

- `ui_component_projects`
  - `projectId` (unique)
  - `name`
  - `isPublic`
  - `apiKeyHash` (sha256)
  - `allowedOrigins`
  - `isActive`

- `ui_component_project_components`
  - `projectId`
  - `componentCode`
  - `enabled`
  - Unique index on `(projectId, componentCode)`

## Admin APIs (basic auth)
All admin APIs are protected with basic auth.

Base path:
- `/api/admin/ui-components`

Projects:
- `GET /projects`
- `POST /projects`
- `GET /projects/:projectId`
- `PUT /projects/:projectId`
- `DELETE /projects/:projectId`
- `POST /projects/:projectId/rotate-key`

Components:
- `GET /components`
- `POST /components`
- `GET /components/:code`
- `PUT /components/:code`
- `DELETE /components/:code`

Assignments:
- `GET /projects/:projectId/components`
- `POST /projects/:projectId/components/:code`
- `DELETE /projects/:projectId/components/:code`

## Admin UI help
The UI Components admin page includes a collapsible “Using the system endpoints & SDK” section that shows:
- Example calls to the public manifest and component endpoints.
- Example `<script>` and `uiCmp.init` usage for the browser SDK.
- A short project setup checklist and troubleshooting tips.

## Public/browser APIs
Base path:
- `/api/ui-components`

Endpoints:
- `GET /projects/:projectId/manifest`
  - Returns project info and enabled components.
  - Optional query `?docs=true` returns only `code`, `name`, `version`, and `usageMarkdown` for each component (omits `html`, `css`, `js`).
- `GET /projects/:projectId/components/:code`
  - Returns a single component payload.

Private projects require `x-project-key` on **every** request.

## Browser SDK
### Bundle
- Output: `public/sdk/ui-components.iife.js`
- Build script: `npm run build:sdk:ui-components:browser`
- Served from: `/public/sdk/ui-components.iife.js`

### Global API
- `window.uiCmp`
- `window.uiComponents` (alias)

Core methods:
- `uiCmp.init({ projectId, apiKey, apiUrl, cssIsolation })`
- `uiCmp.load(code)`

### CSS isolation
Supported modes:
- `cssIsolation: 'scoped'` (default)
- `cssIsolation: 'shadow'`

In scoped mode CSS is injected into `<head>`.
In shadow mode CSS is injected into the component instance shadow root.
