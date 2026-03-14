#!/usr/bin/env node

/**
 * Direct CLI - Main entry point
 * Connects directly to MongoDB and executes operations using backend models
 */

require("dotenv").config(
  process.env.MODE ? { path: `.env.${process.env.MODE}` } : {},
);

const { ScriptBase } = require("../helpers/scriptBase");
const { parseArgs, formatOutput, colorize } = require("./direct/cli-utils");
const { printHelp } = require("./direct/help");

// Import all resource handlers
const {
  agents,
  settings,
  users,
  jsonConfigs,
} = require("./direct/resources-core");
const {
  blogPosts,
  pages,
  assets,
  forms,
  i18n,
  markdowns,
} = require("./direct/resources-cms");
const {
  orgs,
  rbacRoles,
  rbacGroups,
  invites,
  orgMembers,
} = require("./direct/resources-org-rbac");
const {
  crons,
  errors,
  scripts,
  workflows,
  healthChecks,
} = require("./direct/resources-system");
const {
  notifications,
  cache,
  auditLogs,
  consoleLogs,
  activityLogs,
  emailLogs,
  waitingList,
} = require("./direct/resources-logs");
const {
  telegram,
  webhooks,
  stripeItems,
  stripeEvents,
  externalDbs,
} = require("./direct/resources-integrations");
const {
  demos,
  experiments,
  experimentAssignments,
  rateLimits,
  demoProjects,
  demoSteps,
  blogAutomationLocks,
  blogAutomationRuns,
  cronExecutions,
  workflowExecutions,
  scriptRuns,
} = require("./direct/resources-execution");
const {
  pageCollections,
  blockDefinitions,
  contextBlocks,
  uiComponents,
  headlessModels,
  headlessTokens,
} = require("./direct/resources-cms-advanced");
const {
  healthIncidents,
  healthAttempts,
  errorAggregates,
  metricBuckets,
  virtualEjsFiles,
  virtualEjsGroups,
} = require("./direct/resources-health");
const {
  dbStats,
  dbIndexes,
  dbCleanup,
  batchDelete,
  batchUpdate,
  collectionCount,
  collectionSchema,
  exportCollection,
  findDuplicates,
  removeDuplicates,
  validateRefs,
  repairRefs,
  addIndex,
  dropIndex,
  reindex,
  compact,
  validateCollection,
  renameCollection,
  listCollections,
  createCollection,
  dropCollection,
} = require("./direct/db-utils");
const {
  dbInfo,
  dbUsers,
  slowQueries,
  enableProfiling,
  disableProfiling,
} = require("./direct/db-admin");
const {
  userPermissions,
  grantRole,
  revokeRole,
  groupMembers,
  addToGroup,
  removeFromGroup,
} = require("./direct/rbac-advanced");
const {
  agentStats,
  agentSessions,
  clearAgentSessions,
} = require("./direct/agent-utils");
const {
  migrationStatus,
  addTimestamps,
  dataDigest,
} = require("./direct/migration");
const {
  agentMessages,
  actionEvents,
  experimentEvents,
  experimentMetricBuckets,
  fileEntries,
  i18nLocales,
  proxyEntries,
  rateLimitMetricBuckets,
  rbacGrants,
  rbacGroupRoles,
  rbacUserRoles,
  uiComponentProjects,
  uiComponentProjectComponents,
  virtualEjsFileVersions,
  virtualEjsGroupChanges,
  healthCheckRuns,
  consoleEntries,
} = require("./direct/resources-additional");
const {
  collectionStats,
  topCollections,
  emptyCollections,
  findLargeDocuments,
  analyzeFieldTypes,
  findNullFields,
  fillNullFields,
  removeField,
  renameField,
  convertFieldTypes,
  sampleDocuments,
  distinctValues,
  fieldCardinality,
} = require("./direct/db-advanced");
const {
  seedUsers,
  seedSettings,
  seedAgents,
  clearAllData,
  importJson,
  exportJson,
  exportAllCollections,
  countByField,
  findOrphanedDocuments,
  deleteOrphanedDocuments,
  generateTestData,
} = require("./direct/data-seeding");

