# Markdown System Design Plan

## Overview
Design a markdown management system similar to JSON Configs but optimized for markdown content with hierarchical organization and dual UI modes (list and explorer).

## Data Model

### Core Fields (Following Established Patterns)
```javascript
const markdownSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      index: true,
      trim: true,
      default: 'general',
    },
    group_code: {
      type: String,
      required: false,
      index: true,
      trim: true,
      default: '',
    },
    markdownRaw: {
      type: String,
      required: true,
      default: '',
    },
    publicEnabled: {
      type: Boolean,
      default: false,
      index: true,
    },
    cacheTtlSeconds: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null,
    },
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
      default: null,
    },
  },
  { timestamps: true },
);
```

### Unique Constraint (Following Page Model Pattern)
```javascript
// Compound unique index for fast lookups
markdownSchema.index({ category: 1, group_code: 1, slug: 1 }, { unique: true });

// Additional indexes for common queries (following Asset/Page patterns)
markdownSchema.index({ status: 1, publicEnabled: 1 });
markdownSchema.index({ category: 1, status: 1 });
markdownSchema.index({ ownerUserId: 1, createdAt: -1 });
markdownSchema.index({ orgId: 1, createdAt: -1 });
```

## API Design

### Public API (No Auth)
- `GET /api/markdowns/:category/:group_code/:slug` - Get markdown by full path
- `GET /api/markdowns/:category/:slug` - Get markdown (no group_code)
- `GET /api/markdowns/search?q=term&category=cat` - Search within category

### Admin API (Basic Auth)
- `GET /api/admin/markdowns` - List all markdowns
- `GET /api/admin/markdowns/:id` - Get by ID
- `POST /api/admin/markdowns` - Create new
- `PUT /api/admin/markdowns/:id` - Update
- `DELETE /api/admin/markdowns/:id` - Delete
- `GET /api/admin/markdowns/tree` - Get hierarchical tree structure
- `POST /api/admin/markdowns/validate-path` - Validate category/group_code/slug uniqueness

## Admin UI Design

### Route: `/admin/markdowns`

#### Sub-tab 1: List Mode (Default)
- **Layout**: Table with pagination
- **Columns**: Title, Category, Group Code, Slug, Public, Updated, Actions
- **Actions**: Edit, Delete, Copy, Preview
- **Features**:
  - Bulk operations (delete, change category)
  - Search/filter by category and group_code
  - Sort by any column
  - Create new markdown button

#### Sub-tab 2: Explorer Mode
- **Layout**: Split-pane file system interface

**Left Pane - Tree View**:
```
[Category Dropdown ▼]
├── uncategorized
│   ├── file1.md
│   └── file2.md
├── folder1
│   ├── folder2
│   │   ├── folder3
│   │   │   └── rules.md
│   │   └── other.md
│   └── standalone.md
└── another-folder
    └── content.md
```

**Right Pane - Folder Content**:
- **Breadcrumbs**: Home > folder1 > folder2 > folder3
- **Actions Bar**: 
  - "New Markdown" button (refreshes after creation)
  - "New Folder" button (creates group_code prefix)
- **File List**: Table with Name, Size, Modified, Actions
- **File Actions**: Preview, Download, Copy to Clipboard, Edit

**Group Code Rules Info Box**:
```
ℹ️ Group Code Naming Rules
• Use double underscores (__) to separate folders
• Example: docs__api__endpoints creates docs/api/endpoints
• Empty group_code places file in "uncategorized"
• Max depth: 5 levels
• Valid characters: letters, numbers, hyphens, underscores
```

## Service Layer Design (Following Established Patterns)

