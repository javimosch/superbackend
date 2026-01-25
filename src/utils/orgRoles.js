const globalSettingsService = require('../services/globalSettings.service');

const DEFAULT_ROLE_HIERARCHY = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

const CACHE_TTL_MS = 60_000;
let cached = null;

function parseRoleHierarchy(value) {
  if (!value) return null;

  let parsed;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    parsed = JSON.parse(trimmed);
  } else {
    parsed = value;
  }

  if (Array.isArray(parsed)) {
    const out = {};
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const key = String(entry.key || '').trim();
      const level = Number(entry.level);
      if (!key || !Number.isFinite(level)) continue;
      out[key] = level;
    }
    return Object.keys(out).length ? out : null;
  }

  if (parsed && typeof parsed === 'object') {
    const out = {};
    for (const [keyRaw, levelRaw] of Object.entries(parsed)) {
      const key = String(keyRaw || '').trim();
      const level = Number(levelRaw);
      if (!key || !Number.isFinite(level)) continue;
      out[key] = level;
    }
    return Object.keys(out).length ? out : null;
  }

  return null;
}

function normalizeRoleHierarchyOrDefault(input) {
  const roles = input || DEFAULT_ROLE_HIERARCHY;

  // Ensure owner/admin semantics remain sensible if they exist
  const normalized = { ...roles };

  // Ensure no negative/zero levels
  for (const [k, v] of Object.entries(normalized)) {
    const level = Number(v);
    if (!Number.isFinite(level) || level <= 0) {
      delete normalized[k];
    }
  }

  if (!Object.keys(normalized).length) {
    return { ...DEFAULT_ROLE_HIERARCHY };
  }

  return normalized;
}

function getDefaultRoleFromHierarchy(hierarchy) {
  const entries = Object.entries(hierarchy);
  if (!entries.length) return 'member';

  entries.sort((a, b) => a[1] - b[1]);
  return entries[0][0] || 'member';
}

async function loadRoleHierarchy() {
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  let raw = process.env.ORG_ROLES_JSON || null;

  if (!raw) {
    try {
      raw = await globalSettingsService.getSettingValue('ORG_ROLES_JSON', null);
    } catch (e) {
      raw = null;
    }
  }

  let hierarchy = null;
  try {
    hierarchy = normalizeRoleHierarchyOrDefault(parseRoleHierarchy(raw));
  } catch (e) {
    hierarchy = { ...DEFAULT_ROLE_HIERARCHY };
  }

  const allowedRoles = Object.keys(hierarchy);
  const defaultRole = getDefaultRoleFromHierarchy(hierarchy);

  const value = {
    hierarchy,
    allowedRoles,
    defaultRole,
  };

  cached = { value, timestamp: now };
  return value;
}

async function getOrgRoleHierarchy() {
  const { hierarchy } = await loadRoleHierarchy();
  return hierarchy;
}

async function getAllowedOrgRoles() {
  const { allowedRoles } = await loadRoleHierarchy();
  return allowedRoles;
}

async function getDefaultOrgRole() {
  const { defaultRole } = await loadRoleHierarchy();
  return defaultRole;
}

async function isValidOrgRole(role) {
  const r = String(role || '').trim();
  if (!r) return false;
  const { hierarchy } = await loadRoleHierarchy();
  return Boolean(hierarchy[r]);
}

async function getOrgRoleLevel(role) {
  const r = String(role || '').trim();
  if (!r) return 0;
  const { hierarchy } = await loadRoleHierarchy();
  return hierarchy[r] || 0;
}

async function isRoleAtLeast(role, requiredRole) {
  const level = await getOrgRoleLevel(role);
  const requiredLevel = await getOrgRoleLevel(requiredRole);
  return level >= requiredLevel;
}

async function isRoleHigherThan(role, otherRole) {
  const level = await getOrgRoleLevel(role);
  const otherLevel = await getOrgRoleLevel(otherRole);
  return level > otherLevel;
}

function clearOrgRolesCache() {
  cached = null;
}

module.exports = {
  getOrgRoleHierarchy,
  getAllowedOrgRoles,
  getDefaultOrgRole,
  isValidOrgRole,
  getOrgRoleLevel,
  isRoleAtLeast,
  isRoleHigherThan,
  clearOrgRolesCache,
};
