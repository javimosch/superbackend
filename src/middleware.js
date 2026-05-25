const consoleOverride = require("./services/consoleOverride.service");
const { consoleManager } = require("./services/consoleManager.service");

if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
  consoleOverride.init()

  setTimeout(() => {
    consoleManager.setModulePrefix('middleware');
    consoleManager.init();
    console.log("[Console Manager] Initialized - prefixing enabled");
  }, 20);
}

const express = require("express");
const path = require("path");
const mongoose = (globalThis.mongoose && globalThis.mongoose.connection && globalThis.mongoose.connection.readyState === 1)
  ? globalThis.mongoose
  : require("mongoose");
const cors = require("cors");
const fs = require("fs");
const ejs = require("ejs");
const session = require("express-session");
const { adminSessionAuth } = require("./middleware/auth");
const { requireModuleAccess, isBasicAuthSuperAdmin } = require("./middleware/rbac");
const endpointRegistry = require("./admin/endpointRegistry");
const {
  createFeatureFlagsEjsMiddleware,
} = require("./services/featureFlags.service");
const globalSettingsService = require("./services/globalSettings.service");
const cronScheduler = require("./services/cronScheduler.service");
const healthChecksScheduler = require("./services/healthChecksScheduler.service");
const healthChecksBootstrap = require("./services/healthChecksBootstrap.service");
const blogCronsBootstrap = require("./services/blogCronsBootstrap.service");
const {
  hookConsoleError,
  setupProcessHandlers,
  expressErrorMiddleware,
  requestIdMiddleware,
} = require("./middleware/errorCapture");
const rateLimiter = require("./services/rateLimiter.service");
const pluginsService = require("./services/plugins.service");
const telegramService = require("./services/telegram.service");
const { renderAdminPage } = require("./helpers/renderAdminPage");
const { createAdminPageRoutes, requireModuleAccessWithIframe } = require("./routes/adminPageRoutes");

let errorCaptureInitialized = false;

async function isConsoleManagerEnabled() {
  const envEnabled = process.env.CONSOLE_MANAGER_ENABLED;
  if (envEnabled !== undefined) {
    const enabled = String(envEnabled).toLowerCase() !== 'false';
    console.log(`[Console Manager] Environment variable CONSOLE_MANAGER_ENABLED=${envEnabled}, ${enabled ? 'enabled' : 'disabled'}`);
    return enabled;
  }
  try {
    const enabledRaw = await globalSettingsService.getSettingValue(
      "CONSOLE_MANAGER_ENABLED",
      "true"
    );
    const enabled = String(enabledRaw) === "true";
    console.log(`[Console Manager] Global setting CONSOLE_MANAGER_ENABLED=${enabledRaw}, ${enabled ? 'enabled' : 'disabled'}`);
    return enabled;
  } catch (error) {
    console.error("[Console Manager] Error loading global setting:", error);
    console.log("[Console Manager] Fallback to enabled due to error");
    return true;
  }
}

