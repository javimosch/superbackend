const mongoose = require('mongoose');

const Asset = require('../models/Asset');
const FileEntry = require('../models/FileEntry');
const RbacGroup = require('../models/RbacGroup');
const RbacGroupMember = require('../models/RbacGroupMember');

const globalSettingsService = require('./globalSettings.service');

const SETTING_POLICY_JSON = 'FILE_MANAGER_STORAGE_POLICY_JSON';
const SETTING_LEGACY_MAX_UPLOAD = 'FILE_MANAGER_MAX_UPLOAD_BYTES';

const DEFAULT_MAX_UPLOAD_BYTES = 1073741824;
const DEFAULT_MAX_STORAGE_BYTES = 104857600;

function normalizeObjectId(id, name) {
  const str = String(id || '');
  if (!mongoose.Types.ObjectId.isValid(str)) {
    const err = new Error(`${name} must be a valid ObjectId`);
    err.code = 'VALIDATION';
    throw err;
  }
  return new mongoose.Types.ObjectId(str);
}

function normalizeDriveType(value) {
  const t = String(value || '').trim();
  if (t === 'user' || t === 'group' || t === 'org') return t;
  const err = new Error('driveType must be one of: user, group, org');
  err.code = 'VALIDATION';
  throw err;
}

function toPositiveIntOrNull(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

async function loadPolicy() {
  const raw = await globalSettingsService.getSettingValue(SETTING_POLICY_JSON, null);
  if (!raw) return { version: 1, global: {}, orgs: {} };

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return { version: 1, global: {}, orgs: {} };

    const version = toPositiveIntOrNull(parsed.version) || 1;
    const global = parsed.global && typeof parsed.global === 'object' ? parsed.global : {};
    const orgs = parsed.orgs && typeof parsed.orgs === 'object' ? parsed.orgs : {};

    return { version, global, orgs };
  } catch {
    return { version: 1, global: {}, orgs: {} };
  }
}

function getEnvDefaultMaxUploadBytes() {
  const fromEnv = toPositiveIntOrNull(process.env.FILE_MANAGER_DEFAULT_MAX_UPLOAD_BYTES);
  return fromEnv || DEFAULT_MAX_UPLOAD_BYTES;
}

async function getDefaultMaxUploadBytes() {
  const legacy = await globalSettingsService.getSettingValue(SETTING_LEGACY_MAX_UPLOAD, null);
  const legacyParsed = toPositiveIntOrNull(legacy);
  return legacyParsed || getEnvDefaultMaxUploadBytes();
}

function getDefaultMaxStorageBytes() {
  const fromEnv = toPositiveIntOrNull(process.env.FILE_MANAGER_DEFAULT_MAX_STORAGE_BYTES);
  return fromEnv || DEFAULT_MAX_STORAGE_BYTES;
}

async function getUserOrgGroupIds({ userId, orgId }) {
  const uid = normalizeObjectId(userId, 'userId');
  const oid = normalizeObjectId(orgId, 'orgId');

  const links = await RbacGroupMember.find({ userId: uid }).select('groupId').lean();
  const groupIds = links.map((l) => l.groupId).filter(Boolean);
  if (!groupIds.length) return [];

  const groups = await RbacGroup.find({ _id: { $in: groupIds }, orgId: oid, status: 'active', isGlobal: false })
    .select('_id')
    .lean();

  return groups.map((g) => String(g._id));
}

function pickMax(values) {
  let best = null;
  for (const v of values) {
    const n = toPositiveIntOrNull(v);
    if (n === null) continue;
    if (best === null || n > best) best = n;
  }
  return best;
}

function getOrgConfig(policy, orgId) {
  const orgs = policy?.orgs || {};
  const orgConfig = orgs[String(orgId)] || null;
  return orgConfig && typeof orgConfig === 'object' ? orgConfig : null;
}

function getGroupConfig(orgConfig, groupId) {
  const groups = orgConfig?.groups || {};
  const g = groups[String(groupId)] || null;
  return g && typeof g === 'object' ? g : null;
}

function getUserConfig(orgConfig, userId) {
  const users = orgConfig?.users || {};
  const u = users[String(userId)] || null;
  return u && typeof u === 'object' ? u : null;
}

