# Rate Limiter for AI Operations

## Overview
Rate limiting has been implemented for all AI/LLM operations to control costs, prevent abuse, and protect resources. The system uses the existing rate limiter service with auto-bootstrap functionality.

## Protected Routes

### Admin LLM Routes
- `POST /api/admin/llm/config` - Save LLM provider configuration
- `POST /api/admin/llm/prompts/:key/test` - Test prompts with LLM

### Blog AI Routes
- `POST /api/admin/blog-ai/generate-field` - Generate individual metadata fields
- `POST /api/admin/blog-ai/generate-all` - Generate all metadata fields
- `POST /api/admin/blog-ai/format-markdown` - Format markdown content
- `POST /api/admin/blog-ai/refine-markdown` - Refine markdown content

### SEO Config AI Routes
- `POST /api/admin/seo-config/ai/generate-entry` - Generate SEO metadata
- `POST /api/admin/seo-config/ai/improve-entry` - Improve existing SEO metadata
- `POST /api/admin/seo-config/og/generate-png` - Generate OpenGraph images
- `POST /api/admin/seo-config/ai/edit-svg` - AI-assisted SVG editing

### i18n AI Routes
- `POST /api/admin/i18n/ai/preview` - Preview translation changes
- `POST /api/admin/i18n/ai/apply` - Apply translation changes
- `POST /api/admin/i18n/ai/translate-text` - Translate text content

### Headless AI Routes
- `POST /api/admin/headless/ai/model-builder/chat` - Chat-based data model generation

### UI Components AI Routes
- `POST /api/admin/ui-components/ai/components/:code/propose` - Suggest component improvements

### Block Definitions AI Routes
- `POST /api/admin/block-definitions/ai/generate` - Generate block definitions
- `POST /api/admin/block-definitions/ai/:code/propose` - Propose block improvements

### Blog Automation Routes
- `POST /api/admin/blog-automation/run-now` - Manual blog automation execution
- `POST /api/internal/blog/automation/run` - Internal automation trigger

### EJS Virtual AI Routes
- `POST /api/admin/ejs-virtual/vibe` - AI-powered template editing

## Rate Limiter Configuration

### Limiter IDs
- `llmConfigLimiter` - LLM configuration and testing
- `blogAiLimiter` - Blog AI generation operations
- `seoAiLimiter` - SEO AI operations
- `i18nAiLimiter` - Translation operations
- `aiOperationsLimiter` - General AI operations

### Default Behavior
- All limiters are **disabled by default**
- Auto-bootstrap creates `{ enabled: false }` entry on first use
- Can be enabled/configured via Admin UI at `/admin/rate-limiter`
- Identity strategy: `userId` for authenticated routes

### Typical Configuration
```json
{
  "limiters": {
    "llmConfigLimiter": {
      "enabled": true,
      "mode": "enforce",
      "limit": { "max": 5, "windowMs": 60000 }
    },
    "blogAiLimiter": {
      "enabled": true,
      "mode": "enforce",
      "limit": { "max": 20, "windowMs": 60000 }
    },
    "seoAiLimiter": {
      "enabled": true,
      "mode": "enforce",
      "limit": { "max": 15, "windowMs": 60000 }
    },
    "i18nAiLimiter": {
      "enabled": true,
      "mode": "enforce",
      "limit": { "max": 30, "windowMs": 60000 }
    },
    "aiOperationsLimiter": {
      "enabled": true,
      "mode": "enforce",
      "limit": { "max": 10, "windowMs": 60000 }
    }
  }
}
```

## Implementation Details

### Middleware Usage
```javascript
const rateLimiter = require('../services/rateLimiter.service');

router.post('/ai/generate', rateLimiter.limit('aiOperationsLimiter'), controller.generate);
```

### Auto-Bootstrap
- First request to any limited endpoint automatically creates limiter config
- Configuration stored in `rate-limits` JsonConfig
- No code changes required for new limiters

### Response Headers
When rate limited:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in window
- `X-RateLimit-Reset`: Unix timestamp of window reset

### Error Response
```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 45,
  "limit": 10,
  "windowMs": 60000,
  "retryAfterMs": 45000
}
```

## Monitoring

### Metrics Collection
- All rate limit events are tracked in MongoDB
- Metrics available at `/admin/rate-limiter` (Metrics tab)
- Filter by limiter ID and date range

### Key Metrics
- Total requests checked
- Requests allowed
- Requests blocked
- Violation rate percentage

## Security Benefits

1. **Cost Control**: Prevents unexpected AI service costs
2. **Resource Protection**: Avoids overwhelming AI providers
3. **Abuse Prevention**: Stops automated abuse of AI features
4. **Usage Visibility**: Clear metrics on AI consumption

## Administration

### Enable/Disable Limiters
1. Navigate to `/admin/rate-limiter`
2. Use bulk controls or individual toggles
3. Configure limits and modes as needed
4. Save changes

### Bulk Operations
- Enable/disable all AI limiters at once
- Enable/disable selected limiters
- Reset all limiters to defaults

## Best Practices

1. **Start Conservative**: Begin with lower limits, monitor usage
2. **Use Report-Only Mode**: Test limits without blocking
3. **Monitor Metrics**: Regularly check violation rates
4. **Adjust Based on Usage**: Fine-tune limits per feature
5. **Consider Business Hours**: Different limits for peak/off-peak

## Troubleshooting

### Common Issues
1. **Legitimate Users Blocked**: Increase limits or use `userId` identity
2. **High Violation Rate**: Check for automated usage or bots
3. **Performance Impact**: Ensure MongoDB indexes on rate limit collections

### Debug Information
- Check browser console for rate limit headers
- Review metrics in Admin UI
- Monitor MongoDB `rate_limit_counters` collection
