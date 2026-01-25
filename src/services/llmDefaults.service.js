const { getSettingValue } = require('./globalSettings.service');

const GLOBAL_DEFAULT_PROVIDER_KEY = 'llm.defaults.providerKey';
const GLOBAL_DEFAULT_MODEL_KEY = 'llm.defaults.model';
const SYSTEM_DEFAULTS_PREFIX = 'llm.systemDefaults.';
const PROVIDER_MODELS_KEY = 'llm.providerModels';

const CACHE_TTL = 60_000;
let cache = {
  ts: 0,
  globalDefaults: null,
  systemDefaults: null,
  providerModels: null,
};

function trimOrEmpty(value) {
  return String(value || '').trim();
}

function parseJsonOrDefault(raw, fallback) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed ?? fallback;
  } catch (_) {
    return fallback;
  }
}

async function loadCentralConfig() {
  const now = Date.now();
  if (cache.ts && now - cache.ts < CACHE_TTL && cache.globalDefaults && cache.systemDefaults && cache.providerModels) {
    return cache;
  }

  const providerKey = trimOrEmpty(await getSettingValue(GLOBAL_DEFAULT_PROVIDER_KEY, ''));
  const model = trimOrEmpty(await getSettingValue(GLOBAL_DEFAULT_MODEL_KEY, ''));

  const systemDefaultsRaw = await getSettingValue('llm.systemDefaults', '{}');
  const systemDefaults = parseJsonOrDefault(systemDefaultsRaw, {});

  const providerModelsRaw = await getSettingValue(PROVIDER_MODELS_KEY, '{}');
  const providerModels = parseJsonOrDefault(providerModelsRaw, {});

  cache = {
    ts: now,
    globalDefaults: { providerKey, model },
    systemDefaults: systemDefaults && typeof systemDefaults === 'object' ? systemDefaults : {},
    providerModels: providerModels && typeof providerModels === 'object' ? providerModels : {},
  };

  return cache;
}

function getLegacyResolver(systemKey) {
  const key = String(systemKey || '').trim();

  const map = {
    'pageBuilder.blocks.generate': {
      legacyProviderSettingKey: 'pageBuilder.blocks.ai.providerKey',
      legacyModelSettingKey: 'pageBuilder.blocks.ai.model',
      envProviderKey: 'DEFAULT_LLM_PROVIDER_KEY',
      envModelKey: 'DEFAULT_LLM_MODEL',
      hardDefaultModel: 'x-ai/grok-code-fast-1',
    },
    'pageBuilder.blocks.propose': {
      legacyProviderSettingKey: 'pageBuilder.blocks.ai.providerKey',
      legacyModelSettingKey: 'pageBuilder.blocks.ai.model',
      envProviderKey: 'DEFAULT_LLM_PROVIDER_KEY',
      envModelKey: 'DEFAULT_LLM_MODEL',
      hardDefaultModel: 'x-ai/grok-code-fast-1',
    },
    'ejsVirtual.vibe.apply': {
      legacyProviderSettingKey: 'ejsVirtual.ai.providerKey',
      legacyModelSettingKey: 'ejsVirtual.ai.model',
      envProviderKey: 'DEFAULT_LLM_PROVIDER_KEY',
      envModelKey: 'DEFAULT_LLM_MODEL',
      hardDefaultModel: 'x-ai/grok-code-fast-1',
    },
    'uiComponents.proposeEdit': {
      legacyProviderSettingKey: 'uiComponents.ai.providerKey',
      legacyModelSettingKey: 'uiComponents.ai.model',
      envProviderKey: 'DEFAULT_LLM_PROVIDER_KEY',
      envModelKey: 'DEFAULT_LLM_MODEL',
      hardDefaultModel: 'x-ai/grok-code-fast-1',
    },
    'headless.modelBuilder.chat': {
      legacyProviderSettingKey: 'headless.aiProviderKey',
      legacyModelSettingKey: 'headless.aiModel',
      envProviderKey: 'HEADLESS_AI_PROVIDER_KEY',
      envModelKey: 'HEADLESS_AI_MODEL',
      hardDefaultProviderKey: 'openrouter',
      hardDefaultModel: 'google/gemini-2.5-flash-lite',
    },
    'workflow.node.llm': {
      envProviderKey: 'DEFAULT_LLM_PROVIDER_KEY',
      envModelKey: 'DEFAULT_LLM_MODEL',
      hardDefaultProviderKey: 'openrouter',
      hardDefaultModel: 'minimax/minimax-m2.1',
    },
    'seoConfig.entry.generate': {
      legacyModelSettingKey: 'seoconfig.ai.openrouter.model',
      envProviderKey: 'DEFAULT_LLM_PROVIDER_KEY',
      envModelKey: 'DEFAULT_LLM_MODEL',
      hardDefaultProviderKey: 'openrouter',
    },
    'seoConfig.entry.improve': {
      legacyModelSettingKey: 'seoconfig.ai.openrouter.model',
      envProviderKey: 'DEFAULT_LLM_PROVIDER_KEY',
      envModelKey: 'DEFAULT_LLM_MODEL',
      hardDefaultProviderKey: 'openrouter',
    },
    'seoConfig.ogSvg.edit': {
      legacyModelSettingKey: 'seoconfig.ai.openrouter.model',
      envProviderKey: 'DEFAULT_LLM_PROVIDER_KEY',
      envModelKey: 'DEFAULT_LLM_MODEL',
      hardDefaultProviderKey: 'openrouter',
    },
    'i18n.translate.preview': {
      legacyModelSettingKey: 'i18n.ai.model',
      envProviderKey: 'DEFAULT_LLM_PROVIDER_KEY',
      envModelKey: 'DEFAULT_LLM_MODEL',
      hardDefaultProviderKey: 'openrouter',
      hardDefaultModel: 'google/gemini-2.5-flash-lite',
    },
    'i18n.translate.text': {
      legacyModelSettingKey: 'i18n.ai.model',
      envProviderKey: 'DEFAULT_LLM_PROVIDER_KEY',
      envModelKey: 'DEFAULT_LLM_MODEL',
      hardDefaultProviderKey: 'openrouter',
      hardDefaultModel: 'google/gemini-2.5-flash-lite',
    },
  };

  return map[key] || null;
}

