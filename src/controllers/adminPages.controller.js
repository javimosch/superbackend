const Page = require('../models/Page');
const PageCollection = require('../models/PageCollection');
const VirtualEjsFile = require('../models/VirtualEjsFile');
const pagesService = require('../services/pages.service');
const pagesContextService = require('../services/pagesContext.service');
const { getBasicAuthActor, createAuditEvent } = require('../services/audit.service');

exports.listCollections = async (req, res) => {
  try {
    const { tenantId, status, isGlobal, limit, offset, search } = req.query;
    const result = await pagesService.listCollections({
      tenantId: tenantId || undefined,
      status: status || undefined,
      isGlobal: isGlobal === 'true' ? true : isGlobal === 'false' ? false : undefined,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0,
      search: search || undefined,
    });
    res.json(result);
  } catch (err) {
    console.error('[adminPages] listCollections error:', err);
    res.status(500).json({ error: 'Failed to list collections' });
  }
};

exports.getCollection = async (req, res) => {
  try {
    const { id } = req.params;
    const collection = await PageCollection.findById(id).lean();
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    res.json({ collection });
  } catch (err) {
    console.error('[adminPages] getCollection error:', err);
    res.status(500).json({ error: 'Failed to get collection' });
  }
};

exports.createCollection = async (req, res) => {
  try {
    const actor = getBasicAuthActor(req);
    const { slug, name, description, tenantId, isGlobal, status } = req.body;

    const pagesPrefix = req.app.get('pagesPrefix') || '/';
    const adminPath = req.app.get('adminPath') || '/admin';

    const validatedSlug = pagesService.validateCollectionSlug(slug, pagesPrefix, adminPath);

    const existing = await PageCollection.findOne({
      slug: validatedSlug,
      tenantId: tenantId || null,
    });

    if (existing) {
      return res.status(409).json({ error: 'Collection with this slug already exists' });
    }

    const collection = await PageCollection.create({
      slug: validatedSlug,
      name: name || validatedSlug,
      description: description || '',
      tenantId: tenantId || null,
      isGlobal: isGlobal !== false,
      status: status || 'active',
    });

    await createAuditEvent({
      ...actor,
      action: 'pageCollection.create',
      entityType: 'PageCollection',
      entityId: String(collection._id),
      before: null,
      after: collection.toObject(),
      meta: null,
    });

    res.status(201).json({ collection: collection.toObject() });
  } catch (err) {
    if (err.code === 'VALIDATION') {
      return res.status(400).json({ error: err.message });
    }
    console.error('[adminPages] createCollection error:', err);
    res.status(500).json({ error: 'Failed to create collection' });
  }
};

exports.updateCollection = async (req, res) => {
  try {
    const actor = getBasicAuthActor(req);
    const { id } = req.params;
    const { slug, name, description, tenantId, isGlobal, status } = req.body;

    const existing = await PageCollection.findById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const before = existing.toObject();

    const pagesPrefix = req.app.get('pagesPrefix') || '/';
    const adminPath = req.app.get('adminPath') || '/admin';

    if (slug !== undefined) {
      const validatedSlug = pagesService.validateCollectionSlug(slug, pagesPrefix, adminPath);
      const duplicate = await PageCollection.findOne({
        _id: { $ne: id },
        slug: validatedSlug,
        tenantId: existing.tenantId,
      });
      if (duplicate) {
        return res.status(409).json({ error: 'Another collection with this slug already exists' });
      }
      existing.slug = validatedSlug;
    }
    if (name !== undefined) existing.name = name;
    if (description !== undefined) existing.description = description;
    if (tenantId !== undefined) existing.tenantId = tenantId || null;
    if (isGlobal !== undefined) existing.isGlobal = isGlobal;
    if (status !== undefined) existing.status = status;

    await existing.save();

    await createAuditEvent({
      ...actor,
      action: 'pageCollection.update',
      entityType: 'PageCollection',
      entityId: String(existing._id),
      before,
      after: existing.toObject(),
      meta: null,
    });

    res.json({ collection: existing.toObject() });
  } catch (err) {
    if (err.code === 'VALIDATION') {
      return res.status(400).json({ error: err.message });
    }
    console.error('[adminPages] updateCollection error:', err);
    res.status(500).json({ error: 'Failed to update collection' });
  }
};

