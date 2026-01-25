const Page = require('../models/Page');
const PageCollection = require('../models/PageCollection');
const BlockDefinition = require('../models/BlockDefinition');
const ejsVirtualService = require('./ejsVirtual.service');
const pagesContextService = require('./pagesContext.service');
const { getJsonConfigValueBySlug } = require('./jsonConfigs.service');

const RESERVED_SEGMENTS = new Set(['api', 'public', 'w', 'admin']);

const BLOCKS_SCHEMA_JSON_CONFIG_ALIAS = 'page-builder-blocks-schema';

function getDefaultBlocksSchema() {
  return {
    version: 1,
    blocks: {
      hero: {
        label: 'Hero',
        fields: {
          title: { type: 'string', label: 'Title' },
          subtitle: { type: 'string', label: 'Subtitle' },
          ctaText: { type: 'string', label: 'CTA Text' },
          ctaUrl: { type: 'string', label: 'CTA URL' },
        },
      },
      text: {
        label: 'Text',
        fields: {
          title: { type: 'string', label: 'Title' },
          content: { type: 'html', label: 'Content (HTML)' },
        },
      },
      image: {
        label: 'Image',
        fields: {
          src: { type: 'string', label: 'Image URL' },
          alt: { type: 'string', label: 'Alt Text' },
          caption: { type: 'string', label: 'Caption' },
          fullWidth: { type: 'boolean', label: 'Full Width' },
          align: { type: 'select', label: 'Align', options: ['left', 'center', 'right'] },
        },
      },
      cta: {
        label: 'CTA',
        fields: {
          title: { type: 'string', label: 'Title' },
          description: { type: 'string', label: 'Description' },
          buttonText: { type: 'string', label: 'Button Text' },
          buttonUrl: { type: 'string', label: 'Button URL' },
        },
      },
      features: {
        label: 'Features',
        fields: {
          title: { type: 'string', label: 'Title' },
          items: { type: 'json', label: 'Items (JSON array)', example: [{ title: 'Fast setup', description: 'Get started in minutes', icon: 'bolt' }] },
        },
      },
      testimonials: {
        label: 'Testimonials',
        fields: {
          title: { type: 'string', label: 'Title' },
          items: { type: 'json', label: 'Items (JSON array)', example: [{ quote: 'This product is amazing.', name: 'Jane Doe', role: 'CEO', avatar: '/public/avatar.png' }] },
        },
      },
      faq: {
        label: 'FAQ',
        fields: {
          title: { type: 'string', label: 'Title' },
          items: { type: 'json', label: 'Items (JSON array)', example: [{ question: 'What is this?', answer: 'A page builder powered by blocks.' }] },
        },
      },
      contact: {
        label: 'Contact',
        fields: {
          title: { type: 'string', label: 'Title' },
          action: { type: 'string', label: 'Form Action' },
          formId: { type: 'string', label: 'Form ID' },
          buttonText: { type: 'string', label: 'Button Text' },
        },
      },
      html: {
        label: 'HTML',
        fields: {
          html: { type: 'html', label: 'HTML' },
        },
      },
      'context.db_query': {
        label: 'Context: DB Query',
        fields: {
          model: { type: 'string', label: 'Model' },
          op: { type: 'select', label: 'Operation', options: ['find', 'findOne', 'countDocuments'] },
          filter: { type: 'json', label: 'Filter (JSON)' },
          sort: { type: 'json', label: 'Sort (JSON)' },
          select: { type: 'json', label: 'Select (JSON)' },
          limit: { type: 'number', label: 'Limit' },
          assignTo: { type: 'string', label: 'Assign to vars key' },
          cache: { type: 'json', label: 'Cache config (JSON)' },
          timeout: { type: 'json', label: 'Timeout config (JSON)' },
        },
      },
      'context.service_invoke': {
        label: 'Context: Service Invoke',
        fields: {
          servicePath: { type: 'string', label: 'Service path (helpers.*)' },
          args: { type: 'json', label: 'Args (JSON)' },
          assignTo: { type: 'string', label: 'Assign to vars key' },
          cache: { type: 'json', label: 'Cache config (JSON)' },
          timeout: { type: 'json', label: 'Timeout config (JSON)' },
        },
      },
    },
  };
}

function inferRepeatParams(page, { routePath, segments, collectionSlug }) {
  const repeat = page && page.repeat && typeof page.repeat === 'object' ? page.repeat : null;
  if (!repeat) return null;

  const paramKey = String(repeat.paramKey || 'slug').trim() || 'slug';
  // Today we support one-segment dynamic routes within a collection: /<collection>/<param>
  // (collectionSlug may itself include slashes)
  const value = segments && segments.length > 0 ? segments[segments.length - 1] : null;
  if (!value) return null;

  return {
    [paramKey]: value,
    collectionSlug: collectionSlug || null,
    routePath: routePath || null,
  };
}

