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

const additionalPluginsRoots = new Set();

/** In-memory bootstrap status per plugin id */
const bootstrapStatusMap = new Map();

let enabledPluginsAssets = {
  routes: [],
  views: {},
  staticPaths: [],
  adminNavItems: [],
};

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function resolvePluginsRoot(customRoot) {
  return customRoot || path.join(process.cwd(), 'plugins');
}

function listPluginsRoots({ pluginsRoot } = {}) {
  const roots = [];
  const primary = resolvePluginsRoot(pluginsRoot);
  if (primary) roots.push(primary);
  for (const extra of additionalPluginsRoots) {
    if (extra && typeof extra === 'string') roots.push(extra);
  }
  // de-dup while preserving order
  return Array.from(new Set(roots));
}

function registerPluginsRoot(absolutePath) {
  const root = String(absolutePath || '').trim();
  if (!root) return { ok: false, reason: 'empty_path' };
  additionalPluginsRoots.add(root);
  return { ok: true, root };
}

function normalizePlugin(rawModule, pluginId, absoluteDir) {
  const candidate = rawModule && typeof rawModule === 'object' ? rawModule : {};
  const hooks = candidate.hooks && typeof candidate.hooks === 'object' ? candidate.hooks : {};
  const topLevelBootstrap = typeof candidate.bootstrap === 'function' ? candidate.bootstrap : null;
  const topLevelInstall = typeof candidate.install === 'function' ? candidate.install : null;

  const meta = candidate.meta && typeof candidate.meta === 'object' ? candidate.meta : {};

  const aliases = Array.isArray(meta.aliases || candidate.aliases)
    ? (meta.aliases || candidate.aliases).map((a) => String(a).trim()).filter(Boolean)
    : [];

  const routePrefix = String(meta.routePrefix || candidate.routePrefix || `/${pluginId}`).trim();

  // adminNavItems: array of {label, href, icon?} contributed to admin sidebar
  const rawNav = Array.isArray(candidate.adminNavItems) ? candidate.adminNavItems : [];
  const adminNavItems = rawNav
    .filter((n) => n && typeof n === 'object' && n.label && n.href)
    .map((n) => ({
      label: String(n.label).trim(),
      href: String(n.href).trim(),
      icon: n.icon ? String(n.icon).trim() : null,
      pluginId: String(meta.id || candidate.id || pluginId || '').trim(),
    }));

  // pageBlocks: array of block definitions a plugin contributes to the page builder
  const rawPageBlocks = Array.isArray(candidate.pageBlocks) ? candidate.pageBlocks : [];
  const pageBlocks = rawPageBlocks.filter(
    (b) => b && typeof b === 'object' && b.code && b.label,
  );

  // uiComponents: array of component data a plugin contributes declaratively
  const rawUiComponents = Array.isArray(candidate.uiComponents) ? candidate.uiComponents : [];
  const uiComponents = rawUiComponents.filter(
    (c) => c && typeof c === 'object' && c.code && c.name,
  );

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
    routes: candidate.routes || null,
    views: candidate.views && typeof candidate.views === 'object' ? candidate.views : {},
    staticPath: candidate.staticPath ? path.resolve(absoluteDir, candidate.staticPath) : null,
    aliases,
    routePrefix,
    adminNavItems,
    pageBlocks,
    uiComponents,
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
  if (fs.existsSync(entryPath)) {
    try {
      clearPluginRequireCache(pluginDir);
      return require(entryPath);
    } catch (error) {
      console.error(`[plugins] Failed loading plugin from ${entryPath}:`, error);
      return null;
    }
  }

  // Fallback: plugin.json manifest for metadata-only plugins
  const manifestPath = path.join(pluginDir, 'plugin.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const raw = fs.readFileSync(manifestPath, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed;
    } catch (error) {
      console.error(`[plugins] Failed loading plugin.json from ${manifestPath}:`, error);
      return null;
    }
  }

  return null;
}

