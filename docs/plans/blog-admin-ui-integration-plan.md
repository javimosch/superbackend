---
description: Blog admin UI + dashboard integration (plan changes)
---

# Goal
Expose the already-implemented Blog backend (public/admin/internal APIs + automation + cron bootstrap) in the **Admin Dashboard UI** so it’s actually usable end-to-end.

# Current State (what exists)
## Backend (already implemented)
- Admin APIs under `/api/admin/*`:
  - Blog CRUD + status transitions: `/api/admin/blog-posts` (+ `publish`, `unpublish`, `schedule`, `archive`)
  - Blog AI helpers: `/api/admin/blog-ai/*`
  - Blog automation admin: `/api/admin/blog-automation/*` (config, style-guide, runs, run-now)
- Public headless APIs under `/api/blog-posts` and `/api/blog-posts/:slug`
- Internal endpoints for HTTP CronJobs under `/api/internal/blog/*`

## UI assets (partially created)
- `views/partials/dashboard/nav-items.ejs` has new nav entries (currently split):
  - `Blog Posts` -> `${adminPath}/blog`
  - `Blog Automation` -> `${adminPath}/blog-automation`
- New templates exist:
  - `views/admin-blog.ejs`
  - `views/admin-blog-automation.ejs`

# Gaps / Why it feels “not fully implemented”
1. **No Admin UI routing to serve the new pages**
   - `src/middleware.js` has many `router.get(`${adminPath}/...`)` handlers, but none for:
     - `GET ${adminPath}/blog`
     - `GET ${adminPath}/blog-automation`
     - `GET ${adminPath}/blog/new`
     - `GET ${adminPath}/blog/edit/:id`

2. **Missing Blog edit/new page**
   - There is no `admin-blog-edit.ejs` (or equivalent) in this repo.
   - `admin-blog.ejs` currently links to `${adminPath}/blog/new` and `${adminPath}/blog/edit/:id`, which will 404.

3. **Admin list UI expects fields that the API doesn’t currently return**
   - `admin-blog.ejs` currently expects:
     - `data.stats` (for cards)
   - `GET /api/admin/blog-posts` currently returns `{ items, pagination }` only.

4. **Navbar item is added, but may not appear depending on dashboard wiring**
   - The dashboard sidebar uses `navSections` from `window.NAV_SECTIONS`.
   - We need to ensure `views/admin-dashboard.ejs` loads `partials/dashboard/nav-items.ejs` (or equivalent) in the right place.

# Proposed Plan (to lock before implementation)
## 1) Admin Dashboard navigation (single entry)
- Change the sidebar nav to a single entry:
  - `Blog system` -> `${adminPath}/blog`
- Blog Automation lives inside the Blog system view as a sub-tab (no separate navbar entry).
- Ensure the nav renders by verifying:
  - `views/admin-dashboard.ejs` includes `partials/dashboard/nav-items.ejs`.

## 2) Add Admin UI routes in `src/middleware.js`
Add new `router.get()` handlers (protected by `basicAuth`, matching existing patterns) to render:
- `views/admin-blog.ejs` at `GET ${adminPath}/blog`
- `views/admin-blog-edit.ejs` at:
  - `GET ${adminPath}/blog/new`
  - `GET ${adminPath}/blog/edit/:id`

Notes:
- The Blog system view (`/blog`) will own sub-tabs for:
  - Posts
  - Automation

Implementation should follow the exact existing pattern:
- `const templatePath = path.join(__dirname, "..", "views", "<file>.ejs")`
- `fs.readFile(...); ejs.render(..., { baseUrl: req.baseUrl, adminPath }, { filename: templatePath })`

## 3) Add Blog edit/new EJS page
Create `views/admin-blog-edit.ejs` that supports:
- Editing core fields:
  - `title`, `slug`, `excerpt`, `coverImageUrl`, `category`, `tags`, `authorName`, `seoTitle`, `seoDescription`
  - `markdown`, `html` (or generate `html` from markdown if desired)
- Status actions:
  - Publish
  - Unpublish
  - Schedule (set `scheduledAt`)
  - Archive
- Integrate existing AI endpoints (optional but recommended):
  - `/api/admin/blog-ai/generate-field`
  - `/api/admin/blog-ai/generate-all`
  - `/api/admin/blog-ai/format-markdown`
  - `/api/admin/blog-ai/refine-markdown`

### Shared image upload mechanism (replicate MicroExits behavior)
Implement a shared EJS partial that can be used by any field expecting an image URL:
- Suggested partial: `views/partials/admin-image-upload-modal.ejs`
- Responsibilities:
  - Provide a modal dialog with:
    - Dropzone drag-and-drop
    - File picker (`<input type="file">`)
    - Paste-from-clipboard handling (`Ctrl+V`)
  - Upload selected/pasted file to the existing assets upload endpoint (admin authenticated)
  - Return the final public asset URL back to the caller field (e.g. set `coverImageUrl`)

The Blog edit page will reuse this partial for:
- `coverImageUrl` field
- Any future image URL fields

## 4) Align admin list UI with admin API
Use **Option A**:
- Update `GET /api/admin/blog-posts` response to include `stats` (counts by status + total)
- Keep the stats cards in `admin-blog.ejs`

## 5) Minimal verification steps (manual)
- Visit `${adminPath}` and confirm:
  - Blog links appear in sidebar
  - Clicking them opens:
    - Blog list page
    - Blog automation page
- In Blog list:
  - list loads without JS errors
  - create/new + edit routes render
  - publish/unpublish/archive actions work

# Final Implementation Details (completed)
## Admin dashboard navigation
- Sidebar nav now has a single entry:
  - `Blog system` -> `${adminPath}/blog`

## Admin UI routes
Added `basicAuth`-protected admin page routes in `src/middleware.js`:
- `GET ${adminPath}/blog` -> `views/admin-blog.ejs`
- `GET ${adminPath}/blog-automation` -> `views/admin-blog-automation.ejs` (loaded via iframe inside Blog system)
- `GET ${adminPath}/blog/new` -> `views/admin-blog-edit.ejs`
- `GET ${adminPath}/blog/edit/:id` -> `views/admin-blog-edit.ejs`

## Blog system sub-tabs
- Blog system uses querystring tabs:
  - `${adminPath}/blog?tab=posts`
  - `${adminPath}/blog?tab=automation`
- Automation loads as an iframe pointing at `${adminPath}/blog-automation`.

## Shared image upload modal
- Added reusable partial: `views/partials/admin-image-upload-modal.ejs`
- Capabilities:
  - Dropzone drag-and-drop
  - File picker
  - Paste-from-clipboard (`Ctrl+V`) while modal is open
- Upload target:
  - `POST /api/admin/assets/upload` with `namespace=blog-images` and `visibility=public`
- Exposes `window.openImageUploadModal({ onSelect, namespace, visibility })`.

## Blog list API stats
- `GET /api/admin/blog-posts` now returns:
  - `items`, `pagination`, and `stats` (counts for total/draft/scheduled/published/archived)
