const crypto = require('crypto');

const Markdown = require('../models/Markdown');

// Error codes
const ERROR_CODES = {
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  PATH_NOT_UNIQUE: 'PATH_NOT_UNIQUE',
  INVALID_MARKDOWN: 'INVALID_MARKDOWN',
  INVALID_GROUP_CODE: 'INVALID_GROUP_CODE',
};

// Path operations
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

function validateMarkdownContent(markdownRaw) {
  if (typeof markdownRaw !== 'string') {
    const err = new Error('markdownRaw must be a string');
    err.code = ERROR_CODES.VALIDATION;
    throw err;
  }
  
  // Basic markdown validation (can be extended)
  const content = String(markdownRaw).trim();
  if (content.length > 1000000) { // 1MB limit
    const err = new Error('markdownRaw content too large (max 1MB)');
    err.code = ERROR_CODES.VALIDATION;
    throw err;
  }
  
  return content;
}

// Core CRUD operations
async function getMarkdownByPath(category, group_code, slug) {
  const doc = await Markdown.findOne({
    category: String(category).trim(),
    group_code: group_code ? String(group_code).trim() : '',
    slug: String(slug).trim(),
    publicEnabled: true,
    status: 'published'
  }).lean();
  
  if (!doc) {
    const err = new Error('Markdown not found');
    err.code = ERROR_CODES.NOT_FOUND;
    throw err;
  }
  
  return doc;
}

async function createMarkdown({ title, category, group_code, markdownRaw, publicEnabled = false, cacheTtlSeconds = 0, ownerUserId, orgId }) {
  // Validation
  const normalizedTitle = String(title || '').trim();
  if (!normalizedTitle) {
    const err = new Error('title is required');
    err.code = ERROR_CODES.VALIDATION;
    throw err;
  }
  
  const normalizedCategory = normalizeCategory(category);
  if (!normalizedCategory) {
    const err = new Error('category is required');
    err.code = ERROR_CODES.VALIDATION;
    throw err;
  }
  
  const normalizedGroupCode = normalizeGroupCode(group_code);
  const normalizedSlug = await generateUniqueSlugFromTitle(normalizedTitle, normalizedCategory, normalizedGroupCode);
  const validatedMarkdown = validateMarkdownContent(markdownRaw);
  
  // Validate uniqueness
  if (!(await validatePathUniqueness(normalizedCategory, normalizedGroupCode, normalizedSlug))) {
    const err = new Error('Path must be unique (category + group_code + slug)');
    err.code = ERROR_CODES.PATH_NOT_UNIQUE;
    throw err;
  }
  
  const createData = {
    title: normalizedTitle,
    slug: normalizedSlug,
    category: normalizedCategory,
    group_code: normalizedGroupCode,
    markdownRaw: validatedMarkdown,
    publicEnabled: Boolean(publicEnabled),
    cacheTtlSeconds: Number(cacheTtlSeconds || 0) || 0,
    ownerUserId,
    orgId,
  };
  
  const doc = await Markdown.create(createData);
  
  return doc.toObject();
}

async function getMarkdownById(id) {
  return Markdown.findById(id)
    .select('title slug category group_code markdownRaw publicEnabled status cacheTtlSeconds updatedAt createdAt ownerUserId orgId')
    .lean();
}

async function updateMarkdown(id, patch) {
  const doc = await Markdown.findById(id);
  if (!doc) {
    const err = new Error('Markdown not found');
    err.code = ERROR_CODES.NOT_FOUND;
    throw err;
  }

  const oldCategory = doc.category;
  const oldGroupCode = doc.group_code;
  const oldSlug = doc.slug;

  // Update fields
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'title')) {
    const title = String(patch.title || '').trim();
    if (!title) {
      const err = new Error('title is required');
      err.code = ERROR_CODES.VALIDATION;
      throw err;
    }
    doc.title = title;
  }

  if (patch && Object.prototype.hasOwnProperty.call(patch, 'category')) {
    doc.category = normalizeCategory(patch.category);
  }

  if (patch && Object.prototype.hasOwnProperty.call(patch, 'group_code')) {
    doc.group_code = normalizeGroupCode(patch.group_code);
  }

  if (patch && Object.prototype.hasOwnProperty.call(patch, 'markdownRaw')) {
    doc.markdownRaw = validateMarkdownContent(patch.markdownRaw);
  }

  if (patch && Object.prototype.hasOwnProperty.call(patch, 'publicEnabled')) {
    doc.publicEnabled = Boolean(patch.publicEnabled);
  }

  if (patch && Object.prototype.hasOwnProperty.call(patch, 'status')) {
    const validStatuses = ['draft', 'published', 'archived'];
    if (!validStatuses.includes(patch.status)) {
      const err = new Error('Invalid status. Must be draft, published, or archived');
      err.code = ERROR_CODES.VALIDATION;
      throw err;
    }
    doc.status = patch.status;
  }

  if (patch && Object.prototype.hasOwnProperty.call(patch, 'cacheTtlSeconds')) {
    const ttl = Number(patch.cacheTtlSeconds || 0);
    doc.cacheTtlSeconds = Number.isNaN(ttl) ? 0 : Math.max(0, ttl);
  }

  if (patch && Object.prototype.hasOwnProperty.call(patch, 'ownerUserId')) {
    doc.ownerUserId = patch.ownerUserId;
  }

  if (patch && Object.prototype.hasOwnProperty.call(patch, 'orgId')) {
    doc.orgId = patch.orgId;
  }

  // Validate path uniqueness if category, group_code, or slug changed
  if (doc.category !== oldCategory || doc.group_code !== oldGroupCode) {
    if (!(await validatePathUniqueness(doc.category, doc.group_code, doc.slug, id))) {
      const err = new Error('Path must be unique (category + group_code + slug)');
      err.code = ERROR_CODES.PATH_NOT_UNIQUE;
      throw err;
    }
  }

  await doc.save();

  return doc.toObject();
}

