const consoleOverride = require("./services/consoleOverride.service");
const { consoleManager } = require("./services/consoleManager.service");

// Initialize console override service early to capture all logs
// Avoid keeping timers/streams alive during Jest runs.
if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
  consoleOverride.init()
  
  // Initialize console manager after a short delay to ensure consoleOverride is fully set up
  setTimeout(() => {
    // Set module prefix for this middleware
    consoleManager.setModulePrefix('middleware');
    
    // Initialize console manager early to enable prefixing for all subsequent logs
    consoleManager.init();
    console.log("[Console Manager] Initialized - prefixing enabled");
  }, 20);
}

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const cors = require("cors");
const fs = require("fs");
const ejs = require("ejs");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const { adminSessionAuth } = require("./middleware/auth");
const { requireModuleAccess } = require("./middleware/rbac");
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

let errorCaptureInitialized = false;

/**
 * Check if console manager should be enabled based on environment variable and global settings
 * Priority: Environment Variable > Global Settings > Default (true)
 * @returns {Promise<boolean>} Whether console manager should be enabled
 */
async function isConsoleManagerEnabled() {
  // Environment variable takes highest priority
  const envEnabled = process.env.CONSOLE_MANAGER_ENABLED;
  if (envEnabled !== undefined) {
    const enabled = String(envEnabled).toLowerCase() !== 'false';
    console.log(`[Console Manager] Environment variable CONSOLE_MANAGER_ENABLED=${envEnabled}, ${enabled ? 'enabled' : 'disabled'}`);
    return enabled;
  }

  // Check global settings if environment variable not set
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
    return true; // Fallback to enabled on error
  }
}

/**
 * Creates and configures the SaaS backend middleware
 * @param {Object} options - Configuration options
 * @param {string} options.mongodbUri - MongoDB connection string
 * @param {string} options.corsOrigin - CORS origin(s)
 * @param {string} options.jwtSecret - JWT secret for authentication
 * @param {Object} options.dbConnection - Existing Mongoose connection
 * @param {boolean} options.skipBodyParser - Skip adding body parser middleware (default: false)
 * @param {Object} options.telegram - Telegram configuration
 * @param {boolean} options.telegram.enabled - Whether to enable Telegram bots (default: true)
 * @param {Object} options.cron - Cron scheduler configuration
 * @param {boolean} options.cron.enabled - Whether to enable cron scheduler (default: true)
 * @returns {express.Router} Configured Express router
 */
