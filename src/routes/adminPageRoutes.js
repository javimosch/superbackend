const express = require("express");
const { adminSessionAuth } = require("../middleware/auth");
const { requireModuleAccess, isBasicAuthSuperAdmin } = require("../middleware/rbac");
const rbacService = require("../services/rbac.service");
const { adminPageHandler } = require("../helpers/renderAdminPage");

function checkIframeAuth(req, res, next) {
  const referer = req.get('Referer');
  const origin = req.get('Origin');
  const adminPath = req.adminPath || '/admin';
  const iframeToken = req.query.iframe_token;
  if (iframeToken && iframeToken === 'authenticated') {
    req.isIframe = true;
    return next();
  }
  const isValidReferer = referer && referer.includes(adminPath);
  const isValidOrigin = origin && origin.includes(req.hostname);
  if (isValidReferer || isValidOrigin) {
    req.isIframe = true;
    return next();
  }
  return adminSessionAuth(req, res, next);
}

function requireModuleAccessWithIframe(moduleId, action) {
  return async (req, res, next) => {
    try {
      const referer = req.get('Referer');
      const origin = req.get('Origin');
      const adminPath = req.adminPath || '/admin';
      const iframeToken = req.query.iframe_token;
      const isValidIframe = (iframeToken && iframeToken === 'authenticated') ||
        (referer && referer.includes(adminPath)) ||
        (origin && origin.includes(req.hostname));
      if (isValidIframe) {
        req.isIframe = true;
        return next();
      }
      if (isBasicAuthSuperAdmin(req)) {
        return next();
      }
      const userId = req.session?.authData?.userId;
      if (!userId) {
        return res.redirect(`${req.adminPath || '/admin'}/login`);
      }
      const hasAccess = await rbacService.checkRight({
        userId,
        orgId: null,
        right: `admin_panel__${moduleId}:${action}`
      });
      if (!hasAccess.allowed) {
        if (req.path.startsWith('/api/')) {
          return res.status(403).json({
            error: 'Access denied',
            reason: hasAccess.reason,
            required: `admin_panel__${moduleId}:${action}`,
            moduleId,
            action
          });
        }
        return res.status(403).render('admin-403', {
          moduleId,
          action,
          required: `admin_panel__${moduleId}:${action}`,
          reason: hasAccess.reason,
          user: req.session.authData,
          adminPath: req.adminPath || '/admin'
        });
      }
      next();
    } catch (error) {
      console.error('Module access check error:', error);
      if (req.path.startsWith('/api/')) {
        return res.status(500).json({ error: 'Access check failed' });
      }
      return res.status(500).send('Access check failed');
    }
  };
}

