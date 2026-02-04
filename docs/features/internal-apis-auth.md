# Internal APIs Authentication

## Overview
Internal APIs (`/api/internal/*`) use Basic Authentication for privileged system access. This aligns with the existing SuperBackend authentication patterns and eliminates the need for custom bearer tokens.

## Authentication Method
- **Basic Auth**: Username/password via `Authorization: Basic <base64>` header
- Credentials configured via environment variables with fallback chain:
  1. `INTERNAL_CRON_USERNAME` / `INTERNAL_CRON_PASSWORD` (primary)
  2. `ADMIN_USERNAME` / `ADMIN_PASSWORD` (first fallback)
  3. `BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD` (second fallback)
  4. `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` (third fallback)
  5. Defaults to `admin` / `admin` if none set

## Internal API Routes

### Blog Internal API (`/api/internal/blog/*`)
- `/api/internal/blog/automation/run` - Trigger blog automation
- `/api/internal/blog/publish-scheduled/run` - Publish scheduled posts
- Protected by: `basicAuth` middleware
- Rate limited by: `blogAiLimiter` (automation), no limiter (publish)

### Experiments Internal API (`/api/internal/experiments/*`)
- `/api/internal/experiments/aggregate/run` - Aggregate experiment events
- `/api/internal/experiments/retention/run` - Cleanup old data
- Protected by: `basicAuth` middleware
- Rate limited by: `experimentsInternalAggLimiter`, `experimentsInternalRetentionLimiter`

## Cron Job Configuration
Cron jobs created by bootstrap services use Basic Auth with fallback chain:
```javascript
httpAuth: {
  type: 'basic',
  username: process.env.INTERNAL_CRON_USERNAME || 
            process.env.ADMIN_USERNAME || 
            process.env.BASIC_AUTH_USERNAME || 
            process.env.BASIC_AUTH_USER || 
            'admin',
  password: process.env.INTERNAL_CRON_PASSWORD || 
            process.env.ADMIN_PASSWORD || 
            process.env.BASIC_AUTH_PASSWORD || 
            process.env.BASIC_AUTH_PASS || 
            'admin'
}
```

## Security Considerations
- Basic Auth should be used over HTTPS only
- Internal APIs are privileged endpoints; restrict network access
- Rotate credentials regularly in production
- Use any of the supported environment variable pairs:
  - `INTERNAL_CRON_USERNAME`/`INTERNAL_CRON_PASSWORD` (recommended for cron jobs)
  - `ADMIN_USERNAME`/`ADMIN_PASSWORD` (admin UI credentials)
  - `BASIC_AUTH_USERNAME`/`BASIC_AUTH_PASSWORD` (generic Basic Auth)
  - `BASIC_AUTH_USER`/`BASIC_AUTH_PASS` (shorter variant)

## Migration from Bearer Tokens
Previously used custom bearer tokens stored in GlobalSetting:
- `blog.internalCronToken`
- `experiments.internalCronToken`

These have been removed in favor of environment-based Basic Auth for:
- Simplicity and reliability
- Consistency with existing auth patterns
- No database state dependency for internal auth
