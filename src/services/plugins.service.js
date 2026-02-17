const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const JsonConfig = require('../models/JsonConfig');
const { parseJsonOrThrow, clearJsonConfigCache } = require('./jsonConfigs.service');
const registryService = require('./registry.service');

const PLUGINS_STATE_KEY = 'open-registry-plugins-state';
const DEFAULT_REGISTRY_ID = 'plugins';

const exposedServices = {};
const exposedHelpers = {};

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function resolvePluginsRoot(customRoot) {
  return customRoot || path.join(process.cwd(), 'plugins');
}

function normalizePlugin(rawModule, pluginId, absoluteDir) {
  const candidate = rawModule && typeof rawModule === 'object' ? rawModule : {};
  const hooks = candidate.hooks && typeof candidate.hooks === 'object' ? candidate.hooks : {};
  const topLevelBootstrap = typeof candidate.bootstrap === 'function' ? candidate.bootstrap : null;
  const topLevelInstall = typeof candidate.install === 'function' ? candidate.install : null;

  const meta = candidate.meta && typeof candidate.meta === 'object' ? candidate.meta : {};

  return {
    id: String(meta.id || candidate.id || pluginId || '').trim(),
    name: String(meta.name || candidate.name || pluginId || '').trim(),
    version: String(meta.version || candidate.version || '1.0.0').trim(),
    description: String(meta.description || candidate.description || '').trim(),
    tags: Array.isArray(meta.tags || candidate.tags)
      ? (meta.tags || candidate.tags).map((tag) => String(tag).trim()).filter(Boolean)
      : [],
    bootstrap: typeof hooks.bootstrap === 'function' ? hooks.bootstrap : topLevelBootstrap,
    install: typeof hooks.install === 'function' ? hooks.install : topLevelInstall,
    services: candidate.services && typeof candidate.services === 'object' ? candidate.services : {},
    helpers: candidate.helpers && typeof candidate.helpers === 'object' ? candidate.helpers : {},
    path: absoluteDir,
  };
}

function pluginToRegistryItem(plugin) {
  return {
    id: plugin.id,
    name: plugin.name,
    category: 'plugins',
    version: 1,
    versions: [1],
    description: plugin.description,
    public: true,
    tags: plugin.tags,
    metadata: {
      source: 'local-folder',
      plugin_version: plugin.version,
      local_path: plugin.path,
      hooks: {
        bootstrap: typeof plugin.bootstrap === 'function',
        install: typeof plugin.install === 'function',
      },
    },
  };
}

async function ensurePluginStateDoc() {
  const existing = await JsonConfig.findOne({
    $or: [{ slug: PLUGINS_STATE_KEY }, { alias: PLUGINS_STATE_KEY }],
  });
  if (existing) return existing;

  const payload = {
    version: 1,
    plugins: {},
  };

  const doc = await JsonConfig.create({
    title: 'Open Registry Plugins State',
    slug: PLUGINS_STATE_KEY,
    alias: PLUGINS_STATE_KEY,
    publicEnabled: false,
    cacheTtlSeconds: 0,
    jsonRaw: JSON.stringify(payload, null, 2),
    jsonHash: sha256(JSON.stringify(payload)),
  });

  clearJsonConfigCache(PLUGINS_STATE_KEY);
  return doc;
}

async function getPluginState() {
  const doc = await ensurePluginStateDoc();
  const data = parseJsonOrThrow(String(doc.jsonRaw || '{}'));
  if (!data.plugins || typeof data.plugins !== 'object') {
    data.plugins = {};
  }
  return { doc, data };
}

async function savePluginState(doc, data) {
  doc.jsonRaw = JSON.stringify(data, null, 2);
  doc.jsonHash = sha256(doc.jsonRaw);
  await doc.save();
  clearJsonConfigCache(PLUGINS_STATE_KEY);
}

function clearPluginRequireCache(pluginDir) {
  const entryPath = path.join(pluginDir, 'index.js');
  const resolved = require.resolve(entryPath);
  delete require.cache[resolved];
}

function readPluginModule(pluginDir) {
  const entryPath = path.join(pluginDir, 'index.js');
  if (!fs.existsSync(entryPath)) return null;

  try {
    clearPluginRequireCache(pluginDir);
    return require(entryPath);
  } catch (error) {
    console.error(`[plugins] Failed loading plugin from ${entryPath}:`, error);
    return null;
  }
}

async function discoverPlugins({ pluginsRoot } = {}) {
  const root = resolvePluginsRoot(pluginsRoot);
  if (!fs.existsSync(root)) return [];

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const plugins = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pluginId = entry.name;
    const absoluteDir = path.join(root, pluginId);
    const loaded = readPluginModule(absoluteDir);
    if (!loaded) continue;

    const plugin = normalizePlugin(loaded, pluginId, absoluteDir);
    if (!plugin.id) continue;
    plugins.push(plugin);
  }

  plugins.sort((a, b) => a.id.localeCompare(b.id));
  return plugins;
}

async function ensurePluginsRegistry() {
  return registryService.ensureRegistry({
    id: DEFAULT_REGISTRY_ID,
    name: 'Plugins Registry',
    description: 'Auto-generated registry for local runtime plugins loaded from cwd/plugins',
    public: true,
    categories: ['plugins'],
    version: '1.0.0',
  });
}

