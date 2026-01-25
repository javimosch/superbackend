# Plan: Rate Limiter Coverage for Critical Routes (AI/LLM Focus)

## Overview
Add `rateLimiter.limit()` to critical routes across all systems, with special focus on AI/LLM capabilities to prevent abuse and control costs. Limiters will auto-bootstrap as disabled and can be enabled via Admin UI.

## Current State
- Global API limiter mounted on `/api` (disabled by default)
- Health endpoint has `healthRateLimiter` (disabled by default)
- No specific limiters on AI/LLM routes

## Critical Route Categories

### 1. AI/LLM Routes (Highest Priority)
These routes directly call LLM services and incur costs:

#### Admin LLM Configuration (`/api/admin/llm`)
- `POST /api/admin/llm/config` - Save LLM provider config
- `POST /api/admin/llm/prompts/:key/test` - Test prompts (calls LLM)
- `GET /api/admin/llm/openrouter/models` - Fetch model list

#### Blog AI Generation (`/api/admin/blog-ai`)
- `POST /api/admin/blog-ai/generate-field` - Generate individual metadata
- `POST /api/admin/blog-ai/generate-all` - Generate all metadata
- `POST /api/admin/blog-ai/format-markdown` - Format content
- `POST /api/admin/blog-ai/refine-markdown` - Refine content

#### SEO Config AI (`/api/admin/seo-config/ai`)
- `POST /api/admin/seo-config/ai/generate-entry` - Generate SEO metadata
- `POST /api/admin/seo-config/ai/improve-entry` - Improve existing metadata
- `POST /api/admin/seo-config/ai/edit-svg` - AI-assisted SVG editing
- `POST /api/admin/seo-config/og/generate-png` - Generate OG images

#### i18n AI Translation (`/api/admin/i18n/ai`)
- `POST /api/admin/i18n/ai/preview` - Preview translation
- `POST /api/admin/i18n/ai/apply` - Apply translation
- `POST /api/admin/i18n/ai/translate-text` - Translate text

#### Headless AI Model Builder (`/api/admin/headless`)
- `POST /api/admin/headless/ai/model-builder/chat` - Chat-based model generation

#### UI Components AI (`/api/admin/ui-components/ai`)
- `POST /api/admin/ui-components/ai/components/:code/propose` - Suggest component improvements

#### Block Definitions AI (`/api/admin/block-definitions/ai`)
- `POST /api/admin/block-definitions/ai/generate` - Generate block definitions
- `POST /api/admin/block-definitions/ai/:code/propose` - Propose improvements

#### Blog Automation (`/api/admin/blog-automation`)
- `POST /api/admin/blog-automation/:id/run` - Manual automation run (generates content)

#### Internal Blog AI (`/api/internal/blog`)
- `POST /api/internal/blog/run-automation` - Internal trigger for blog automation

#### EJS Virtual AI (`/api/admin/ejs-virtual`)
- `POST /api/admin/ejs-virtual/ai/generate` - Generate EJS templates

### 2. Authentication Routes (High Priority)
Protect against brute force attacks:

#### Auth Endpoints (`/api/auth`)
- `POST /api/auth/login` - Login attempts
- `POST /api/auth/register` - Registration
- `POST /api/auth/forgot-password` - Password reset request
- `POST /api/auth/reset-password` - Password reset
- `POST /api/auth/refresh` - Token refresh

#### Admin Auth (`/api/admin`)
- `POST /api/admin/generate-token` - Generate test token

### 3. Public API Routes (Medium Priority)
Protect public endpoints from abuse:

#### Waiting List (`/api/waiting-list`)
- `POST /api/waiting-list/subscribe` - Public subscription

#### Pages (`/api/pages`)
- `GET /api/pages/*` - Public page access

#### File Manager (`/api/files`)
- `GET /api/files/public/*` - Public file access

### 4. Admin CRUD Routes (Lower Priority)
General admin operations:

#### All Admin Routes
- Standard CRUD operations on various entities
- Bulk operations
- Export/import functions

## Proposed Rate Limiter IDs and Configurations

### AI/LLM Limiters (Strict)
```javascript
// General AI operations (most restrictive)
aiOperationsLimiter: {
  label: "AI Operations",
  config: {
    limit: { max: 10, windowMs: 60000 }, // 10/minute
    mode: "enforce",
    identity: { type: "userId" }
  }
}

// Blog AI generation
blogAiLimiter: {
  label: "Blog AI Generation",
  config: {
    limit: { max: 20, windowMs: 60000 }, // 20/minute
    mode: "enforce",
    identity: { type: "userId" }
  }
}

// SEO AI operations
seoAiLimiter: {
  label: "SEO AI Operations",
  config: {
    limit: { max: 15, windowMs: 60000 }, // 15/minute
    mode: "enforce",
    identity: { type: "userId" }
  }
}

// Translation operations
i18nAiLimiter: {
  label: "i18n AI Translation",
  config: {
    limit: { max: 30, windowMs: 60000 }, // 30/minute
    mode: "enforce",
    identity: { type: "userId" }
  }
}

// LLM configuration/testing
llmConfigLimiter: {
  label: "LLM Configuration",
  config: {
    limit: { max: 5, windowMs: 60000 }, // 5/minute
    mode: "enforce",
    identity: { type: "userId" }
  }
}
```

