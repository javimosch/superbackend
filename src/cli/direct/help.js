#!/usr/bin/env node

/**
 * Help text for the direct CLI
 */

const { colorize } = require('./cli-utils');

function printHelp() {
  console.log(`
${colorize("bold", "SuperBackend Direct CLI")}

${colorize("bold", "Usage:")}
  node src/cli/direct.js <resource> <command> [options]

${colorize("bold", "Resources & Commands:")}

  ${colorize("cyan", "agents")}           - Manage AI agents
    list, get, create, update, delete

  ${colorize("cyan", "settings")}         - Manage global settings
    list, get, create, update, delete

  ${colorize("cyan", "users")}            - Manage users
    list, get, create, update, delete, disable, enable

  ${colorize("cyan", "json-configs")}     - Manage JSON configs
    list, get, create, update, delete

  ${colorize("cyan", "blog-posts")}       - Manage blog posts
    list, get, create, update, delete, publish, unpublish

  ${colorize("cyan", "orgs")}             - Manage organizations
    list, get, create, update, delete

  ${colorize("cyan", "crons")}            - Manage cron jobs
    list, get, create, delete, enable, disable

  ${colorize("cyan", "errors")}           - Manage error logs
    list, get, delete, clear

  ${colorize("cyan", "scripts")}          - Manage script definitions
    list, get, create, delete

  ${colorize("cyan", "workflows")}        - Manage workflows
    list, get, create, delete, enable, disable

  ${colorize("cyan", "health-checks")}    - Manage health checks
    list, get, create, delete

  ${colorize("cyan", "pages")}            - Manage pages
    list, get, create, update, delete

  ${colorize("cyan", "assets")}           - Manage assets
    list, get, delete, clear

  ${colorize("cyan", "forms")}            - Manage form submissions
    list, get, delete, clear

  ${colorize("cyan", "i18n")}             - Manage i18n entries
    list, get, create, delete

  ${colorize("cyan", "notifications")}    - Manage notifications
    list, get, delete, clear

  ${colorize("cyan", "rbac-roles")}       - Manage RBAC roles
    list, get, create, delete

  ${colorize("cyan", "rbac-groups")}      - Manage RBAC groups
    list, get, create, delete

  ${colorize("cyan", "invites")}          - Manage invites
    list, get, create, delete, clear

  ${colorize("cyan", "waiting-list")}     - Manage waiting list
    list, delete, clear

  ${colorize("cyan", "cache")}            - Manage cache entries
    list, get, delete, clear

  ${colorize("cyan", "audit-logs")}       - Manage audit logs
    list, get, clear

  ${colorize("cyan", "db-stats")}         - Database statistics
  ${colorize("cyan", "db-indexes")}       - Database indexes
  ${colorize("cyan", "db-cleanup")}       - Database cleanup

  ${colorize("cyan", "experiments")}      - Manage experiments
  ${colorize("cyan", "experiment-assignments")} - Experiment assignments

  ${colorize("cyan", "telegram")}         - Manage Telegram bots
  ${colorize("cyan", "rate-limits")}      - Manage rate limits
  ${colorize("cyan", "console-logs")}     - Manage console logs
  ${colorize("cyan", "activity-logs")}    - Manage activity logs
  ${colorize("cyan", "email-logs")}       - Manage email logs
  ${colorize("cyan", "webhooks")}         - Manage webhooks

  ${colorize("cyan", "stripe-items")}     - Stripe catalog items
  ${colorize("cyan", "stripe-events")}    - Stripe webhook events

  ${colorize("cyan", "demo-projects")}    - Demo projects
  ${colorize("cyan", "demo-steps")}       - Demo steps

  ${colorize("cyan", "external-dbs")}     - External DB connections
  ${colorize("cyan", "org-members")}      - Organization members

  ${colorize("cyan", "page-collections")} - Page collections
  ${colorize("cyan", "block-definitions")} - Block definitions
  ${colorize("cyan", "context-blocks")}   - Context blocks
  ${colorize("cyan", "ui-components")}    - UI components
  ${colorize("cyan", "headless-models")}  - Headless models
  ${colorize("cyan", "headless-tokens")}  - Headless API tokens

  ${colorize("cyan", "blog-automation-locks")} - Blog automation locks
  ${colorize("cyan", "blog-automation-runs")} - Blog automation runs

  ${colorize("cyan", "cron-executions")}  - Cron execution history
  ${colorize("cyan", "workflow-executions")} - Workflow executions
  ${colorize("cyan", "script-runs")}      - Script execution history

  ${colorize("cyan", "health-incidents")} - Health incidents
  ${colorize("cyan", "health-attempts")}  - Health auto-heal attempts

  ${colorize("cyan", "error-aggregates")} - Error aggregates
  ${colorize("cyan", "metric-buckets")}   - Metric buckets

  ${colorize("cyan", "virtual-ejs-files")} - Virtual EJS files
  ${colorize("cyan", "virtual-ejs-groups")} - Virtual EJS groups
  ${colorize("cyan", "markdowns")}        - Manage markdowns

  ${colorize("cyan", "batch-delete")}     - Batch delete documents
  ${colorize("cyan", "batch-update")}     - Batch update documents
  ${colorize("cyan", "collection-count")} - Count documents
  ${colorize("cyan", "collection-schema")} - Show collection schema
  ${colorize("cyan", "export-collection")} - Export collection to JSON

  ${colorize("cyan", "find-duplicates")}    - Find duplicate documents
  ${colorize("cyan", "remove-duplicates")}  - Remove duplicate documents
  ${colorize("cyan", "validate-refs")}      - Validate references
  ${colorize("cyan", "repair-refs")}        - Repair broken references

  ${colorize("cyan", "add-index")}          - Add index to collection
  ${colorize("cyan", "drop-index")}         - Drop index from collection
  ${colorize("cyan", "reindex")}            - Rebuild collection indexes
  ${colorize("cyan", "compact")}            - Compact collection
  ${colorize("cyan", "validate-collection")} - Validate collection integrity
  ${colorize("cyan", "rename-collection")}  - Rename collection
  ${colorize("cyan", "list-collections")}   - List all collections
  ${colorize("cyan", "create-collection")}  - Create new collection
  ${colorize("cyan", "drop-collection")}    - Drop collection

  ${colorize("cyan", "db-info")}            - Database server info
  ${colorize("cyan", "db-users")}           - Database users
  ${colorize("cyan", "slow-queries")}       - Find slow queries
  ${colorize("cyan", "enable-profiling")}   - Enable query profiling
  ${colorize("cyan", "disable-profiling")}  - Disable query profiling

  ${colorize("cyan", "user-permissions")}   - Show user permissions
  ${colorize("cyan", "grant-role")}         - Grant role to user
  ${colorize("cyan", "revoke-role")}        - Revoke role from user
  ${colorize("cyan", "group-members")}      - Show group members
  ${colorize("cyan", "add-to-group")}       - Add user to group
  ${colorize("cyan", "remove-from-group")}  - Remove user from group

  ${colorize("cyan", "agent-stats")}        - Agent statistics
  ${colorize("cyan", "agent-sessions")}     - List agent sessions
  ${colorize("cyan", "clear-agent-sessions")} - Clear old sessions

  ${colorize("cyan", "migration-status")}   - Migration status check
  ${colorize("cyan", "add-timestamps")}     - Add timestamps to docs
  ${colorize("cyan", "data-digest")}        - Database digest report

${colorize("bold", "Options:")}
  --name NAME           Resource name
  --model MODEL         AI model name (for agents)
  --key KEY             Setting key / Collection name / User ID
  --value VALUE         Value (context-dependent)
  --description DESC    Description / Additional parameter
  --email EMAIL         User email
  --password PASSWORD   User password
  --role ROLE           User role
  --alias ALIAS         JSON config alias
  --json JSON           JSON config data
  --output FORMAT       Output: json, text, table (default: json)
  --quiet               Only output data
  --verbose             Show additional details
  -h, --help            Show this help

${colorize("bold", "Environment Variables:")}
  MONGODB_URI         MongoDB connection string
  MODE                Environment mode (loads .env.MODE)
`);
}

module.exports = { printHelp };