// Build handlers registry
const handlers = {
  agents,
  settings,
  users,
  "json-configs": jsonConfigs,
  "blog-posts": blogPosts,
  pages,
  assets,
  forms,
  i18n,
  markdowns,
  orgs,
  "rbac-roles": rbacRoles,
  "rbac-groups": rbacGroups,
  invites,
  "org-members": orgMembers,
  crons,
  errors,
  scripts,
  workflows,
  "health-checks": healthChecks,
  notifications,
  cache,
  "audit-logs": auditLogs,
  "console-logs": consoleLogs,
  "activity-logs": activityLogs,
  "email-logs": emailLogs,
  "waiting-list": waitingList,
  telegram,
  webhooks,
  "stripe-items": stripeItems,
  "stripe-events": stripeEvents,
  "external-dbs": externalDbs,
  demos,
  experiments,
  "experiment-assignments": experimentAssignments,
  "rate-limits": rateLimits,
  "demo-projects": demoProjects,
  "demo-steps": demoSteps,
  "blog-automation-locks": blogAutomationLocks,
  "blog-automation-runs": blogAutomationRuns,
  "cron-executions": cronExecutions,
  "workflow-executions": workflowExecutions,
  "script-runs": scriptRuns,
  "page-collections": pageCollections,
  "block-definitions": blockDefinitions,
  "context-blocks": contextBlocks,
  "ui-components": uiComponents,
  "headless-models": headlessModels,
  "headless-tokens": headlessTokens,
  "health-incidents": healthIncidents,
  "health-attempts": healthAttempts,
  "error-aggregates": errorAggregates,
  "metric-buckets": metricBuckets,
  "virtual-ejs-files": virtualEjsFiles,
  "virtual-ejs-groups": virtualEjsGroups,
  "db-stats": dbStats,
  "db-indexes": dbIndexes,
  "db-cleanup": dbCleanup,
  "batch-delete": batchDelete,
  "batch-update": batchUpdate,
  "collection-count": collectionCount,
  "collection-schema": collectionSchema,
  "export-collection": exportCollection,
  "find-duplicates": findDuplicates,
  "remove-duplicates": removeDuplicates,
  "validate-refs": validateRefs,
  "repair-refs": repairRefs,
  "add-index": addIndex,
  "drop-index": dropIndex,
  reindex,
  compact,
  "validate-collection": validateCollection,
  "rename-collection": renameCollection,
  "list-collections": listCollections,
  "create-collection": createCollection,
  "drop-collection": dropCollection,
  "db-info": dbInfo,
  "db-users": dbUsers,
  "slow-queries": slowQueries,
  "enable-profiling": enableProfiling,
  "disable-profiling": disableProfiling,
  "user-permissions": userPermissions,
  "grant-role": grantRole,
  "revoke-role": revokeRole,
  "group-members": groupMembers,
  "add-to-group": addToGroup,
  "remove-from-group": removeFromGroup,
  "agent-stats": agentStats,
  "agent-sessions": agentSessions,
  "clear-agent-sessions": clearAgentSessions,
  "migration-status": migrationStatus,
  "add-timestamps": addTimestamps,
  "data-digest": dataDigest,
  // Additional resources
  "agent-messages": agentMessages,
  "action-events": actionEvents,
  "experiment-events": experimentEvents,
  "experiment-metric-buckets": experimentMetricBuckets,
  "file-entries": fileEntries,
  "i18n-locales": i18nLocales,
  "proxy-entries": proxyEntries,
  "rate-limit-metric-buckets": rateLimitMetricBuckets,
  "rbac-grants": rbacGrants,
  "rbac-group-roles": rbacGroupRoles,
  "rbac-user-roles": rbacUserRoles,
  "ui-component-projects": uiComponentProjects,
  "ui-component-project-components": uiComponentProjectComponents,
  "virtual-ejs-file-versions": virtualEjsFileVersions,
  "virtual-ejs-group-changes": virtualEjsGroupChanges,
  "health-check-runs": healthCheckRuns,
  "console-entries": consoleEntries,
  // DB Advanced
  "collection-stats": collectionStats,
  "top-collections": topCollections,
  "empty-collections": emptyCollections,
  "find-large-documents": findLargeDocuments,
  "analyze-field-types": analyzeFieldTypes,
  "find-null-fields": findNullFields,
  "fill-null-fields": fillNullFields,
  "remove-field": removeField,
  "rename-field": renameField,
  "convert-field-types": convertFieldTypes,
  "sample-documents": sampleDocuments,
  "distinct-values": distinctValues,
  "field-cardinality": fieldCardinality,
  // Data seeding
  "seed-users": seedUsers,
  "seed-settings": seedSettings,
  "seed-agents": seedAgents,
  "clear-all-data": clearAllData,
  "import-json": importJson,
  "export-json": exportJson,
  "export-all-collections": exportAllCollections,
  "count-by-field": countByField,
  "find-orphaned-documents": findOrphanedDocuments,
  "delete-orphaned-documents": deleteOrphanedDocuments,
  "generate-test-data": generateTestData,
};

class DirectCLI extends ScriptBase {
  constructor(options) {
    super({ name: "DirectCLI", autoDisconnect: true, timeout: 30000 }); // 30s timeout for CLI
    this.cliOptions = options;
  }

