# LLM Service & AI Integration

## What it is

A configurable LLM (Large Language Model) service that integrates with multiple AI providers for:
- Generating SEO metadata (titles, descriptions, keywords)
- Testing and managing AI prompts
- Tracking API costs and usage
- Auditing LLM requests and responses

Supports multiple LLM providers (OpenRouter, Perplexity, and custom OpenAI-compatible services).

## Base URL / mount prefix

When mounted at `/saas`, all routes are prefixed:
- `/saas/api/admin/admin-llm`

In this document we use `${BASE_URL}` which should include the mount prefix.

## Configuration

### Environment variables

- `LLM_PROVIDER`
  - Optional
  - Default: `openrouter`
  - Options: `openrouter`, `perplexity`, `custom`

- `LLM_API_KEY`
  - Optional (if using global default)
  - API key for the LLM provider
  - Note: Can be overridden per-provider in global settings

- `LLM_MODEL`
  - Optional
  - Default model to use for completions
  - Example: `openai/gpt-4`, `claude-3-opus`, `gpt-4-turbo`

### Global Settings

LLM configuration is stored in global settings as JSON:

- `llm.providers` - Provider configurations (base URLs, models)
- `llm.prompts` - Prompt templates for various tasks
- `llm.provider.{name}.apiKey` - Encrypted API keys per provider

## API

### Admin endpoints (Basic auth required)

#### Get LLM configuration
```
GET ${BASE_URL}/api/admin/admin-llm/config
```

**Authentication:** Basic auth (admin)

**Response:**
```json
{
  "providers": {
    "openrouter": {
      "baseUrl": "https://openrouter.ai/api/v1",
      "model": "openai/gpt-4",
      "maxTokens": 2000,
      "temperature": 0.7,
      "enabled": true
    },
    "perplexity": {
      "baseUrl": "https://api.perplexity.ai",
      "model": "sonar",
      "maxTokens": 2000,
      "temperature": 0.7,
      "enabled": false
    }
  },
  "prompts": {
    "seo_title": "Generate an SEO-optimized title for: {content}",
    "seo_description": "Generate a 160-character SEO description for: {content}",
    "seo_keywords": "Generate 5 relevant keywords for: {content}"
  }
}
```

#### Save LLM configuration
```
POST ${BASE_URL}/api/admin/admin-llm/config
```

**Authentication:** Basic auth

**Body:**
```json
{
  "providers": {
    "openrouter": {
      "baseUrl": "https://openrouter.ai/api/v1",
      "model": "openai/gpt-4-turbo",
      "maxTokens": 2000,
      "temperature": 0.7,
      "apiKey": "sk-...",
      "enabled": true
    }
  },
  "prompts": {
    "seo_title": "Create an SEO title for: {content}",
    "seo_description": "Create a 160-char SEO description for: {content}",
    "seo_keywords": "Generate 5 keywords for: {content}"
  }
}
```

**Response:**
```json
{
  "message": "LLM configuration saved successfully",
  "config": {
    "providers": {
      "openrouter": {
        "baseUrl": "https://openrouter.ai/api/v1",
        "model": "openai/gpt-4-turbo",
        "enabled": true
      }
    }
  }
}
```

#### Test a prompt
```
POST ${BASE_URL}/api/admin/admin-llm/prompts/:key/test
```

**Authentication:** Basic auth

**Parameters:**
- `key` - Prompt key (e.g., `seo_title`, `seo_description`)

**Body:**
```json
{
  "input": "Content to test the prompt with",
  "providerName": "openrouter" // optional, uses first enabled provider if omitted
}
```

**Response:**
```json
{
  "success": true,
  "prompt": {
    "key": "seo_title",
    "template": "Generate an SEO-optimized title for: {content}"
  },
  "input": "Content to test the prompt with",
  "output": "5 Best Practices for Modern Web Development",
  "usage": {
    "promptTokens": 15,
    "completionTokens": 12,
    "totalTokens": 27,
    "costUSD": 0.0015
  },
  "executionTimeMs": 1250
}
```

**Response on error:**
```json
{
  "success": false,
  "error": "Provider not available or API key invalid",
  "code": "PROVIDER_ERROR"
}
```

#### List LLM audit log
```
GET ${BASE_URL}/api/admin/admin-llm/audit
```

**Authentication:** Basic auth

**Query parameters:**
- `limit` (optional, default: 50) - Number of entries to return
- `skip` (optional, default: 0) - Number of entries to skip
- `provider` (optional) - Filter by provider name
- `promptKey` (optional) - Filter by prompt key
- `startDate` (optional) - ISO date for filtering (e.g., `2024-01-15`)
- `endDate` (optional) - ISO date for filtering

**Response:**
```json
{
  "audit": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "provider": "openrouter",
      "promptKey": "seo_title",
      "input": "Content about web development",
      "output": "5 Best Practices for Modern Web Development",
      "status": "success|error",
      "usage": {
        "promptTokens": 15,
        "completionTokens": 12,
        "totalTokens": 27,
        "costUSD": 0.0015
      },
      "executionTimeMs": 1250,
      "initiatedBy": "admin@example.com",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 245
}
```

#### Get LLM costs report
```
GET ${BASE_URL}/api/admin/admin-llm/costs
```

**Authentication:** Basic auth

**Query parameters:**
- `groupBy` (optional, default: `daily`) - Group costs by: `hourly`, `daily`, `weekly`, `monthly`, `provider`
- `startDate` (optional) - ISO date for filtering
- `endDate` (optional) - ISO date for filtering

