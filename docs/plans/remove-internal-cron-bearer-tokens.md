# Plan: Remove internal cron bearer tokens and use Basic Auth/JWT for internal APIs

## Problem statement
Internal APIs (e.g., `/api/internal/*`) previously used custom bearer tokens stored in GlobalSetting (`experiments.internalCronToken`, `blog.internalCronToken`). This pattern:
- Added unnecessary complexity (bootstrap, token storage, cache invalidation)
- Caused 403 failures when cache/stored token diverged
- Was inconsistent with the rest of the system, which uses either:
  - **Basic Auth** for privileged internal/system access (admin superadmin)
  - **JWT + RBAC** for user-scoped access

## Goal
Standardize internal API authentication to use existing patterns:
- **Basic Auth** for privileged internal/system calls (cron jobs, internal services)
- **JWT + RBAC** when user context is needed
- Remove all custom internal bearer token infrastructure

## Current state analysis

### Internal APIs using custom bearer tokens
- `/api/internal/blog/*` (used `requireInternalCronToken` with `blog.internalCronToken`)
- `/api/internal/experiments/*` (used `requireInternalExperimentsCronToken` with `experiments.internalCronToken`)

### Existing privileged internal patterns
- **Basic Auth**: `basicAuth` middleware in `src/middleware/auth.js` (used by many admin routes)
- **RBAC superadmin bypass**: `isBasicAuthSuperAdmin` in `src/middleware/rbac.js` (allows Basic Auth to bypass RBAC)
- **CronJob model**: supports `httpAuth.type: 'basic'` in addition to `'bearer'`

## Implementation steps

1. **Add environment variables** 
   - `INTERNAL_CRON_USERNAME` (default: `admin`)
   - `INTERNAL_CRON_PASSWORD` (default: `admin`)

2. **Update cron bootstraps** 
   - Remove token generation/GlobalSetting code
   - Change `httpAuth` to Basic Auth using env vars

3. **Update internal routes** 
   - Replace custom auth middlewares with `basicAuth`

4. **Delete unused files** 
   - `src/middleware/internalCronAuth.js`
   - `src/middleware/internalExperimentsCronAuth.js`
   - Their tests (if any)

5. **Delete GlobalSettings** (optional)
   - `blog.internalCronToken`
   - `experiments.internalCronToken`
   - (Optional: leave for compatibility; they will become unused)

## Advantages

- **Simplicity**: No token sync/cache issues
- **Consistency**: Aligns with existing privileged internal auth pattern
- **Operational**: Credentials are env vars, not database state
- **Security**: Basic Auth over HTTPS is sufficient for internal privileged calls

## Open questions

- Should we use the same `ADMIN_USERNAME`/`ADMIN_PASSWORD` as admin UI, or dedicated `INTERNAL_CRON_*` env vars?
  - Recommendation: Dedicated env vars to allow rotating admin credentials without breaking cron jobs.

## Files changed

- `src/services/blogCronsBootstrap.service.js` - Updated to use Basic Auth
- `src/services/experimentsCronsBootstrap.service.js` - Updated to use Basic Auth
- `src/routes/blogInternal.routes.js` - Replaced custom auth with basicAuth
- `src/routes/internalExperiments.routes.js` - Replaced custom auth with basicAuth
- `.env.example` - Added INTERNAL_CRON_USERNAME/PASSWORD documentation
- Deleted: `src/middleware/internalCronAuth.js`, `src/middleware/internalExperimentsCronAuth.js`, `src/middleware/internalCronAuth.test.js`

## Testing

- Verify cron jobs run successfully with Basic Auth
- Verify manual calls to `/api/internal/*` work with Basic Auth
- Ensure no 403s after restart/cache clear
- Run existing cron-related tests

## Status: COMPLETED

All internal APIs now use Basic Auth for authentication. The custom bearer token infrastructure has been removed, eliminating the 403 synchronization issues.