### Core Functions (Following jsonConfigs.service.js Pattern)
```javascript
const cache = new Map(); // In-memory cache pattern
const CACHE_TTL = 30000; // 30 seconds default

// Path operations (following JSON Config patterns)
async function getMarkdownByPath(category, group_code, slug, opts = {}) {
  const bypassCache = Boolean(opts.bypassCache);
  const cacheKey = `markdown:${category}:${group_code || ''}:${slug}`;
  
  if (!bypassCache) {
    const cached = getCached(cacheKey);
    if (cached !== null) return cached;
  }
  
  const doc = await Markdown.findOne({
    category: String(category).trim(),
    group_code: group_code ? String(group_code).trim() : '',
    slug: String(slug).trim(),
    publicEnabled: true,
    status: 'published'
  }).lean();
  
  if (!doc) {
    const err = new Error('Markdown not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  
  setCached(cacheKey, doc.markdownRaw, doc.cacheTtlSeconds);
  return doc.markdownRaw;
}

// Validation functions (following JSON Config validation patterns)
function normalizeGroupCode(group_code) {
  if (!group_code) return '';
  
  return String(group_code)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/_{3,}/g, '__') // Normalize multiple underscores
    .replace(/^_|_$/g, ''); // Remove leading/trailing
}

function parseGroupCode(group_code) {
  if (!group_code) return [];
  return group_code.split('__').filter(part => part.length > 0);
}

function buildGroupCode(parts) {
  return parts.filter(part => part.length > 0).join('__');
}

async function validatePathUniqueness(category, group_code, slug, excludeId = null) {
  const query = {
    category: String(category).trim(),
    group_code: group_code ? String(group_code).trim() : '',
    slug: String(slug).trim(),
  };
  
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  
  const existing = await Markdown.findOne(query).select('_id').lean();
  return !existing;
}

// Cache functions (following jsonConfigs.service.js pattern)
function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (typeof entry.expiresAt === 'number' && Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(key, value, ttlSeconds) {
  const ttl = Number(ttlSeconds || 0);
  if (Number.isNaN(ttl) || ttl <= 0) return;
  cache.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
}

function clearMarkdownCache(category, group_code, slug) {
  const keysToDelete = [];
  
  // Clear all possible cache keys for this path
  keysToDelete.push(`markdown:${category}:${group_code || ''}:${slug}`);
  keysToDelete.push(`markdown-tree:${category}`);
  keysToDelete.push(`markdown-folder:${category}:${group_code || ''}`);
  
  keysToDelete.forEach(key => cache.delete(key));
}
```

