const migrationService = require('../services/migration.service');

function getModelRegistry() {
  return globalThis?.saasbackend?.models || null;
}

function getModelByName(modelName) {
  const registry = getModelRegistry();
  if (!registry) return null;
  return registry[String(modelName || '')] || null;
}

function describeSchema(model) {
  const schemaPaths = model?.schema?.paths || {};
  const fields = [];

  for (const [key, pathDef] of Object.entries(schemaPaths)) {
    if (key === '__v') continue;
    const instance = pathDef?.instance || null;
    const enumValues = Array.isArray(pathDef?.enumValues) && pathDef.enumValues.length > 0
      ? pathDef.enumValues
      : (Array.isArray(pathDef?.options?.enum) && pathDef.options.enum.length > 0 ? pathDef.options.enum : null);
    const isRequired = Array.isArray(pathDef?.validators)
      ? pathDef.validators.some((v) => v && v.type === 'required')
      : false;

    fields.push({
      key,
      type: instance,
      required: isRequired,
      enumValues,
    });
  }

  fields.sort((a, b) => a.key.localeCompare(b.key));
  return {
    modelName: model?.modelName,
    fields,
  };
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

exports.listEnvironments = async (req, res) => {
  try {
    const envs = await migrationService.listEnvironments();
    res.json({ environments: envs });
  } catch (e) {
    res.status(500).json({ error: e?.message ? String(e.message) : 'Failed to list environments' });
  }
};

exports.listModels = async (req, res) => {
  try {
    const registry = getModelRegistry();
    if (!registry) {
      return res.status(500).json({ error: 'saasbackend models registry is not available' });
    }
    const models = Object.keys(registry).sort();
    res.json({ models });
  } catch (e) {
    res.status(500).json({ error: e?.message ? String(e.message) : 'Failed to list models' });
  }
};

exports.getModelSchema = async (req, res) => {
  try {
    const modelName = String(req.params.modelName || '').trim();
    if (!modelName) return res.status(400).json({ error: 'modelName is required' });
    const model = getModelByName(modelName);
    if (!model) return res.status(404).json({ error: `Unknown model '${modelName}'` });
    res.json({ schema: describeSchema(model) });
  } catch (e) {
    res.status(500).json({ error: e?.message ? String(e.message) : 'Failed to load schema' });
  }
};

exports.preview = async (req, res) => {
  try {
    const { modelName, query, page, limit, sort, search } = req.body || {};
    const safeModelName = String(modelName || '').trim();
    if (!safeModelName) return res.status(400).json({ error: 'modelName is required' });

    const model = getModelByName(safeModelName);
    if (!model) {
      const registry = getModelRegistry();
      return res.status(400).json({
        error: `Unknown model '${safeModelName}'`,
        availableModels: registry ? Object.keys(registry).sort() : [],
      });
    }

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (safePage - 1) * safeLimit;

    const filter = query && typeof query === 'object' ? query : {};
    const trimmedSearch = String(search || '').trim();

    if (trimmedSearch) {
      const schemaInfo = describeSchema(model);
      const stringFields = schemaInfo.fields
        .filter((f) => f && (String(f.type || '').toLowerCase() === 'string'))
        .map((f) => f.key)
        .slice(0, 6);
      if (stringFields.length) {
        filter.$or = stringFields.map((k) => ({ [k]: { $regex: trimmedSearch, $options: 'i' } }));
      }
    }

    const sortObj = (() => {
      if (!sort) return { createdAt: -1 };
      if (typeof sort === 'object') return sort;
      const parsed = safeJsonParse(String(sort), null);
      return parsed && typeof parsed === 'object' ? parsed : { createdAt: -1 };
    })();

    const [items, total] = await Promise.all([
      model.find(filter).sort(sortObj).skip(skip).limit(safeLimit).lean(),
      model.countDocuments(filter),
    ]);

    res.json({
      ok: true,
      modelName: safeModelName,
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit) || 1,
      items,
    });
  } catch (e) {
    res.status(500).json({ error: e?.message ? String(e.message) : 'Preview failed' });
  }
};

exports.upsertEnvironment = async (req, res) => {
  try {
    const { envKey, name, connectionString, description } = req.body || {};
    const saved = await migrationService.upsertEnvironment(envKey, { name, connectionString, description });
    res.json({ environment: saved });
  } catch (e) {
    res.status(e.status || 500).json({ error: e?.message ? String(e.message) : 'Failed to save environment' });
  }
};

exports.deleteEnvironment = async (req, res) => {
  try {
    const { envKey } = req.params;
    const result = await migrationService.deleteEnvironment(envKey);
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e?.message ? String(e.message) : 'Failed to delete environment' });
  }
};

exports.testConnection = async (req, res) => {
  try {
    const { envKey } = req.body || {};
    if (!envKey) return res.status(400).json({ error: 'envKey is required' });
    const result = await migrationService.testConnection(envKey);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e?.message ? String(e.message) : 'Connection test failed' });
  }
};

exports.runMigration = async (req, res) => {
  try {
    const { envKey, modelName, query, dryRun } = req.body || {};
    if (!envKey) return res.status(400).json({ error: 'envKey is required' });
    if (!modelName) return res.status(400).json({ error: 'modelName is required' });

    const registry = getModelRegistry();
    if (!registry) {
      return res.status(500).json({ error: 'saasbackend models registry is not available' });
    }

    const sourceModel = registry[modelName] || null;

    if (!sourceModel) {
      return res.status(400).json({
        error: `Unknown model '${modelName}'`,
        availableModels: Object.keys(registry).sort(),
      });
    }

    const result = await migrationService.migrateModel({
      sourceModel,
      targetEnvKey: envKey,
      modelName,
      query,
      dryRun: !!dryRun,
    });

    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e?.message ? String(e.message) : 'Migration failed' });
  }
};
