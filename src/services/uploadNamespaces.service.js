const GlobalSetting = require('../models/GlobalSetting');
const globalSettingsService = require('./globalSettings.service');
const objectStorage = require('./objectStorage.service');

const UPLOAD_NAMESPACE_PREFIX = 'UPLOAD_NAMESPACE.';

const stripPrefix = (key) => {
  if (!key) return key;
  if (!key.startsWith(UPLOAD_NAMESPACE_PREFIX)) return key;
  return key.slice(UPLOAD_NAMESPACE_PREFIX.length);
};

const parseJson = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const MAX_FILE_SIZE_HARD_CAP_SETTING_KEY = 'MAX_FILE_SIZE_HARD_CAP';

const getHardCapMaxFileSizeBytes = () => {
  const raw = process.env.MAX_FILE_SIZE_HARD_CAP || process.env.MAX_FILE_SIZE || '10485760';
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 10485760;
  return parsed;
};

const getEffectiveHardCapMaxFileSizeBytes = async () => {
  const envHardCap = getHardCapMaxFileSizeBytes();

  const raw = await globalSettingsService.getSettingValue(MAX_FILE_SIZE_HARD_CAP_SETTING_KEY, null);
  if (raw === null || raw === undefined || raw === '') return envHardCap;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return envHardCap;

  return Math.min(envHardCap, parsed);
};

const normalizePayload = (namespaceKey, payload) => {
  const hardCap = getHardCapMaxFileSizeBytes();

  const enabled = payload?.enabled === undefined ? true : Boolean(payload.enabled);

  let maxFileSizeBytes = payload?.maxFileSizeBytes;
  if (maxFileSizeBytes === undefined || maxFileSizeBytes === null || maxFileSizeBytes === '') {
    maxFileSizeBytes = hardCap;
  }
  maxFileSizeBytes = Number(maxFileSizeBytes);
  if (!Number.isFinite(maxFileSizeBytes) || maxFileSizeBytes <= 0) {
    maxFileSizeBytes = hardCap;
  }
  maxFileSizeBytes = Math.min(maxFileSizeBytes, hardCap);

  const normalizeArray = (value) => {
    if (value === undefined) return undefined;
    if (value === null) return [];
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    return [String(value)].filter(Boolean);
  };

  const allowedContentTypes = normalizeArray(payload?.allowedContentTypes);

  const defaultVisibility = payload?.defaultVisibility ? String(payload.defaultVisibility) : undefined;
  const enforceVisibility = payload?.enforceVisibility === undefined ? false : Boolean(payload.enforceVisibility);

  const keyPrefix = payload?.keyPrefix !== undefined ? String(payload.keyPrefix || '') : undefined;

  return {
    key: String(namespaceKey),
    enabled,
    maxFileSizeBytes,
    allowedContentTypes,
    keyPrefix,
    defaultVisibility,
    enforceVisibility,
  };
};

const getSettingKey = (namespaceKey) => `${UPLOAD_NAMESPACE_PREFIX}${namespaceKey}`;

const getDefaultNamespaceConfig = (hardCapMaxFileSizeBytes) => {
  const hardCap = hardCapMaxFileSizeBytes ?? getHardCapMaxFileSizeBytes();
  return {
    key: 'default',
    enabled: true,
    maxFileSizeBytes: hardCap,
    allowedContentTypes: objectStorage.getAllowedContentTypes(),
    keyPrefix: 'assets',
    defaultVisibility: 'private',
    enforceVisibility: false,
  };
};

const mergeWithDefault = (config, fallback) => {
  const base = fallback || getDefaultNamespaceConfig();

  const allowedContentTypes =
    config.allowedContentTypes === undefined ? base.allowedContentTypes : config.allowedContentTypes;

  const keyPrefix = config.keyPrefix === undefined ? base.keyPrefix : config.keyPrefix;

  const defaultVisibility = config.defaultVisibility === undefined ? base.defaultVisibility : config.defaultVisibility;

  return {
    ...base,
    ...config,
    allowedContentTypes,
    keyPrefix,
    defaultVisibility,
  };
};

