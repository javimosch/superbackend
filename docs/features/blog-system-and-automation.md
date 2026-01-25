# Blog system and automation

## Overview
The Blog system provides:

- Headless public APIs for listing and reading published blog posts.
- Admin APIs and admin UI for authoring blog posts (draft/scheduled/published/archived).
- AI-assisted admin endpoints for content/metadata generation and markdown refinement.
- Automation services and HTTP CronJobs to generate draft posts and publish scheduled posts.

## Data model
### BlogPost
MongoDB collection: `blog_posts`

Fields:
- `title`: string (required)
- `slug`: string (required)
- `status`: `draft | scheduled | published | archived`
- `excerpt`: string
- `markdown`: string
- `html`: string
- `coverImageUrl`: string
- `category`: string
- `tags`: string[]
- `authorName`: string
- `seoTitle`: string
- `seoDescription`: string
- `scheduledAt`: date
- `publishedAt`: date
- timestamps

Indexes:
- `(status, publishedAt desc)`
- `(status, scheduledAt asc)`
- Unique `slug` among non-archived posts via partial unique index (archived posts free up slugs)

### BlogAutomationRun
MongoDB collection: `blog_automation_runs`

Fields:
- `status`: `queued | running | succeeded | failed | partial | skipped`
- `trigger`: `scheduled | manual`
- `startedAt`, `finishedAt`
- `configSnapshot`, `topic`, `results`, `steps`
- `error`
- timestamps

### BlogAutomationLock
MongoDB collection: `blog_automation_locks`

Fields:
- `key` (unique)
- `lockedUntil`
- `ownerId`
- timestamps

## Public headless APIs
### List published posts
`GET /api/blog-posts`

Query:
- `page` (default 1)
- `limit`
- `q` (search in title/excerpt/slug)
- `tag`
- `category`

Response:
- `items[]` containing published posts
- `pagination` with `page`, `limit`, `total`, `pages`

### Get published post by slug
`GET /api/blog-posts/:slug`

Response:
- `item` containing `markdown` and `html` for the post

## Admin dashboard UI
### Navigation
The admin dashboard includes a single module entry:
- `Blog system` -> `/admin/blog`

### Blog system page
`GET /admin/blog`

Sub-tabs (querystring):
- `/admin/blog?tab=posts`
- `/admin/blog?tab=automation`

### Blog editor
- `GET /admin/blog/new`
- `GET /admin/blog/edit/:id`

The editor integrates:
- Blog post CRUD and state transitions
- AI helper actions
- Image upload modal for setting image URL fields

## Admin APIs
### Blog post CRUD
- `GET /api/admin/blog-posts`
  - Returns `items`, `pagination`, and `stats`
- `POST /api/admin/blog-posts`
- `GET /api/admin/blog-posts/:id`
- `PUT /api/admin/blog-posts/:id`
- `DELETE /api/admin/blog-posts/:id`

### Status transitions
- `PUT /api/admin/blog-posts/:id/publish`
- `PUT /api/admin/blog-posts/:id/unpublish`
- `PUT /api/admin/blog-posts/:id/schedule`
- `PUT /api/admin/blog-posts/:id/archive`

### AI helper endpoints
- `POST /api/admin/blog-ai/generate-field`
- `POST /api/admin/blog-ai/generate-all`
- `POST /api/admin/blog-ai/format-markdown`
- `POST /api/admin/blog-ai/refine-markdown`

### Blog automation admin endpoints
- `GET /api/admin/blog-automation/config`
- `PUT /api/admin/blog-automation/config`
- `GET /api/admin/blog-automation/style-guide`
- `PUT /api/admin/blog-automation/style-guide`
- `GET /api/admin/blog-automation/runs`
- `POST /api/admin/blog-automation/run-now`

## Image uploads
### Upload endpoint
`POST /api/admin/assets/upload`

The blog editor uses a reusable modal component to upload images and obtain a public URL.

Upload parameters:
- `namespace=blog-images`
- `visibility=public`

Returned URL:
- `asset.publicUrl` (served from `/public/assets/:key`)

## Automation and cron
### Settings
- `blog.automation.config`
- `blog.automation.styleGuide`
- `blog.internalCronToken`

### HTTP CronJobs
Two HTTP cron tasks are bootstrapped:
- Blog draft generation (automation pipeline)
- Publish scheduled posts

The cron tasks call internal endpoints protected by bearer auth:
- `POST /api/internal/blog/automation/run`
- `POST /api/internal/blog/publish-scheduled/run`