function isRepeatEnabledForRoot(page) {
  const repeat = page && page.repeat && typeof page.repeat === 'object' ? page.repeat : null;
  return Boolean(repeat && repeat.allowRoot === true);
}

async function getBlocksSchema({ bypassCache = false } = {}) {
  try {
    let schema = await getJsonConfigValueBySlug(BLOCKS_SCHEMA_JSON_CONFIG_ALIAS, { bypassCache });
    if (!schema || typeof schema !== 'object' || !schema.blocks || typeof schema.blocks !== 'object') {
      schema = getDefaultBlocksSchema();
    }

    let defs = [];
    try {
      defs = await BlockDefinition.find({ isActive: true }).sort({ updatedAt: -1 }).lean();
    } catch (_) {
      defs = [];
    }

    if (!defs.length) return schema;

    const mergedBlocks = { ...(schema.blocks || {}) };
    for (const d of defs) {
      const code = String(d.code || '').trim();
      if (!code) continue;
      mergedBlocks[code] = {
        label: String(d.label || code),
        description: String(d.description || ''),
        fields: (d.fields && typeof d.fields === 'object' && !Array.isArray(d.fields)) ? d.fields : {},
        version: Number(d.version || 1) || 1,
        source: 'db',
      };
    }

    return { ...schema, blocks: mergedBlocks };
  } catch (err) {
    if (err && err.code === 'NOT_FOUND') {
      const base = getDefaultBlocksSchema();
      let defs = [];
      try {
        defs = await BlockDefinition.find({ isActive: true }).sort({ updatedAt: -1 }).lean();
      } catch (_) {
        defs = [];
      }

      if (!defs.length) return base;

      const mergedBlocks = { ...(base.blocks || {}) };
      for (const d of defs) {
        const code = String(d.code || '').trim();
        if (!code) continue;
        mergedBlocks[code] = {
          label: String(d.label || code),
          description: String(d.description || ''),
          fields: (d.fields && typeof d.fields === 'object' && !Array.isArray(d.fields)) ? d.fields : {},
          version: Number(d.version || 1) || 1,
          source: 'db',
        };
      }

      return { ...base, blocks: mergedBlocks };
    }
    throw err;
  }
}

function validateBlocks(blocks, schema) {
  if (blocks === undefined) return;
  if (!Array.isArray(blocks)) {
    const err = new Error('blocks must be an array');
    err.code = 'VALIDATION';
    throw err;
  }

  const blockDefs = schema?.blocks || {};

  for (const block of blocks) {
    if (!block || typeof block !== 'object') {
      const err = new Error('Each block must be an object');
      err.code = 'VALIDATION';
      throw err;
    }

    const id = String(block.id || '').trim();
    if (!id) {
      const err = new Error('Each block must have an id');
      err.code = 'VALIDATION';
      throw err;
    }

    const type = String(block.type || '').trim();
    if (!type) {
      const err = new Error('Each block must have a type');
      err.code = 'VALIDATION';
      throw err;
    }

    const def = blockDefs[type];
    if (!def) {
      const err = new Error(`Unknown block type: ${type}`);
      err.code = 'VALIDATION';
      throw err;
    }

    if (block.props !== undefined && (block.props === null || typeof block.props !== 'object' || Array.isArray(block.props))) {
      const err = new Error(`Block props must be an object for type: ${type}`);
      err.code = 'VALIDATION';
      throw err;
    }

    const props = block.props || {};
    const fields = def?.fields && typeof def.fields === 'object' ? def.fields : {};
    for (const key of Object.keys(fields)) {
      if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
      const field = fields[key] || {};
      const fieldType = String(field.type || '').toLowerCase();
      const val = props[key];

      if (val === null || val === undefined) continue;

      if (fieldType === 'string' || fieldType === 'html') {
        if (typeof val !== 'string') {
          const err = new Error(`Block props.${key} must be a string for type: ${type}`);
          err.code = 'VALIDATION';
          throw err;
        }
      } else if (fieldType === 'boolean') {
        if (typeof val !== 'boolean') {
          const err = new Error(`Block props.${key} must be a boolean for type: ${type}`);
          err.code = 'VALIDATION';
          throw err;
        }
      } else if (fieldType === 'number') {
        if (typeof val !== 'number' || Number.isNaN(val)) {
          const err = new Error(`Block props.${key} must be a number for type: ${type}`);
          err.code = 'VALIDATION';
          throw err;
        }
      } else if (fieldType === 'select') {
        const options = Array.isArray(field.options) ? field.options : [];
        if (typeof val !== 'string') {
          const err = new Error(`Block props.${key} must be a string for type: ${type}`);
          err.code = 'VALIDATION';
          throw err;
        }
        if (options.length > 0 && !options.includes(val)) {
          const err = new Error(`Block props.${key} must be one of: ${options.join(', ')} for type: ${type}`);
          err.code = 'VALIDATION';
          throw err;
        }
      } else if (fieldType === 'json') {
        const ok = typeof val === 'object' || typeof val === 'string';
        if (!ok) {
          const err = new Error(`Block props.${key} must be an object/array or JSON string for type: ${type}`);
          err.code = 'VALIDATION';
          throw err;
        }
      }
    }
  }
}

