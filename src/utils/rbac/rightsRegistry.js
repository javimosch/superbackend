const DEFAULT_RIGHTS = [
  'rbac:roles:read',
  'rbac:roles:write',
  'rbac:groups:read',
  'rbac:groups:write',
  'rbac:grants:read',
  'rbac:grants:write',
  'rbac:test',
  'backoffice:*',
  'backoffice:dashboard:access',
  '*',
];

function listRights() {
  return Array.from(new Set(DEFAULT_RIGHTS)).sort();
}

module.exports = {
  listRights,
};
