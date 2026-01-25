# Plan: Blog system + blog automation (superbackend)

## Goal
Replicate and unify two MicroExits subsystems into superbackend:

- Blog system (headless APIs required; optional public serving)
- Blog automation (scheduled/manual generation, including research + images)

This document started as analysis/plan, and now includes the **final implementation details**.

## Reference: MicroExits current implementation (ref-microexits)

### Blog domain model
MicroExits stores blog content in MongoDB (Mongoose):

- `BlogPost`
  - `title` (required)
  - `slug` (required, unique, indexed)
  - `status`: `draft | scheduled | published | archived` (indexed)
  - `excerpt`, `markdown`, `html`
  - `coverImageUrl`, `category`, `tags[]`, `authorName`
  - `seoTitle`, `seoDescription`
  - `publishedAt`
  - timestamps + index `(status, publishedAt desc)`

Important behavior:

- `slug` is auto-generated and deduped via `generateUniqueBlogSlug()`.
- Public rendering uses stored `html` (not generated at request-time).
- Excerpt fallback: derived from markdown when missing.

### Public routes
- `GET /blog`
  - Lists `published` posts sorted by `(publishedAt, createdAt)`.
- `GET /blog/:slug`
  - Renders a single `published` post.
- `GET /rss.xml`
  - Builds RSS for up to last 50 published posts.
- `GET /sitemap.xml`
  - Includes static URLs + each published blog post.

### Admin UI + Admin API
MicroExits uses a Basic Auth-protected admin area with EJS pages.

Admin pages:

- `GET /admin/blog` (list)
- `GET /admin/blog/new` (editor)
- `GET /admin/blog/:id` (editor)

Admin REST endpoints (JSON):

- `GET /api/admin/blog-posts?status=`
- `POST /api/admin/blog-posts` (creates draft)
- `GET /api/admin/blog-posts/:id`
- `PUT /api/admin/blog-posts/:id`
- `PUT /api/admin/blog-posts/:id/publish`
- `PUT /api/admin/blog-posts/:id/unpublish`
- `DELETE /api/admin/blog-posts/:id`

Editor features worth replicating:

- Preview uses `marked` in the browser.
- Image paste uploads images via `POST /saasbackend/api/admin/assets/upload` using namespace `blog-images` and visibility `public`.

### Blog AI helper endpoints
MicroExits adds admin endpoints that call superbackend’s LLM service:

- `POST /api/admin/blog-ai/generate-field`
- `POST /api/admin/blog-ai/generate-all`
- `POST /api/admin/blog-ai/format-markdown`
- `POST /api/admin/blog-ai/refine-markdown`

These are thin wrappers over `llm.callAdhoc()` that:

- enforce simple input validation
- request either plain text or valid JSON
- perform light parsing/normalization (especially tags)

### Blog automation (generation pipeline)
MicroExits implements a “generate draft posts” pipeline with:

- `BlogAutomationRun` model tracking history (`queued|running|succeeded|failed|partial|skipped`)
- Mongo-based lock `BlogAutomationLock` to prevent concurrent runs
- Config + style guide stored in superbackend `GlobalSetting`
  - keys: `BLOG_AUTOMATION_CONFIG`, `BLOG_AUTOMATION_STYLE_GUIDE`

Execution:

- Triggered by:
  - schedule: `node-cron` using `cfg.cron` and `cfg.timezone`
  - manual: `POST /api/admin/blog-automation/run-now`
- Typical steps per run:
  - pick weighted topic from `cfg.topics[]`
  - generate research query/angle (OpenRouter)
  - do research call (Perplexity) returning JSON with sources
  - generate post JSON (OpenRouter) with markdown, metadata, citations section
  - optionally generate images (OpenRouter image model)
    - upload images into Assets and store public URLs
    - optionally insert inline image into markdown
  - save blog post as `draft`
  - mark run `partial` if image generation failed or JSON fallback path was used

Admin UI + endpoints:

- `GET /admin/blog-automation` (EJS UI)
- `GET/PUT /api/admin/blog-automation/config`
- `GET/PUT /api/admin/blog-automation/style-guide`
- `GET /api/admin/blog-automation/runs`
- `POST /api/admin/blog-automation/run-now`

## Existing superbackend capabilities to reuse
From this repo:

- **Global settings**: `src/models/GlobalSetting.js` + services (`globalSettings.service.js`)
- **LLM**: `src/services/llm.service.js` supports `callAdhoc()` and encrypted provider API keys
- **Assets**:
  - admin upload endpoints exist (`adminAssets.controller.js`)
  - upload namespace enforcement exists (`uploadNamespaces.service`)
