const mongoose = require('mongoose');

const Asset = require('../models/Asset');
const FileEntry = require('../models/FileEntry');
const RbacGroup = require('../models/RbacGroup');
const RbacGroupMember = require('../models/RbacGroupMember');

const objectStorage = require('./objectStorage.service');
const uploadNamespacesService = require('./uploadNamespaces.service');
const globalSettingsService = require('./globalSettings.service');

const DEFAULT_FILE_MANAGER_MAX_UPLOAD_BYTES = 1073741824;

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

function normalizePath(p) {
  const raw = String(p || '/').trim();
  if (!raw || raw === '/') return '/';
  let out = raw;
  if (!out.startsWith('/')) out = `/${out}`;
  out = out.replace(/\/+/g, '/');
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

function normalizeName(name) {
  const n = String(name || '').trim();
  if (!n) {
    const err = new Error('name is required');
    err.code = 'VALIDATION';
    throw err;
  }
  if (n.length > 200) {
    const err = new Error('name is too long');
    err.code = 'VALIDATION';
    throw err;
  }
  return n;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPublicUrl(assetKey) {
  return `/public/assets/${assetKey}`;
}

function computeNamespace({ orgId, driveType, driveId, parentPath }) {
  const folderSlug =
    parentPath === '/'
      ? 'root'
      : parentPath
          .slice(1)
          .toLowerCase()
          .replace(/[^a-z0-9/\-]+/g, '-')
          .replace(/\/+?/g, '/')
          .split('/')
          .filter(Boolean)
          .join('--');
  return `fms_${String(orgId)}_${driveType}_${String(driveId)}_${folderSlug || 'root'}`;
}

function buildNamespaceConfigForFolder(policyConfig, computedNamespace) {
  // We want per-folder namespaces without creating GlobalSetting entries for each.
  // Use the resolved policy from a stable namespace (default) but override key/keyPrefix.
  return {
    ...policyConfig,
    key: computedNamespace,
    keyPrefix: `assets/${computedNamespace}`,
  };
}

async function listDrives({ userId, orgId }) {
  const oid = normalizeObjectId(orgId, 'orgId');
  const uid = normalizeObjectId(userId, 'userId');

  const [groupMemberships, groups] = await Promise.all([
    RbacGroupMember.find({ userId: uid }).select('groupId').lean(),
    RbacGroup.find({ orgId: oid, status: 'active', isGlobal: false }).select('_id name description orgId').lean(),
  ]);

  const memberGroupIds = new Set(groupMemberships.map((m) => String(m.groupId)));
  const orgGroups = groups.filter((g) => memberGroupIds.has(String(g._id)));

  return {
    drives: [
      { driveType: 'user', driveId: String(uid), label: 'My Drive' },
      ...orgGroups.map((g) => ({ driveType: 'group', driveId: String(g._id), label: g.name || 'Group Drive' })),
      { driveType: 'org', driveId: String(oid), label: 'Org Drive' },
    ],
  };
}

async function listFolder({ orgId, driveType, driveId, parentPath }) {
  const oid = normalizeObjectId(orgId, 'orgId');
  const dt = normalizeDriveType(driveType);
  const did = normalizeObjectId(driveId, 'driveId');
  const path = normalizePath(parentPath);

  const entries = await FileEntry.find({
    orgId: oid,
    driveType: dt,
    driveId: did,
    parentPath: path,
    deletedAt: null,
  })
    .sort({ name: 1 })
    .lean();

  const assetIds = entries.map((e) => e.assetId).filter(Boolean);
  const assets = assetIds.length
    ? await Asset.find({ _id: { $in: assetIds } }).select('_id key originalName contentType sizeBytes status').lean()
    : [];
  const assetsById = new Map(assets.map((a) => [String(a._id), a]));

  const files = entries.map((e) => {
    const asset = assetsById.get(String(e.assetId));
    return {
      id: String(e._id),
      name: e.name,
      parentPath: e.parentPath,
      visibility: e.visibility,
      assetId: String(e.assetId),
      assetKey: asset?.key || null,
      publicUrl:
        e.visibility === 'public' && asset?.key
          ? buildPublicUrl(asset.key)
          : null,
      contentType: asset?.contentType || null,
      size: asset?.sizeBytes ?? null,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  });

  // Virtual folders: compute immediate child folder names based on existing file parentPath values.
  // Example: file at /toto/photo.jpg has parentPath=/toto. When listing '/', folder 'toto' should appear.
  const prefix = path === '/' ? '/' : `${path}/`;
  const prefixRegex = `^${escapeRegex(prefix)}`;
  const descendantParentPaths = await FileEntry.find({
    orgId: oid,
    driveType: dt,
    driveId: did,
    parentPath: { $regex: prefixRegex },
    deletedAt: null,
  })
    .select('parentPath')
    .lean();

  const folderNameSet = new Set();
  for (const row of descendantParentPaths) {
    const parent = normalizePath(row.parentPath);
    if (parent === path) continue;

    const remainder = parent.startsWith(prefix) ? parent.slice(prefix.length) : '';
    const seg = remainder.split('/').filter(Boolean)[0];
    if (seg) folderNameSet.add(seg);
  }

  const folders = Array.from(folderNameSet)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      path: normalizePath(path === '/' ? `/${name}` : `${path}/${name}`),
    }));

  return {
    entries: files,
    files,
    folders,
  };
}

