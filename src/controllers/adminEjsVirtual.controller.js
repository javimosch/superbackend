const fs = require('fs');
const path = require('path');

const VirtualEjsFile = require('../models/VirtualEjsFile');
const VirtualEjsFileVersion = require('../models/VirtualEjsFileVersion');
const VirtualEjsGroupChange = require('../models/VirtualEjsGroupChange');

const ejsVirtualService = require('../services/ejsVirtual.service');
const { getBasicAuthActor, createAuditEvent } = require('../services/audit.service');

function normalizeViewsRoot(req) {
  const viewsRoot = (req.app && req.app.get('views')) ? req.app.get('views') : path.join(process.cwd(), 'src', 'views');
  return String(viewsRoot);
}

async function listFilesRecursive(rootDir, relDir = '') {
  const abs = path.join(rootDir, relDir);
  const items = await fs.promises.readdir(abs, { withFileTypes: true });
  const results = [];

  for (const item of items) {
    const name = item.name;
    if (name.startsWith('.')) continue;
    if (name === 'node_modules') continue;

    const nextRel = path.join(relDir, name);
    const nextAbs = path.join(rootDir, nextRel);

    if (item.isDirectory()) {
      const nested = await listFilesRecursive(rootDir, nextRel);
      results.push(...nested);
      continue;
    }

    if (item.isFile() && name.endsWith('.ejs')) {
      results.push(nextRel.replace(/\\/g, '/'));
    }
  }

  return results;
}

exports.list = async (req, res) => {
  try {
    const viewsRoot = normalizeViewsRoot(req);
    const dbFiles = await VirtualEjsFile.find({}).select('path enabled inferred integrated updatedAt').lean();
    const dbByPath = new Map((dbFiles || []).map((f) => [f.path, f]));

    let fsFiles = [];
    try {
      fsFiles = await listFilesRecursive(viewsRoot);
    } catch (_) {
      fsFiles = [];
    }

    const allPaths = new Set([...(fsFiles || []), ...Array.from(dbByPath.keys())]);
    const items = Array.from(allPaths)
      .sort()
      .map((p) => {
        const db = dbByPath.get(p) || null;
        const isAdminView = p.startsWith('admin/');
        const integratedFlag = isAdminView ? Boolean(db && db.integrated) : true;
        return {
          path: p,
          existsOnFs: fsFiles.includes(p),
          hasOverride: Boolean(db && typeof db.enabled === 'boolean'),
          enabled: db ? Boolean(db.enabled) : false,
          inferred: db ? Boolean(db.inferred) : fsFiles.includes(p),
          integrated: integratedFlag,
          updatedAt: db ? db.updatedAt : null,
        };
      });

    res.json({ viewsRoot, items });
  } catch (err) {
    console.error('[adminEjsVirtual] list error', err);
    res.status(500).json({ error: 'Failed to list EJS files' });
  }
};

exports.getFile = async (req, res) => {
  try {
    const viewsRoot = normalizeViewsRoot(req);
    const relPath = ejsVirtualService.normalizeRelPath(String(req.query.path || '').trim());

    let fsContent = '';
    try {
      fsContent = await ejsVirtualService.readFsView(viewsRoot, relPath);
    } catch (_) {
      fsContent = '';
    }

    const override = await VirtualEjsFile.findOne({ path: relPath }).lean();

    let effective;
    try {
      effective = await ejsVirtualService.resolveTemplateSource({ viewsRoot, relPath, allowDb: true });
    } catch (_) {
      effective = { source: override ? 'db' : 'none', content: override?.content || '' };
    }

    res.json({
      path: relPath,
      fs: { content: fsContent },
      db: override ? { enabled: Boolean(override.enabled), content: override.content || '', updatedAt: override.updatedAt } : null,
      effective: { source: effective.source, content: effective.content },
    });
  } catch (err) {
    const code = err.code;
    if (code === 'VALIDATION') return res.status(400).json({ error: err.message });
    console.error('[adminEjsVirtual] getFile error', err);
    res.status(500).json({ error: 'Failed to load file' });
  }
};

exports.saveFile = async (req, res) => {
  try {
    const actor = getBasicAuthActor(req);
    const viewsRoot = normalizeViewsRoot(req);
    const relPath = ejsVirtualService.normalizeRelPath(String(req.query.path || '').trim());

    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    const enabled = req.body?.enabled !== undefined ? Boolean(req.body.enabled) : true;
    const description = String(req.body?.description || '').trim();

    const existing = await VirtualEjsFile.findOne({ path: relPath });
    const before = existing ? existing.toObject() : null;

    const next = await VirtualEjsFile.findOneAndUpdate(
      { path: relPath },
      {
        $set: {
          path: relPath,
          enabled,
          content,
          source: 'manual',
          inferred: true,
          lastSeenAt: new Date(),
        },
        $setOnInsert: {
          integrated: false,
          renderCount: 0,
          lastRenderedAt: null,
        },
      },
      { upsert: true, new: true },
    );

    const groupCount = await VirtualEjsGroupChange.countDocuments({});
    const group = await VirtualEjsGroupChange.create({
      title: `Grouped changes ${groupCount + 1}`,
      summary: description || 'Manual edit',
      filePaths: [relPath],
      versionIds: [],
      createdBy: actor.actorId || null,
    });

    const version = await VirtualEjsFileVersion.create({
      fileId: next._id,
      path: relPath,
      content,
      source: 'manual',
      description: description || 'Manual edit',
      groupId: group._id,
    });

    await VirtualEjsGroupChange.updateOne({ _id: group._id }, { $set: { versionIds: [version._id] } });

    await createAuditEvent({
      ...actor,
      action: 'ejsVirtual.file.save',
      entityType: 'VirtualEjsFile',
      entityId: relPath,
      before,
      after: next.toObject(),
      meta: { groupId: String(group._id) },
    });

    ejsVirtualService.invalidateCacheForPath(relPath);

    res.json({
      file: next.toObject(),
      version: version.toObject(),
      group: group.toObject(),
    });
  } catch (err) {
    const code = err.code;
    if (code === 'VALIDATION') return res.status(400).json({ error: err.message });
    console.error('[adminEjsVirtual] saveFile error', err);
    res.status(500).json({ error: 'Failed to save file' });
  }
};