### CRUD Operations (Following Established Controller Pattern)
```javascript
// Error handling pattern (following adminJsonConfigs.controller.js)
function handleServiceError(res, error) {
  const msg = error?.message || 'Operation failed';
  const code = error?.code;

  if (code === 'VALIDATION' || code === 'INVALID_MARKDOWN') {
    return res.status(400).json({ error: msg });
  }
  if (code === 'NOT_FOUND') {
    return res.status(404).json({ error: msg });
  }
  if (code === 'PATH_NOT_UNIQUE') {
    return res.status(409).json({ error: msg });
  }

  return res.status(500).json({ error: msg });
}

### Service Functions (Following jsonConfigs.service.js patterns)
async function createMarkdown({ title, category, group_code, markdownRaw, publicEnabled = false, cacheTtlSeconds = 0, ownerUserId, orgId }) {
  // Validation (following JSON Config patterns)
  const normalizedTitle = String(title || '').trim();
  if (!normalizedTitle) {
    const err = new Error('title is required');
    err.code = 'VALIDATION';
    throw err;
  }
  
  const normalizedCategory = String(category || 'general').trim();
  if (!normalizedCategory) {
    const err = new Error('category is required');
    err.code = 'VALIDATION';
    throw err;
  }
  
  const normalizedGroupCode = normalizeGroupCode(group_code);
  const normalizedSlug = await generateUniqueSlugFromTitle(normalizedTitle, normalizedCategory, normalizedGroupCode);
  
  // Validate uniqueness (following existing patterns)
  if (!(await validatePathUniqueness(normalizedCategory, normalizedGroupCode, normalizedSlug))) {
    const err = new Error('Path must be unique (category + group_code + slug)');
    err.code = 'PATH_NOT_UNIQUE';
    throw err;
  }
  
  const createData = {
    title: normalizedTitle,
    slug: normalizedSlug,
    category: normalizedCategory,
    group_code: normalizedGroupCode,
    markdownRaw: String(markdownRaw || ''),
    publicEnabled: Boolean(publicEnabled),
    cacheTtlSeconds: Number(cacheTtlSeconds || 0) || 0,
    ownerUserId,
    orgId,
  };
  
  const doc = await Markdown.create(createData);
  
  // Clear cache
  clearMarkdownCache(normalizedCategory, normalizedGroupCode, normalizedSlug);
  
  return doc.toObject();
}

// Slug generation (following jsonConfigs.service.js patterns)
function normalizeSlugBase(title) {
  const str = String(title || '').trim().toLowerCase();
  if (!str) return 'markdown';

  const slug = str
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .replace(/-{2,}/g, '-');

  return slug || 'markdown';
}

function randomSuffix4() {
  return crypto.randomBytes(2).toString('hex');
}

async function generateUniqueSlugFromTitle(title, category, group_code, { maxAttempts = 10 } = {}) {
  const base = normalizeSlugBase(title);

  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = `${base}-${randomSuffix4()}`;
    // eslint-disable-next-line no-await-in-loop
    const existing = await Markdown.findOne({ 
      category: String(category).trim(),
      group_code: group_code ? String(group_code).trim() : '',
      slug: candidate 
    }).select('_id').lean();
    if (!existing) return candidate;
  }

  throw new Error('Failed to generate unique slug');
}

// List operations (following established pagination patterns)
async function listMarkdowns(filters = {}, pagination = {}) {
  const { 
    category, 
    group_code, 
    status = 'published',
    ownerUserId,
    orgId,
    search 
  } = filters;
  
  const { page = 1, limit = 50, sort = { updatedAt: -1 } } = pagination;
  const skip = Math.max(0, (page - 1) * limit);
  const normalizedLimit = Math.min(Number(limit) || 50, 200);

  // Build filter (following established patterns)
  const filter = {};
  
  if (category) {
    filter.category = String(category).trim();
  }
  
  if (group_code) {
    filter.group_code = String(group_code).trim();
  }
  
  if (status) {
    filter.status = String(status);
  }
  
  if (ownerUserId) {
    filter.ownerUserId = ownerUserId;
  }
  
  if (orgId) {
    filter.orgId = orgId;
  }
  
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { markdownRaw: { $regex: search, $options: 'i' } }
    ];
  }

  // Execute query with pagination (following established patterns)
  const [items, total] = await Promise.all([
    Markdown.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(normalizedLimit)
      .select('title slug category group_code publicEnabled status cacheTtlSeconds updatedAt createdAt ownerUserId orgId')
      .lean(),
    Markdown.countDocuments(filter),
  ]);

  return { items, total, limit: normalizedLimit, skip };
}

// Tree structure for explorer mode
async function getMarkdownTree(category) {
  const normalizedCategory = String(category || '').trim();
  if (!normalizedCategory) return [];

  const cacheKey = `markdown-tree:${normalizedCategory}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  const docs = await Markdown.find({ 
    category: normalizedCategory,
    status: 'published'
  }).select('group_code slug title').lean();

  // Build tree structure
  const tree = {};
  
  for (const doc of docs) {
    const parts = parseGroupCode(doc.group_code);
    let current = tree;
    
    // Navigate/create folder structure
    for (const part of parts) {
      if (!current[part]) {
        current[part] = { _type: 'folder', children: {} };
      }
      current = current[part].children;
    }
    
    // Add file
    current[doc.slug] = {
      _type: 'file',
      title: doc.title,
      slug: doc.slug,
      group_code: doc.group_code
    };
  }

  setCached(cacheKey, tree, 300); // 5 minute cache
  return tree;
}