async function uploadFile({ userId, orgId, driveType, driveId, parentPath, name, buffer, contentType, overwrite = false, requestedVisibility }) {
  const oid = normalizeObjectId(orgId, 'orgId');
  const uid = normalizeObjectId(userId, 'userId');
  const dt = normalizeDriveType(driveType);
  const did = normalizeObjectId(driveId, 'driveId');
  const path = normalizePath(parentPath);
  const filename = normalizeName(name);

  const existing = await FileEntry.findOne({
    orgId: oid,
    driveType: dt,
    driveId: did,
    parentPath: path,
    name: filename,
    deletedAt: null,
  });

  const computedNamespace = computeNamespace({ orgId: oid, driveType: dt, driveId: did, parentPath: path });
  const policyConfig = await uploadNamespacesService.resolveNamespace('default');
  const baseNamespaceConfig = buildNamespaceConfigForFolder(policyConfig, computedNamespace);

  const rawMaxUploadBytes = await globalSettingsService.getSettingValue(
    'FILE_MANAGER_MAX_UPLOAD_BYTES',
    String(DEFAULT_FILE_MANAGER_MAX_UPLOAD_BYTES)
  );
  const parsedMaxUploadBytes = Number(rawMaxUploadBytes);
  const maxUploadBytes =
    Number.isFinite(parsedMaxUploadBytes) && parsedMaxUploadBytes > 0
      ? parsedMaxUploadBytes
      : DEFAULT_FILE_MANAGER_MAX_UPLOAD_BYTES;

  // File Manager should accept any file type. `validateUpload()` only enforces
  // allowed content types if the array is non-empty.
  const namespaceConfig = {
    ...baseNamespaceConfig,
    allowedContentTypes: [],
    maxFileSizeBytes: maxUploadBytes,
  };

  // File Manager max size is enforced via FILE_MANAGER_MAX_UPLOAD_BYTES.
  // Provide it as the effective hard-cap for validation.
  const hardCapMaxFileSizeBytes = maxUploadBytes;

  const validation = uploadNamespacesService.validateUpload({
    namespaceConfig,
    contentType,
    sizeBytes: buffer.length,
    hardCapMaxFileSizeBytes,
  });

  if (!validation.ok) {
    const err = new Error('Upload rejected by namespace policy');
    err.code = 'UPLOAD_REJECTED';
    err.details = { namespace: namespaceConfig.key, hardCapMaxFileSizeBytes, errors: validation.errors };
    throw err;
  }

  const visibility = uploadNamespacesService.computeVisibility({
    namespaceConfig,
    requestedVisibility,
  });

  if (existing) {
    if (!overwrite) {
      const err = new Error('File already exists');
      err.code = 'CONFLICT';
      err.details = { existingFileId: String(existing._id) };
      throw err;
    }

    const asset = await Asset.findById(existing.assetId);
    if (!asset) {
      const err = new Error('Underlying asset not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    const { provider, bucket } = await objectStorage.putObject({
      key: asset.key,
      body: buffer,
      contentType,
    });

    asset.provider = provider;
    asset.bucket = bucket;
    asset.contentType = contentType;
    asset.sizeBytes = buffer.length;
    asset.originalName = filename;
    asset.namespace = namespaceConfig.key;
    // Overwrite replaces the object bytes only; visibility should not be changed.
    await asset.save();

    if (existing.visibility !== asset.visibility) {
      existing.visibility = asset.visibility;
      await existing.save();
    }

    return { file: { id: String(existing._id), assetId: String(asset._id), visibility: asset.visibility } };
  }

  const key = uploadNamespacesService.generateObjectKey({
    namespaceConfig,
    originalName: filename,
  });

  const { provider, bucket } = await objectStorage.putObject({
    key,
    body: buffer,
    contentType,
  });

  const asset = await Asset.create({
    key,
    provider,
    bucket,
    originalName: filename,
    contentType,
    sizeBytes: buffer.length,
    visibility,
    namespace: namespaceConfig.key,
    visibilityEnforced: Boolean(namespaceConfig.enforceVisibility),
    ownerUserId: dt === 'user' ? uid : null,
    orgId: oid,
    status: 'uploaded',
  });

  const entry = await FileEntry.create({
    orgId: oid,
    driveType: dt,
    driveId: did,
    parentPath: path,
    name: filename,
    assetId: asset._id,
    visibility: asset.visibility,
    deletedAt: null,
  });

  return { file: { id: String(entry._id), assetId: String(asset._id), visibility: asset.visibility } };
}