async function listNamespaces() {
  const settings = await GlobalSetting.find({
    key: { $regex: `^${UPLOAD_NAMESPACE_PREFIX}` },
    type: 'json',
  })
    .sort({ key: 1 })
    .lean();

  return settings.map((s) => {
    const namespaceKey = stripPrefix(s.key);
    const raw = parseJson(s.value);
    const normalized = normalizePayload(namespaceKey, raw);
    const merged = mergeWithDefault(normalized);

    return {
      ...merged,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  });
}

async function resolveNamespace(namespaceKey) {
  const requested = namespaceKey ? String(namespaceKey).trim() : '';
  const key = requested || 'default';

  const effectiveHardCap = await getEffectiveHardCapMaxFileSizeBytes();

  if (key === 'default') {
    try {
      const value = await globalSettingsService.getSettingValue(getSettingKey('default'), null);
      if (!value) return getDefaultNamespaceConfig(effectiveHardCap);

      const raw = parseJson(value);
      const normalized = normalizePayload('default', raw);
      const merged = mergeWithDefault(normalized, getDefaultNamespaceConfig(effectiveHardCap));
      const clamped = {
        ...merged,
        maxFileSizeBytes: Math.min(merged.maxFileSizeBytes ?? effectiveHardCap, effectiveHardCap),
      };
      return clamped.enabled ? clamped : getDefaultNamespaceConfig(effectiveHardCap);
    } catch {
      return getDefaultNamespaceConfig(effectiveHardCap);
    }
  }

  const rawValue = await globalSettingsService.getSettingValue(getSettingKey(key), null);
  if (!rawValue) {
    return resolveNamespace('default');
  }

  const raw = parseJson(rawValue);
  const normalized = normalizePayload(key, raw);
  const merged = mergeWithDefault(normalized, getDefaultNamespaceConfig(effectiveHardCap));

  const clamped = {
    ...merged,
    maxFileSizeBytes: Math.min(merged.maxFileSizeBytes ?? effectiveHardCap, effectiveHardCap),
  };

  if (!clamped.enabled) {
    return resolveNamespace('default');
  }

  return clamped;
}

function validateUpload({ namespaceConfig, contentType, sizeBytes, hardCapMaxFileSizeBytes }) {
  const errors = [];

  const hardCap = hardCapMaxFileSizeBytes ?? getHardCapMaxFileSizeBytes();
  const maxSize = Math.min(namespaceConfig?.maxFileSizeBytes ?? hardCap, hardCap);
  if (typeof sizeBytes === 'number' && sizeBytes > maxSize) {
    errors.push({ field: 'sizeBytes', reason: 'File too large', maxFileSizeBytes: maxSize });
  }

  const normalizeAllowedEntry = (entry) => {
    if (entry === undefined || entry === null) return '';
    return String(entry).trim().toLowerCase();
  };

  const matchesAllowedContentType = (allowedEntry, actualContentType) => {
    const allowedNormalized = normalizeAllowedEntry(allowedEntry);
    const actualNormalized = normalizeAllowedEntry(actualContentType);

    if (!allowedNormalized || !actualNormalized) return false;

    // Exact match: image/png
    if (allowedNormalized === actualNormalized) return true;

    // Wildcard match: image/*
    if (allowedNormalized.endsWith('/*')) {
      const prefix = allowedNormalized.slice(0, -1); // keep trailing '/'
      return actualNormalized.startsWith(prefix);
    }

    // Shorthand: image, video, audio, application
    if (!allowedNormalized.includes('/')) {
      return actualNormalized.startsWith(`${allowedNormalized}/`);
    }

    return false;
  };

  const allowed = namespaceConfig?.allowedContentTypes;
  if (Array.isArray(allowed) && allowed.length > 0) {
    const ok = allowed.some((entry) => matchesAllowedContentType(entry, contentType));
    if (!ok) {
      errors.push({ field: 'contentType', reason: 'Invalid file type', allowedContentTypes: allowed });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function computeVisibility({ namespaceConfig, requestedVisibility }) {
  const requested = requestedVisibility === 'public' ? 'public' : requestedVisibility === 'private' ? 'private' : null;

  const defaultVis = namespaceConfig?.defaultVisibility === 'public' ? 'public' : 'private';

  if (namespaceConfig?.enforceVisibility) {
    return defaultVis;
  }

  return requested || defaultVis;
}

function computeKeyPrefix(namespaceConfig) {
  const prefix = namespaceConfig?.keyPrefix;
  if (prefix === undefined || prefix === null) return 'assets';
  const trimmed = String(prefix).trim();
  return trimmed ? trimmed.replace(/^\/+/, '').replace(/\/+$/, '') : 'assets';
}

function generateObjectKey({ namespaceConfig, originalName }) {
  const prefix = computeKeyPrefix(namespaceConfig);
  return objectStorage.generateKey(originalName, prefix);
}

module.exports = {
  UPLOAD_NAMESPACE_PREFIX,
  MAX_FILE_SIZE_HARD_CAP_SETTING_KEY,
  getHardCapMaxFileSizeBytes,
  getEffectiveHardCapMaxFileSizeBytes,
  getDefaultNamespaceConfig,
  normalizePayload,
  getSettingKey,
  listNamespaces,
  resolveNamespace,
  validateUpload,
  computeVisibility,
  generateObjectKey,
  computeKeyPrefix,
};
