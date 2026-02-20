const DEFAULT_RIGHTS = [
  // Existing RBAC rights
  'rbac:roles:read',
  'rbac:roles:write',
  'rbac:groups:read',
  'rbac:groups:write',
  'rbac:grants:read',
  'rbac:grants:write',
  'rbac:test',
  
  // Existing experiment and file manager rights
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
  
  // Admin panel login rights
  'admin_panel__login',
  'admin_panel__dashboard',
  
  // Dashboard section
  'admin_panel__overview:read',
  
  // User Management section
  'admin_panel__users:read',
  'admin_panel__users:write',
  'admin_panel__organizations:read',
  'admin_panel__organizations:write',
  'admin_panel__rbac:read',
  'admin_panel__rbac:write',
  'admin_panel__notifications:read',
  'admin_panel__notifications:write',
  'admin_panel__waiting-list:read',
  'admin_panel__waiting-list:write',
  
  // Content & Config section
  'admin_panel__i18n:read',
  'admin_panel__i18n:write',
  'admin_panel__i18n-locales:read',
  'admin_panel__i18n-locales:write',
  'admin_panel__json-configs:read',
  'admin_panel__json-configs:write',
  'admin_panel__markdowns:read',
  'admin_panel__markdowns:write',
  'admin_panel__seo-config:read',
  'admin_panel__seo-config:write',
  'admin_panel__assets:read',
  'admin_panel__assets:write',
  'admin_panel__file-manager:read',
  'admin_panel__file-manager:write',
  'admin_panel__ui-components:read',
  'admin_panel__ui-components:write',
  'admin_panel__headless:read',
  'admin_panel__headless:write',
  'admin_panel__pages:read',
  'admin_panel__pages:write',
  'admin_panel__blog:read',
  'admin_panel__blog:write',
  
  // System & DevOps section
  'admin_panel__global-settings:read',
  'admin_panel__global-settings:write',
  'admin_panel__plugins-system:read',
  'admin_panel__plugins-system:write',
  'admin_panel__feature-flags:read',
  'admin_panel__feature-flags:write',
  'admin_panel__ejs-virtual:read',
  'admin_panel__ejs-virtual:write',
  'admin_panel__rate-limiter:read',
  'admin_panel__rate-limiter:write',
  'admin_panel__proxy:read',
  'admin_panel__proxy:write',
  'admin_panel__cache:read',
  'admin_panel__cache:write',
  'admin_panel__db-browser:read',
  'admin_panel__db-browser:write',
  'admin_panel__data-cleanup:read',
  'admin_panel__data-cleanup:write',
  'admin_panel__migration:read',
  'admin_panel__migration:write',
  'admin_panel__webhooks:read',
  'admin_panel__webhooks:write',
  'admin_panel__coolify-deploy:read',
  'admin_panel__coolify-deploy:write',
  
  // Monitoring & AI section
  'admin_panel__audit:read',
  'admin_panel__audit:write',
  'admin_panel__errors:read',
  'admin_panel__errors:write',
  'admin_panel__experiments:read',
  'admin_panel__experiments:write',
  'admin_panel__console-manager:read',
  'admin_panel__console-manager:write',
  'admin_panel__health-checks:read',
  'admin_panel__health-checks:write',
  'admin_panel__metrics:read',
  'admin_panel__metrics:write',
  'admin_panel__llm:read',
  'admin_panel__llm:write',
  
  // Billing & Forms section
  'admin_panel__stripe-pricing:read',
  'admin_panel__stripe-pricing:write',
  'admin_panel__forms:read',
  'admin_panel__forms:write',
  
  // Automation section
  'admin_panel__agents:read',
  'admin_panel__agents:write',
  'admin_panel__telegram:read',
  'admin_panel__telegram:write',
  'admin_panel__workflows:read',
  'admin_panel__workflows:write',
  'admin_panel__scripts:read',
  'admin_panel__scripts:write',
  'admin_panel__crons:read',
  'admin_panel__crons:write',
  'admin_panel__terminals:read',
  'admin_panel__terminals:write',
  
  // Section wildcards for easier role management
  'admin_panel__user-management:*',
  'admin_panel__content-config:*',
  'admin_panel__system-devops:*',
  'admin_panel__monitoring-ai:*',
  'admin_panel__billing-forms:*',
  'admin_panel__automation:*',
  
  // Superuser wildcard
  '*',
];

function listRights() {
  return Array.from(new Set(DEFAULT_RIGHTS)).sort();
}

module.exports = {
  listRights,
};