async function resolveEffectiveLimits({ userId, orgId, driveType, driveId }) {
  const dt = normalizeDriveType(driveType);
  const oid = normalizeObjectId(orgId, 'orgId');
  const did = normalizeObjectId(driveId, 'driveId');

  const policy = await loadPolicy();
  const orgConfig = getOrgConfig(policy, String(oid));

  const source = { maxUpload: 'default', maxStorage: 'default' };

  const defaultMaxUpload = await getDefaultMaxUploadBytes();
  const defaultMaxStorage = getDefaultMaxStorageBytes();

  const globalMaxUpload = toPositiveIntOrNull(policy?.global?.maxUploadBytes);
  const globalMaxStorage = toPositiveIntOrNull(policy?.global?.maxStorageBytes);

  let maxUploadBytes = null;
  let maxStorageBytes = null;

  const orgMaxUpload = toPositiveIntOrNull(orgConfig?.maxUploadBytes);
  const orgMaxStorage = toPositiveIntOrNull(orgConfig?.maxStorageBytes);

  if (dt === 'org') {
    maxUploadBytes = orgMaxUpload;
    if (maxUploadBytes !== null) source.maxUpload = 'org';

    maxStorageBytes = orgMaxStorage;
    if (maxStorageBytes !== null) source.maxStorage = 'org';
  }

  if (dt === 'group') {
    const groupConfig = getGroupConfig(orgConfig, String(did));
    const groupMaxUpload = toPositiveIntOrNull(groupConfig?.maxUploadBytes);
    const groupMaxStorage = toPositiveIntOrNull(groupConfig?.maxStorageBytes);

    maxUploadBytes = groupMaxUpload;
    if (maxUploadBytes !== null) source.maxUpload = 'group';

    maxStorageBytes = groupMaxStorage;
    if (maxStorageBytes !== null) source.maxStorage = 'group';

    if (maxUploadBytes === null) {
      maxUploadBytes = orgMaxUpload;
      if (maxUploadBytes !== null) source.maxUpload = 'org';
    }

    if (maxStorageBytes === null) {
      maxStorageBytes = orgMaxStorage;
      if (maxStorageBytes !== null) source.maxStorage = 'org';
    }
  }

  if (dt === 'user') {
    const userConfig = getUserConfig(orgConfig, String(did));
    const userMaxUpload = toPositiveIntOrNull(userConfig?.maxUploadBytes);
    const userMaxStorage = toPositiveIntOrNull(userConfig?.maxStorageBytes);

    maxUploadBytes = userMaxUpload;
    if (maxUploadBytes !== null) source.maxUpload = 'user';

    maxStorageBytes = userMaxStorage;
    if (maxStorageBytes !== null) source.maxStorage = 'user';

    const groupIds = await getUserOrgGroupIds({ userId, orgId: oid });
    if (groupIds.length) {
      const groupUploads = groupIds.map((gid) => getGroupConfig(orgConfig, gid)?.maxUploadBytes);
      const groupStorages = groupIds.map((gid) => getGroupConfig(orgConfig, gid)?.maxStorageBytes);

      if (maxUploadBytes === null) {
        maxUploadBytes = pickMax(groupUploads);
        if (maxUploadBytes !== null) source.maxUpload = 'group';
      }

      if (maxStorageBytes === null) {
        maxStorageBytes = pickMax(groupStorages);
        if (maxStorageBytes !== null) source.maxStorage = 'group';
      }
    }

    if (maxUploadBytes === null) {
      maxUploadBytes = orgMaxUpload;
      if (maxUploadBytes !== null) source.maxUpload = 'org';
    }

    if (maxStorageBytes === null) {
      maxStorageBytes = orgMaxStorage;
      if (maxStorageBytes !== null) source.maxStorage = 'org';
    }
  }

  if (maxUploadBytes === null && globalMaxUpload !== null) {
    maxUploadBytes = globalMaxUpload;
    source.maxUpload = 'global';
  }

  if (maxStorageBytes === null && globalMaxStorage !== null) {
    maxStorageBytes = globalMaxStorage;
    source.maxStorage = 'global';
  }

  if (maxUploadBytes === null) {
    maxUploadBytes = defaultMaxUpload;
  }

  if (maxStorageBytes === null) {
    maxStorageBytes = defaultMaxStorage;
  }

  return {
    maxUploadBytes,
    maxStorageBytes,
    source,
  };
}

async function computeDriveUsedBytes({ orgId, driveType, driveId }) {
  const oid = normalizeObjectId(orgId, 'orgId');
  const dt = normalizeDriveType(driveType);
  const did = normalizeObjectId(driveId, 'driveId');

  const rows = await FileEntry.aggregate([
    {
      $match: {
        orgId: oid,
        driveType: dt,
        driveId: did,
        deletedAt: null,
      },
    },
    {
      $lookup: {
        from: 'assets',
        localField: 'assetId',
        foreignField: '_id',
        as: 'asset',
      },
    },
    { $unwind: { path: '$asset', preserveNullAndEmptyArrays: false } },
    { $match: { 'asset.status': 'uploaded' } },
    {
      $group: {
        _id: null,
        usedBytes: { $sum: '$asset.sizeBytes' },
      },
    },
  ]);

  const usedBytes = rows?.[0]?.usedBytes;
  return Number.isFinite(usedBytes) ? usedBytes : 0;
}

async function getEffectivePolicy({ userId, orgId, driveType, driveId }) {
  const effective = await resolveEffectiveLimits({ userId, orgId, driveType, driveId });
  const usedBytes = await computeDriveUsedBytes({ orgId, driveType, driveId });
  const overageBytes = Math.max(0, usedBytes - effective.maxStorageBytes);

  return {
    effective,
    usage: { usedBytes, overageBytes },
  };
}

module.exports = {
  loadPolicy,
  resolveEffectiveLimits,
  computeDriveUsedBytes,
  getEffectivePolicy,
  getUserOrgGroupIds,
};
