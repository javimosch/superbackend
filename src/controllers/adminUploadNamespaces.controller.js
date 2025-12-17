const GlobalSetting = require('../models/GlobalSetting');
const Asset = require('../models/Asset');
const uploadNamespacesService = require('../services/uploadNamespaces.service');
const globalSettingsService = require('../services/globalSettings.service');

const parseJson = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

exports.listNamespaces = async (req, res) => {
  try {
    const namespaces = await uploadNamespacesService.listNamespaces();
    res.json(namespaces);
  } catch (error) {
    console.error('Error listing upload namespaces:', error);
    res.status(500).json({ error: 'Failed to list upload namespaces' });
  }
};

exports.getNamespacesSummary = async (req, res) => {
  try {
    let namespaces = await uploadNamespacesService.listNamespaces();

    if (!namespaces.find((n) => n.key === 'default')) {
      namespaces = [await uploadNamespacesService.resolveNamespace('default'), ...namespaces];
    }

    const stats = await Asset.aggregate([
      { $match: { status: 'uploaded' } },
      {
        $group: {
          _id: { $ifNull: ['$namespace', 'default'] },
          totalFiles: { $sum: 1 },
          totalBytes: { $sum: '$sizeBytes' },
        },
      },
    ]);

    const statsByNamespace = new Map(stats.map((s) => [String(s._id), s]));

    const summary = namespaces
      .slice()
      .sort((a, b) => String(a.key).localeCompare(String(b.key)))
      .map((ns) => {
        const s = statsByNamespace.get(String(ns.key)) || { totalFiles: 0, totalBytes: 0 };
        return {
          key: ns.key,
          enabled: ns.enabled !== false,
          maxFileSizeBytes: ns.maxFileSizeBytes,
          allowedContentTypes: ns.allowedContentTypes,
          keyPrefix: ns.keyPrefix,
          defaultVisibility: ns.defaultVisibility,
          enforceVisibility: Boolean(ns.enforceVisibility),
          stats: {
            totalFiles: s.totalFiles || 0,
            totalBytes: s.totalBytes || 0,
          },
        };
      });

    res.json(summary);
  } catch (error) {
    console.error('Error getting upload namespaces summary:', error);
    res.status(500).json({ error: 'Failed to get upload namespaces summary' });
  }
};

exports.getNamespace = async (req, res) => {
  try {
    const key = String(req.params.key || '').trim();
    if (!key) {
      return res.status(400).json({ error: 'key is required' });
    }

    const setting = await GlobalSetting.findOne({
      key: uploadNamespacesService.getSettingKey(key),
      type: 'json',
    }).lean();

    if (!setting) {
      const resolved = await uploadNamespacesService.resolveNamespace(key);
      return res.json(resolved);
    }

    const raw = parseJson(setting.value);
    const normalized = uploadNamespacesService.normalizePayload(key, raw);
    const merged = await uploadNamespacesService.resolveNamespace(key);

    res.json({
      ...merged,
      ...normalized,
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt,
    });
  } catch (error) {
    console.error('Error getting upload namespace:', error);
    res.status(500).json({ error: 'Failed to get upload namespace' });
  }
};

exports.createNamespace = async (req, res) => {
  try {
    const key = req.body?.key ? String(req.body.key).trim() : '';
    if (!key) {
      return res.status(400).json({ error: 'key is required' });
    }

    const existing = await GlobalSetting.findOne({ key: uploadNamespacesService.getSettingKey(key) }).lean();
    if (existing) {
      return res.status(409).json({ error: `Upload namespace '${key}' already exists` });
    }

    const normalized = uploadNamespacesService.normalizePayload(key, req.body || {});

    const setting = await GlobalSetting.create({
      key: uploadNamespacesService.getSettingKey(key),
      type: 'json',
      public: false,
      description: `Upload namespace: ${key}`,
      value: JSON.stringify(normalized),
    });

    globalSettingsService.clearSettingsCache();

    const resolved = await uploadNamespacesService.resolveNamespace(key);
    res.status(201).json({
      ...resolved,
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt,
    });
  } catch (error) {
    console.error('Error creating upload namespace:', error);
    res.status(500).json({ error: 'Failed to create upload namespace' });
  }
};

exports.updateNamespace = async (req, res) => {
  try {
    const key = String(req.params.key || '').trim();
    if (!key) {
      return res.status(400).json({ error: 'key is required' });
    }

    const settingKey = uploadNamespacesService.getSettingKey(key);
    const existing = await GlobalSetting.findOne({ key: settingKey, type: 'json' });

    const current = existing ? parseJson(existing.value) : {};
    const mergedRaw = { ...current, ...req.body };
    const normalized = uploadNamespacesService.normalizePayload(key, mergedRaw);

    const setting = existing
      ? await GlobalSetting.findOneAndUpdate(
          { key: settingKey, type: 'json' },
          { $set: { value: JSON.stringify(normalized) } },
          { new: true }
        )
      : await GlobalSetting.create({
          key: settingKey,
          type: 'json',
          public: false,
          description: `Upload namespace: ${key}`,
          value: JSON.stringify(normalized),
        });

    globalSettingsService.clearSettingsCache();

    const resolved = await uploadNamespacesService.resolveNamespace(key);
    res.json({
      ...resolved,
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt,
    });
  } catch (error) {
    console.error('Error updating upload namespace:', error);
    res.status(500).json({ error: 'Failed to update upload namespace' });
  }
};

exports.deleteNamespace = async (req, res) => {
  try {
    const key = String(req.params.key || '').trim();
    if (!key) {
      return res.status(400).json({ error: 'key is required' });
    }

    const setting = await GlobalSetting.findOneAndDelete({
      key: uploadNamespacesService.getSettingKey(key),
      type: 'json',
    }).lean();

    if (!setting) {
      return res.status(404).json({ error: `Upload namespace '${key}' not found` });
    }

    globalSettingsService.clearSettingsCache();

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting upload namespace:', error);
    res.status(500).json({ error: 'Failed to delete upload namespace' });
  }
};