// Folder contents for explorer mode
async function getFolderContents(category, group_code, pagination = {}) {
  const normalizedCategory = String(category || '').trim();
  const normalizedGroupCode = group_code ? String(group_code).trim() : '';
  
  const { page = 1, limit = 100, sort = { title: 1 } } = pagination;
  const skip = Math.max(0, (page - 1) * limit);
  const normalizedLimit = Math.min(Number(limit) || 100, 200);

  const cacheKey = `markdown-folder:${normalizedCategory}:${normalizedGroupCode}`;
  const cached = getCached(cacheKey);
  if (cached !== null) return cached;

  // Get files in this folder
  const filter = {
    category: normalizedCategory,
    group_code: normalizedGroupCode,
    status: 'published'
  };

  const [items, total] = await Promise.all([
    Markdown.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(normalizedLimit)
      .select('title slug group_code publicEnabled cacheTtlSeconds updatedAt createdAt')
      .lean(),
    Markdown.countDocuments(filter),
  ]);

  const result = { items, total, limit: normalizedLimit, skip };
  setCached(cacheKey, result, 60); // 1 minute cache
  return result;
}
```

## Caching Strategy

### Cache Keys
- `markdown:${category}:${group_code}:${slug}` - Full path
- `markdown-tree:${category}` - Tree structure
- `markdown-folder:${category}:${group_code}` - Folder contents

### Cache Invalidation
- Clear path cache on update/delete
- Clear tree cache on any change in category
- Clear folder cache on changes within that folder

## Frontend Components

### List Mode Components
- `MarkdownListTable` - Main table component
- `MarkdownFilters` - Category/group_code filters
- `MarkdownActions` - Bulk operations
- `CreateMarkdownModal` - New markdown form

### Explorer Mode Components
- `CategorySelector` - Dropdown with autocomplete
- `FolderTreeView` - Recursive tree component
- `FolderContents` - File listing for selected folder
- `Breadcrumbs` - Path navigation
- `FilePreviewModal` - Markdown preview
- `EditMarkdownModal` - Rich markdown editor

### Shared Components
- `MarkdownEditor` - Syntax-highlighted editor
- `PathValidator` - Real-time path validation
- `MarkdownPreview` - Rendered markdown display

## Implementation Phases

### Phase 1: Core Infrastructure
1. Create Markdown model with indexes
2. Implement basic service layer functions
3. Set up API routes (public and admin)
4. Basic CRUD operations

### Phase 2: List Mode UI
1. Create admin route and basic layout
2. Implement list table with pagination
3. Add search and filtering
4. Implement create/edit modals

### Phase 3: Explorer Mode UI
1. Implement tree view component
2. Add folder content display
3. Implement breadcrumbs and navigation
4. Add file operations (preview, download, copy)

### Phase 4: Advanced Features
1. Search functionality
2. Bulk operations
3. Import/export capabilities
4. Advanced caching and performance

## Technical Considerations

### Performance
- Compound indexes for fast path lookups
- Tree structure caching for explorer mode
- Pagination for large lists
- Lazy loading for tree expansion

### Validation
- Group code format validation
- Path uniqueness validation
- Markdown syntax validation
- Category existence validation

### Error Handling
- Structured error codes similar to JSON configs
- Graceful handling of malformed group codes
- Clear validation messages for path conflicts

### Security
- Same Basic Auth pattern as JSON configs
- Public access controlled by `publicEnabled` flag
- Input sanitization for all fields

## Route Integration (Following middleware.js Pattern)

### Route Registration (Following JSON Config Pattern)
```javascript
// In src/middleware.js (following existing pattern)
router.use("/api/markdowns", require("./routes/markdowns.routes"));
router.use("/api/admin/markdowns", require("./routes/adminMarkdowns.routes"));

// Admin UI route (following existing admin page pattern)
router.get(`${adminPath}/markdowns`, basicAuth, (req, res) => {
  const templatePath = path.join(
    __dirname,
    "..",
    "views",
    "admin-markdowns.ejs",
  );
  fs.readFile(templatePath, "utf8", (err, template) => {
    if (err) {
      console.error("Error reading admin-markdowns template:", err);
      return res.status(500).send("Admin page error");
    }

    const rendered = ejs.render(template, {
      adminPath,
      baseUrl: process.env.BASE_URL || "",
      // Add any additional EJS variables needed
    });

    res.send(rendered);
  });
});
```

### Route Files (Following Established Patterns)
```javascript
// src/routes/markdowns.routes.js (following jsonConfigs.routes.js pattern)
const express = require('express');
const router = express.Router();
const markdownsController = require('../controllers/markdowns.controller');

router.get('/:category/:group_code/:slug', markdownsController.getByPath);
router.get('/:category/:slug', markdownsController.getByPath); // No group_code
router.get('/search', markdownsController.search);

module.exports = router;

// src/routes/adminMarkdowns.routes.js (following adminJsonConfigs.routes.js pattern)
const express = require('express');
const router = express.Router();
const { basicAuth } = require('../middleware/auth');
const adminMarkdownsController = require('../controllers/adminMarkdowns.controller');