async function syncRegistryItemsFromPlugins(plugins) {
  await ensurePluginsRegistry();

  for (const plugin of plugins) {
    await registryService.upsertItem(DEFAULT_REGISTRY_ID, pluginToRegistryItem(plugin));
  }
}

function applyExposedContracts(plugin) {
  if (plugin.services && typeof plugin.services === 'object') {
    Object.assign(exposedServices, plugin.services);
  }
  if (plugin.helpers && typeof plugin.helpers === 'object') {
    Object.assign(exposedHelpers, plugin.helpers);
  }
}

function createPluginContext(plugin, externalContext = {}) {
  return {
    plugin,
    services: externalContext.services || {},
    helpers: externalContext.helpers || {},
    logger: console,
    cwd: process.cwd(),
  };
}

async function runHook(plugin, hookName, externalContext = {}) {
  const hook = plugin[hookName];
  if (typeof hook !== 'function') return { ok: true, skipped: true };

  try {
    const context = createPluginContext(plugin, externalContext);
    await Promise.resolve(hook(context));
    return { ok: true };
  } catch (error) {
    console.error(`[plugins] ${hookName} hook failed for plugin ${plugin.id}:`, error);
    return { ok: false, error: error.message || 'hook execution failed' };
  }
}

async function bootstrap({ pluginsRoot, context } = {}) {
  const discovered = await discoverPlugins({ pluginsRoot });
  await ensurePluginsRegistry();
  await syncRegistryItemsFromPlugins(discovered);

  const { doc, data } = await getPluginState();

  for (const plugin of discovered) {
    if (!data.plugins[plugin.id]) {
      data.plugins[plugin.id] = {
        enabled: false,
        installedAt: null,
        updatedAt: nowIso(),
      };
    }
  }

  await savePluginState(doc, data);

  const results = [];
  for (const plugin of discovered) {
    const state = data.plugins[plugin.id];
    if (!state || state.enabled !== true) continue;

    applyExposedContracts(plugin);
    const hookResult = await runHook(plugin, 'bootstrap', context || {});
    results.push({ pluginId: plugin.id, hook: 'bootstrap', ...hookResult });
  }

  return {
    plugins: discovered,
    bootstrapResults: results,
  };
}

async function listPlugins({ pluginsRoot } = {}) {
  const discovered = await discoverPlugins({ pluginsRoot });
  await ensurePluginsRegistry();
  await syncRegistryItemsFromPlugins(discovered);

  const { data } = await getPluginState();

  return discovered.map((plugin) => {
    const state = data.plugins?.[plugin.id] || { enabled: false, installedAt: null };
    return {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      tags: plugin.tags,
      path: plugin.path,
      hooks: {
        bootstrap: typeof plugin.bootstrap === 'function',
        install: typeof plugin.install === 'function',
      },
      enabled: state.enabled === true,
      installedAt: state.installedAt || null,
      updatedAt: state.updatedAt || null,
    };
  });
}

async function enablePlugin(pluginId, { pluginsRoot, context } = {}) {
  const plugins = await discoverPlugins({ pluginsRoot });
  const plugin = plugins.find((item) => item.id === pluginId);
  if (!plugin) {
    const err = new Error('plugin not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const { doc, data } = await getPluginState();
  data.plugins[plugin.id] = data.plugins[plugin.id] || { enabled: false, installedAt: null };

  const installResult = await runHook(plugin, 'install', context || {});
  const bootstrapResult = await runHook(plugin, 'bootstrap', context || {});
  applyExposedContracts(plugin);

  data.plugins[plugin.id].enabled = true;
  data.plugins[plugin.id].installedAt = nowIso();
  data.plugins[plugin.id].updatedAt = nowIso();
  await savePluginState(doc, data);

  return {
    pluginId: plugin.id,
    enabled: true,
    install: installResult,
    bootstrap: bootstrapResult,
  };
}

async function disablePlugin(pluginId) {
  const { doc, data } = await getPluginState();
  if (!data.plugins[pluginId]) {
    const err = new Error('plugin not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  data.plugins[pluginId].enabled = false;
  data.plugins[pluginId].updatedAt = nowIso();
  await savePluginState(doc, data);

  return { pluginId, enabled: false };
}

async function installPlugin(pluginId, { pluginsRoot, context } = {}) {
  const plugins = await discoverPlugins({ pluginsRoot });
  const plugin = plugins.find((item) => item.id === pluginId);
  if (!plugin) {
    const err = new Error('plugin not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const installResult = await runHook(plugin, 'install', context || {});
  applyExposedContracts(plugin);
  return { pluginId: plugin.id, install: installResult };
}

function getExposedServices() {
  return exposedServices;
}

function getExposedHelpers() {
  return exposedHelpers;
}

module.exports = {
  PLUGINS_STATE_KEY,
  DEFAULT_REGISTRY_ID,
  ensurePluginsRegistry,
  discoverPlugins,
  bootstrap,
  listPlugins,
  enablePlugin,
  disablePlugin,
  installPlugin,
  getExposedServices,
  getExposedHelpers,
};
