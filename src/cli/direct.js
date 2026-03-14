#!/usr/bin/env node

/**
 * Direct CLI - Main entry point
 * Connects directly to MongoDB and executes operations using backend models
 */

require('dotenv').config(process.env.MODE ? { path: `.env.${process.env.MODE}` } : {});

const { ScriptBase } = require('../helpers/scriptBase');
const { parseArgs, formatOutput, colorize } = require('./direct/cli-utils');
const { printHelp } = require('./direct/help');

// Import all resource handlers
const { agents, settings, users, jsonConfigs } = require('./direct/resources-core');
const { blogPosts, pages, assets, forms, i18n, markdowns } = require('./direct/resources-cms');
const { orgs, rbacRoles, rbacGroups, invites, orgMembers } = require('./direct/resources-org-rbac');
const { crons, errors, scripts, workflows, healthChecks } = require('./direct/resources-system');
const { notifications, cache, auditLogs, consoleLogs, activityLogs, emailLogs, waitingList } = require('./direct/resources-logs');
const { telegram, webhooks, stripeItems, stripeEvents, externalDbs } = require('./direct/resources-integrations');
const { experiments, experimentAssignments, rateLimits, demoProjects, demoSteps, blogAutomationLocks, blogAutomationRuns, cronExecutions, workflowExecutions, scriptRuns } = require('./direct/resources-execution');
const { pageCollections, blockDefinitions, contextBlocks, uiComponents, headlessModels, headlessTokens } = require('./direct/resources-cms-advanced');
const { healthIncidents, healthAttempts, errorAggregates, metricBuckets, virtualEjsFiles, virtualEjsGroups } = require('./direct/resources-health');
const {
  dbStats, dbIndexes, dbCleanup, batchDelete, batchUpdate, collectionCount, collectionSchema, exportCollection,
  findDuplicates, removeDuplicates, validateRefs, repairRefs, addIndex, dropIndex, reindex, compact,
  validateCollection, renameCollection, listCollections, createCollection, dropCollection,
} = require('./direct/db-utils');
const { dbInfo, dbUsers, slowQueries, enableProfiling, disableProfiling } = require('./direct/db-admin');
const { userPermissions, grantRole, revokeRole, groupMembers, addToGroup, removeFromGroup } = require('./direct/rbac-advanced');
const { agentStats, agentSessions, clearAgentSessions } = require('./direct/agent-utils');
const { migrationStatus, addTimestamps, dataDigest } = require('./direct/migration');

// Build handlers registry
const handlers = {
  agents, settings, users, 'json-configs': jsonConfigs,
  'blog-posts': blogPosts, pages, assets, forms, i18n, markdowns,
  orgs, 'rbac-roles': rbacRoles, 'rbac-groups': rbacGroups, invites, 'org-members': orgMembers,
  crons, errors, scripts, workflows, 'health-checks': healthChecks,
  notifications, cache, 'audit-logs': auditLogs, 'console-logs': consoleLogs, 'activity-logs': activityLogs, 'email-logs': emailLogs, 'waiting-list': waitingList,
  telegram, webhooks, 'stripe-items': stripeItems, 'stripe-events': stripeEvents, 'external-dbs': externalDbs,
  experiments, 'experiment-assignments': experimentAssignments, 'rate-limits': rateLimits,
  'demo-projects': demoProjects, 'demo-steps': demoSteps,
  'blog-automation-locks': blogAutomationLocks, 'blog-automation-runs': blogAutomationRuns,
  'cron-executions': cronExecutions, 'workflow-executions': workflowExecutions, 'script-runs': scriptRuns,
  'page-collections': pageCollections, 'block-definitions': blockDefinitions, 'context-blocks': contextBlocks,
  'ui-components': uiComponents, 'headless-models': headlessModels, 'headless-tokens': headlessTokens,
  'health-incidents': healthIncidents, 'health-attempts': healthAttempts,
  'error-aggregates': errorAggregates, 'metric-buckets': metricBuckets,
  'virtual-ejs-files': virtualEjsFiles, 'virtual-ejs-groups': virtualEjsGroups,
  'db-stats': dbStats, 'db-indexes': dbIndexes, 'db-cleanup': dbCleanup,
  'batch-delete': batchDelete, 'batch-update': batchUpdate,
  'collection-count': collectionCount, 'collection-schema': collectionSchema, 'export-collection': exportCollection,
  'find-duplicates': findDuplicates, 'remove-duplicates': removeDuplicates,
  'validate-refs': validateRefs, 'repair-refs': repairRefs,
  'add-index': addIndex, 'drop-index': dropIndex, reindex, compact,
  'validate-collection': validateCollection, 'rename-collection': renameCollection,
  'list-collections': listCollections, 'create-collection': createCollection, 'drop-collection': dropCollection,
  'db-info': dbInfo, 'db-users': dbUsers, 'slow-queries': slowQueries,
  'enable-profiling': enableProfiling, 'disable-profiling': disableProfiling,
  'user-permissions': userPermissions, 'grant-role': grantRole, 'revoke-role': revokeRole,
  'group-members': groupMembers, 'add-to-group': addToGroup, 'remove-from-group': removeFromGroup,
  'agent-stats': agentStats, 'agent-sessions': agentSessions, 'clear-agent-sessions': clearAgentSessions,
  'migration-status': migrationStatus, 'add-timestamps': addTimestamps, 'data-digest': dataDigest,
};

class DirectCLI extends ScriptBase {
  constructor(options) {
    super({ name: 'DirectCLI', autoDisconnect: true, timeout: 60000 });
    this.cliOptions = options;
  }

  async execute(context) {
    const options = this.cliOptions;
    const { quiet, output } = options;

    if (!handlers[options.resource]) {
      const available = Object.keys(handlers).join(', ');
      throw new Error(`Unknown resource: ${options.resource}\nAvailable: ${available}`);
    }

    const result = await handlers[options.resource].execute(options, context);

    if (quiet) {
      console.log(formatOutput(result, output));
    } else {
      console.log(colorize('green', `\n✓ ${options.resource} ${options.command}`));
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
  console.error(colorize('red', 'Error: Resource is required'));
  printHelp();
  process.exit(1);
}

if (!options.command) {
  console.error(colorize('red', 'Error: Command is required'));
  printHelp();
  process.exit(1);
}

const cli = new DirectCLI(options);
cli.run().catch(err => {
  if (!options.quiet) {
    console.error(colorize('red', '\n✗ Error:'), err.message);
    if (options.verbose) console.error(err);
  } else {
    console.error(colorize('red', `Error: ${err.message}`));
  }
  process.exit(1);
});