exports.revertToDefault = async (req, res) => {
  try {
    const actor = getBasicAuthActor(req);
    const relPath = ejsVirtualService.normalizeRelPath(String(req.query.path || '').trim());

    const existing = await VirtualEjsFile.findOne({ path: relPath });
    if (!existing) {
      return res.json({ success: true, message: 'No override existed' });
    }

    const before = existing.toObject();

    await VirtualEjsFile.deleteOne({ path: relPath });

    await createAuditEvent({
      ...actor,
      action: 'ejsVirtual.file.revert_to_default',
      entityType: 'VirtualEjsFile',
      entityId: relPath,
      before,
      after: null,
      meta: null,
    });

    ejsVirtualService.invalidateCacheForPath(relPath);

    res.json({ success: true });
  } catch (err) {
    const code = err.code;
    if (code === 'VALIDATION') return res.status(400).json({ error: err.message });
    console.error('[adminEjsVirtual] revertToDefault error', err);
    res.status(500).json({ error: 'Failed to revert to default' });
  }
};

exports.listHistory = async (req, res) => {
  try {
    const relPath = ejsVirtualService.normalizeRelPath(String(req.query.path || '').trim());
    const versions = await VirtualEjsFileVersion.find({ path: relPath })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ path: relPath, versions });
  } catch (err) {
    const code = err.code;
    if (code === 'VALIDATION') return res.status(400).json({ error: err.message });
    console.error('[adminEjsVirtual] listHistory error', err);
    res.status(500).json({ error: 'Failed to load history' });
  }
};

exports.rollback = async (req, res) => {
  try {
    const actor = getBasicAuthActor(req);
    const versionId = String(req.body?.versionId || '').trim();
    if (!versionId) return res.status(400).json({ error: 'versionId is required' });

    const version = await VirtualEjsFileVersion.findById(versionId).lean();
    if (!version) return res.status(404).json({ error: 'Version not found' });

    const relPath = ejsVirtualService.normalizeRelPath(version.path);

    const existing = await VirtualEjsFile.findOne({ path: relPath });
    const before = existing ? existing.toObject() : null;

    const next = await VirtualEjsFile.findOneAndUpdate(
      { path: relPath },
      {
        $set: {
          path: relPath,
          enabled: true,
          content: version.content,
          source: 'rollback',
          inferred: true,
          lastSeenAt: new Date(),
        },
        $setOnInsert: {
          integrated: false,
          renderCount: 0,
          lastRenderedAt: null,
        },
      },
      { upsert: true, new: true },
    );

    const groupCount = await VirtualEjsGroupChange.countDocuments({});
    const group = await VirtualEjsGroupChange.create({
      title: `Grouped changes ${groupCount + 1}`,
      summary: `Rollback to ${versionId}`,
      filePaths: [relPath],
      versionIds: [],
      createdBy: actor.actorId || null,
    });

    const newVersion = await VirtualEjsFileVersion.create({
      fileId: next._id,
      path: relPath,
      content: version.content,
      source: 'rollback',
      description: `Rollback to ${versionId}`,
      groupId: group._id,
    });

    await VirtualEjsGroupChange.updateOne({ _id: group._id }, { $set: { versionIds: [newVersion._id] } });

    await createAuditEvent({
      ...actor,
      action: 'ejsVirtual.file.rollback',
      entityType: 'VirtualEjsFile',
      entityId: relPath,
      before,
      after: next.toObject(),
      meta: { versionId },
    });

    ejsVirtualService.invalidateCacheForPath(relPath);

    res.json({ file: next.toObject(), version: newVersion.toObject(), group: group.toObject() });
  } catch (err) {
    console.error('[adminEjsVirtual] rollback error', err);
    res.status(500).json({ error: 'Failed to rollback' });
  }
};

exports.vibe = async (req, res) => {
  try {
    const actor = getBasicAuthActor(req);
    const viewsRoot = normalizeViewsRoot(req);

    const { prompt, paths, providerKey, model } = req.body || {};

    const result = await ejsVirtualService.vibeEdit({
      prompt,
      paths,
      providerKey,
      model,
      viewsRoot,
      actor,
    });

    res.json(result);
  } catch (err) {
    const code = err.code;
    if (code === 'VALIDATION') return res.status(400).json({ error: err.message });
    if (code === 'AI_INVALID') return res.status(500).json({ error: err.message });
    console.error('[adminEjsVirtual] vibe error', err);
    res.status(500).json({ error: 'Failed to run vibe edit', details: err.message });
  }
};

exports.clearCache = async (req, res) => {
  try {
    const actor = getBasicAuthActor(req);
    ejsVirtualService.clearCache();

    await createAuditEvent({
      ...actor,
      action: 'ejsVirtual.cache.clear',
      entityType: 'ejsVirtual',
      entityId: null,
      before: null,
      after: { cleared: true },
      meta: null,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[adminEjsVirtual] clearCache error', err);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
};
