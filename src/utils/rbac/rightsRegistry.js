const DEFAULT_RIGHTS = [
  'rbac:roles:read',
  'rbac:roles:write',
  'rbac:groups:read',
  'rbac:groups:write',
  'rbac:grants:read',
  'rbac:grants:write',
  'rbac:test',
  'experiments:*',
  'experiments:read',
  'experiments:events:write',
  'experiments:admin',
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
  'admin_panel__login',
  'admin_panel__dashboard',
  'admin_panel__users:read',
  'admin_panel__users:write',
  'admin_panel__rbac:read',
  'admin_panel__rbac:write',
  'admin_panel__organizations:read',
  'admin_panel__organizations:write',
  'admin_panel__notifications:read',
  'admin_panel__notifications:write',
  '*',
];

function listRights() {
  return Array.from(new Set(DEFAULT_RIGHTS)).sort();
}

module.exports = {
  listRights,
};
