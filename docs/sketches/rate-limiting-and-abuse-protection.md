# Rate Limiting + Abuse Protection (Sketch)

## Goal
Add a reusable abuse-protection layer for common SaaS endpoints:
- Auth endpoints (login/register/reset)
- API key usage
- Webhook subscription management

This reduces fraud, credential stuffing, and accidental overload.

## Non-goals (for v1)
- Bot detection with ML
- WAF replacement

## Threat model (baseline)
- Brute force login attempts
- Password reset spamming
- API scraping
- High-rate DoS from a single key/IP

## Approach
Layered protections:
- Per-IP rate limit
- Per-user rate limit (when authenticated)
- Per-API-key rate limit (when using ApiKey auth)
- Simple lockouts on repeated failures

## Storage
Option A (simple): MongoDB-based counters
- Pros: no extra infra
- Cons: higher DB load

Option B (preferred): Redis counters
- Pros: fast, TTL-native
- Cons: extra dependency

Sketch assumes MongoDB fallback with TTL indexes.

## Data model (Mongoose)
### `RateLimitCounter`
- `key` (string, required, unique) (e.g. `ip:1.2.3.4:login`)
- `count` (number, required)
- `resetAt` (date, required, index)
- timestamps

TTL:
- TTL index on `resetAt`

## Policies (starter)
- `POST /api/auth/login`
  - 10 / 10 min per IP
  - 5 / 10 min per email
- `POST /api/auth/register`
  - 5 / hour per IP
- `POST /api/user/password-reset-request`
  - 5 / hour per IP
  - 3 / hour per email

## API behavior
When limit exceeded:
- `429 Too Many Requests`
- body: `{ "error": "Too many requests" }`
- headers:
  - `Retry-After`

## Middleware
- `rateLimit({ keyFn, limit, windowMs })`
- Key functions:
  - IP-based: `req.ip`
  - Email-based: from body
  - User-based: `req.user._id`
  - ApiKey-based: `req.apiKey._id`

## Admin visibility
### Admin (Basic Auth)
- `GET /api/admin/rate-limits?prefix=ip:`
- `DELETE /api/admin/rate-limits/:id` (optional)

## Activity logging
- Log suspicious events:
  - `rate_limited` with key and endpoint
  - `login_failed` already likely exists; ensure it’s logged

## Implementation outline (files)
- `src/models/RateLimitCounter.js`
- `src/middleware/rateLimit.js`
- Integrate middleware in:
  - `src/routes/auth.routes.js`
  - `src/routes/user.routes.js`
- `src/controllers/adminRateLimit.controller.js`
- `src/routes/adminRateLimit.routes.js`

## Testing checklist
- Exceed thresholds -> 429
- Counters reset after window
- Different keys do not collide

## Open questions
- Do we standardize rate limit config via global settings?
- Do we include a captcha hook on register/reset?
- How do we handle proxy headers safely (trust proxy)?
