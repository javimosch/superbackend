# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Common commands

### Install
```bash
npm ci
```

### Run (standalone dev server)
```bash
npm run dev
```

### Run (standalone prod-ish)
```bash
npm start
```

### Tests (Jest)
```bash
npm test
```

Run a single test file:
```bash
npm test -- path/to/some.test.js
```

Run tests matching a name/pattern:
```bash
npm test -- -t "pattern"
```

Watch mode / coverage:
```bash
npm run test:watch
npm run test:coverage
```

### Docker (local)
Start the app via Docker (hot-reloads the repo into the container):
```bash
docker compose -f compose.standalone.yml --profile app up --build
```

Start a local S3-compatible MinIO (for S3-backed storage development):
```bash
npm run start:minio
# or:
# docker compose -f compose.standalone.yml --profile minio-only up -d minio
```

Print MinIO/S3 env vars expected by the app:
```bash
npm run minio:envs
```

### Build browser SDK bundles
This repo ships small browser bundles under `sdk/` and `public/sdk/` (built with esbuild):
```bash
npm run build:sdk:error-tracking:browser
npm run build:sdk:ui-components:browser
```

### Linting
No dedicated linter/formatter script is configured in `package.json` at the moment.

## Architecture overview (big picture)

### Primary entrypoints
- `index.js` is the package entrypoint (`"main"` in `package.json`).
  - Exposes `middleware(options)` (the core Express router) and `server(options)` (starts a standalone server).
  - Loads environment via `dotenv` and supports selecting a different env file using `ENV_FILE`.
  - Re-exports many `services` and `models` for programmatic use.
- `server.js` is the minimal standalone runner used by `npm start` / `npm run dev`.

### Typical usage (middleware mode)
- This package is intended to be mounted as middleware inside another Express app (README example mounts it under a prefix like `/saas`).
  - Most routes are relative to where the router is mounted (e.g., if mounted at `/saas`, admin UI defaults to `/saas/admin`).

### Core runtime
- `src/middleware.js` builds the Express `router` that provides the full “SuperBackend” surface.
  - Connects to MongoDB via Mongoose (or uses an existing connection).
  - Configures CORS, parsing middleware, static file serving, and error capture.
  - Mounts the API surface under `/api/*` and the admin UI under `adminPath` (defaults to `/admin`).
  - Sets up session storage for admin auth using `express-session` + `connect-mongo`.
  - Boots background systems after DB connection (cron scheduler, health checks, blog crons, experiments crons) unless disabled via `options.cron.enabled === false`.
  - Boots Telegram integration unless disabled via `options.telegram.enabled === false`.
  - Bootstraps the plugin runtime and exposes plugin-provided contracts via `superbackend.services.pluginsRuntime` / `superbackend.helpers.pluginsRuntime`.

### Request routing pattern
- Routes live in `src/routes/*.routes.js` and are mounted directly inside `src/middleware.js`.
- Most route modules delegate to `src/controllers/*` (HTTP-level logic), which in turn call `src/services/*` (domain/integration logic).
- Data persistence is primarily through Mongoose models in `src/models/*`.
- The “public pages” system is handled by `src/routes/pages.routes.js` and is mounted last as a catch-all (so it sees unmatched requests).

### Admin UI
- Server-rendered admin pages are EJS templates in `views/` (rendered directly from `src/middleware.js`).
- Static assets live in `public/` and are served both directly and under `${adminPath}/assets`.

### Auth & RBAC (where to look)
- JWT API auth middleware: `src/middleware/auth.js` (`authenticate`).
- Admin auth is session-based with a basic-auth fallback for compatibility (`adminSessionAuth` / `adminAuth`).
- RBAC checks:
  - Middleware helpers in `src/middleware/rbac.js`.
  - The grant evaluation engine and DB-backed grant lookup in `src/services/rbac.service.js`.

### WebSockets
- The middleware router exposes `router.attachWs(server)`.
- Terminal WebSocket endpoint is attached in `src/services/terminalsWs.service.js` (upgrade handler on the HTTP server).

### Plugins system
- Local runtime plugins are discovered from `plugins/` (and optional extra roots).
- The plugin system is implemented in `src/services/plugins.service.js`.
  - Plugin enablement/state is persisted via the `JsonConfig` model (key `open-registry-plugins-state`).
  - Discovered plugins are synced into an internal registry (see `src/services/registry.service.js`).

## Repo-specific agent rules (imported from other instruction files)

### From `CLAUDE.md`
- Don’t create new standalone documentation files unnecessarily; only create feature docs under `docs/features/` when explicitly requested per feature.
- Prefer small updates to existing docs when improving an existing feature.
- Be straightforward about what was actually done; don’t claim credit for changes you didn’t make.

### From `GEMINI.md`
- If asked to “execute [workflow name] flow” (example: “execute documentation assistant flow”), first read `GEMINI-flows.md` and then follow the named flow steps exactly.