async function deleteMarkdown(id) {
  const doc = await Markdown.findByIdAndDelete(id).lean();
  if (!doc) {
    const err = new Error('Markdown not found');
    err.code = ERROR_CODES.NOT_FOUND;
    throw err;
  }

  return { success: true };
}

// List operations
async function listMarkdowns(filters = {}, pagination = {}, options = {}) {
  const { 
    category, 
    group_code, 
    status,
    ownerUserId,
    orgId,
    search 
  } = filters;
  
  const { isAdmin = false } = options;
  
  const { page = 1, limit = 50, sort = { updatedAt: -1 } } = pagination;
  const skip = Math.max(0, (page - 1) * limit);
  const normalizedLimit = Math.min(Number(limit) || 50, 200);

  // Build filter
  const filter = {};
  
  if (category) {
    filter.category = String(category).trim();
  }
  
  if (group_code) {
    filter.group_code = String(group_code).trim();
  }
  
  // Apply status filter: explicit status or default for non-admin
  if (status) {
    filter.status = String(status);
  } else if (!isAdmin) {
    filter.status = 'published';
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

  // Execute query with pagination
  const [items, total] = await Promise.all([
    Markdown.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(normalizedLimit)
      .select('title slug category group_code markdownRaw publicEnabled status cacheTtlSeconds updatedAt createdAt ownerUserId orgId')
      .lean(),
    Markdown.countDocuments(filter),
  ]);

  return { items, total, limit: normalizedLimit, skip };
}

// Tree structure for explorer mode
async function getMarkdownTree(category, options = {}) {
  const { isAdmin = false } = options;
  const normalizedCategory = String(category || '').trim();
  if (!normalizedCategory) return {};

  // Build filter based on admin mode
  const filter = { category: normalizedCategory };
  if (!isAdmin) {
    filter.status = 'published';
  }

  const docs = await Markdown.find(filter)
    .select('group_code slug title status')
    .lean();

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
      group_code: doc.group_code,
      status: doc.status
    };
  }

  return tree;
}

// Folder contents for explorer mode (exact folder matching)
async function getFolderContents(category, group_code, pagination = {}, options = {}) {
  const { isAdmin = false } = options;
  const normalizedCategory = String(category || '').trim();
  const normalizedGroupCode = group_code ? String(group_code).trim() : '';
  
  const { page = 1, limit = 100, sort = { title: 1 } } = pagination;
  const skip = Math.max(0, (page - 1) * limit);
  const normalizedLimit = Math.min(Number(limit) || 100, 200);

  // Exact match only (no prefix matching for Windows Explorer-style navigation)
  const filter = {
    category: normalizedCategory,
    group_code: normalizedGroupCode
  };
  
  if (!isAdmin) {
    filter.status = 'published';
  }

  const [items, total] = await Promise.all([
    Markdown.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(normalizedLimit)
      .select('title slug category group_code markdownRaw publicEnabled status cacheTtlSeconds updatedAt createdAt ownerUserId orgId')
      .lean(),
    Markdown.countDocuments(filter),
  ]);

  const result = { items, total, limit: normalizedLimit, skip };
  return result;
}

// Get unique group codes for tree building (performance optimized)
async function getUniqueGroupCodes(category, options = {}) {
  const { isAdmin = false } = options;
  const normalizedCategory = String(category || '').trim();
  
  const filter = { category: normalizedCategory };
  if (!isAdmin) {
    filter.status = 'published';
  }

  // Use distinct to get all existing group codes
  const groupCodes = await Markdown.distinct('group_code', filter);
  
  // Normalize results: convert null/undefined to "" and ensure uniqueness
  const normalizedCodes = Array.from(new Set(groupCodes.map(code => code || '')));
  
  // Explicitly check for documents where group_code field might be missing
  // because distinct() omits values for documents where the field is missing.
  const hasMissingField = await Markdown.findOne({
    ...filter,
    group_code: { $exists: false }
  }).select('_id').lean();

  if (hasMissingField && !normalizedCodes.includes('')) {
    normalizedCodes.push('');
  }

  return normalizedCodes;
}

// Search functionality
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
  
  // Text search
  if (query) {
    searchFilter.$or = [
      { title: { $regex: query, $options: 'i' } },
      { markdownRaw: { $regex: query, $options: 'i' } }
    ];
  }
  
  return Markdown.find(searchFilter)
    .select('title slug category group_code updatedAt')
    .sort({ updatedAt: -1 })
    .limit(Number(limit))
    .lean();
}

module.exports = {
  ERROR_CODES,
  normalizeGroupCode,
  parseGroupCode,
  buildGroupCode,
  normalizeCategory,
  validatePathUniqueness,
  getMarkdownByPath,
  createMarkdown,
  getMarkdownById,
  updateMarkdown,
  deleteMarkdown,
  listMarkdowns,
  getMarkdownTree,
  getFolderContents,
  getUniqueGroupCodes,
  searchMarkdowns,
};