function computeReservedSegments(adminPath) {
  const segments = new Set(RESERVED_SEGMENTS);
  if (adminPath) {
    const firstSegment = String(adminPath).replace(/^\//, '').split('/')[0];
    if (firstSegment) {
      segments.add(firstSegment.toLowerCase());
    }
  }
  return segments;
}

function isReservedSegment(segment, adminPath) {
  const reserved = computeReservedSegments(adminPath);
  return reserved.has(String(segment).toLowerCase());
}

function validateSlug(slug) {
  const s = String(slug || '').trim();
  if (!s) {
    const err = new Error('Slug is required');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) {
    const err = new Error('Slug must be lowercase alphanumeric with hyphens only');
    err.code = 'VALIDATION';
    throw err;
  }
  return s;
}

function validateCollectionSlug(slug, pagesPrefix, adminPath) {
  const s = validateSlug(slug);
  if (pagesPrefix === '/' && isReservedSegment(s, adminPath)) {
    const err = new Error(`Slug "${s}" is reserved and cannot be used as a collection slug when pagesPrefix is "/""`);
    err.code = 'VALIDATION';
    throw err;
  }
  return s;
}

function validatePageSlug(slug, collectionSlug, pagesPrefix, adminPath) {
  const s = validateSlug(slug);
  if (pagesPrefix === '/' && !collectionSlug && isReservedSegment(s, adminPath)) {
    const err = new Error(`Slug "${s}" is reserved and cannot be used at root level when pagesPrefix is "/"`);
    err.code = 'VALIDATION';
    throw err;
  }
  return s;
}

function buildRoutePath(pagesPrefix, collectionSlug, pageSlug) {
  const parts = [];
  const prefix = String(pagesPrefix || '/').replace(/\/+$/, '');
  if (prefix && prefix !== '/') {
    parts.push(prefix.replace(/^\//, ''));
  }
  if (collectionSlug) {
    parts.push(collectionSlug);
  }
  parts.push(pageSlug);
  return '/' + parts.join('/');
}

async function findPageByRoutePath(routePath, options = {}) {
  const { pagesPrefix = '/', tenantId = null, includeGlobal = true, statuses = ['published'] } = options;
  
  const pathWithoutPrefix = pagesPrefix === '/'
    ? routePath
    : routePath.replace(new RegExp(`^${pagesPrefix}`), '');
  
  const segments = pathWithoutPrefix.replace(/^\//, '').split('/').filter(Boolean);
  
  if (segments.length === 0) {
    return null;
  }
  
  const tenantQuery = [];
  if (includeGlobal) {
    tenantQuery.push({ isGlobal: true });
  }
  if (tenantId) {
    tenantQuery.push({ tenantId, isGlobal: false });
  }
  
  if (tenantQuery.length === 0) {
    return null;
  }

  if (segments.length === 1) {
    const page = await Page.findOne({
      slug: segments[0],
      collectionId: null,
      status: { $in: statuses },
      $or: tenantQuery,
    }).lean();
    
    if (page) {
      page._routePath = buildRoutePath(pagesPrefix, null, page.slug);
      page._params = {};
    }

    if (page) return page;

    // Repeat fallback for root-level pages is disabled by default.
    // To enable, explicitly set page.repeat.allowRoot=true.
    const repeatCandidate = await Page.findOne({
      collectionId: null,
      slug: '_',
      status: { $in: statuses },
      repeat: { $ne: null },
      $or: tenantQuery,
    }).sort({ updatedAt: -1 }).lean();

    if (!repeatCandidate || !isRepeatEnabledForRoot(repeatCandidate)) return null;

    repeatCandidate._routePath = buildRoutePath(pagesPrefix, null, segments[0]);
    repeatCandidate._params = inferRepeatParams(repeatCandidate, { routePath, segments, collectionSlug: null }) || {};
    repeatCandidate._repeatResolved = true;
    return repeatCandidate;
  }

  const collectionSlug = segments.slice(0, -1).join('/');
  const pageSlug = segments[segments.length - 1];

  const collection = await PageCollection.findOne({
    slug: collectionSlug,
    status: 'active',
    $or: tenantQuery,
  }).lean();

  if (!collection) {
    return null;
  }

  const page = await Page.findOne({
    slug: pageSlug,
    collectionId: collection._id,
    status: { $in: statuses },
    $or: tenantQuery,
  }).lean();

  if (page) {
    page._routePath = buildRoutePath(pagesPrefix, collectionSlug, page.slug);
    page._collection = collection;
    page._params = {};
    return page;
  }

  // Repeat fallback within the collection.
  const repeatPage = await Page.findOne({
    collectionId: collection._id,
    slug: '_',
    status: { $in: statuses },
    repeat: { $ne: null },
    $or: tenantQuery,
  }).sort({ updatedAt: -1 }).lean();

  if (!repeatPage) {
    // Backward-compatible fallback: any repeat page in the collection.
    const anyRepeat = await Page.findOne({
      collectionId: collection._id,
      status: { $in: statuses },
      repeat: { $ne: null },
      $or: tenantQuery,
    }).sort({ updatedAt: -1 }).lean();

    if (!anyRepeat) return null;

    anyRepeat._routePath = buildRoutePath(pagesPrefix, collectionSlug, pageSlug);
    anyRepeat._collection = collection;
    anyRepeat._params = inferRepeatParams(anyRepeat, { routePath, segments, collectionSlug }) || {};
    anyRepeat._repeatResolved = true;
    return anyRepeat;
  }

  // Route path should reflect the requested route, not the repeat page slug.
  repeatPage._routePath = buildRoutePath(pagesPrefix, collectionSlug, pageSlug);
  repeatPage._collection = collection;
  repeatPage._params = inferRepeatParams(repeatPage, { routePath, segments, collectionSlug }) || {};
  repeatPage._repeatResolved = true;
  return repeatPage;
}

async function renderPage(page, options = {}) {
  const { viewsRoot, req, res } = options;
  
  const layoutKey = page.layoutKey || 'default';
  const templateKey = page.templateKey || 'default';
  
  const layoutPath = `pages/layouts/${layoutKey}.ejs`;
  const templatePath = `pages/templates/${templateKey}.ejs`;
  
  const routePath = (req && req.path) ? req.path : (page && page._routePath ? page._routePath : null);
  const params = (page && page._params && typeof page._params === 'object') ? page._params : {};

  const { pageContext, renderBlocks } = await pagesContextService.resolvePageContext({
    page,
    req,
    res,
    routePath,
    params,
  });

  const data = {
    page,
    blocks: renderBlocks || [],
    pageContext,
    seoMeta: page.seoMeta || {},
    customCss: page.customCss || '',
    customJs: page.customJs || '',
    layoutPath,
    templatePath,
    req,
  };

  const entryPath = 'pages/runtime/page.ejs';
  
  const html = await ejsVirtualService.renderToString(res, entryPath, data, { viewsRoot });
  return html;
}

async function listPages(query = {}) {
  const { tenantId, collectionId, status, isGlobal, limit = 50, offset = 0, search } = query;
  
  const filter = {};
  
  if (tenantId !== undefined) {
    filter.tenantId = tenantId;
  }
  if (collectionId !== undefined) {
    filter.collectionId = collectionId;
  }
  if (status) {
    filter.status = status;
  }
  if (isGlobal !== undefined) {
    filter.isGlobal = isGlobal;
  }
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { slug: { $regex: search, $options: 'i' } },
    ];
  }

  const [pages, total] = await Promise.all([
    Page.find(filter)
      .populate('collectionId', 'slug name')
      .sort({ updatedAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean(),
    Page.countDocuments(filter),
  ]);

  return { pages, total, limit, offset };
}

async function listCollections(query = {}) {
  const { tenantId, status, isGlobal, limit = 50, offset = 0, search } = query;
  
  const filter = {};
  
  if (tenantId !== undefined) {
    filter.tenantId = tenantId;
  }
  if (status) {
    filter.status = status;
  }
  if (isGlobal !== undefined) {
    filter.isGlobal = isGlobal;
  }
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { slug: { $regex: search, $options: 'i' } },
    ];
  }

  const [collections, total] = await Promise.all([
    PageCollection.find(filter)
      .sort({ updatedAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean(),
    PageCollection.countDocuments(filter),
  ]);

  return { collections, total, limit, offset };
}

module.exports = {
  RESERVED_SEGMENTS,
  BLOCKS_SCHEMA_JSON_CONFIG_ALIAS,
  getDefaultBlocksSchema,
  getBlocksSchema,
  validateBlocks,
  computeReservedSegments,
  isReservedSegment,
  validateSlug,
  validateCollectionSlug,
  validatePageSlug,
  buildRoutePath,
  findPageByRoutePath,
  renderPage,
  listPages,
  listCollections,
};
