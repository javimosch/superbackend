const migrationService = require('../services/migration.service');

exports.listEnvironments = async (req, res) => {
  try {
    const envs = await migrationService.listEnvironments();
    res.json({ environments: envs });
  } catch (e) {
    res.status(500).json({ error: e?.message ? String(e.message) : 'Failed to list environments' });
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

    const registry = globalThis?.saasbackend?.models || null;
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
