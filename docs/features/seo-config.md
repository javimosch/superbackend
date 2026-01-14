# SEO Config

## What it is
SEO Config provides centralized management of SEO metadata and OpenGraph images. It combines JSON-based page configuration with AI-powered content generation and SVG-to-PNG image processing for comprehensive SEO optimization.

## Base URL / mount prefix
When mounted at `/saas`, all routes are prefixed:
- `/saas/api/admin/seo-config`
- `/saas/api/admin/seo-config/ai/generate-entry`
- `/saas/api/admin/seo-config/og/generate-png`

## Configuration

### Environment variables
- `OPENROUTER_API_KEY` (optional): API key for AI features
- `OPENROUTER_MODEL` (optional): Default model for AI operations

### Global settings
- `seoconfig.ai.openrouter.apiKey` (encrypted): Scoped AI API key
- `seoconfig.ai.openrouter.model` (optional): Scoped AI model
- `ai.openrouter.apiKey` (encrypted): Fallback AI API key
- `ai.openrouter.model` (optional): Fallback AI model
- `seoconfig.og.svg` (html): OG image SVG template

### Default configuration
```json
{
  "siteName": "",
  "baseUrl": "",
  "defaultOgImagePath": "/og/og-default.png",
  "defaultTwitterCard": "summary_large_image",
  "defaultRobots": "index,follow",
  "pages": {}
}
```

## API

### Admin endpoints (Basic Auth)

#### SEO Config management
- `GET /api/admin/seo-config` - Get current config and OG SVG
- `PUT /api/admin/seo-config` - Update SEO JSON config

#### AI-powered SEO generation
- `GET /api/admin/seo-config/ai/views` - List available EJS views
- `POST /api/admin/seo-config/ai/generate-entry` - Generate SEO entry from EJS view
- `POST /api/admin/seo-config/ai/improve-entry` - Improve existing SEO entry
- `POST /api/admin/seo-config/pages/apply-entry` - Apply SEO page entry

#### OG image processing
- `PUT /api/admin/seo-config/og/svg` - Update OG SVG template
- `POST /api/admin/seo-config/og/generate-png` - Generate PNG from SVG

#### AI SVG editing
- `POST /api/admin/seo-config/ai/edit-svg` - AI edit SVG template

### Public endpoints
- `GET /api/json-configs/seo-config` - Get public SEO config (requires `publicEnabled: true`)

## Admin UI
- `/saas/admin/seo-config` - Complete SEO management interface
  - JSON config editor with validation
  - OG SVG editor with live preview
  - PNG generation with multiple tool support
  - AI helpers for content generation
  - Developer snippet for integration

## Common errors / troubleshooting

### AI features not working
- **400 AI disabled**: Set `OPENROUTER_API_KEY` or configure `seoconfig.ai.openrouter.apiKey`
- **500 AI returned invalid JSON**: Check AI response format, ensure valid JSON output
- **400 viewPath invalid**: Ensure view path is under `views/` directory and ends with `.ejs`

### OG image generation failures
- **400 No converter found**: Install one of: Chrome/Chromium, ImageMagick, librsvg, or Inkscape
- **400 outputPath invalid**: Ensure path starts with `public/` and is within project directory
- **400 SVG is empty**: Provide valid SVG content in request body

### Validation errors
- **400 routePath must start with /**: Route paths must begin with `/`
- **400 entry.title is required**: Title field is mandatory for SEO entries
- **400 entry.description is required**: Description field is mandatory for SEO entries

### JSON configuration errors
- **400 INVALID_JSON**: Ensure JSON is valid and parseable
- **400 jsonRaw is required**: Provide `jsonRaw` field in update requests

### Example API usage

**Get current SEO config:**
```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "${BASE_URL}/api/admin/seo-config"
```

**Update SEO JSON:**
```bash
curl -X PUT -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"jsonRaw":"{\"siteName\":\"My Site\",\"baseUrl\":\"https://example.com\",\"pages\":{\"/marketplace\":{\"title\":\"Marketplace\",\"description\":\"Browse our marketplace\"}}}", "publicEnabled": true}' \
  "${BASE_URL}/api/admin/seo-config"
```

**Generate SEO entry from EJS view:**
```bash
curl -X POST -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"viewPath":"views/marketplace.ejs","routePath":"/marketplace"}' \
  "${BASE_URL}/api/admin/seo-config/ai/generate-entry"
```

**Generate OG PNG:**
```bash
curl -X POST -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"svgRaw":"<svg width=\"1200\" height=\"630\"><rect width=\"1200\" height=\"630\" fill=\"#ffffff\"/></svg>", "outputPath":"public/og/og-default.png"}' \
  "${BASE_URL}/api/admin/seo-config/og/generate-png"
```

**Get public SEO config:**
```bash
curl "${BASE_URL}/api/json-configs/seo-config"
```

### Integration example

```javascript
const { getJsonConfigValueBySlug } = require('@intranefr/superbackend').services.jsonConfigs;

async function getSeoForRoute(route) {
  const seo = await getJsonConfigValueBySlug('seo-config');
  const page = seo.pages?.[route];
  
  return {
    title: page?.title || seo.siteName,
    description: page?.description || seo.defaultDescription,
    robots: page?.robots || seo.defaultRobots,
    ogImage: page?.ogImage || seo.defaultOgImagePath
  };
}
```

### System requirements for OG generation

Install at least one of these tools:

**Chrome/Chromium (recommended):**
```bash
# Ubuntu/Debian
sudo apt-get install google-chrome-stable

# macOS
brew install --cask google-chrome
```

**ImageMagick:**
```bash
# Ubuntu/Debian
sudo apt-get install imagemagick

# macOS
brew install imagemagick
```

**librsvg:**
```bash
# Ubuntu/Debian
sudo apt-get install librsvg2-bin

# macOS
brew install librsvg
```

**Inkscape:**
```bash
# Ubuntu/Debian
sudo apt-get install inkscape

# macOS
brew install --cask inkscape
