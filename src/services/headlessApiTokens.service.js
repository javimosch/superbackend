const HeadlessApiToken = require('../models/HeadlessApiToken');
const { generateApiTokenPlaintext, hashToken, timingSafeEqualHex } = require('./headlessCrypto.service');

const VALID_OPERATIONS = new Set(['create', 'read', 'update', 'delete']);

function normalizeOperations(ops) {
  const list = Array.isArray(ops) ? ops : [];
  const normalized = list
    .map((o) => String(o || '').trim().toLowerCase())
    .filter((o) => o);

  for (const op of normalized) {
    if (!VALID_OPERATIONS.has(op)) {
      const err = new Error(`Invalid operation: ${op}`);
      err.code = 'VALIDATION';
      throw err;
    }
  }

  return Array.from(new Set(normalized));
}

function normalizePermissions(perms) {
  const list = Array.isArray(perms) ? perms : [];
  return list
    .map((p) => {
      const modelCode = String(p?.modelCode || '').trim();
      const operations = normalizeOperations(p?.operations);
      return { modelCode, operations };
    })
    .filter((p) => p.modelCode);
}

async function createApiToken({ name, permissions, ttlSeconds }) {
  const normalizedName = String(name || '').trim();
  if (!normalizedName) {
    const err = new Error('name is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const plaintext = generateApiTokenPlaintext();
  const tokenHash = hashToken(plaintext);
  const expiresAt = ttlSeconds ? new Date(Date.now() + Number(ttlSeconds) * 1000) : null;

  const doc = await HeadlessApiToken.create({
    name: normalizedName,
    tokenHash,
    permissions: normalizePermissions(permissions),
    expiresAt,
    isActive: true,
    lastUsedAt: null,
  });

  return { token: plaintext, item: doc.toObject() };
}

async function listApiTokens() {
  return HeadlessApiToken.find({}).sort({ createdAt: -1 }).lean();
}

async function getApiTokenById(id) {
  return HeadlessApiToken.findById(id).lean();
}

async function updateApiToken(id, updates) {
  const doc = await HeadlessApiToken.findById(id);
  if (!doc) {
    const err = new Error('API token not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (updates.name !== undefined) {
    const normalizedName = String(updates.name || '').trim();
    if (!normalizedName) {
      const err = new Error('name is required');
      err.code = 'VALIDATION';
      throw err;
    }
    doc.name = normalizedName;
  }

  if (updates.permissions !== undefined) {
    doc.permissions = normalizePermissions(updates.permissions);
  }

  if (updates.isActive !== undefined) {
    doc.isActive = Boolean(updates.isActive);
  }

  if (updates.ttlSeconds !== undefined) {
    const ttlSeconds = updates.ttlSeconds;
    doc.expiresAt = ttlSeconds ? new Date(Date.now() + Number(ttlSeconds) * 1000) : null;
  }

  await doc.save();
  return doc.toObject();
}

async function deleteApiToken(id) {
  const doc = await HeadlessApiToken.findById(id);
  if (!doc) {
    const err = new Error('API token not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  await HeadlessApiToken.deleteOne({ _id: id });
  return { success: true };
}

async function authenticateApiToken(plaintextToken) {
  const provided = String(plaintextToken || '').trim();
  if (!provided) return null;

  const tokenHash = hashToken(provided);

  const candidates = await HeadlessApiToken.find({ isActive: true }).select(
    'tokenHash permissions expiresAt isActive lastUsedAt',
  );

  const match = candidates.find((c) => timingSafeEqualHex(c.tokenHash, tokenHash));
  if (!match) return null;

  if (match.expiresAt && new Date(match.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  match.lastUsedAt = new Date();
  await match.save();

  return match.toObject();
}

function tokenAllowsOperation(tokenDoc, modelCode, operation) {
  if (!tokenDoc || !tokenDoc.permissions) return false;
  const op = String(operation || '').trim().toLowerCase();
  if (!VALID_OPERATIONS.has(op)) return false;

  const code = String(modelCode || '').trim();
  if (!code) return false;

  const perm = (tokenDoc.permissions || []).find((p) => p.modelCode === code);
  if (!perm) return false;

  return Array.isArray(perm.operations) && perm.operations.includes(op);
}

module.exports = {
  VALID_OPERATIONS,
  createApiToken,
  listApiTokens,
  getApiTokenById,
  updateApiToken,
  deleteApiToken,
  authenticateApiToken,
  tokenAllowsOperation,
};