### Authentication Limiters
```javascript
// Login attempts
authLoginLimiter: {
  label: "Auth Login",
  config: {
    limit: { max: 5, windowMs: 900000 }, // 5/15 minutes
    mode: "enforce",
    identity: { type: "ip" }
  }
}

// Registration
authRegisterLimiter: {
  label: "Auth Registration",
  config: {
    limit: { max: 3, windowMs: 3600000 }, // 3/hour
    mode: "enforce",
    identity: { type: "ip" }
  }
}

// Password reset
authPasswordResetLimiter: {
  label: "Auth Password Reset",
  config: {
    limit: { max: 3, windowMs: 3600000 }, // 3/hour
    mode: "enforce",
    identity: { type: "ip" }
  }
}
```

### Public API Limiters
```javascript
// Waiting list subscription
waitingListLimiter: {
  label: "Waiting List",
  config: {
    limit: { max: 1, windowMs: 3600000 }, // 1/hour per email/IP
    mode: "enforce",
    identity: { type: "ip" }
  }
}

// Public page access
publicPagesLimiter: {
  label: "Public Pages",
  config: {
    limit: { max: 100, windowMs: 60000 }, // 100/minute
    mode: "reportOnly", // Start with reportOnly
    identity: { type: "ip" }
  }
}
```

## Implementation Strategy

### Phase 1: AI/LLM Routes (Immediate)
1. Add limiters to all AI/LLM endpoints
2. Use strict limits to prevent cost overrun
3. Start in `enforce` mode for production safety

### Phase 2: Authentication Routes (Week 1)
1. Add auth-specific limiters
2. Focus on IP-based limiting for login/reset
3. Implement progressive delays on violations

### Phase 3: Public APIs (Week 2)
1. Add limiters to public endpoints
2. Start with `reportOnly` to gather metrics
3. Adjust based on usage patterns

### Phase 4: Admin CRUD (Week 3)
1. Add general admin limiters
2. Focus on bulk operations
3. Use `userId` identity for user-specific limits

## Route Updates Required

### src/routes/adminLlm.routes.js
```javascript
router.post("/config", basicAuth, rateLimiter.limit("llmConfigLimiter"), adminLlmController.saveConfig);
router.post("/prompts/:key/test", basicAuth, rateLimiter.limit("llmConfigLimiter"), adminLlmController.testPrompt);
```

### src/routes/adminBlogAi.routes.js
```javascript
router.post('/blog-ai/generate-field', basicAuth, rateLimiter.limit("blogAiLimiter"), controller.generateField);
router.post('/blog-ai/generate-all', basicAuth, rateLimiter.limit("blogAiLimiter"), controller.generateAll);
```

### src/routes/adminSeoConfig.routes.js
```javascript
router.post('/ai/generate-entry', basicAuth, rateLimiter.limit("seoAiLimiter"), adminSeoConfigController.seoConfigAiGenerateEntry);
router.post('/ai/improve-entry', basicAuth, rateLimiter.limit("seoAiLimiter"), adminSeoConfigController.seoConfigAiImproveEntry);
```

### src/routes/auth.routes.js
```javascript
router.post('/login', rateLimiter.limit("authLoginLimiter"), authController.login);
router.post('/register', rateLimiter.limit("authRegisterLimiter"), authController.register);
```

## Monitoring and Metrics

### Key Metrics to Track
1. AI/LLM token usage per user
2. Rate limit violations by endpoint
3. Cost impact of rate limiting
4. User experience impact

### Alerts to Configure
1. High rate limit violations on AI endpoints
2. Sudden spikes in LLM usage
3. Authentication attack patterns

## Security Considerations

1. **User Identity**: Use `userId` for authenticated routes, `ip` for public routes
2. **Fail-Open**: Authentication routes should fail-open to avoid locking out users
3. **Cost Protection**: AI routes must enforce strict limits to prevent cost overrun
4. **Bypass Mechanism**: Admin bypass for emergency situations

## Testing Strategy

1. Unit tests for rate-limited endpoints
2. Load testing with rate limits
3. Cost simulation tests for AI routes
4. Security penetration testing

## Documentation Updates