- **Cron**:
  - superbackend already has a DB-backed cron scheduler (`cronScheduler.service.js`, `CronJob`, `CronExecution`)

Implication: blog automation scheduling will be implemented via superbackend’s **CronJob** system.

## Proposed unified design in superbackend

### 1) A single “Blog” module with optional “Automation” submodule
Keep “blog” as the core domain with:

- BlogPost storage
- Public endpoints for listing/reading + RSS + sitemap additions
- Admin endpoints for CRUD
- Admin helper endpoints:
  - “AI helpers” (editor assistance)
  - “Automation” (scheduled/manual generation)

Serving note:

- Headless APIs are **required**.
- Serving `/blog` pages from superbackend is **optional** and can be added later without changing the admin/automation APIs.

### 2) Data model
Introduce superbackend-native Mongoose models (or equivalent) modeled after MicroExits:

- `BlogPost`
- `BlogAutomationRun`
- `BlogAutomationLock` (or reuse a generic lock primitive if one exists)

Design note: Keep `BlogAutomationRun.steps` and `results` as flexible JSON fields (Mixed) to preserve observability.

### 3) Configuration
Store automation config in GlobalSetting, similar to MicroExits, but namespaced for superbackend:

- `blog.automation.config` (json)
- `blog.automation.styleGuide` (string)

No backward compatibility/migration is required (starting from zero).

### 4) Execution model
Create a single orchestrator function akin to `runBlogAutomation({ trigger })` with:

- safety lock
- run history persistence
- explicit step logging
- hard limits:
  - runs per day
  - posts per run
  - images per run

Scheduling:

- Use superbackend’s `CronJob` system (DB-backed) to trigger automation runs.

### 5) APIs
**Public**:

- `GET /blog`
- `GET /blog/:slug`
- `GET /rss.xml`
- `GET /sitemap.xml` (or extend existing sitemap behavior)

Headless requirement:

- These endpoints should return HTML/XML if implemented, but serving is optional.
- Headless JSON APIs (admin + public content APIs) are required.

**Admin (REST JSON)**:

- Blog posts:
  - `GET /api/admin/blog-posts`
  - `POST /api/admin/blog-posts`
  - `GET /api/admin/blog-posts/:id`
  - `PUT /api/admin/blog-posts/:id`
  - `PUT /api/admin/blog-posts/:id/publish`
  - `PUT /api/admin/blog-posts/:id/unpublish`
  - `PUT /api/admin/blog-posts/:id/schedule`
  - `PUT /api/admin/blog-posts/:id/archive`
  - `DELETE /api/admin/blog-posts/:id`

- Public content APIs (headless):
  - `GET /api/blog-posts` (list published; pagination + filters)
  - `GET /api/blog-posts/:slug` (get published; returns both `html` + `markdown`)

- Blog AI helpers:
  - `POST /api/admin/blog-ai/generate-field`
  - `POST /api/admin/blog-ai/generate-all`
  - `POST /api/admin/blog-ai/format-markdown`
  - `POST /api/admin/blog-ai/refine-markdown`

- Blog automation:
  - `GET/PUT /api/admin/blog-automation/config`
  - `GET/PUT /api/admin/blog-automation/style-guide`
  - `GET /api/admin/blog-automation/runs`
  - `POST /api/admin/blog-automation/run-now`

**Admin UI**:

Admin UI is optional. Initial delivery should focus on API completeness.

### 6) Assets integration
Replicate MicroExits behavior:

- Default upload namespace: `blog-images`
- Default visibility: `public`

Namespace policy:

- Allowed content types: common image/video/audio types (exact list TBD per upload namespace config)
- Max size: 10MB
- Public is mandatory (blog posts do not require auth)

Support:

- editor clipboard image uploads
- automation image generation uploads

### 7) Observability + audit
Use superbackend’s existing audit/event logging conventions.

For automation, log:

- run started/finished
- provider/model used
- failures (invalid JSON, missing keys, image generation errors)
- created asset ids + created post id

## Migration plan (milestones)

### Milestone 1: Scope lock + interfaces
- Confirm required feature set for “Blog” and for “Automation” in superbackend.
- Confirm public content API shapes (list/get) and whether HTML serving is in-scope for v1.
- Confirm how CronJob triggers should be modeled (see open questions).

### Milestone 2: Core Blog module
- Add BlogPost model + slug/excerpt utilities.
- Add public endpoints: `/blog`, `/blog/:slug`, `/rss.xml`.
- Add admin CRUD endpoints.