async function discoverPlugins({ pluginsRoot } = {}) {
  const roots = listPluginsRoots({ pluginsRoot });
  const pluginById = new Map();

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const entries = fs.readdirSync(root, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pluginId = entry.name;
      const absoluteDir = path.join(root, pluginId);
      const loaded = readPluginModule(absoluteDir);
      if (!loaded) continue;

      const plugin = normalizePlugin(loaded, pluginId, absoluteDir);
      if (!plugin.id) continue;

      // First discovered wins (stable and avoids unexpected overrides)
      if (!pluginById.has(plugin.id)) {
        pluginById.set(plugin.id, plugin);
      }
    }
  }

  const plugins = Array.from(pluginById.values());
  plugins.sort((a, b) => a.id.localeCompare(b.id));
  return plugins;
}

async function loadAllPluginsFromFolder(absolutePath, { context } = {}) {
  registerPluginsRoot(absolutePath);
  return bootstrap({ context });
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
  const viewsBase = plugin.path;
  return {
    plugin,
    services: externalContext.services || {},
    helpers: externalContext.helpers || {},
    logger: console,
    cwd: process.cwd(),
    app: externalContext.app || null,
    router: externalContext.router || null,
    routerPrefix: plugin.routePrefix,
    viewsBase,
    resolvePluginView(viewName) {
      const viewPath = plugin.views[viewName];
      if (!viewPath) return null;
      if (path.isAbsolute(viewPath)) return viewPath;
      return path.resolve(viewsBase, viewPath);
    },
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

    // Track bootstrap status per plugin
    bootstrapStatusMap.set(plugin.id, {
      ok: hookResult.ok,
      error: hookResult.error || null,
      skipped: hookResult.skipped || false,
      timestamp: new Date().toISOString(),
    });
  }

  await collectEnabledPluginsAssets({ pluginsRoot, context });

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

  // Auto-register declarative uiComponents (C3)
  if (plugin.uiComponents && plugin.uiComponents.length > 0) {
    try {
      const uiComponentsService = require('./uiComponents.service');
      for (const comp of plugin.uiComponents) {
        await uiComponentsService.upsertComponent(comp);
      }
      console.log(`[plugins] Auto-registered ${plugin.uiComponents.length} UI component(s) from plugin ${plugin.id}`);
    } catch (uiErr) {
      console.error(`[plugins] Failed to auto-register UI components for plugin ${plugin.id}:`, uiErr);
    }
  }

  const installResult = await runHook(plugin, 'install', context || {});
  const bootstrapResult = await runHook(plugin, 'bootstrap', context || {});
  applyExposedContracts(plugin);

  data.plugins[plugin.id].enabled = true;
  data.plugins[plugin.id].installedAt = nowIso();
  data.plugins[plugin.id].updatedAt = nowIso();
  await savePluginState(doc, data);

  await collectEnabledPluginsAssets({ pluginsRoot, context });

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

function collectPluginAssets() {
  return enabledPluginsAssets;
}

function getBootstrapStatus(pluginId) {
  if (pluginId) return bootstrapStatusMap.get(pluginId) || null;
  const all = {};
  for (const [id, status] of bootstrapStatusMap) {
    all[id] = status;
  }
  return all;
}

function getAdminNavItems() {
  return enabledPluginsAssets.adminNavItems || [];
}

function getPluginPageBlocks() {
  return enabledPluginsAssets.pageBlocks || [];
}

async function collectEnabledPluginsAssets({ pluginsRoot, context } = {}) {
  const discovered = await discoverPlugins({ pluginsRoot });
  const { data } = await getPluginState();
  
  const assets = {
    routes: [],
    views: {},
    staticPaths: [],
    adminNavItems: [],
    pageBlocks: [],
    uiComponents: [],
  };

  for (const plugin of discovered) {
    const state = data.plugins?.[plugin.id];
    if (!state || state.enabled !== true) continue;

    if (plugin.routes) {
      assets.routes.push({
        prefix: plugin.routePrefix,
        router: plugin.routes,
        aliases: plugin.aliases,
        pluginId: plugin.id
      });
    }

    for (const [viewName, viewPath] of Object.entries(plugin.views)) {
      const resolvedPath = path.isAbsolute(viewPath) 
        ? viewPath 
        : path.resolve(plugin.path, viewPath);
      assets.views[viewName] = resolvedPath;
    }

    if (plugin.staticPath && fs.existsSync(plugin.staticPath)) {
      assets.staticPaths.push({
        prefix: plugin.routePrefix,
        path: plugin.staticPath,
        pluginId: plugin.id
      });
    }

    if (plugin.adminNavItems && plugin.adminNavItems.length > 0) {
      assets.adminNavItems.push(...plugin.adminNavItems);
    }

    if (plugin.pageBlocks && plugin.pageBlocks.length > 0) {
      assets.pageBlocks.push(...plugin.pageBlocks.map((b) => ({ ...b, pluginId: plugin.id })));
    }

    if (plugin.uiComponents && plugin.uiComponents.length > 0) {
      assets.uiComponents.push(...plugin.uiComponents.map((c) => ({ ...c, pluginId: plugin.id })));
    }
  }

  enabledPluginsAssets = assets;
  return assets;
}

function discoverPluginFromPath(absolutePath) {
  const pluginDir = path.resolve(absolutePath);
  const indexPath = path.join(pluginDir, 'index.js');
  
  if (!fs.existsSync(pluginDir) || !fs.existsSync(indexPath)) {
    return null;
  }
  
  const rawModule = readPluginModule(pluginDir);
  if (!rawModule) return null;
  
  const pluginId = rawModule.meta?.id || path.basename(pluginDir);
  const plugin = normalizePlugin(rawModule, pluginId, pluginDir);
  
  if (!plugin.id) return null;
  
  return plugin;
}

async function enablePluginFromPath(absolutePath, { context, skipAssetsCollection } = {}) {
  const pluginDir = path.resolve(absolutePath);
  const plugin = discoverPluginFromPath(pluginDir);
  
  if (!plugin) {
    throw Object.assign(new Error('Plugin not found at path or invalid plugin'), { code: 'NOT_FOUND' });
  }
  
  registerPluginsRoot(path.dirname(pluginDir));
  
  const { doc, data } = await getPluginState();
  data.plugins[plugin.id] = data.plugins[plugin.id] || { enabled: false, installedAt: null };
  
  const installResult = await runHook(plugin, 'install', context || {});
  const bootstrapResult = await runHook(plugin, 'bootstrap', context || {});
  applyExposedContracts(plugin);
  
  data.plugins[plugin.id].enabled = true;
  data.plugins[plugin.id].installedAt = nowIso();
  data.plugins[plugin.id].updatedAt = nowIso();
  data.plugins[plugin.id].sourcePath = pluginDir;
  await savePluginState(doc, data);
  
  if (!skipAssetsCollection) {
    await collectEnabledPluginsAssets({ context });
  }
  
  return {
    pluginId: plugin.id,
    plugin,
    enabled: true,
    install: installResult,
    bootstrap: bootstrapResult,
  };
}

async function autoDiscoverPluginsFromPath(pluginsRoot, { context, skipAssetsCollection } = {}) {
  const rootDir = path.resolve(pluginsRoot);
  
  if (!fs.existsSync(rootDir)) {
    return { plugins: [], failed: [] };
  }
  
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const results = {
    plugins: [],
    failed: [],
  };
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    const pluginPath = path.join(rootDir, entry.name);
    
    try {
      const result = await enablePluginFromPath(pluginPath, {
        context,
        skipAssetsCollection: true
      });
      results.plugins.push(result);
    } catch (error) {
      results.failed.push({
        pluginId: entry.name,
        path: pluginPath,
        error: error.message
      });
    }
  }
  
  if (!skipAssetsCollection && results.plugins.length > 0) {
    await collectEnabledPluginsAssets({ context });
  }
  
  return results;
}

module.exports = {
  PLUGINS_STATE_KEY,
  DEFAULT_REGISTRY_ID,
  ensurePluginsRegistry,
  registerPluginsRoot,
  loadAllPluginsFromFolder,
  discoverPlugins,
  discoverPluginFromPath,
  bootstrap,
  listPlugins,
  enablePlugin,
  enablePluginFromPath,
  disablePlugin,
  installPlugin,
  autoDiscoverPluginsFromPath,
  getExposedServices,
  getExposedHelpers,
  collectPluginAssets,
  collectEnabledPluginsAssets,
  getBootstrapStatus,
  getAdminNavItems,
  getPluginPageBlocks,
};