router.get('/', basicAuth, adminMarkdownsController.list);
router.get('/tree', basicAuth, adminMarkdownsController.getTree);
router.get('/folder/:category/:group_code?', basicAuth, adminMarkdownsController.getFolderContents);
router.get('/:id', basicAuth, adminMarkdownsController.get);
router.post('/', basicAuth, adminMarkdownsController.create);
router.put('/:id', basicAuth, adminMarkdownsController.update);
router.delete('/:id', basicAuth, adminMarkdownsController.remove);
router.post('/validate-path', basicAuth, adminMarkdownsController.validatePath);

module.exports = router;
```

## File Structure (Following Established Patterns)

```
src/
├── models/Markdown.js                    // Following JsonConfig.js pattern
├── services/markdowns.service.js          // Following jsonConfigs.service.js pattern
├── controllers/markdowns.controller.js   // Following jsonConfigs.controller.js pattern
├── controllers/adminMarkdowns.controller.js // Following adminJsonConfigs.controller.js pattern
├── routes/markdowns.routes.js             // Following jsonConfigs.routes.js pattern
├── routes/adminMarkdowns.routes.js       // Following adminJsonConfigs.routes.js pattern
└── views/admin-markdowns.ejs             // Following admin-json-configs.ejs pattern
```

## Implementation Details Based on Codebase Analysis

### Error Code Patterns (Following JSON Config System)
```javascript
// Standardized error codes used across controllers
const ERROR_CODES = {
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND', 
  PATH_NOT_UNIQUE: 'PATH_NOT_UNIQUE',
  INVALID_MARKDOWN: 'INVALID_MARKDOWN',
  INVALID_GROUP_CODE: 'INVALID_GROUP_CODE',
};
```

### Controller Structure (Following adminJsonConfigs.controller.js)
```javascript
// Standard controller pattern
exports.list = async (req, res) => {
  try {
    const filters = {
      category: req.query.category,
      group_code: req.query.group_code,
      status: req.query.status,
      ownerUserId: req.query.ownerUserId,
      orgId: req.query.orgId,
      search: req.query.search,
    };
    
    const pagination = {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
      sort: parseJsonMaybe(req.query.sort) || { updatedAt: -1 },
    };
    
    const result = await listMarkdowns(filters, pagination);
    return res.json(result);
  } catch (error) {
    console.error('Error listing markdowns:', error);
    return handleServiceError(res, error);
  }
};

exports.getTree = async (req, res) => {
  try {
    const { category } = req.query;
    if (!category) {
      return res.status(400).json({ error: 'category is required' });
    }
    
    const tree = await getMarkdownTree(category);
    return res.json({ tree });
  } catch (error) {
    console.error('Error getting markdown tree:', error);
    return handleServiceError(res, error);
  }
};

exports.getFolderContents = async (req, res) => {
  try {
    const { category } = req.params;
    const { group_code } = req.params;
    
    const pagination = {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 100,
      sort: parseJsonMaybe(req.query.sort) || { title: 1 },
    };
    
    const result = await getFolderContents(category, group_code, pagination);
    return res.json(result);
  } catch (error) {
    console.error('Error getting folder contents:', error);
    return handleServiceError(res, error);
  }
};

exports.validatePath = async (req, res) => {
  try {
    const { category, group_code, slug, excludeId } = req.body;
    
    if (!category || !slug) {
      return res.status(400).json({ error: 'category and slug are required' });
    }
    
    const isUnique = await validatePathUniqueness(category, group_code, slug, excludeId);
    return res.json({ unique: isUnique });
  } catch (error) {
    console.error('Error validating path:', error);
    return handleServiceError(res, error);
  }
};

// Utility function (following headlessCrud.controller.js pattern)
function parseJsonMaybe(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    return null;
  }
}
```

### Query Optimization Patterns (Following Established Practices)
```javascript
// Efficient field selection (following established patterns)
async function getMarkdownById(id) {
  return Markdown.findById(id)
    .select('title slug category group_code markdownRaw publicEnabled status cacheTtlSeconds updatedAt createdAt ownerUserId orgId')
    .lean();
}

// Optimized uniqueness checks (following jsonConfigs.service.js pattern)
async function validatePathUniqueness(category, group_code, slug, excludeId = null) {
  const query = {
    category: String(category).trim(),
    group_code: group_code ? String(group_code).trim() : '',
    slug: String(slug).trim(),
  };
  
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  
  const existing = await Markdown.findOne(query).select('_id').lean();
  return !existing;
}

