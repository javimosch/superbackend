# Plan: Add “How to use the system endpoints” section to UI Components admin page

## Goal
Add a dedicated, always-visible section in the UI Components admin page that explains how to use the public/browser endpoints and the browser SDK (`window.uiCmp`). This should help developers integrate the system without digging through feature docs.

## Placement
Add a new top-level section on the UI Components admin page, after the main header and before the Projects/Components/Assignments grid. It should be collapsible/expandable to avoid cluttering the workflow.

## Content outline
### Title
“Using the system endpoints & SDK”

### Subsections
1) **Public API endpoints**
   - Manifest endpoint: `GET /api/ui-components/manifest/:projectId`
   - Component endpoint: `GET /api/ui-components/component/:code`
   - Required headers:
     - `x-project-key` for private projects
     - Optional `Origin` checks (allowedOrigins)
   - Example curl commands
   - Example JSON responses (manifest structure, component structure)

2) **Browser SDK**
   - Script tag: `<script src="/public/sdk/ui-components.iife.js"></script>`
   - Initialization:
     ```js
     uiCmp.init({ projectId, apiKey, apiUrl });
     // or alias
     uiComponents.init({ projectId, apiKey, apiUrl });
     ```
   - Usage examples:
     - Render a component by code
     - Pass props
     - Unmount
   - CSS isolation options (scoped vs Shadow DOM)

3) **Project setup checklist**
   - Create project (public/private)
   - Add components to project
   - For private projects: copy API key (shown once)
   - Add allowed origins (optional)
   - Use the SDK or raw endpoints

4) **Troubleshooting**
   - 401/403 for private projects without key
   - Origin mismatches
   - Component not found
   - SDK not loaded

## UI/UX details
- Collapsible section (default collapsed, expandable via button)
- Collapse state is remembered in `localStorage`.
- Use Tailwind styling to match the rest of the page.
- Use `<pre><code>` blocks for examples with placeholder API keys.
- Include the current `baseUrl` dynamically in example URLs and SDK init config.
- Keep it concise; link to `docs/features/ui-components.md` for full reference if needed.

## Decisions
- Section remembers expanded/collapsed state via `localStorage`.
- No “Copy to clipboard” buttons for snippets in v1.
- Examples use placeholders for API keys, not real keys.
- `baseUrl` is injected dynamically into examples and SDK init snippets.

## Implementation notes
- Add the section in `ref-saasbackend/views/admin-ui-components.ejs`
- Use Vue reactive data for collapse state
- Optionally add localStorage persistence for collapse state
- No backend changes required (pure UI/documentation addition)