async function getFileEntry({ orgId, driveType, driveId, fileId }) {
  const oid = normalizeObjectId(orgId, 'orgId');
  const dt = normalizeDriveType(driveType);
  const did = normalizeObjectId(driveId, 'driveId');
  const fid = normalizeObjectId(fileId, 'fileId');

  const entry = await FileEntry.findOne({ _id: fid, orgId: oid, driveType: dt, driveId: did, deletedAt: null }).lean();
  if (!entry) {
    const err = new Error('File not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const asset = await Asset.findById(entry.assetId).lean();
  if (!asset) {
    const err = new Error('Underlying asset not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  return { entry, asset };
}

async function downloadFile({ orgId, driveType, driveId, fileId }) {
  const { entry, asset } = await getFileEntry({ orgId, driveType, driveId, fileId });
  const result = await objectStorage.getObject({ key: asset.key });
  if (!result) {
    const err = new Error('File not found in storage');
    err.code = 'NOT_FOUND';
    throw err;
  }

  return {
    entry,
    asset,
    contentType: result.contentType || asset.contentType,
    body: result.body,
  };
}

async function deleteFile({ orgId, driveType, driveId, fileId }) {
  const { entry, asset } = await getFileEntry({ orgId, driveType, driveId, fileId });

  await objectStorage.deleteObject({ key: asset.key });

  await Asset.findByIdAndUpdate(asset._id, { $set: { status: 'deleted' } });
  await FileEntry.findByIdAndUpdate(entry._id, { $set: { deletedAt: new Date() } });

  return { success: true };
}

async function setShare({ orgId, driveType, driveId, fileId, enabled }) {
  const { entry, asset } = await getFileEntry({ orgId, driveType, driveId, fileId });

  if (asset.visibilityEnforced) {
    const err = new Error('Visibility is enforced by the upload namespace for this file');
    err.code = 'VISIBILITY_ENFORCED';
    throw err;
  }

  const newVisibility = enabled ? 'public' : 'private';

  await Asset.findByIdAndUpdate(asset._id, { $set: { visibility: newVisibility } });
  await FileEntry.findByIdAndUpdate(entry._id, { $set: { visibility: newVisibility } });

  return {
    success: true,
    visibility: newVisibility,
    publicUrl: newVisibility === 'public' ? buildPublicUrl(asset.key) : null,
  };
}

async function updateFile({ orgId, driveType, driveId, fileId, name, parentPath }) {
  const oid = normalizeObjectId(orgId, 'orgId');
  const dt = normalizeDriveType(driveType);
  const did = normalizeObjectId(driveId, 'driveId');
  const fid = normalizeObjectId(fileId, 'fileId');

  const patch = {};
  if (name !== undefined) patch.name = normalizeName(name);
  if (parentPath !== undefined) patch.parentPath = normalizePath(parentPath);

  if (Object.keys(patch).length === 0) {
    const err = new Error('No updates provided');
    err.code = 'VALIDATION';
    throw err;
  }

  const entry = await FileEntry.findOne({ _id: fid, orgId: oid, driveType: dt, driveId: did, deletedAt: null });
  if (!entry) {
    const err = new Error('File not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const newName = patch.name ?? entry.name;
  const newParentPath = patch.parentPath ?? entry.parentPath;

  // Uniqueness: same folder + name
  const conflict = await FileEntry.findOne({
    _id: { $ne: entry._id },
    orgId: oid,
    driveType: dt,
    driveId: did,
    parentPath: newParentPath,
    name: newName,
    deletedAt: null,
  }).select('_id').lean();

  if (conflict) {
    const err = new Error('A file with that name already exists in the target folder');
    err.code = 'CONFLICT';
    err.details = { existingFileId: String(conflict._id) };
    throw err;
  }

  // Update entry first
  entry.name = newName;
  entry.parentPath = newParentPath;
  await entry.save();

  // Update Asset.namespace to match new folder (no object key move).
  const computedNamespace = computeNamespace({ orgId: oid, driveType: dt, driveId: did, parentPath: newParentPath });
  const policyConfig = await uploadNamespacesService.resolveNamespace('default');
  const namespaceConfig = buildNamespaceConfigForFolder(policyConfig, computedNamespace);

  await Asset.findByIdAndUpdate(entry.assetId, { $set: { namespace: namespaceConfig.key, originalName: newName } });

  return {
    file: {
      id: String(entry._id),
      name: entry.name,
      parentPath: entry.parentPath,
    },
  };
}

module.exports = {
  normalizePath,
  normalizeName,
  listDrives,
  listFolder,
  uploadFile,
  updateFile,
  downloadFile,
  deleteFile,
  setShare,
  computeNamespace,
  buildPublicUrl,
};