// Efficient counting for pagination (following established patterns)
async function getMarkdownStats(filters = {}) {
  const { category, status, ownerUserId, orgId } = filters;
  
  const filter = {};
  if (category) filter.category = String(category).trim();
  if (status) filter.status = String(status);
  if (ownerUserId) filter.ownerUserId = ownerUserId;
  if (orgId) filter.orgId = orgId;
  
  const [total, published, draft] = await Promise.all([
    Markdown.countDocuments(filter),
    Markdown.countDocuments({ ...filter, status: 'published' }),
    Markdown.countDocuments({ ...filter, status: 'draft' }),
  ]);
  
  return { total, published, draft };
}
```

## Additional Technical Patterns Discovered

### Input Validation & Sanitization (Following Established Patterns)
```javascript
// String normalization (following jsonConfigs.service.js patterns)
function normalizeCategory(category) {
  const str = String(category || '').trim().toLowerCase();
  if (!str) return 'general';
  
  return str
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '');
}

function validateMarkdownContent(markdownRaw) {
  if (typeof markdownRaw !== 'string') {
    const err = new Error('markdownRaw must be a string');
    err.code = 'VALIDATION';
    throw err;
  }
  
  // Basic markdown validation (can be extended)
  const content = String(markdownRaw).trim();
  if (content.length > 1000000) { // 1MB limit
    const err = new Error('markdownRaw content too large (max 1MB)');
    err.code = 'VALIDATION';
    throw err;
  }
  
  return content;
}

// Query parameter parsing (following headlessCrud.controller.js pattern)
function parsePaginationParams(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(Math.max(1, Number(query.limit) || 50), 200);
  const skip = (page - 1) * limit;
  
  return { page, limit, skip };
}
```

### Database Query Patterns (Following Established Practices)
```javascript
// Efficient queries with proper field selection
async function searchMarkdowns(query, options = {}) {
  const { category, group_code, limit = 50 } = options;
  
  const searchFilter = {
    status: 'published',
    publicEnabled: true,
  };
  
  if (category) {
    searchFilter.category = String(category).trim();
  }
  
  if (group_code) {
    searchFilter.group_code = String(group_code).trim();
  }
  
  // Text search optimization
  if (query) {
    searchFilter.$text = { $search: String(query).trim() };
  } else {
    searchFilter.$or = [
      { title: { $regex: query, $options: 'i' } },
      { markdownRaw: { $regex: query, $options: 'i' } }
    ];
  }
  
  return Markdown.find(searchFilter)
    .select('title slug category group_code updatedAt') // Minimal fields for search results
    .sort({ score: { $meta: 'textScore' }, updatedAt: -1 })
    .limit(Number(limit))
    .lean();
}

// Bulk operations (following established patterns)
async function bulkUpdateStatus(ids, status, actorId) {
  const objectIds = ids.map(id => new mongoose.Types.ObjectId(id));
  
  const result = await Markdown.updateMany(
    { _id: { $in: objectIds } },
    { 
      status: String(status),
      updatedAt: new Date(),
    }
  );
  
  // Clear cache for affected items
  for (const id of ids) {
    // Would need to fetch and clear individual cache keys
    clearMarkdownCacheByDocId(id);
  }
  
  return result;
}
```

### Performance Optimization Patterns
```javascript
// Parallel query execution (following established patterns)
async function getMarkdownWithStats(id) {
  const [markdown, stats] = await Promise.all([
    getMarkdownById(id),
    getMarkdownStats({ category: markdown?.category }),
  ]);
  
  return { markdown, stats };
}

// Efficient aggregation for tree building
async function getMarkdownTreeAggregated(category) {
  const pipeline = [
    { $match: { 
      category: String(category).trim(),
      status: 'published'
    }},
    { $project: {
      group_code: 1,
      slug: 1,
      title: 1,
      pathParts: { $split: ['$group_code', '__'] }
    }},
    { $group: {
      _id: '$group_code',
      files: { $push: {
        slug: '$slug',
        title: '$title',
        group_code: '$group_code'
      }}
    }}
  ];
  
  return Markdown.aggregate(pipeline);
}