async function resolveLlmProviderModel({ systemKey, providerKey, model }) {
  const uiProviderKey = trimOrEmpty(providerKey);
  const uiModel = trimOrEmpty(model);

  const { globalDefaults, systemDefaults } = await loadCentralConfig();

  const perSystem = systemKey && systemDefaults && typeof systemDefaults === 'object'
    ? systemDefaults[String(systemKey)]
    : null;

  const systemProviderKey = trimOrEmpty(perSystem && perSystem.providerKey);
  const systemModel = trimOrEmpty(perSystem && perSystem.model);

  const globalProviderKey = trimOrEmpty(globalDefaults && globalDefaults.providerKey);
  const globalModel = trimOrEmpty(globalDefaults && globalDefaults.model);

  const legacy = getLegacyResolver(systemKey);

  const legacyProviderKey = legacy?.legacyProviderSettingKey
    ? trimOrEmpty(await getSettingValue(legacy.legacyProviderSettingKey, ''))
    : '';
  const legacyModel = legacy?.legacyModelSettingKey
    ? trimOrEmpty(await getSettingValue(legacy.legacyModelSettingKey, ''))
    : '';

  const envProviderKey = legacy?.envProviderKey ? trimOrEmpty(process.env[legacy.envProviderKey]) : '';
  const envModel = legacy?.envModelKey ? trimOrEmpty(process.env[legacy.envModelKey]) : '';

  const resolvedProviderKey = uiProviderKey || systemProviderKey || globalProviderKey || legacyProviderKey || envProviderKey || trimOrEmpty(legacy?.hardDefaultProviderKey);
  if (!resolvedProviderKey) {
    const err = new Error('Missing LLM providerKey');
    err.code = 'VALIDATION';
    throw err;
  }

  const resolvedModel = uiModel || systemModel || globalModel || legacyModel || envModel || trimOrEmpty(legacy?.hardDefaultModel);

  return { providerKey: resolvedProviderKey, model: resolvedModel };
}

async function getProviderModelsMap() {
  const { providerModels } = await loadCentralConfig();
  return providerModels && typeof providerModels === 'object' ? providerModels : {};
}

module.exports = {
  GLOBAL_DEFAULT_PROVIDER_KEY,
  GLOBAL_DEFAULT_MODEL_KEY,
  SYSTEM_DEFAULTS_PREFIX,
  PROVIDER_MODELS_KEY,
  resolveLlmProviderModel,
  getProviderModelsMap,
};