**Response:**
```json
{
  "period": {
    "startDate": "2024-01-01",
    "endDate": "2024-01-31"
  },
  "groupBy": "daily",
  "costs": [
    {
      "date": "2024-01-15",
      "costUSD": 2.45,
      "tokenCount": 1850,
      "requestCount": 12,
      "providerBreakdown": {
        "openrouter": 1.50,
        "perplexity": 0.95
      }
    }
  ],
  "summary": {
    "totalCostUSD": 75.30,
    "totalTokenCount": 56200,
    "totalRequestCount": 380,
    "averageCostPerRequest": 0.198,
    "costByProvider": {
      "openrouter": 45.20,
      "perplexity": 30.10
    },
    "costByPrompt": {
      "seo_title": 25.50,
      "seo_description": 30.10,
      "seo_keywords": 19.70
    }
  }
}
```

## Common errors / troubleshooting

### 401 Unauthorized
- Invalid or missing basic auth credentials

**Response:**
```json
{
  "error": "Unauthorized",
  "code": "UNAUTHORIZED"
}
```

### 400 Provider not configured
- Requested provider doesn't have API key or valid configuration

**Response:**
```json
{
  "error": "Provider not configured",
  "code": "PROVIDER_NOT_CONFIGURED"
}
```

### 503 Provider unavailable
- LLM provider API is down or not responding

**Response:**
```json
{
  "error": "LLM provider is currently unavailable",
  "code": "PROVIDER_UNAVAILABLE"
}
```

### 400 Invalid prompt
- Prompt template is missing or malformed

**Response:**
```json
{
  "error": "Prompt template 'xyz' not found",
  "code": "PROMPT_NOT_FOUND"
}
```

### 429 Rate limited
- Too many API requests to the LLM provider

**Response:**
```json
{
  "error": "Rate limited by provider, please try again later",
  "code": "RATE_LIMITED"
}
```

## Use cases

### Configure OpenRouter as LLM provider
```bash
curl -X POST ${BASE_URL}/api/admin/admin-llm/config \
  -H "Authorization: Basic <credentials>" \
  -H "Content-Type: application/json" \
  -d '{
    "providers": {
      "openrouter": {
        "baseUrl": "https://openrouter.ai/api/v1",
        "model": "openai/gpt-4-turbo",
        "maxTokens": 2000,
        "temperature": 0.7,
        "apiKey": "sk-or-v1-...",
        "enabled": true
      }
    }
  }'
```

### Test SEO title generation
```bash
curl -X POST ${BASE_URL}/api/admin/admin-llm/prompts/seo_title/test \
  -H "Authorization: Basic <credentials>" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "Article about machine learning best practices"
  }'
```

### Get monthly cost report
```bash
curl -X GET "${BASE_URL}/api/admin/admin-llm/costs?groupBy=monthly&startDate=2024-01-01&endDate=2024-01-31" \
  -H "Authorization: Basic <credentials>"
```

### Audit specific prompt usage
```bash
curl -X GET "${BASE_URL}/api/admin/admin-llm/audit?promptKey=seo_description&limit=100" \
  -H "Authorization: Basic <credentials>"
```

## Advanced topics

### Supported providers

#### OpenRouter
- **URL:** https://openrouter.ai/api/v1
- **Models:** 100+ models including GPT-4, Claude, Llama
- **Authentication:** API key in header
- **Pricing:** Per-token, varies by model

#### Perplexity
- **URL:** https://api.perplexity.ai
- **Models:** Sonar (web-aware), Sonar Pro
- **Authentication:** API key in header
- **Pricing:** Per-request billing

#### Custom OpenAI-compatible
- Any service with OpenAI API format
- Examples: vLLM, LocalAI, Replicate
- **URL:** Configurable base URL
- **Authentication:** API key

### Prompt templating

Prompts use simple string interpolation with `{variable}` syntax:

```
"seo_title": "Write an SEO-friendly title (max 60 chars) for this content: {content}"
```

Variables are replaced before sending to the LLM:
```javascript
const filled = template.replace(/{content}/g, userContent);
```

### Token counting

Tokens are tracked for cost calculation:
- **Prompt tokens:** Input to the LLM
- **Completion tokens:** Output from the LLM
- **Total tokens:** Sum for billing

Cost = (prompt_tokens × provider_rate + completion_tokens × provider_rate) / 1000

### Caching

Configuration is cached in-memory with 60-second TTL:
- Reduces database queries
- Automatic refresh after expiry
- Manual refresh on config updates

### Cost tracking

Costs are recorded in audit log:
- Per-request cost calculation
- Aggregates by date, provider, prompt key
- Useful for budget monitoring and optimization

### Error handling

LLM errors are categorized:
- **Provider errors:** API key invalid, provider down
- **Prompt errors:** Invalid template variables
- **Rate limiting:** Too many requests
- **Timeout:** Request took too long (usually > 30s)

### Integration with SEO Config

The SEO Config feature uses LLM service to generate metadata:

```javascript
const llmService = require('../services/llm.service');

const title = await llmService.complete('seo_title', {
  content: pageContent
});
```

See [SEO Config](/docs/features/seo-config.md) for details.

### Security considerations

- API keys are encrypted before storage in database
- Keys never appear in audit logs or API responses
- Only admins with basic auth can access LLM configuration
- All LLM requests are logged for audit purposes
- Consider rate limiting to prevent cost abuse