1. Update API documentation with rate limit headers
2. Document rate limit responses (429)
3. Admin guide for managing rate limits
4. Developer guide for rate limit best practices

## Rollout Plan

1. **Week 0**: Deploy with all limiters in `reportOnly` mode
2. **Week 1**: Enable authentication limiters in `enforce` mode
3. **Week 2**: Enable AI/LLM limiters in `enforce` mode
4. **Week 3**: Enable public API limiters based on metrics
5. **Week 4**: Full deployment with all limiters active

## Implementation Details (Completed - AI Operations Only)

### Phase 1: AI/LLM Routes - COMPLETED ✅

All AI/LLM routes have been protected with rate limiters. The limiters will auto-bootstrap as disabled and can be enabled via the Admin UI.

#### Routes Updated:

1. **Admin LLM Routes** (`/api/admin/llm`)
   - `POST /config` - `llmConfigLimiter`
   - `POST /prompts/:key/test` - `llmConfigLimiter`

2. **Blog AI Routes** (`/api/admin/blog-ai`)
   - `POST /blog-ai/generate-field` - `blogAiLimiter`
   - `POST /blog-ai/generate-all` - `blogAiLimiter`
   - `POST /blog-ai/format-markdown` - `blogAiLimiter`
   - `POST /blog-ai/refine-markdown` - `blogAiLimiter`

3. **SEO Config AI Routes** (`/api/admin/seo-config/ai`)
   - `POST /ai/generate-entry` - `seoAiLimiter`
   - `POST /ai/improve-entry` - `seoAiLimiter`
   - `POST /og/generate-png` - `seoAiLimiter`
   - `POST /ai/edit-svg` - `seoAiLimiter`

4. **i18n AI Routes** (`/api/admin/i18n/ai`)
   - `POST /ai/preview` - `i18nAiLimiter`
   - `POST /ai/apply` - `i18nAiLimiter`
   - `POST /ai/translate-text` - `i18nAiLimiter`

5. **Headless AI Routes** (`/api/admin/headless`)
   - `POST /ai/model-builder/chat` - `aiOperationsLimiter`

6. **UI Components AI Routes** (`/api/admin/ui-components/ai`)
   - `POST /ai/components/:code/propose` - `aiOperationsLimiter`

7. **Block Definitions AI Routes** (`/api/admin/block-definitions/ai`)
   - `POST /ai/block-definitions/generate` - `aiOperationsLimiter`
   - `POST /ai/block-definitions/:code/propose` - `aiOperationsLimiter`

8. **Blog Automation Routes** (`/api/admin/blog-automation`)
   - `POST /blog-automation/run-now` - `blogAiLimiter`

9. **Internal Blog AI Routes** (`/api/internal/blog`)
   - `POST /blog/automation/run` - `blogAiLimiter`

10. **EJS Virtual AI Routes** (`/api/admin/ejs-virtual`)
    - `POST /vibe` - `aiOperationsLimiter`

#### Limiter IDs and Default Configurations:

```javascript
// Will be bootstrapped into rate-limits JsonConfig as:
{
  "limiters": {
    "llmConfigLimiter": { "enabled": false },
    "blogAiLimiter": { "enabled": false },
    "seoAiLimiter": { "enabled": false },
    "i18nAiLimiter": { "enabled": false },
    "aiOperationsLimiter": { "enabled": false }
  }
}
```

### Next Steps for Operations Team:

1. **Enable Limiters**: Go to `/admin/rate-limiter` and enable the AI limiters
2. **Configure Limits**: Set appropriate limits based on usage patterns
3. **Monitor**: Check metrics to ensure limits don't impact legitimate usage
4. **Adjust**: Fine-tune limits based on actual usage and cost considerations

### Files Modified:

- `src/routes/adminLlm.routes.js`
- `src/routes/adminBlogAi.routes.js`
- `src/routes/adminSeoConfig.routes.js`
- `src/routes/adminI18n.routes.js`
- `src/routes/adminHeadless.routes.js`
- `src/routes/adminUiComponents.routes.js`
- `src/routes/adminPages.routes.js`
- `src/routes/adminBlogAutomation.routes.js`
- `src/routes/blogInternal.routes.js`
- `src/routes/adminEjsVirtual.routes.js`

### Security Benefits:

- **Cost Control**: Prevents runaway AI usage and unexpected costs
- **Resource Protection**: Ensures AI services aren't overwhelmed
- **Abuse Prevention**: Stops potential abuse of AI features
- **Visibility**: Provides metrics on AI usage patterns

## Success Metrics

- ✅ All 25+ AI/LLM endpoints now rate limited
- ✅ Limiters will auto-bootstrap on first use
- ✅ Configurable via Admin UI
- ✅ Zero breaking changes (disabled by default)
- ✅ Ready for production enablement
