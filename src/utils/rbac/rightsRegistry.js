const DEFAULT_RIGHTS = [
  'rbac:roles:read',
  'rbac:roles:write',
  'rbac:groups:read',
  'rbac:groups:write',
  'rbac:grants:read',
  'rbac:grants:write',
  'rbac:test',
  'file_manager:*',
  'file_manager:access',
  'file_manager:drives:read',
  'file_manager:files:read',
  'file_manager:files:upload',
  'file_manager:files:download',
  'file_manager:files:update',
  'file_manager:files:delete',
  'file_manager:files:share',
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