### Milestone 3: Blog editor helpers (AI)
- Add the 4 blog-ai endpoints as wrappers over `llm.service.callAdhoc()`.
- Ensure tags normalization and JSON safety.

### Milestone 4: Blog automation
- Add automation config + style guide storage in GlobalSetting.
- Add `BlogAutomationRun` persistence + locking.
- Implement `runBlogAutomation()` pipeline.
- Add admin endpoints to manage config/style guide + run now + run history.

### Milestone 5: Scheduling
- Wire scheduling to superbackend CronJob system.

### Milestone 6: Hardening
- Rate limiting / guardrails
- Dedupe window enforcement
- Cost tracking per run (from LLM usage) if desired
- Error handling + retries

## Risks / complexity
- **LLM JSON reliability**: needs robust parsing/repair paths.
- **Image model variability**: responses differ across providers; MicroExits implemented multiple extraction paths.
- **Sitemap ownership**: superbackend might already generate sitemap; need to merge without breaking.
- **Auth model**: superbackend’s admin auth might differ from MicroExits BasicAuth.

## Open questions (need your decisions)
- **Plan lock-in answers (confirmed)**
  - Public content APIs return both `html` and `markdown` on detail.
  - Public list supports pagination + filters in v1.
  - Archived posts free up slugs.
  - Scheduled posts use `scheduledAt`, and a cron-driven publisher moves `scheduled -> published` when due.
  - Two CronJobs:
    - blog automation generation (create drafts)
    - scheduled publishing (scheduled -> published)
  - Research provider/model is explicitly configured (admin chooses a web-search-capable provider/model); we reuse provider/model picker.

## Final implementation summary

### Data model
- `BlogPost` (`blog_posts`)
  - `status: draft | scheduled | published | archived`
  - Partial unique index on `slug` for non-archived statuses (archived posts free slugs)
- `BlogAutomationRun` (`blog_automation_runs`)
- `BlogAutomationLock` (`blog_automation_locks`)

### Public headless APIs
- `GET /api/blog-posts`
  - Pagination + filters: `page`, `limit`, `q`, `tag`, `category`
- `GET /api/blog-posts/:slug`
  - Returns both `markdown` and `html`

### Admin APIs (Basic Auth)
- Blog posts CRUD + transitions:
  - `GET /api/admin/blog-posts` (returns `items`, `pagination`, and `stats`)
  - `POST /api/admin/blog-posts`
  - `GET /api/admin/blog-posts/:id`
  - `PUT /api/admin/blog-posts/:id`
  - `PUT /api/admin/blog-posts/:id/publish`
  - `PUT /api/admin/blog-posts/:id/unpublish`
  - `PUT /api/admin/blog-posts/:id/schedule`
  - `PUT /api/admin/blog-posts/:id/archive`
  - `DELETE /api/admin/blog-posts/:id`

- Blog AI helpers:
  - `POST /api/admin/blog-ai/generate-field`
  - `POST /api/admin/blog-ai/generate-all`
  - `POST /api/admin/blog-ai/format-markdown`
  - `POST /api/admin/blog-ai/refine-markdown`

- Blog automation admin:
  - `GET/PUT /api/admin/blog-automation/config`
  - `GET/PUT /api/admin/blog-automation/style-guide`
  - `GET /api/admin/blog-automation/runs`
  - `POST /api/admin/blog-automation/run-now`

### Internal endpoints for HTTP CronJobs
Protected by bearer token middleware `requireInternalCronToken`.

- `POST /api/internal/blog/automation/run`
- `POST /api/internal/blog/publish-scheduled/run`

Token source:
- GlobalSetting key: `blog.internalCronToken`

### CronJobs
The system uses two DB-backed cron jobs (task type: HTTP):

- `Blog: Automation (generate drafts)`
- `Blog: Publish scheduled posts`

### Assets / uploads
The Blog system uses the existing assets upload API:

- `POST /api/admin/assets/upload`
  - Namespace: `blog-images`
  - Visibility: `public`

### Admin dashboard UI
- The dashboard sidebar has a single entry: `Blog system`.
- `GET /admin/blog` implements querystring sub-tabs:
  - `/admin/blog?tab=posts`
  - `/admin/blog?tab=automation` (automation loaded via iframe)
- Editor routes:
  - `GET /admin/blog/new`
  - `GET /admin/blog/edit/:id`

### Shared image upload modal
The admin editor includes a reusable modal partial supporting:

- Dropzone drag-and-drop
- File picker
- Paste from clipboard (`Ctrl+V`) while the modal is open