// Cache warming strategies
async function warmMarkdownCache(category) {
  const docs = await Markdown.find({
    category: String(category).trim(),
    status: 'published',
    publicEnabled: true
  }).select('category group_code slug cacheTtlSeconds markdownRaw').lean();
  
  for (const doc of docs) {
    const cacheKey = `markdown:${doc.category}:${doc.group_code || ''}:${doc.slug}`;
    setCached(cacheKey, doc.markdownRaw, doc.cacheTtlSeconds);
  }
}
```

### Security & Validation Patterns
```javascript
// Input sanitization (following established patterns)
function sanitizeMarkdownInput(data) {
  const sanitized = {};
  
  if (data.title) {
    sanitized.title = String(data.title).trim().substring(0, 200);
  }
  
  if (data.category) {
    sanitized.category = normalizeCategory(data.category);
  }
  
  if (data.group_code) {
    sanitized.group_code = normalizeGroupCode(data.group_code);
  }
  
  if (data.markdownRaw) {
    sanitized.markdownRaw = validateMarkdownContent(data.markdownRaw);
  }
  
  if (typeof data.publicEnabled === 'boolean') {
    sanitized.publicEnabled = data.publicEnabled;
  }
  
  if (typeof data.cacheTtlSeconds === 'number') {
    sanitized.cacheTtlSeconds = Math.max(0, Math.min(3600, Number(data.cacheTtlSeconds)));
  }
  
  return sanitized;
}

// Rate limiting consideration (following existing patterns)
// Note: This would use the existing rateLimiter.service.js
async function checkMarkdownRateLimit(userId, operation) {
  // Would integrate with existing rate limiting infrastructure
  // Different limits for create vs read operations
}
```

### Testing Patterns (Following Established Test Structure)
```javascript
// Test structure following jsonConfigs.service.test.js patterns
describe('markdowns.service', () => {
  beforeEach(() => {
    // Setup test data
    jest.clearAllMocks();
  });

  describe('createMarkdown', () => {
    test('should create markdown with valid data', async () => {
      const data = {
        title: 'Test Markdown',
        category: 'docs',
        group_code: 'api__endpoints',
        markdownRaw: '# Test Content',
        publicEnabled: true,
      };

      Markdown.findOne.mockResolvedValue(null);
      Markdown.create.mockResolvedValue({ _id: 'test-id', ...data });

      const result = await createMarkdown(data);
      
      expect(result).toBeDefined();
      expect(Markdown.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Markdown',
          category: 'docs',
          group_code: 'api__endpoints'
        })
      );
    });

    test('should throw validation error for missing title', async () => {
      const data = { category: 'docs', markdownRaw: '# Test' };
      
      await expect(createMarkdown(data)).rejects.toThrow('title is required');
    });
  });

  describe('getMarkdownTree', () => {
    test('should build hierarchical tree structure', async () => {
      const mockDocs = [
        { group_code: 'folder1__folder2', slug: 'file1', title: 'File 1' },
        { group_code: 'folder1', slug: 'file2', title: 'File 2' },
        { group_code: '', slug: 'root', title: 'Root File' },
      ];

      Markdown.find.mockResolvedValue(mockDocs);

      const tree = await getMarkdownTree('docs');
      
      expect(tree).toHaveProperty('folder1');
      expect(tree.folder1).toHaveProperty('children');
      expect(tree.folder1.children).toHaveProperty('folder2');
    });
  });
});
```

### Model Patterns (Following Page.js, I18nEntry.js, Asset.js)
- Use `{ timestamps: true }` for automatic timestamp management
- Add proper indexes for performance
- Use `trim: true` for string fields
- Follow the same reference patterns for User/Organization
- Use `default` values where appropriate
- Add `enum` fields for status management

### Middleware Integration (Following middleware.js)
- Use existing `basicAuth` middleware for admin routes
- Follow the same route mounting patterns
- Use the same EJS template rendering approach
- Follow the same error handling patterns in route handlers

## Migration Strategy
1. Create new model alongside existing JSON configs
2. Implement service layer with similar patterns
3. Add routes following established conventions
4. Create admin UI as new page
5. Test thoroughly before deployment

This design leverages the proven patterns from JSON Configs while adding markdown-specific features and hierarchical organization capabilities.