  async run() {
    // Faster connection handling for CLI
    const mongoose = require("mongoose");
    const mongooseHelper = require("../helpers/mongooseHelper").mongooseHelper;

    try {
      console.log("[DirectCLI] Connecting to MongoDB...");

      // Load all models to register schemas (with error handling)
      const modelFiles = [
        "User",
        "Agent",
        "AgentMessage",
        "GlobalSetting",
        "JsonConfig",
        "BlogPost",
        "Page",
        "Asset",
        "FormSubmission",
        "I18nEntry",
        "I18nLocale",
        "Markdown",
        "Organization",
        "OrganizationMember",
        "CronJob",
        "ErrorAggregate",
        "ScriptDefinition",
        "Workflow",
        "HealthCheck",
        "Notification",
        "CacheEntry",
        "AuditEvent",
        "ConsoleLog",
        "ActivityLog",
        "EmailLog",
        "WaitingList",
        "TelegramBot",
        "Webhook",
        "StripeCatalogItem",
        "StripeWebhookEvent",
        "ExternalDbConnection",
        "Experiment",
        "ExperimentAssignment",
        "ExperimentEvent",
        "ExperimentMetricBucket",
        "SuperDemo",
        "SuperDemoProject",
        "SuperDemoStep",
        "BlogAutomationLock",
        "BlogAutomationRun",
        "CronExecution",
        "WorkflowExecution",
        "ScriptRun",
        "PageCollection",
        "BlockDefinition",
        "ContextBlockDefinition",
        "UiComponent",
        "HeadlessModelDefinition",
        "HeadlessApiToken",
        "HealthIncident",
        "HealthAutoHealAttempt",
        "RateLimitMetricBucket",
        "VirtualEjsFile",
        "VirtualEjsFileVersion",
        "VirtualEjsGroupChange",
        "ActionEvent",
        "FileEntry",
        "ProxyEntry",
        "RateLimitCounter",
        "RbacGrant",
        "RbacGroup",
        "RbacGroupMember",
        "RbacGroupRole",
        "RbacRole",
        "RbacUserRole",
        "Invite",
        "UiComponentProject",
        "UiComponentProjectComponent",
        "ConsoleEntry",
        "HealthCheckRun",
      ];

      for (const model of modelFiles) {
        try {
          require(`../models/${model}`);
        } catch (e) {
          // Skip missing models
        }
      }

      // Override connection options for CLI (faster timeouts)
      mongooseHelper.connectionOptions = {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 2,
        bufferCommands: false,
        retryWrites: true,
        retryReads: true,
        socketTimeoutMS: 30000,
        connectTimeoutMS: 10000,
      };

      // Connect with timeout
      const connectPromise = mongooseHelper.connect();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("MongoDB connection timeout (10s)")),
          10000,
        );
      });

      await Promise.race([connectPromise, timeoutPromise]);

      console.log("[DirectCLI] ✅ Connected");

      const context = {
        mongoose,
        models: mongoose.models,
        connection: mongoose.connection,
        db: mongoose.connection.db,
        script: { name: "DirectCLI", startTime: Date.now() },
      };

      console.log(
        `[DirectCLI] Executing ${options.resource} ${options.command || ""}...`,
      );
      const result = await this.execute(context);

      // Quick disconnect
      await mongoose.disconnect();
      console.log("[DirectCLI] ✅ Disconnected");

      return result;
    } catch (error) {
      console.error(colorize("red", "\n✗ Error:"), error.message);
      console.error(
        colorize("gray", "Hint: Check MONGODB_URI and MongoDB connectivity"),
      );

      try {
        await mongoose.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }

      process.exit(1);
    }
  }

  async execute(context) {
    const options = this.cliOptions;
    const { quiet, output } = options;

    if (!handlers[options.resource]) {
      const available = Object.keys(handlers).join(", ");
      throw new Error(
        `Unknown resource: ${options.resource}\nAvailable: ${available}`,
      );
    }

    const result = await handlers[options.resource].execute(options, context);

    if (quiet) {
      console.log(formatOutput(result, output));
    } else {
      console.log(
        colorize("green", `\n✓ ${options.resource} ${options.command}`),
      );
      console.log();
      console.log(formatOutput(result, output));
    }

    return result;
  }
}

// Main execution
const args = process.argv.slice(2);
const options = parseArgs(args);

if (options.help || (!options.resource && !options.command)) {
  printHelp();
  process.exit(0);
}

if (!options.resource) {
  console.error(colorize("red", "Error: Resource is required"));
  printHelp();
  process.exit(1);
}

// Resources that don't require a command (they have a single operation)
const noCommandResources = [
  "db-stats",
  "db-info",
  "db-users",
  "data-digest",
  "migration-status",
  "empty-collections",
  "top-collections",
];

if (!options.command && !noCommandResources.includes(options.resource)) {
  console.error(colorize("red", "Error: Command is required"));
  printHelp();
  process.exit(1);
}

// Auto-set command for no-command resources
if (!options.command && noCommandResources.includes(options.resource)) {
  options.command = "execute";
}

const cli = new DirectCLI(options);
cli.run().catch((err) => {
  if (!options.quiet) {
    console.error(colorize("red", "\n✗ Error:"), err.message);
    if (options.verbose) console.error(err);
  } else {
    console.error(colorize("red", `Error: ${err.message}`));
  }
  process.exit(1);
});