exports.deleteCollection = async (req, res) => {
  try {
    const actor = getBasicAuthActor(req);
    const { id } = req.params;

    const existing = await PageCollection.findById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    const pagesInCollection = await Page.countDocuments({ collectionId: id });
    if (pagesInCollection > 0) {
      return res.status(400).json({ 
        error: `Cannot delete collection with ${pagesInCollection} page(s). Move or delete pages first.` 
      });
    }

    const before = existing.toObject();
    await PageCollection.deleteOne({ _id: id });

    await createAuditEvent({
      ...actor,
      action: 'pageCollection.delete',
      entityType: 'PageCollection',
      entityId: String(id),
      before,
      after: null,
      meta: null,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[adminPages] deleteCollection error:', err);
    res.status(500).json({ error: 'Failed to delete collection' });
  }
};

exports.listPages = async (req, res) => {
  try {
    const { tenantId, collectionId, status, isGlobal, limit, offset, search } = req.query;
    const result = await pagesService.listPages({
      tenantId: tenantId || undefined,
      collectionId: collectionId || undefined,
      status: status || undefined,
      isGlobal: isGlobal === 'true' ? true : isGlobal === 'false' ? false : undefined,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0,
      search: search || undefined,
    });
    res.json(result);
  } catch (err) {
    console.error('[adminPages] listPages error:', err);
    res.status(500).json({ error: 'Failed to list pages' });
  }
};

exports.getPage = async (req, res) => {
  try {
    const { id } = req.params;
    const page = await Page.findById(id).populate('collectionId', 'slug name').lean();
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }
    res.json({ page });
  } catch (err) {
    console.error('[adminPages] getPage error:', err);
    res.status(500).json({ error: 'Failed to get page' });
  }
};

exports.createPage = async (req, res) => {
  try {
    const actor = getBasicAuthActor(req);
    const {
      slug,
      collectionId,
      title,
      templateKey,
      layoutKey,
      blocks,
      repeat,
      customCss,
      customJs,
      seoMeta,
      tenantId,
      isGlobal,
      status,
    } = req.body;

    const pagesPrefix = req.app.get('pagesPrefix') || '/';
    const adminPath = req.app.get('adminPath') || '/admin';

    let collection = null;
    if (collectionId) {
      collection = await PageCollection.findById(collectionId).lean();
      if (!collection) {
        return res.status(400).json({ error: 'Collection not found' });
      }
    }

    const validatedSlug = pagesService.validatePageSlug(
      slug,
      collection?.slug,
      pagesPrefix,
      adminPath,
    );

    const blocksSchema = await pagesService.getBlocksSchema();
    pagesService.validateBlocks(blocks || [], blocksSchema);

    const existing = await Page.findOne({
      slug: validatedSlug,
      collectionId: collectionId || null,
      tenantId: tenantId || null,
    });

    if (existing) {
      return res.status(409).json({ error: 'Page with this slug already exists in this collection' });
    }

    const page = await Page.create({
      slug: validatedSlug,
      collectionId: collectionId || null,
      title: title || validatedSlug,
      templateKey: templateKey || 'default',
      layoutKey: layoutKey || 'default',
      blocks: blocks || [],
      repeat: repeat === undefined ? null : repeat,
      customCss: customCss || '',
      customJs: customJs || '',
      seoMeta: seoMeta || {},
      tenantId: tenantId || null,
      isGlobal: isGlobal !== false,
      status: status || 'draft',
    });

    await createAuditEvent({
      ...actor,
      action: 'page.create',
      entityType: 'Page',
      entityId: String(page._id),
      before: null,
      after: page.toObject(),
      meta: null,
    });

    res.status(201).json({ page: page.toObject() });
  } catch (err) {
    if (err.code === 'VALIDATION') {
      return res.status(400).json({ error: err.message });
    }
    console.error('[adminPages] createPage error:', err);
    res.status(500).json({ error: 'Failed to create page' });
  }
};

exports.updatePage = async (req, res) => {
  try {
    const actor = getBasicAuthActor(req);
    const { id } = req.params;
    const {
      slug,
      collectionId,
      title,
      templateKey,
      layoutKey,
      blocks,
      repeat,
      customCss,
      customJs,
      seoMeta,
      tenantId,
      isGlobal,
      status,
    } = req.body;

    const existing = await Page.findById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const before = existing.toObject();

    const pagesPrefix = req.app.get('pagesPrefix') || '/';
    const adminPath = req.app.get('adminPath') || '/admin';

    let collection = null;
    const newCollectionId = collectionId !== undefined ? collectionId : existing.collectionId;
    if (newCollectionId) {
      collection = await PageCollection.findById(newCollectionId).lean();
      if (!collection) {
        return res.status(400).json({ error: 'Collection not found' });
      }
    }

    if (slug !== undefined) {
      const validatedSlug = pagesService.validatePageSlug(
        slug,
        collection?.slug,
        pagesPrefix,
        adminPath,
      );
      const duplicate = await Page.findOne({
        _id: { $ne: id },
        slug: validatedSlug,
        collectionId: newCollectionId || null,
        tenantId: existing.tenantId,
      });
      if (duplicate) {
        return res.status(409).json({ error: 'Another page with this slug already exists in this collection' });
      }
      existing.slug = validatedSlug;
    }

    if (collectionId !== undefined) existing.collectionId = collectionId || null;
    if (title !== undefined) existing.title = title;
    if (templateKey !== undefined) existing.templateKey = templateKey;
    if (layoutKey !== undefined) existing.layoutKey = layoutKey;
    if (blocks !== undefined) {
      const blocksSchema = await pagesService.getBlocksSchema();
      pagesService.validateBlocks(blocks || [], blocksSchema);
      existing.blocks = blocks;
    }
    if (repeat !== undefined) existing.repeat = repeat;
    if (customCss !== undefined) existing.customCss = customCss;
    if (customJs !== undefined) existing.customJs = customJs;
    if (seoMeta !== undefined) existing.seoMeta = seoMeta;
    if (tenantId !== undefined) existing.tenantId = tenantId || null;
    if (isGlobal !== undefined) existing.isGlobal = isGlobal;
    if (status !== undefined) {
      if (status === 'published' && existing.status !== 'published') {
        existing.publishedAt = new Date();
      }
      existing.status = status;
    }

    await existing.save();

    await createAuditEvent({
      ...actor,
      action: 'page.update',
      entityType: 'Page',
      entityId: String(existing._id),
      before,
      after: existing.toObject(),
      meta: null,
    });

    res.json({ page: existing.toObject() });
  } catch (err) {
    if (err.code === 'VALIDATION') {
      return res.status(400).json({ error: err.message });
    }
    console.error('[adminPages] updatePage error:', err);
    res.status(500).json({ error: 'Failed to update page' });
  }
};

exports.deletePage = async (req, res) => {
  try {
    const actor = getBasicAuthActor(req);
    const { id } = req.params;

    const existing = await Page.findById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const before = existing.toObject();
    await Page.deleteOne({ _id: id });

    await createAuditEvent({
      ...actor,
      action: 'page.delete',
      entityType: 'Page',
      entityId: String(id),
      before,
      after: null,
      meta: null,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[adminPages] deletePage error:', err);
    res.status(500).json({ error: 'Failed to delete page' });
  }
};

exports.publishPage = async (req, res) => {
  try {
    const actor = getBasicAuthActor(req);
    const { id } = req.params;

    const existing = await Page.findById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const before = existing.toObject();
    existing.status = 'published';
    existing.publishedAt = new Date();
    await existing.save();

    await createAuditEvent({
      ...actor,
      action: 'page.publish',
      entityType: 'Page',
      entityId: String(existing._id),
      before,
      after: existing.toObject(),
      meta: null,
    });

    res.json({ page: existing.toObject() });
  } catch (err) {
    console.error('[adminPages] publishPage error:', err);
    res.status(500).json({ error: 'Failed to publish page' });
  }
};

exports.unpublishPage = async (req, res) => {
  try {
    const actor = getBasicAuthActor(req);
    const { id } = req.params;

    const existing = await Page.findById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const before = existing.toObject();
    existing.status = 'draft';
    await existing.save();

    await createAuditEvent({
      ...actor,
      action: 'page.unpublish',
      entityType: 'Page',
      entityId: String(existing._id),
      before,
      after: existing.toObject(),
      meta: null,
    });

    res.json({ page: existing.toObject() });
  } catch (err) {
    console.error('[adminPages] unpublishPage error:', err);
    res.status(500).json({ error: 'Failed to unpublish page' });
  }
};

exports.getAvailableTemplates = async (req, res) => {
  try {
    const base = [
      { key: 'default', name: 'Default Template', description: 'Basic page template' },
      { key: 'landing', name: 'Landing Page', description: 'Marketing landing page with hero and CTA sections' },
      { key: 'article', name: 'Article', description: 'Blog post or article layout' },
      { key: 'listing', name: 'Listing', description: 'Grid or list of items' },
    ];

    let dbFiles = [];
    try {
      dbFiles = await VirtualEjsFile.find({ path: /^pages\/templates\/[^/]+\.ejs$/ }).select('path updatedAt enabled').lean();
    } catch (_) {
      dbFiles = [];
    }

    const byKey = new Map(base.map((t) => [t.key, t]));
    for (const f of dbFiles) {
      const m = String(f.path || '').match(/^pages\/templates\/([^/]+)\.ejs$/);
      if (!m) continue;
      const key = String(m[1] || '').trim();
      if (!key) continue;
      if (byKey.has(key)) continue;
      byKey.set(key, { key, name: key, description: '' });
    }

    const templates = Array.from(byKey.values()).sort((a, b) => String(a.key).localeCompare(String(b.key)));
    res.json({ templates });
  } catch (err) {
    console.error('[adminPages] getAvailableTemplates error:', err);
    res.status(500).json({ error: 'Failed to get templates' });
  }
};

exports.getAvailableLayouts = async (req, res) => {
  try {
    const base = [
      { key: 'default', name: 'Default Layout', description: 'Standard layout with header and footer' },
      { key: 'minimal', name: 'Minimal', description: 'Clean layout without navigation' },
      { key: 'sidebar', name: 'Sidebar', description: 'Layout with sidebar navigation' },
    ];

    let dbFiles = [];
    try {
      dbFiles = await VirtualEjsFile.find({ path: /^pages\/layouts\/[^/]+\.ejs$/ }).select('path updatedAt enabled').lean();
    } catch (_) {
      dbFiles = [];
    }

    const byKey = new Map(base.map((l) => [l.key, l]));
    for (const f of dbFiles) {
      const m = String(f.path || '').match(/^pages\/layouts\/([^/]+)\.ejs$/);
      if (!m) continue;
      const key = String(m[1] || '').trim();
      if (!key) continue;
      if (byKey.has(key)) continue;
      byKey.set(key, { key, name: key, description: '' });
    }

    const layouts = Array.from(byKey.values()).sort((a, b) => String(a.key).localeCompare(String(b.key)));
    res.json({ layouts });
  } catch (err) {
    console.error('[adminPages] getAvailableLayouts error:', err);
    res.status(500).json({ error: 'Failed to get layouts' });
  }
};

exports.getAvailableBlocks = async (req, res) => {
  try {
    const schema = await pagesService.getBlocksSchema();
    const defs = schema?.blocks || {};
    const blocks = Object.keys(defs).map((type) => ({
      type,
      name: defs[type]?.label || type,
      description: defs[type]?.description || '',
    }));
    res.json({ blocks });
  } catch (err) {
    console.error('[adminPages] getAvailableBlocks error:', err);
    res.status(500).json({ error: 'Failed to get available blocks' });
  }
};

exports.getBlocksSchema = async (req, res) => {
  try {
    const schema = await pagesService.getBlocksSchema();
    res.json({ schema, alias: pagesService.BLOCKS_SCHEMA_JSON_CONFIG_ALIAS });
  } catch (err) {
    console.error('[adminPages] getBlocksSchema error:', err);
    res.status(500).json({ error: 'Failed to get blocks schema' });
  }
};

function toSafeJsonError(error) {
  const msg = error?.message || 'Operation failed';
  const code = error?.code;
  if (code === 'VALIDATION') return { status: 400, body: { error: msg } };
  if (code === 'NOT_FOUND') return { status: 404, body: { error: msg } };
  if (code === 'TIMEOUT') return { status: 408, body: { error: msg } };
  return { status: 500, body: { error: msg } };
}

exports.testPageContextPhase = async (req, res) => {
  try {
    const { id } = req.params;
    const page = await Page.findById(id).lean();
    if (!page) return res.status(404).json({ error: 'Page not found' });

    const routePath = req.body?.routePath || (page.collectionId ? '/_test' : '/_test');
    const params = req.body?.params || (page._params || {});
    const mockContext = req.body?.mockContext || null;

    const startedAt = Date.now();
    const { pageContext, contextBlocks } = await pagesContextService.resolvePageContext({
      page,
      req,
      res,
      routePath,
      params,
      mockContext,
    });

    res.json({
      ok: true,
      elapsedMs: Date.now() - startedAt,
      contextBlocksCount: contextBlocks.length,
      vars: pageContext.vars,
    });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.testPageContextBlock = async (req, res) => {
  try {
    const { id } = req.params;
    const page = await Page.findById(id).lean();
    if (!page) return res.status(404).json({ error: 'Page not found' });

    const block = req.body?.block;
    if (!block || typeof block !== 'object') {
      return res.status(400).json({ error: 'block is required' });
    }

    const type = String(block.type || '').trim();
    if (!type.startsWith('context.')) {
      return res.status(400).json({ error: 'Only context.* blocks can be tested with this endpoint' });
    }

    const routePath = req.body?.routePath || (page.collectionId ? '/_test' : '/_test');
    const params = req.body?.params || (page._params || {});
    const mockContext = req.body?.mockContext || null;

    const startedAt = Date.now();
    const synthetic = { ...page, blocks: [block] };
    const { pageContext, contextBlocks } = await pagesContextService.resolvePageContext({
      page: synthetic,
      req,
      res,
      routePath,
      params,
      mockContext,
    });

    res.json({
      ok: true,
      elapsedMs: Date.now() - startedAt,
      contextBlocksCount: contextBlocks.length,
      vars: pageContext.vars,
    });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};

exports.testContextBlockAdhoc = async (req, res) => {
  try {
    const block = req.body?.block;
    if (!block || typeof block !== 'object') {
      return res.status(400).json({ error: 'block is required' });
    }

    const type = String(block.type || '').trim();
    if (!type.startsWith('context.')) {
      return res.status(400).json({ error: 'Only context.* blocks can be tested with this endpoint' });
    }

    const mockContext = req.body?.mockContext || null;
    const routePath = req.body?.routePath || '/_test';
    const params = req.body?.params || {};

    const startedAt = Date.now();
    const syntheticPage = {
      slug: '_test',
      title: 'Test',
      templateKey: 'default',
      layoutKey: 'default',
      blocks: [block],
      repeat: null,
      seoMeta: {},
      customCss: '',
      customJs: '',
    };

    const { pageContext, contextBlocks } = await pagesContextService.resolvePageContext({
      page: syntheticPage,
      req,
      res,
      routePath,
      params,
      mockContext,
    });

    res.json({
      ok: true,
      elapsedMs: Date.now() - startedAt,
      contextBlocksCount: contextBlocks.length,
      vars: pageContext.vars,
    });
  } catch (err) {
    const safe = toSafeJsonError(err);
    res.status(safe.status).json(safe.body);
  }
};