function createMiddleware(options = {}) {
  const router = express.Router();
  const adminPath = options.adminPath || "/admin";
  const pagesPrefix = options.pagesPrefix || "/";
  const isJest = Boolean(process.env.JEST_WORKER_ID);

  const bootstrapPluginsRuntime = async () => {
    try {
      const pluginRoots = Array.isArray(options.plugins?.extraRoots) ? options.plugins.extraRoots : [];

      if (options.plugins?.extraRoots) {
        for (const root of pluginRoots) {
          await pluginsService.loadAllPluginsFromFolder(root, { context: { app: router } });
        }
      }
      const superbackend = globalThis.superbackend || globalThis.saasbackend || {};
      await pluginsService.bootstrap({
        context: {
          services: superbackend.services || {},
          helpers: superbackend.helpers || {},
          app: router,
        },
      });
      const pluginServices = pluginsService.getExposedServices();
      const pluginHelpers = pluginsService.getExposedHelpers();
      if (superbackend.services && typeof superbackend.services === "object") {
        superbackend.services.pluginsRuntime = pluginServices;
      }
      if (superbackend.helpers && typeof superbackend.helpers === "object") {
        superbackend.helpers.pluginsRuntime = pluginHelpers;
      }

      if (options.plugins?.autoDiscover) {
        for (const root of pluginRoots) {
          try {
            await pluginsService.autoDiscoverPluginsFromPath(root, { context: { app: router } });
          } catch (e) {
            console.error('[Middleware] autoDiscoverPluginsFromPath failed:', e.message);
          }
        }
      }

      const pluginAssets = pluginsService.collectPluginAssets();

      router.use((req, res, next) => {
        res.resolvePluginView = (viewName) => {
          const viewPath = pluginAssets.views[viewName];
          return viewPath || null;
        };
        next();
      });

      for (const asset of pluginAssets.routes) {
        router.use(asset.prefix, asset.router);
        for (const alias of asset.aliases) {
          router.use(alias, (req, res, next) => {
            res.redirect(asset.prefix + req.path);
          });
        }
      }
      for (const staticAsset of pluginAssets.staticPaths) {
        router.use(`/plugin-static${staticAsset.prefix}`, express.static(staticAsset.path));
      }
    } catch (error) {
      console.error("Failed to bootstrap plugins runtime:", error);
    }
  };

  const normalizeBasePath = (value) => {
    const v = String(value || "").trim();
    if (!v) return "/files";
    return v.startsWith("/") ? v : `/${v}`;
  };

  const fileManagerPublicConfig = {
    enabled: false,
    basePath: "/files",
    loaded: false,
  };

  (async () => {
    try {
      const enabledRaw = await globalSettingsService.getSettingValue(
        "FILE_MANAGER_ENABLED",
        "false",
      );
      const basePathRaw = await globalSettingsService.getSettingValue(
        "FILE_MANAGER_BASE_PATH",
        "/files",
      );
      fileManagerPublicConfig.enabled = String(enabledRaw) === "true";
      fileManagerPublicConfig.basePath = normalizeBasePath(basePathRaw);
      fileManagerPublicConfig.loaded = true;
    } catch (error) {
      console.error("Error loading File Manager public config:", error);
      fileManagerPublicConfig.loaded = true;
    }
  })();

  router.adminPath = adminPath;
  router.pagesPrefix = pagesPrefix;
  router.attachWs = (server) => {
    const { attachTerminalWebsocketServer } = require("./services/terminalsWs.service");
    attachTerminalWebsocketServer(server, { basePathPrefix: adminPath });
    const { attachExperimentsWebsocketServer } = require("./services/experimentsWs.service");
    attachExperimentsWebsocketServer(server);
    const { attachSuperDemosWebsocketServer } = require("./services/superDemosWs.service");
    attachSuperDemosWebsocketServer(server);
  };

  if (!errorCaptureInitialized) {
    errorCaptureInitialized = true;
    hookConsoleError();
    setupProcessHandlers();
  }

  router.use((req, res, next) => {
    req.adminPath = req.baseUrl + adminPath;
    next();
  });

  console.log("[Middleware Debug] Received options:", {
    telegramEnabled: options.telegram?.enabled,
    cronEnabled: options.cron?.enabled
  });

  const mongoUri = options.mongodbUri || process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!mongoUri && mongoose.connection.readyState !== 1) {
    console.warn(
      "⚠️  Warning: No MongoDB connection provided to middleware. Set MONGODB_URI or MONGO_URI in environment or pass mongodbUri/dbConnection option.",
    );
  } else if (mongoUri && mongoose.connection.readyState !== 1) {
    const connectionOptions = options.mongooseOptions || {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    };

    const connectionPromise = mongoose
      .connect(mongoUri, connectionOptions)
      .then(async () => {
        console.log("✅ Middleware: Connected to MongoDB");

        if (!isJest && options.cron?.enabled !== false) {
          await cronScheduler.start();
          await healthChecksScheduler.start();
          await healthChecksBootstrap.bootstrap();
          await blogCronsBootstrap.bootstrap();
          await require("./services/experimentsCronsBootstrap.service").bootstrap();
        } else {
          console.log("🔍 Cron scheduler disabled - cron.enabled:", options.cron?.enabled, isJest ? '(jest)' : '');
        }

        const telegramEnabled = options.telegram?.enabled !== false;
        if (!isJest && telegramEnabled) {
          const telegramInitializer =
            (telegramService && typeof telegramService.initialize === "function"
              ? telegramService.initialize.bind(telegramService)
              : null) ||
            (telegramService && typeof telegramService.init === "function"
              ? telegramService.init.bind(telegramService)
              : null);

          if (telegramInitializer) {
            await telegramInitializer();
          } else {
            console.warn("⚠️ Telegram service has no initialize/init method; skipping startup");
          }
        } else {
          console.log("🔍 Telegram bots disabled - telegram.enabled:", options.telegram?.enabled);
        }

        if (!isJest) {
          await bootstrapPluginsRuntime();
        }

        console.log("[Console Manager] MongoDB connection established");
        return true;
      })
      .catch((err) => {
        console.error("❌ Middleware: MongoDB connection error:", err);
        return false;
      });

    router.connectionPromise = connectionPromise;
  } else if (mongoose.connection.readyState === 1) {
    console.log("✅ Middleware: Using existing MongoDB connection");

    if (!isJest && options.cron?.enabled !== false) {
      cronScheduler.start().catch((err) => {
        console.error("Failed to start cron scheduler:", err);
      });
      healthChecksScheduler.start().catch((err) => {
        console.error("Failed to start health checks scheduler:", err);
      });
      healthChecksBootstrap.bootstrap().catch((err) => {
        console.error("Failed to bootstrap health checks:", err);
      });
      blogCronsBootstrap.bootstrap().catch((err) => {
        console.error("Failed to bootstrap blog crons:", err);
      });
      require("./services/experimentsCronsBootstrap.service")
        .bootstrap()
        .catch((err) => {
          console.error("Failed to bootstrap experiments crons:", err);
        });
    } else {
      console.log("🔍 Cron scheduler disabled - cron.enabled:", options.cron?.enabled, "(existing connection)", isJest ? '(jest)' : '');
    }

    const telegramEnabled = options.telegram?.enabled !== false;
    if (!isJest && telegramEnabled) {
      const telegramInitializer =
        (telegramService && typeof telegramService.initialize === "function"
          ? telegramService.initialize.bind(telegramService)
          : null) ||
        (telegramService && typeof telegramService.init === "function"
          ? telegramService.init.bind(telegramService)
          : null);

      if (!telegramInitializer) {
        console.warn("⚠️ Telegram service has no initialize/init method; skipping startup (existing connection)");
      } else {
        telegramInitializer().catch(err => {
          console.error("Failed to initialize Telegram service (existing connection):", err);
        });
      }
    } else {
      console.log("🔍 Telegram bots disabled - telegram.enabled:", options.telegram?.enabled, "(existing connection)");
    }

    if (!isJest) {
      bootstrapPluginsRuntime().catch((err) => {
        console.error("Failed to bootstrap plugins runtime (existing connection):", err);
      });
    }

    if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
      isConsoleManagerEnabled().then(consoleManagerEnabled => {
        if (consoleManagerEnabled) {
          consoleManager.init();
          consoleManager.setModulePrefix('middleware');
          console.log("[Console Manager] Initialized");
        } else {
          console.log("[Console Manager] Disabled - console methods not overridden");
        }
      }).catch(error => {
        console.error("[Console Manager] Error checking enabled status:", error);
        console.log("[Console Manager] Fallback to enabled due to error");
        consoleManager.init();
        consoleManager.setModulePrefix('middleware');
        console.log("[Console Manager] Initialized (fallback)");
      });
    }
  }

  const configureCORS = () => {
    const corsOrigin = options.corsOrigin || process.env.CORS_ORIGIN || "*";
    if (corsOrigin === "*") {
      return { origin: "*", credentials: true, optionsSuccessStatus: 200 };
    }
    if (corsOrigin.includes(",")) {
      const origins = corsOrigin.split(",").map((o) => o.trim());
      return { origin: origins, credentials: true, optionsSuccessStatus: 200 };
    }
    return { origin: corsOrigin, credentials: true, optionsSuccessStatus: 200 };
  };

  const isCorsDisabled = options.corsOrigin === false || options.cors === false;
  if (!isCorsDisabled) {
    const corsOptions = configureCORS();
    console.log("🌐 Middleware CORS Configuration:", {
      origin: corsOptions.origin,
      credentials: corsOptions.credentials,
    });
    router.use(cors(corsOptions));
  }

  const webhookHandler = require("./controllers/billing.controller").handleWebhook;
  router.post("/api/stripe-webhook", express.raw({ type: "application/json" }), webhookHandler);
  router.post("/api/stripe/webhook", express.raw({ type: "application/json" }), webhookHandler);

  router.use("/proxy", express.raw({ type: "*/*", limit: "10mb" }), require("./routes/proxy.routes"));

  if (!options.skipBodyParser) {
    router.use(express.json());
    router.use(express.urlencoded({ extended: true }));
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.warn('[Middleware] WARNING: SESSION_SECRET not set. Using insecure fallback. Set SESSION_SECRET in environment for production.');
  }

  const sessionMiddleware = session({
    secret: sessionSecret || 'superbackend-session-secret-fallback',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    },
    name: 'superbackend.admin.session'
  });

  router.use(sessionMiddleware);

  router.use((req, res, next) => {
    res.locals.adminCredentials = {
      adminUsername: options.adminUsername || process.env.ADMIN_USERNAME,
      adminPassword: options.adminPassword || process.env.ADMIN_PASSWORD,
    };
    next();
  });

  router.use(requestIdMiddleware);
  router.use("/api", rateLimiter.limit("globalApiLimiter"));

  router.use("/public", express.static(path.join(__dirname, "..", "public")));
  router.use(express.static(path.join(__dirname, "..", "public")));
  router.use("/public/sdk", express.static(path.join(__dirname, "..", "public", "sdk")));
  router.use(`${adminPath}/assets`, express.static(path.join(__dirname, "..", "public")));

  router.use(createFeatureFlagsEjsMiddleware());

  router.get("*", (req, res, next) => {
    try {
      if (!fileManagerPublicConfig.enabled) return next();
      const basePath = fileManagerPublicConfig.basePath || "/files";
      const reqPath = req.path;
      const matches = reqPath === basePath || reqPath === `${basePath}/` || reqPath.startsWith(`${basePath}/`);
      if (!matches) return next();
      if (req.method !== "GET") return next();
      const templatePath = path.join(__dirname, "..", "views", "file-manager.ejs");
      fs.readFile(templatePath, "utf8", (err, template) => {
        if (err) {
          console.error("Error reading template:", err);
          return res.status(500).send("Error loading page");
        }
        try {
          const html = ejs.render(template, { baseUrl: req.baseUrl, fileManagerBasePath: basePath }, { filename: templatePath });
          res.send(html);
        } catch (renderErr) {
          console.error("Error rendering template:", renderErr);
          res.status(500).send("Error rendering page");
        }
      });
    } catch (error) {
      console.error("Error serving File Manager SPA:", error);
      next();
    }
  });

  router.use(require("./routes/sitemap.routes"));

  router.use("/api/auth", require("./routes/auth.routes"));
  router.use("/api/billing", require("./routes/billing.routes"));
  router.use("/api/waiting-list", require("./routes/waitingList.routes"));
  router.use("/api/metrics", require("./routes/metrics.routes"));
  router.use("/api/forms", require("./routes/forms.routes"));
  router.use("/api/admin/forms", require("./routes/formsAdmin.routes"));
  router.use("/api/admin/waiting-list", require("./routes/waitingListAdmin.routes"));
  router.use("/api/admin/orgs", require("./routes/orgAdmin.routes"));
  router.use("/api/admin/users", requireModuleAccessWithIframe('users', 'read'), require("./routes/userAdmin.routes"));
  router.use("/api/admin/rbac", require("./routes/adminRbac.routes"));
  router.use("/api/admin/notifications", require("./routes/notificationAdmin.routes"));
  router.use("/api/admin/stripe", require("./routes/stripeAdmin.routes"));

  const adminStatsController = require("./controllers/adminStats.controller");
  router.get("/api/admin/stats/overview", adminSessionAuth, adminStatsController.getOverviewStats);

  router.use("/api/admin", require("./routes/admin.routes"));
  router.use("/api/admin/settings", require("./routes/globalSettings.routes"));
  router.use("/api/admin/feature-flags", require("./routes/adminFeatureFlags.routes"));
  router.use("/api/admin/json-configs", require("./routes/adminJsonConfigs.routes"));
  router.use("/api/admin/markdowns", require("./routes/adminMarkdowns.routes"));
  router.use("/api/admin/rate-limits", require("./routes/adminRateLimits.routes"));
  router.use("/api/admin/proxy", require("./routes/adminProxy.routes"));
  router.use("/api/admin/seo-config", require("./routes/adminSeoConfig.routes"));
  router.use("/api/admin/i18n", require("./routes/adminI18n.routes"));
  router.use("/api/admin/headless", require("./routes/adminHeadless.routes"));
  router.use("/api/admin/scripts", require("./routes/adminScripts.routes"));
  router.use("/api/admin/crons", require("./routes/adminCrons.routes"));
  router.use("/api/admin/health-checks", require("./routes/adminHealthChecks.routes"));
  router.use("/api/admin/cache", require("./routes/adminCache.routes"));
  router.use("/api/admin/console-manager", require("./routes/adminConsoleManager.routes"));
  router.use("/api/admin/db-browser", require("./routes/adminDbBrowser.routes"));
  router.use("/api/admin/data-cleanup", require("./routes/adminDataCleanup.routes"));
  router.use("/api/admin/terminals", require("./routes/adminTerminals.routes"));
  router.use("/api/admin/experiments", require("./routes/adminExperiments.routes"));
  router.use("/api/admin/assets", require("./routes/adminAssets.routes"));
  router.use("/api/admin/upload-namespaces", require("./routes/adminUploadNamespaces.routes"));
  router.use("/api/admin/ui-components", require("./routes/adminUiComponents.routes"));
  router.use("/api/admin/superdemos", require("./routes/adminSuperDemos.routes"));
  router.use("/api/admin/migration", require("./routes/adminMigration.routes"));
  router.use("/api/admin/errors", adminSessionAuth, require("./routes/adminErrors.routes"));
  router.use("/api/admin/audit", requireModuleAccessWithIframe('audit', 'read'), require("./routes/adminAudit.routes"));
  router.use("/api/admin/llm", require("./routes/adminLlm.routes"));
  router.use("/api/admin/telegram", require("./routes/adminTelegram.routes"));
  router.use("/api/admin/agents", require("./routes/adminAgents.routes"));
  router.use("/api/admin/registries", require("./routes/adminRegistry.routes"));
  router.use("/api/admin/plugins", require("./routes/adminPlugins.routes"));
  router.use("/api/admin/page-redirects", require("./routes/adminPageRedirects.routes"));
  router.use("/api/admin/ejs-virtual", require("./routes/adminEjsVirtual.routes"));
  router.use("/api/admin/pages", require("./routes/adminPages.routes"));
  router.use("/api/admin", require("./routes/adminBlog.routes"));
  router.use("/api/admin", require("./routes/adminBlogAi.routes"));
  router.use("/api/admin", require("./routes/adminBlogAutomation.routes"));
  router.use("/api/admin/workflows", adminSessionAuth, require("./routes/workflows.routes"));
  router.use("/w", require("./routes/workflowWebhook.routes"));
  router.use("/api/webhooks", require("./routes/webhook.routes"));
  router.use("/api/settings", require("./routes/globalSettings.routes"));
  router.use("/api/feature-flags", require("./routes/featureFlags.routes"));
  router.use("/api/json-configs", require("./routes/jsonConfigs.routes"));
  router.use("/api/markdowns", require("./routes/markdowns.routes"));
  router.use("/api/assets", require("./routes/assets.routes"));
  router.use("/api/i18n", require("./routes/i18n.routes"));
  router.use("/api/headless", require("./routes/headless.routes"));
  router.use("/api", require("./routes/notifications.routes"));
  router.use("/api/user", require("./routes/user.routes"));
  router.use("/api/orgs", require("./routes/org.routes"));
  router.use("/api/invites", require("./routes/invite.routes"));
  router.use("/api/log", require("./routes/log.routes"));
  router.use("/api/error-tracking", require("./routes/errorTracking.routes"));
  router.use("/api/ui-components", require("./routes/uiComponentsPublic.routes"));
  router.use("/api/superdemos", require("./routes/superDemos.routes"));
  router.use("/api/rbac", require("./routes/rbac.routes"));
  router.use("/registry", require("./routes/registry.routes"));
  router.use("/api/file-manager", require("./routes/fileManager.routes"));
  router.use("/api/experiments", require("./routes/experiments.routes"));
  router.use("/api", require("./routes/blogPublic.routes"));
  router.use("/api/internal", require("./routes/blogInternal.routes"));
  router.use("/api/internal", require("./routes/internalExperiments.routes"));
  router.use("/api/health-checks", require("./routes/healthChecksPublic.routes"));
  router.use("/public/assets", require("./routes/publicAssets.routes"));

  router.use(`${adminPath}`, require("./routes/adminLogin.routes"));

  const adminPageRoutes = createAdminPageRoutes();
  router.use(adminPath, adminPageRoutes);

  router.get(adminPath, adminSessionAuth, async (req, res) => {
    let maxTabs = 5;
    try {
      if (process.env.ADMIN_MAX_TABS) {
        const envValue = parseInt(process.env.ADMIN_MAX_TABS, 10);
        if (!isNaN(envValue) && envValue > 0) {
          maxTabs = envValue;
        }
      } else {
        const settingValue = await globalSettingsService.getSettingValue("ADMIN_MAX_TABS", "5");
        const parsedValue = parseInt(settingValue, 10);
        if (!isNaN(parsedValue) && parsedValue > 0) {
          maxTabs = parsedValue;
        }
      }
    } catch (error) {
      console.error("Error fetching max tabs configuration:", error);
    }
    renderAdminPage(req, res, 'admin-dashboard.ejs', { maxTabs });
  });

  router.use("/api/ejs-virtual", require("./routes/adminEjsVirtual.routes"));
  router.use("/api/webhooks", require("./routes/webhook.routes"));

  router.use((req, res, next) => {
    if (!req.app.get("pagesPrefix")) {
      req.app.set("pagesPrefix", pagesPrefix);
    }
    if (!req.app.get("adminPath")) {
      req.app.set("adminPath", adminPath);
    }
    next();
  });

  router.use("/share/export", require("./routes/publicExport.routes"));
  router.use(require("./routes/pages.routes"));
  router.use(expressErrorMiddleware);

  return router;
}

module.exports = createMiddleware;