function createMiddleware(options = {}) {
  const router = express.Router();
  const adminPath = options.adminPath || "/admin";
  const pagesPrefix = options.pagesPrefix || "/";

  const bootstrapPluginsRuntime = async () => {
    try {
      const superbackend = globalThis.superbackend || globalThis.saasbackend || {};
      await pluginsService.bootstrap({
        context: {
          services: superbackend.services || {},
          helpers: superbackend.helpers || {},
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
    } catch (error) {
      console.error("Failed to bootstrap plugins runtime:", error);
    }
  };

  // Debug: Log received options
  console.log("[Middleware Debug] Received options:", {
    telegramEnabled: options.telegram?.enabled,
    cronEnabled: options.cron?.enabled
  });

  router.get(`${adminPath}/plugins-system`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-plugins-system.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

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

  // Restart-required behavior: we load settings once and keep the values in memory.
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

  // Expose adminPath, pagesPrefix and WS attachment helper
  router.adminPath = adminPath;
  router.pagesPrefix = pagesPrefix;
  router.attachWs = (server) => {
    const {
      attachTerminalWebsocketServer,
    } = require("./services/terminalsWs.service");
    attachTerminalWebsocketServer(server, { basePathPrefix: adminPath });

    const {
      attachExperimentsWebsocketServer,
    } = require("./services/experimentsWs.service");
    attachExperimentsWebsocketServer(server);
  };

  if (!errorCaptureInitialized) {
    errorCaptureInitialized = true;
    hookConsoleError();
    setupProcessHandlers();
  }

  // Console manager will be initialized after database connection

  // Database connection
  const mongoUri =
    options.mongodbUri ||
    options.dbConnection ||
    process.env.MONGODB_URI ||
    process.env.MONGO_URI;

  if (!mongoUri && mongoose.connection.readyState !== 1) {
    console.warn(
      "⚠️  Warning: No MongoDB connection provided to middleware. Set MONGODB_URI or MONGO_URI in environment or pass mongodbUri/dbConnection option.",
    );
  } else if (mongoUri && mongoose.connection.readyState !== 1) {
    const connectionOptions = options.mongooseOptions || {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
    };

const telegramService = require("./services/telegram.service");

    // Return a promise that resolves when connection is established
    const connectionPromise = mongoose
      .connect(mongoUri, connectionOptions)
      .then(async () => {
        console.log("✅ Middleware: Connected to MongoDB");
        
        // Start cron scheduler after DB connection (only if enabled)
        if (options.cron?.enabled !== false) {
          await cronScheduler.start();
          await healthChecksScheduler.start();
          await healthChecksBootstrap.bootstrap();
          await blogCronsBootstrap.bootstrap();
          await require("./services/experimentsCronsBootstrap.service").bootstrap();
        } else {
          console.log("🔍 Cron scheduler disabled - cron.enabled:", options.cron?.enabled);
        }
        
        // Initialize Telegram bots (check telegram config)
        const telegramEnabled = options.telegram?.enabled !== false;
        if (telegramEnabled) {
          await telegramService.init();
        } else {
          console.log("🔍 Telegram bots disabled - telegram.enabled:", options.telegram?.enabled);
        }

        await bootstrapPluginsRuntime();

        // Console manager is already initialized early in the middleware
        console.log("[Console Manager] MongoDB connection established");
        
        return true;
      })
      .catch((err) => {
        console.error("❌ Middleware: MongoDB connection error:", err);
        return false;
      });

    router.get(`${adminPath}/health-checks`, adminSessionAuth, (req, res) => {
      const templatePath = path.join(
        __dirname,
        "..",
        "views",
        "admin-health-checks.ejs",
      );
      fs.readFile(templatePath, "utf8", (err, template) => {
        if (err) {
          console.error("Error reading template:", err);
          return res.status(500).send("Error loading page");
        }
        try {
          const html = ejs.render(
            template,
            {
              baseUrl: req.baseUrl,
              adminPath,
            },
            {
              filename: templatePath,
            },
          );
          res.send(html);
        } catch (renderErr) {
          console.error("Error rendering template:", renderErr);
          res.status(500).send("Error rendering page");
        }
      });
    });

    router.get(`${adminPath}/console-manager`, adminSessionAuth, (req, res) => {
      const templatePath = path.join(
        __dirname,
        "..",
        "views",
        "admin-console-manager.ejs",
      );
      fs.readFile(templatePath, "utf8", (err, template) => {
        if (err) {
          console.error("Error reading template:", err);
          return res.status(500).send("Error loading page");
        }
        try {
          const html = ejs.render(
            template,
            {
              baseUrl: req.baseUrl,
              adminPath,
            },
            {
              filename: templatePath,
            },
          );
          res.send(html);
        } catch (renderErr) {
          console.error("Error rendering template:", renderErr);
          res.status(500).send("Error rendering page");
        }
      });
    });

    // Store the promise so it can be awaited if needed
    router.connectionPromise = connectionPromise;
  } else if (mongoose.connection.readyState === 1) {
    console.log("✅ Middleware: Using existing MongoDB connection");
    
    // Start cron scheduler for existing connection (only if enabled)
    if (options.cron?.enabled !== false) {
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
      console.log("🔍 Cron scheduler disabled - cron.enabled:", options.cron?.enabled, "(existing connection)");
    }
    
    // Initialize Telegram bots for existing connection (check telegram config)
    const telegramEnabled = options.telegram?.enabled !== false;
    if (telegramEnabled) {
      telegramService.init().catch(err => {
        console.error("Failed to initialize Telegram service (existing connection):", err);
      });
    } else {
      console.log("🔍 Telegram bots disabled - telegram.enabled:", options.telegram?.enabled, "(existing connection)");
    }

    bootstrapPluginsRuntime().catch((err) => {
      console.error("Failed to bootstrap plugins runtime (existing connection):", err);
    });
    
    // Initialize console manager AFTER database is already connected
    if (process.env.NODE_ENV !== "test" && !process.env.JEST_WORKER_ID) {
      isConsoleManagerEnabled().then(consoleManagerEnabled => {
        if (consoleManagerEnabled) {
          consoleManager.init();
          // Set module prefix after initialization
          consoleManager.setModulePrefix('middleware');
          console.log("[Console Manager] Initialized");
        } else {
          console.log("[Console Manager] Disabled - console methods not overridden");
        }
      }).catch(error => {
        console.error("[Console Manager] Error checking enabled status:", error);
        console.log("[Console Manager] Fallback to enabled due to error");
        consoleManager.init();
        // Set module prefix after initialization
        consoleManager.setModulePrefix('middleware');
        console.log("[Console Manager] Initialized (fallback)");
      });
    }
  }

  // CORS configuration
  const configureCORS = () => {
    const corsOrigin = options.corsOrigin || process.env.CORS_ORIGIN || "*";

    // If corsOrigin is *, allow all origins
    if (corsOrigin === "*") {
      return {
        origin: "*",
        credentials: true,
        optionsSuccessStatus: 200,
      };
    }

    // If corsOrigin contains comma, split into array
    if (corsOrigin.includes(",")) {
      const origins = corsOrigin.split(",").map((o) => o.trim());
      return {
        origin: origins,
        credentials: true,
        optionsSuccessStatus: 200,
      };
    }

    // Single origin
    return {
      origin: corsOrigin,
      credentials: true,
      optionsSuccessStatus: 200,
    };
  };

  const isCorsDisabled = options.corsOrigin === false || options.cors === false;

  if (!isCorsDisabled) {
    const corsOptions = configureCORS();

    console.log("🌐 Middleware CORS Configuration:", {
      origin: corsOptions.origin,
      credentials: corsOptions.credentials,
    });

    // Middleware
    router.use(cors(corsOptions));
  }

  // Stripe webhook needs raw body (support both routes)
  const webhookHandler =
    require("./controllers/billing.controller").handleWebhook;
  router.post(
    "/api/stripe-webhook",
    express.raw({ type: "application/json" }),
    webhookHandler,
  );
  router.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    webhookHandler,
  );

  router.use(
    "/proxy",
    express.raw({ type: "*/*", limit: "10mb" }),
    require("./routes/proxy.routes"),
  );

  // Regular JSON parsing for other routes (skip if parent app already handles it)
  if (!options.skipBodyParser) {
    router.use(express.json());
    router.use(express.urlencoded({ extended: true }));
  }

  // Session middleware for admin authentication
  const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'superbackend-session-secret-fallback',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax'
    },
    store: MongoStore.create({
      mongoUrl: options.mongodbUri || process.env.MONGODB_URI,
      collectionName: 'admin_sessions',
      ttl: 24 * 60 * 60 // 24 hours in seconds
    }),
    name: 'superbackend.admin.session'
  });

  router.use(sessionMiddleware);

  router.use(requestIdMiddleware);

  router.use("/api", rateLimiter.limit("globalApiLimiter"));

  // Serve public static files with /public prefix (for admin UI components)
  router.use("/public", express.static(path.join(__dirname, "..", "public")));

  // Serve public static files (e.g. /og/og-default.png)
  router.use(express.static(path.join(__dirname, "..", "public")));

  // Serve browser SDK bundles
  router.use(
    "/public/sdk",
    express.static(path.join(__dirname, "..", "public", "sdk")),
  );

  // Serve static files for admin views
  router.use(
    `${adminPath}/assets`,
    express.static(path.join(__dirname, "..", "public")),
  );

  // EJS locals: feature flags for server-rendered pages
  router.use(createFeatureFlagsEjsMiddleware());

  // Public File Manager SPA (gated by global settings; restart required)
  router.get("*", (req, res, next) => {
    try {
      if (!fileManagerPublicConfig.enabled) return next();

      const basePath = fileManagerPublicConfig.basePath || "/files";
      const reqPath = req.path;
      const matches =
        reqPath === basePath ||
        reqPath === `${basePath}/` ||
        reqPath.startsWith(`${basePath}/`);

      if (!matches) return next();
      if (req.method !== "GET") return next();

      const templatePath = path.join(
        __dirname,
        "..",
        "views",
        "file-manager.ejs",
      );
      fs.readFile(templatePath, "utf8", (err, template) => {
        if (err) {
          console.error("Error reading template:", err);
          return res.status(500).send("Error loading page");
        }
        try {
          const html = ejs.render(
            template,
            {
              baseUrl: req.baseUrl,
              fileManagerBasePath: basePath,
            },
            { filename: templatePath },
          );
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

  // API Routes
  router.use("/api/auth", require("./routes/auth.routes"));
  router.use("/api/billing", require("./routes/billing.routes"));
  router.use("/api/waiting-list", require("./routes/waitingList.routes"));
  router.use("/api/metrics", require("./routes/metrics.routes"));
  router.use("/api/forms", require("./routes/forms.routes"));
  router.use("/api/admin/forms", require("./routes/formsAdmin.routes"));
  router.use(
    "/api/admin/waiting-list",
    require("./routes/waitingListAdmin.routes"),
  );
  router.use("/api/admin/orgs", require("./routes/orgAdmin.routes"));
  router.use("/api/admin/users", requireModuleAccessWithIframe('users', 'read'), require("./routes/userAdmin.routes"));
  router.use("/api/admin/rbac", require("./routes/adminRbac.routes"));
  router.use(
    "/api/admin/notifications",
    require("./routes/notificationAdmin.routes"),
  );
  router.use("/api/admin/stripe", require("./routes/stripeAdmin.routes"));

  // Stats Routes
  const adminStatsController = require("./controllers/adminStats.controller");
  router.get(
    "/api/admin/stats/overview",
    adminSessionAuth,
    adminStatsController.getOverviewStats,
  );

  // Middleware to check if request is from authenticated parent iframe
function checkIframeAuth(req, res, next) {
  const referer = req.get('Referer');
  const origin = req.get('Origin');
  const adminPath = req.adminPath || '/admin';
  
  // Check for iframe token parameter (more reliable than referer)
  const iframeToken = req.query.iframe_token;
  if (iframeToken && iframeToken === 'authenticated') {
    req.isIframe = true;
    return next();
  }
  
  // Fallback to referer/origin check
  const isValidReferer = referer && referer.includes(adminPath);
  const isValidOrigin = origin && origin.includes(req.hostname);
  
  if (isValidReferer || isValidOrigin) {
    req.isIframe = true;
    return next();
  }
  
  // If not from iframe, require normal authentication
  return adminSessionAuth(req, res, next);
}

// Combined middleware for iframe authentication + module access
function requireModuleAccessWithIframe(moduleId, action = 'read') {
  return async (req, res, next) => {
    try {
      // Check for iframe authentication first
      const referer = req.get('Referer');
      const origin = req.get('Origin');
      const adminPath = req.adminPath || '/admin';
      const iframeToken = req.query.iframe_token;
      
      const isValidIframe = (iframeToken && iframeToken === 'authenticated') ||
                          (referer && referer.includes(adminPath)) ||
                          (origin && origin.includes(req.hostname));
      
      if (isValidIframe) {
        req.isIframe = true;
        // For iframe requests, we'll allow access but mark it as iframe context
        return next();
      }
      
      // Check for basic auth superadmin bypass
      if (isBasicAuthSuperAdmin(req)) {
        return next();
      }

      // Get user ID from session
      const userId = req.session?.authData?.userId;
      if (!userId) {
        return res.redirect(`${req.adminPath || '/admin'}/login`);
      }

      // Check RBAC permission for specific module
      const hasAccess = await rbacService.checkRight({
        userId,
        orgId: null, // Global admin permissions
        right: `admin_panel__${moduleId}:${action}`
      });

      if (!hasAccess.allowed) {
        // For API routes, return JSON error
        if (req.path.startsWith('/api/')) {
          return res.status(403).json({
            error: 'Access denied',
            reason: hasAccess.reason,
            required: `admin_panel__${moduleId}:${action}`,
            moduleId,
            action
          });
        }

        // For page routes, render 403 page
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
      } else {
        return res.status(500).send('Access check failed');
      }
    }
  };
}

router.get(`${adminPath}/stats/dashboard-home`, checkIframeAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-dashboard-home.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          { 
            baseUrl: req.baseUrl, 
            adminPath,
            isIframe: req.isIframe || false
          },
          { filename: templatePath },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/experiments`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-experiments.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/rbac`, requireModuleAccessWithIframe('rbac', 'read'), (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-rbac.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
            isIframe: req.isIframe || false
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/terminals`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-terminals.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/scripts`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-scripts.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/crons`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-crons.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/cache`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-cache.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

    router.get(`${adminPath}/db-browser`, adminSessionAuth, (req, res) => {
      const templatePath = path.join(
        __dirname,
        "..",
        "views",
        "admin-db-browser.ejs",
      );
      fs.readFile(templatePath, "utf8", (err, template) => {
        if (err) {
          console.error("Error reading template:", err);
          return res.status(500).send("Error loading page");
        }
        try {
          const html = ejs.render(
            template,
            {
              baseUrl: req.baseUrl,
              adminPath,
            },
            {
              filename: templatePath,
            },
          );
          res.send(html);
        } catch (renderErr) {
          console.error("Error rendering template:", renderErr);
          res.status(500).send("Error rendering page");
        }
      });
    });

    router.get(`${adminPath}/telegram`, adminSessionAuth, (req, res) => {
      const templatePath = path.join(
        __dirname,
        "..",
        "views",
        "admin-telegram.ejs",
      );
      fs.readFile(templatePath, "utf8", (err, template) => {
        if (err) {
          console.error("Error reading template:", err);
          return res.status(500).send("Error loading page");
        }
        try {
          const html = ejs.render(
            template,
            {
              baseUrl: req.baseUrl,
              adminPath,
            },
            {
              filename: templatePath,
            },
          );
          res.send(html);
        } catch (renderErr) {
          console.error("Error rendering template:", renderErr);
          res.status(500).send("Error rendering page");
        }
      });
    });

    router.get(`${adminPath}/agents`, adminSessionAuth, (req, res) => {
      const templatePath = path.join(
        __dirname,
        "..",
        "views",
        "admin-agents.ejs",
      );
      fs.readFile(templatePath, "utf8", (err, template) => {
        if (err) {
          console.error("Error reading template:", err);
          return res.status(500).send("Error loading page");
        }
        try {
          const html = ejs.render(
            template,
            {
              baseUrl: req.baseUrl,
              adminPath,
            },
            {
              filename: templatePath,
            },
          );
          res.send(html);
        } catch (renderErr) {
          console.error("Error rendering template:", renderErr);
          res.status(500).send("Error rendering page");
        }
      });
    });

  router.use("/api/admin", require("./routes/admin.routes"));
  router.use("/api/admin/settings", require("./routes/globalSettings.routes"));
  router.use(
    "/api/admin/feature-flags",
    require("./routes/adminFeatureFlags.routes"),
  );
  router.use(
    "/api/admin/json-configs",
    require("./routes/adminJsonConfigs.routes"),
  );
  router.use(
    "/api/admin/markdowns",
    require("./routes/adminMarkdowns.routes"),
  );
  router.use(
    "/api/admin/rate-limits",
    require("./routes/adminRateLimits.routes"),
  );
  router.use("/api/admin/proxy", require("./routes/adminProxy.routes"));
  router.use(
    "/api/admin/seo-config",
    require("./routes/adminSeoConfig.routes"),
  );
  router.use("/api/admin/i18n", require("./routes/adminI18n.routes"));
  router.use("/api/admin/headless", require("./routes/adminHeadless.routes"));
  router.use("/api/admin/scripts", require("./routes/adminScripts.routes"));
  router.use("/api/admin/crons", require("./routes/adminCrons.routes"));
  router.use(
    "/api/admin/health-checks",
    require("./routes/adminHealthChecks.routes"),
  );
  router.use("/api/admin/cache", require("./routes/adminCache.routes"));
  router.use(
    "/api/admin/console-manager",
    require("./routes/adminConsoleManager.routes"),
  );
  router.use(
    "/api/admin/db-browser",
    require("./routes/adminDbBrowser.routes"),
  );
  router.use("/api/admin/terminals", require("./routes/adminTerminals.routes"));
  router.use("/api/admin/experiments", require("./routes/adminExperiments.routes"));
  router.use("/api/admin/assets", require("./routes/adminAssets.routes"));
  router.use(
    "/api/admin/upload-namespaces",
    require("./routes/adminUploadNamespaces.routes"),
  );
  router.use(
    "/api/admin/ui-components",
    require("./routes/adminUiComponents.routes"),
  );
  router.use("/api/admin/migration", require("./routes/adminMigration.routes"));
  router.use(
    "/api/admin/errors",
    adminSessionAuth,
    require("./routes/adminErrors.routes"),
  );
  router.use(
    "/api/admin/audit",
    requireModuleAccessWithIframe('audit', 'read'),
    require("./routes/adminAudit.routes"),
  );
  router.use("/api/admin/llm", require("./routes/adminLlm.routes"));
  router.use("/api/admin/telegram", require("./routes/adminTelegram.routes"));
  router.use("/api/admin/agents", require("./routes/adminAgents.routes"));
  router.use("/api/admin/registries", require("./routes/adminRegistry.routes"));
  router.use("/api/admin/plugins", require("./routes/adminPlugins.routes"));
  router.use(
    "/api/admin/ejs-virtual",
    require("./routes/adminEjsVirtual.routes"),
  );
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
  router.use("/api/rbac", require("./routes/rbac.routes"));
  router.use("/registry", require("./routes/registry.routes"));
  router.use("/api/file-manager", require("./routes/fileManager.routes"));
  router.use("/api/experiments", require("./routes/experiments.routes"));

  // Public blog APIs (headless)
  router.use("/api", require("./routes/blogPublic.routes"));

  // Internal blog endpoints (used by HTTP CronJobs)
  router.use("/api/internal", require("./routes/blogInternal.routes"));

  // Internal experiments endpoints (used by HTTP CronJobs)
  router.use("/api/internal", require("./routes/internalExperiments.routes"));

  // Public health checks status (gated by global setting)
  router.use(
    "/api/health-checks",
    require("./routes/healthChecksPublic.routes"),
  );

  // Public assets proxy
  router.use("/public/assets", require("./routes/publicAssets.routes"));

  // Admin login routes (no authentication required)
  router.use(`${adminPath}`, (req, res, next) => {
    req.adminPath = adminPath;
    next();
  }, require("./routes/adminLogin.routes"));

  // Admin dashboard (redirect to login if not authenticated)
  router.get(adminPath, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-dashboard.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          { baseUrl: req.baseUrl, adminPath },
          { filename: templatePath },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin technical API test page (protected by session auth)
  router.get(`${adminPath}/api/test`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-test.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/migration`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-migration.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin LLM/AI page (protected by basic auth)
  router.get(`${adminPath}/admin-llm`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-llm.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/workflows/:id`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-workflows.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          { baseUrl: req.baseUrl, adminPath },
          { filename: templatePath },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/pages`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-pages.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/blog`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-blog.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          { baseUrl: req.baseUrl, adminPath },
          { filename: templatePath },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/blog-automation`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-blog-automation.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          { baseUrl: req.baseUrl, adminPath },
          { filename: templatePath },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/blog/new`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-blog-edit.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          { baseUrl: req.baseUrl, adminPath, postId: "", mode: "new" },
          { filename: templatePath },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/blog/edit/:id`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-blog-edit.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
            postId: String(req.params.id || ""),
            mode: "edit",
          },
          { filename: templatePath },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/file-manager`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-file-manager.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/ejs-virtual`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-ejs-virtual.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/seo-config`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-seo-config.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/i18n`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-i18n.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          { baseUrl: req.baseUrl, adminPath },
          { filename: templatePath },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/i18n/locales`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-i18n-locales.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          { baseUrl: req.baseUrl, adminPath },
          { filename: templatePath },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin forms page (protected by basic auth)
  router.get(`${adminPath}/forms`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-forms.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin feature flags page (protected by basic auth)
  router.get(`${adminPath}/feature-flags`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-feature-flags.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin headless CMS page (protected by basic auth)
  router.get(`${adminPath}/headless`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-headless.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin UI Components page (protected by basic auth)
  router.get(`${adminPath}/ui-components`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-ui-components.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl || '',
            adminPath,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin JSON configs page (protected by basic auth)
  router.get(`${adminPath}/json-configs`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-json-configs.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin markdowns page (protected by basic auth)
  router.get(`${adminPath}/markdowns`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-markdowns.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin assets page (protected by basic auth)
  router.get(`${adminPath}/assets`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-assets.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin waiting list page (protected by basic auth)
  router.get(`${adminPath}/waiting-list`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-waiting-list.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(template, {
          baseUrl: req.baseUrl,
          adminPath,
          endpointRegistry,
        });
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin organizations page (protected by basic auth)
  router.get(`${adminPath}/organizations`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-organizations.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin users page (protected by session auth)
  router.get(`${adminPath}/users`, requireModuleAccessWithIframe('users', 'read'), (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-users.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl, 
            adminPath,
            isIframe: req.isIframe || false
          },
          { filename: templatePath },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin notifications page (protected by session auth)
  router.get(`${adminPath}/notifications`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-notifications.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin Stripe pricing page (protected by session auth)
  router.get(`${adminPath}/stripe-pricing`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-stripe-pricing.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          {
            baseUrl: req.baseUrl,
            adminPath,
            endpointRegistry,
          },
          {
            filename: templatePath,
          },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin metrics page (protected by session auth)
  router.get(`${adminPath}/metrics`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-metrics.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(template, {
          baseUrl: req.baseUrl,
          adminPath,
          endpointRegistry,
        });
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/rate-limiter`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-rate-limiter.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(template, {
          baseUrl: req.baseUrl,
          adminPath,
        });
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  // Admin global settings page (protected by session auth) - render manually
  router.get(`${adminPath}/global-settings`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-global-settings.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(template, { baseUrl: req.baseUrl, adminPath });
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/errors`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-errors.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          { baseUrl: req.baseUrl, adminPath },
          { filename: templatePath },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/audit`, requireModuleAccessWithIframe('audit', 'read'), (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-audit.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          { 
            baseUrl: req.baseUrl, 
            adminPath,
            isIframe: req.isIframe || false
          },
          { filename: templatePath },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/coolify-deploy`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-coolify-deploy.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          { baseUrl: req.baseUrl, adminPath },
          { filename: templatePath },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/proxy`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(__dirname, "..", "views", "admin-proxy.ejs");
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          { baseUrl: req.baseUrl, adminPath },
          { filename: templatePath },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get(`${adminPath}/webhooks`, adminSessionAuth, (req, res) => {
    const templatePath = path.join(
      __dirname,
      "..",
      "views",
      "admin-webhooks.ejs",
    );
    fs.readFile(templatePath, "utf8", (err, template) => {
      if (err) {
        console.error("Error reading template:", err);
        return res.status(500).send("Error loading page");
      }
      try {
        const html = ejs.render(
          template,
          { baseUrl: req.baseUrl, adminPath },
          { filename: templatePath },
        );
        res.send(html);
      } catch (renderErr) {
        console.error("Error rendering template:", renderErr);
        res.status(500).send("Error rendering page");
      }
    });
  });

  router.get("/health", rateLimiter.limit("healthRateLimiter"), (req, res) => {
    res.json({
      status: "ok",
      mode: "middleware",
      database:
        mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    });
  });

  router.use("/api/ejs-virtual", require("./routes/adminEjsVirtual.routes"));
  router.use("/api/webhooks", require("./routes/webhook.routes"));

  // Store pagesPrefix and adminPath on app for pages router
  router.use((req, res, next) => {
    if (!req.app.get("pagesPrefix")) {
      req.app.set("pagesPrefix", pagesPrefix);
    }
    if (!req.app.get("adminPath")) {
      req.app.set("adminPath", adminPath);
    }
    next();
  });

  // Public pages router (catch-all, must be last before error handler)
  router.use(require("./routes/pages.routes"));

  // Error handling middleware
  router.use(expressErrorMiddleware);

  return router;
}

module.exports = createMiddleware;