function createAdminPageRoutes() {
  const router = express.Router();

  router.get('/plugins-system', requireModuleAccessWithIframe('plugins', 'read'), adminPageHandler('admin-plugins-system.ejs'));

  router.get('/health-checks', requireModuleAccessWithIframe('health-checks', 'read'), adminPageHandler('admin-health-checks.ejs'));

  router.get('/data-cleanup', requireModuleAccessWithIframe('data-cleanup', 'read'), adminPageHandler('admin-data-cleanup.ejs'));

  router.get('/console-manager', requireModuleAccessWithIframe('console-manager', 'read'), adminPageHandler('admin-console-manager.ejs'));

  router.get('/stats/dashboard-home', checkIframeAuth, adminPageHandler('admin-dashboard-home.ejs'));

  router.get('/experiments', requireModuleAccessWithIframe('experiments', 'read'), adminPageHandler('admin-experiments.ejs'));

  router.get('/rbac', requireModuleAccessWithIframe('rbac', 'read'), adminPageHandler('admin-rbac.ejs'));

  router.get('/terminals', requireModuleAccessWithIframe('terminals', 'read'), (req, res) => {
    const { renderAdminPage } = require("../helpers/renderAdminPage");
    renderAdminPage(req, res, 'admin-terminals.ejs', {
      endpointRegistry: require("../admin/endpointRegistry"),
      serverPort: process.env.PORT || 3000
    });
  });

  router.get('/scripts', requireModuleAccessWithIframe('scripts', 'read'), adminPageHandler('admin-scripts.ejs', () => ({
    endpointRegistry: require("../admin/endpointRegistry")
  })));

  router.get('/crons', requireModuleAccessWithIframe('crons', 'read'), adminPageHandler('admin-crons.ejs'));

  router.get('/cache', requireModuleAccessWithIframe('cache', 'read'), adminPageHandler('admin-cache.ejs'));

  router.get('/db-browser', requireModuleAccessWithIframe('db-browser', 'read'), adminPageHandler('admin-db-browser.ejs'));

  router.get('/telegram', requireModuleAccessWithIframe('telegram', 'read'), adminPageHandler('admin-telegram.ejs'));

  router.get('/agents', requireModuleAccessWithIframe('agents', 'read'), adminPageHandler('admin-agents.ejs'));

  router.get('/api/test', adminSessionAuth, (req, res) => {
    const { renderAdminPage } = require("../helpers/renderAdminPage");
    renderAdminPage(req, res, 'admin-test.ejs', {
      endpointRegistry: require("../admin/endpointRegistry")
    });
  });

  router.get('/migration', requireModuleAccessWithIframe('migration', 'read'), adminPageHandler('admin-migration.ejs'));

  router.get('/admin-llm', requireModuleAccessWithIframe('admin-llm', 'read'), adminPageHandler('admin-llm.ejs'));

  router.get('/workflows/:id', adminSessionAuth, adminPageHandler('admin-workflows.ejs'));

  router.get('/pages', requireModuleAccessWithIframe('pages', 'read'), adminPageHandler('admin-pages.ejs'));

  router.get('/blog', requireModuleAccessWithIframe('blog', 'read'), adminPageHandler('admin-blog.ejs'));

  router.get('/blog-automation', requireModuleAccessWithIframe('blog-automation', 'read'), adminPageHandler('admin-blog-automation.ejs'));

  router.get('/blog/new', requireModuleAccessWithIframe('blog', 'read'), (req, res) => {
    const { renderAdminPage } = require("../helpers/renderAdminPage");
    renderAdminPage(req, res, 'admin-blog-edit.ejs', { postId: "", mode: "new" });
  });

  router.get('/blog/edit/:id', requireModuleAccessWithIframe('blog', 'read'), (req, res) => {
    const { renderAdminPage } = require("../helpers/renderAdminPage");
    renderAdminPage(req, res, 'admin-blog-edit.ejs', { postId: String(req.params.id || ""), mode: "edit" });
  });

  router.get('/file-manager', requireModuleAccessWithIframe('file-manager', 'read'), adminPageHandler('admin-file-manager.ejs'));

  router.get('/ejs-virtual', requireModuleAccessWithIframe('ejs-virtual', 'read'), adminPageHandler('admin-ejs-virtual.ejs'));

  router.get('/seo-config', requireModuleAccessWithIframe('seo-config', 'read'), adminPageHandler('admin-seo-config.ejs', () => ({
    endpointRegistry: require("../admin/endpointRegistry")
  })));

  router.get('/i18n', requireModuleAccessWithIframe('i18n', 'read'), adminPageHandler('admin-i18n.ejs'));

  router.get('/i18n/locales', requireModuleAccessWithIframe('i18n', 'read'), adminPageHandler('admin-i18n-locales.ejs'));

  router.get('/forms', requireModuleAccessWithIframe('forms', 'read'), adminPageHandler('admin-forms.ejs', () => ({
    endpointRegistry: require("../admin/endpointRegistry")
  })));

  router.get('/feature-flags', requireModuleAccessWithIframe('feature-flags', 'read'), adminPageHandler('admin-feature-flags.ejs', () => ({
    endpointRegistry: require("../admin/endpointRegistry")
  })));

  router.get('/headless', requireModuleAccessWithIframe('headless', 'read'), adminPageHandler('admin-headless.ejs', () => ({
    endpointRegistry: require("../admin/endpointRegistry")
  })));

  router.get('/ui-components', requireModuleAccessWithIframe('ui-components', 'read'), adminPageHandler('admin-ui-components.ejs', () => ({
    endpointRegistry: require("../admin/endpointRegistry")
  })));

  router.get('/superdemos', requireModuleAccessWithIframe('superdemos', 'read'), adminPageHandler('admin-superdemos.ejs', () => ({
    endpointRegistry: require("../admin/endpointRegistry")
  })));

  router.get('/json-configs', requireModuleAccessWithIframe('json-configs', 'read'), adminPageHandler('admin-json-configs.ejs', () => ({
    endpointRegistry: require("../admin/endpointRegistry")
  })));

  router.get('/markdowns', requireModuleAccessWithIframe('markdowns', 'read'), adminPageHandler('admin-markdowns.ejs', () => ({
    endpointRegistry: require("../admin/endpointRegistry")
  })));

  router.get('/assets', requireModuleAccessWithIframe('assets', 'read'), adminPageHandler('admin-assets.ejs', () => ({
    endpointRegistry: require("../admin/endpointRegistry")
  })));

  router.get('/waiting-list', requireModuleAccessWithIframe('waiting-list', 'read'), adminPageHandler('admin-waiting-list.ejs', () => ({
    endpointRegistry: require("../admin/endpointRegistry")
  })));

  router.get('/organizations', requireModuleAccessWithIframe('organizations', 'read'), adminPageHandler('admin-organizations.ejs', () => ({
    endpointRegistry: require("../admin/endpointRegistry")
  })));

  router.get('/users', requireModuleAccessWithIframe('users', 'read'), adminPageHandler('admin-users.ejs'));

  router.get('/notifications', requireModuleAccessWithIframe('notifications', 'read'), adminPageHandler('admin-notifications.ejs', () => ({
    endpointRegistry: require("../admin/endpointRegistry")
  })));

  router.get('/stripe-pricing', adminSessionAuth, adminPageHandler('admin-stripe-pricing.ejs', () => ({
    endpointRegistry: require("../admin/endpointRegistry")
  })));

  router.get('/metrics', adminSessionAuth, adminPageHandler('admin-metrics.ejs', () => ({
    endpointRegistry: require("../admin/endpointRegistry")
  })));

  router.get('/rate-limiter', adminSessionAuth, adminPageHandler('admin-rate-limiter.ejs'));

  router.get('/global-settings', adminSessionAuth, adminPageHandler('admin-global-settings.ejs'));

  router.get('/errors', adminSessionAuth, adminPageHandler('admin-errors.ejs'));

  router.get('/audit', requireModuleAccessWithIframe('audit', 'read'), adminPageHandler('admin-audit.ejs'));

  router.get('/coolify-deploy', adminSessionAuth, adminPageHandler('admin-coolify-deploy.ejs'));

  router.get('/proxy', adminSessionAuth, adminPageHandler('admin-proxy.ejs'));

  router.get('/webhooks', adminSessionAuth, adminPageHandler('admin-webhooks.ejs'));

  return router;
}

module.exports = { createAdminPageRoutes, requireModuleAccessWithIframe, checkIframeAuth };
