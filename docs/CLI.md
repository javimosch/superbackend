# SuperBackend CLI Tools

This package includes several CLI tools for interacting with your SuperBackend instance.

## Quick Reference

| Command | Description | Auth |
|---------|-------------|------|
| `api` | HTTP API client (remote access) | JWT, Basic, Session |
| `direct` | Direct MongoDB access (local admin) | None (DB connection) |
| `agent-chat` | Interactive AI agent TUI | None (DB connection) |
| `agent-list` | List AI agents | None (DB connection) |

### `direct` Resources

| Resource | Description | Commands |
|----------|-------------|----------|
| `agents` | AI agents | list, get, create, update, delete |
| `settings` | Global settings | list, get, create, update, delete |
| `users` | Users | list, get, create, update, delete, disable, enable |
| `json-configs` | JSON configs | list, get, create, update, delete |
| `blog-posts` | Blog posts | list, get, create, update, delete, publish, unpublish |
| `orgs` | Organizations | list, get, create, update, delete |
| `crons` | Cron jobs | list, get, create, delete, enable, disable |
| `errors` | Error logs | list, get, delete, clear |
| `scripts` | Script definitions | list, get, create, delete |
| `workflows` | Workflows | list, get, create, delete, enable, disable |
| `health-checks` | Health checks | list, get, create, delete |
| `pages` | Pages | list, get, create, update, delete |
| `assets` | Assets | list, get, delete, clear |
| `forms` | Form submissions | list, get, delete, clear |
| `i18n` | i18n entries | list, get, create, delete |
| `notifications` | Notifications | list, get, delete, clear |
| `rbac-roles` | RBAC roles | list, get, create, delete |
| `rbac-groups` | RBAC groups | list, get, create, delete |
| `invites` | Invites | list, get, create, delete, clear |
| `waiting-list` | Waiting list | list, delete, clear |
| `cache` | Cache entries | list, get, delete, clear |
| `audit-logs` | Audit logs | list, get, clear |
| `db-stats` | Database stats | (show stats) |
| `db-indexes` | Database indexes | (list indexes) |
| `db-cleanup` | Database cleanup | (cleanup old docs) |
| `experiments` | Experiments | list, get, create, delete |
| `experiment-assignments` | Experiment assignments | list, get, clear |
| `telegram` | Telegram bots | list, get, create, delete, enable, disable |
| `rate-limits` | Rate limit counters | list, get, delete, clear |
| `console-logs` | Console logs | list, get, clear |
| `activity-logs` | Activity logs | list, get, clear |
| `email-logs` | Email logs | list, get, clear |
| `webhooks` | Webhooks | list, get, create, delete, enable, disable |
| `stripe-items` | Stripe catalog items | list, get, clear |
| `stripe-events` | Stripe webhook events | list, get, clear |
| `demo-projects` | Demo projects | list, get, create, delete |
| `demo-steps` | Demo steps | list, get, delete, clear |
| `external-dbs` | External DB connections | list, get, create, delete |
| `org-members` | Organization members | list, delete |
| `page-collections` | Page collections | list, get, create, delete |
| `block-definitions` | Block definitions | list, get, delete |
| `context-blocks` | Context blocks | list, get, delete |
| `ui-components` | UI components | list, get, delete |
| `headless-models` | Headless models | list, get, create, delete |
| `headless-tokens` | Headless API tokens | list, delete, clear |
| `blog-automation-locks` | Blog automation locks | list, clear |
| `blog-automation-runs` | Blog automation runs | list, get, clear |
| `cron-executions` | Cron execution history | list, clear |
| `workflow-executions` | Workflow executions | list, get, clear |
| `script-runs` | Script execution history | list, get, clear |
| `health-incidents` | Health incidents | list, clear |
| `health-attempts` | Health auto-heal attempts | list, clear |
| `error-aggregates` | Error aggregates | list, clear |
| `metric-buckets` | Metric buckets | list, clear |
| `virtual-ejs-files` | Virtual EJS files | list, get, delete, clear |
| `virtual-ejs-groups` | Virtual EJS groups | list, delete |
| `markdowns` | Markdowns | list, get, create, delete |
| `batch-delete` | Batch delete | (delete by IDs) |
| `batch-update` | Batch update | (update with JSON) |
| `collection-count` | Document counts | (count docs) |
| `collection-schema` | Collection schema | (show schema) |
| `export-collection` | Export collection | (export to JSON) |
| `find-duplicates` | Find duplicates | (find by field) |
| `remove-duplicates` | Remove duplicates | (remove by field) |
| `validate-refs` | Validate references | (check ref integrity) |
| `repair-refs` | Repair references | (fix broken refs) |
| `add-index` | Add index | (create index) |
| `drop-index` | Drop index | (remove index) |
| `reindex` | Rebuild indexes | (reindex collection) |
| `compact` | Compact collection | (free storage space) |
| `validate-collection` | Validate collection | (check integrity) |
| `rename-collection` | Rename collection | (change name) |
| `list-collections` | List collections | (with stats) |
| `create-collection` | Create collection | (optionally capped) |
| `drop-collection` | Drop collection | (delete collection) |
| `db-info` | Database info | (server info) |
| `db-users` | Database users | (admin users) |
| `slow-queries` | Slow queries | (find slow queries) |
| `enable-profiling` | Enable profiling | (query profiling) |
| `disable-profiling` | Disable profiling | (query profiling) |
| `user-permissions` | User permissions | (show permissions) |
| `grant-role` | Grant role | (add role to user) |
| `revoke-role` | Revoke role | (remove role from user) |
| `group-members` | Group members | (show members) |
| `add-to-group` | Add to group | (add user to group) |
| `remove-from-group` | Remove from group | (remove user from group) |
| `agent-stats` | Agent statistics | (usage stats) |
| `agent-sessions` | Agent sessions | (list sessions) |
| `clear-agent-sessions` | Clear agent sessions | (cleanup old sessions) |
| `migration-status` | Migration status | (check timestamps) |
| `add-timestamps` | Add timestamps | (migration helper) |
| `data-digest` | Data digest | (database report) |

## Installation

After installing `@intranefr/superbackend`, the following commands are available via `npx`:

```bash
npx @intranefr/superbackend <command>
```

Or run directly from the repo:

```bash
node src/cli/<command>.js
```

Or via npm scripts:

```bash
npm run <command>
```

---

## 1. `api` - HTTP API Client

Non-interactive CLI to interact with a SuperBackend instance via HTTP API (no server running locally required).

### Usage

```bash
node src/cli/api.js <endpoint> [options]
```

### Examples

```bash
# List agents with admin basic auth
node src/cli/api.js /api/admin/agents --admin-basic

# Create a global setting
node src/cli/api.js /api/admin/settings/MY_KEY -X POST \
  -d '{"value":"my-value","description":"My setting"}' --admin-basic

# Get user info with JWT token
node src/cli/api.js /api/auth/me --token YOUR_JWT_TOKEN

# List blog posts with query params
node src/cli/api.js /api/blog/posts -q status=published -q limit=10

# Upload JSON data from file
node src/cli/api.js /api/data -X POST -d @data.json --token TOKEN

# Silent mode for scripting
node src/cli/api.js /api/admin/agents --admin-basic --silent --output json
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-X, --method METHOD` | HTTP method (GET, POST, PUT, DELETE, PATCH) | GET |
| `-d, --data DATA` | Request body (JSON string or file path with @prefix) | - |
| `-H, --header HEADER` | Custom header (format: "Key: Value") | - |
| `-q, --query KEY=VAL` | Query parameter (can be repeated) | - |
| `--base-url URL` | Base URL of SuperBackend instance | http://localhost:3000 |
| `--token TOKEN` | JWT token for authentication | - |
| `--admin-basic` | Use admin basic auth (from env or defaults) | - |
| `--admin-session` | Use admin session auth (requires --cookie) | - |
| `--cookie COOKIE` | Session cookie for authentication | - |
| `--output FORMAT` | Output format: json, text, table | json |
| `--silent` | Only output response data (no status/colors) | - |
| `--verbose` | Show request details | - |
| `--timeout MS` | Request timeout in ms | 30000 |

### Environment Variables

- `SUPERBACKEND_URL` - Base URL (default: http://localhost:3000)
- `ADMIN_USERNAME` - Admin username for basic auth (default: admin)
- `ADMIN_PASSWORD` - Admin password for basic auth (default: admin)

---

## 2. `direct` - Direct Database CLI

Direct CLI to interact with SuperBackend logic (services, models) without the HTTP server. Connects directly to MongoDB.

### Usage

```bash
node src/cli/direct.js <resource> <command> [options]
```

### Resources

#### `agents` - Manage AI agents

```bash
# List all agents
node src/cli/direct.js agents list

# Get agent by ID
node src/cli/direct.js agents get <id>

# Create an agent
node src/cli/direct.js agents create --name "My Agent" --model "gpt-4"

# Update an agent
node src/cli/direct.js agents update <id> --name "New Name"

# Delete an agent
node src/cli/direct.js agents delete <id>
```

#### `settings` - Manage global settings

```bash
# List all settings
node src/cli/direct.js settings list

# Get setting by key
node src/cli/direct.js settings get MY_KEY

# Create a setting
node src/cli/direct.js settings create --key API_KEY --value "secret123" --description "API Key"

# Update a setting
node src/cli/direct.js settings update API_KEY --value "new-secret"

# Delete a setting
node src/cli/direct.js settings delete API_KEY
```

#### `users` - Manage users

```bash
# List all users
node src/cli/direct.js users list

# Get user by ID
node src/cli/direct.js users get <id>

# Create a user
node src/cli/direct.js users create --email "user@example.com" --password "pass123" --role admin

# Update a user
node src/cli/direct.js users update <id> --role user

# Delete a user
node src/cli/direct.js users delete <id>

# Disable/Enable a user
node src/cli/direct.js users disable <id>
node src/cli/direct.js users enable <id>
```

#### `json-configs` - Manage JSON configs

```bash
# List all configs
node src/cli/direct.js json-configs list

# Get config by alias
node src/cli/direct.js json-configs get my-config

# Create a config
node src/cli/direct.js json-configs create --alias my-config --json '{"key":"value"}'

# Update a config
node src/cli/direct.js json-configs update my-config --json '{"key":"new-value"}'

# Delete a config
node src/cli/direct.js json-configs delete my-config
```

#### `blog-posts` - Manage blog posts

```bash
# List all posts
node src/cli/direct.js blog-posts list

# Get post by ID
node src/cli/direct.js blog-posts get <id>

# Create a post
node src/cli/direct.js blog-posts create --name "My Post" --description "Content"

# Update a post
node src/cli/direct.js blog-posts update <id> --name "New Title"

# Delete a post
node src/cli/direct.js blog-posts delete <id>

# Publish/Unpublish a post
node src/cli/direct.js blog-posts publish <id>
node src/cli/direct.js blog-posts unpublish <id>
```

#### `orgs` - Manage organizations

```bash
# List all orgs
node src/cli/direct.js orgs list

# Get org by ID
node src/cli/direct.js orgs get <id>

# Create an org
node src/cli/direct.js orgs create --name "My Org"

# Update an org
node src/cli/direct.js orgs update <id> --name "New Name"

# Delete an org
node src/cli/direct.js orgs delete <id>
```

#### `crons` - Manage cron jobs

```bash
# List all crons
node src/cli/direct.js crons list

# Get cron by ID
node src/cli/direct.js crons get <id>

# Create a cron
node src/cli/direct.js crons create --name "Daily Cleanup" --description "0 0 * * *"

# Delete a cron
node src/cli/direct.js crons delete <id>

# Enable/Disable a cron
node src/cli/direct.js crons enable <id>
node src/cli/direct.js crons disable <id>
```

#### `errors` - Manage error logs

```bash
# List all errors (default: last 50)
node src/cli/direct.js errors list
node src/cli/direct.js errors list --value 100

# Get error by ID
node src/cli/direct.js errors get <id>

# Delete an error
node src/cli/direct.js errors delete <id>

# Clear all errors
node src/cli/direct.js errors clear
```

#### `scripts` - Manage script definitions

```bash
# List all scripts
node src/cli/direct.js scripts list

# Get script by ID
node src/cli/direct.js scripts get <id>

# Create a script
node src/cli/direct.js scripts create --name "My Script" --description "console.log('Hello')"

# Delete a script
node src/cli/direct.js scripts delete <id>
```

#### `workflows` - Manage workflows

```bash
# List all workflows
node src/cli/direct.js workflows list

# Get workflow by ID
node src/cli/direct.js workflows get <id>

# Create a workflow
node src/cli/direct.js workflows create --name "My Workflow"

# Delete a workflow
node src/cli/direct.js workflows delete <id>

# Enable/Disable a workflow
node src/cli/direct.js workflows enable <id>
node src/cli/direct.js workflows disable <id>
```

#### `health-checks` - Manage health checks

```bash
# List all health checks
node src/cli/direct.js health-checks list

# Get health check by ID
node src/cli/direct.js health-checks get <id>

# Create a health check
node src/cli/direct.js health-checks create --name "Database Check"

# Delete a health check
node src/cli/direct.js health-checks delete <id>
```

#### `pages` - Manage pages

```bash
# List all pages
node src/cli/direct.js pages list

# Get page by ID
node src/cli/direct.js pages get <id>

# Create a page
node src/cli/direct.js pages create --name "about" --description "About Us" --value "Content here"

# Update a page
node src/cli/direct.js pages update <id> --value "New content"

# Delete a page
node src/cli/direct.js pages delete <id>
```

#### `assets` - Manage assets

```bash
# List all assets
node src/cli/direct.js assets list
node src/cli/direct.js assets list --value 100

# Get asset by ID
node src/cli/direct.js assets get <id>

# Delete an asset
node src/cli/direct.js assets delete <id>

# Clear all assets
node src/cli/direct.js assets clear
```

#### `forms` - Manage form submissions

```bash
# List all submissions
node src/cli/direct.js forms list
node src/cli/direct.js forms list --value 100

# Get submission by ID
node src/cli/direct.js forms get <id>

# Delete a submission
node src/cli/direct.js forms delete <id>

# Clear all submissions
node src/cli/direct.js forms clear
```

#### `i18n` - Manage i18n entries

```bash
# List all entries
node src/cli/direct.js i18n list

# Get entry by ID
node src/cli/direct.js i18n get <id>

# Create a new entry
node src/cli/direct.js i18n create --key common.welcome --value "Welcome!"

# Delete an entry
node src/cli/direct.js i18n delete <id>
```

#### `notifications` - Manage notifications

```bash
# List all notifications
node src/cli/direct.js notifications list

# Get notification by ID
node src/cli/direct.js notifications get <id>

# Delete a notification
node src/cli/direct.js notifications delete <id>

# Clear all notifications
node src/cli/direct.js notifications clear
```

#### `rbac-roles` - Manage RBAC roles

```bash
# List all roles
node src/cli/direct.js rbac-roles list

# Get role by ID
node src/cli/direct.js rbac-roles get <id>

# Create a role
node src/cli/direct.js rbac-roles create --name "moderator"

# Delete a role
node src/cli/direct.js rbac-roles delete <id>
```

#### `rbac-groups` - Manage RBAC groups

```bash
# List all groups
node src/cli/direct.js rbac-groups list

# Get group by ID
node src/cli/direct.js rbac-groups get <id>

# Create a group
node src/cli/direct.js rbac-groups create --name "admins"

# Delete a group
node src/cli/direct.js rbac-groups delete <id>
```

#### `invites` - Manage invites

```bash
# List all invites
node src/cli/direct.js invites list

# Get invite by ID
node src/cli/direct.js invites get <id>

# Create an invite
node src/cli/direct.js invites create --email "user@example.com" --role admin

# Delete an invite
node src/cli/direct.js invites delete <id>

# Clear used invites
node src/cli/direct.js invites clear
```

#### `waiting-list` - Manage waiting list

```bash
# List all entries
node src/cli/direct.js waiting-list list

# Delete an entry
node src/cli/direct.js waiting-list delete <id>

# Clear all entries
node src/cli/direct.js waiting-list clear
```

#### `cache` - Manage cache entries

```bash
# List all cache entries
node src/cli/direct.js cache list

# Get entry by key
node src/cli/direct.js cache get --key "my-cache-key"

# Delete entry by key
node src/cli/direct.js cache delete --key "my-cache-key"

# Clear all cache
node src/cli/direct.js cache clear
```

#### `audit-logs` - Manage audit logs

```bash
# List all audit events
node src/cli/direct.js audit-logs list

# Get event by ID
node src/cli/direct.js audit-logs get <id>

# Clear old audit logs (older than 90 days)
node src/cli/direct.js audit-logs clear
node src/cli/direct.js audit-logs clear --value 30
```

### Database Utilities

#### `db-stats` - Database statistics

```bash
# Show database statistics
node src/cli/direct.js db-stats
```

#### `db-indexes` - Database indexes

```bash
# List all indexes for all collections
node src/cli/direct.js db-indexes

# Get indexes for specific collection
node src/cli/direct.js db-indexes --key users
```

#### `db-cleanup` - Database cleanup

```bash
# Delete documents older than 30 days from a collection
node src/cli/direct.js db-cleanup --key audit-events --value 30
```

### Options

| Option | Description |
|--------|-------------|
| `--name NAME` | Resource name |
| `--model MODEL` | AI model name (for agents) |
| `--key KEY` | Setting key |
| `--value VALUE` | Setting value (JSON or string) |
| `--description DESC` | Setting description |
| `--email EMAIL` | User email |
| `--password PASSWORD` | User password |
| `--role ROLE` | User role (user, admin) |
| `--alias ALIAS` | JSON config alias |
| `--json JSON` | JSON config data |
| `--output FORMAT` | Output format: json, text, table |
| `--quiet` | Only output data (no status/colors) |
| `--verbose` | Show additional details |
| `--yes, -y` | Skip confirmation prompts |

### Environment Variables

- `MONGODB_URI` - MongoDB connection string
- `MODE` - Environment mode (loads `.env.$MODE`)

---

## 3. `agent-chat` - Interactive AI Agent TUI

Interactive terminal UI for chatting with AI agents.

### Usage

```bash
node src/cli/agent-chat.js
```

### Features

- Select from available agents
- Real-time streaming responses
- Session management (`/new`, `/sessions`, `/compact`, `/rename`)
- Token usage tracking
- Abort operations with ESC

---

## 4. `agent-list` - List AI Agents

List all available AI agents.

### Usage

```bash
node src/cli/agent-list.js
```

---

## npm Scripts

For convenience, these npm scripts are available:

```bash
npm run api -- <endpoint> [options]
npm run direct -- <resource> <command> [options]
```

---

## Comparison: `api` vs `direct`

| Feature | `api` | `direct` |
|---------|-------|----------|
| Connection | HTTP | Direct MongoDB |
| Server required | No | No |
| Authentication | JWT, Basic Auth, Session | None (DB access) |
| Use case | Remote instances, production | Local dev, admin tasks |
| Rate limiting | Yes (server-side) | No |
| Validation | Server-side | Direct DB operations |
| Resources | All API endpoints | Core resources only |

**When to use which:**

- Use **`api`** when:
  - Connecting to a remote SuperBackend instance
  - You need to respect server-side auth and rate limiting
  - Testing API endpoints
  - You need access to all API endpoints

- Use **`direct`** when:
  - Running admin/maintenance tasks locally
  - The server is not running
  - You need direct database access for bulk operations
  - Quick CRUD operations on core resources

---

## Common Recipes

### Cleanup old data

```bash
# Clear all errors
npm run direct -- errors clear

# Clear old audit logs (older than 30 days)
npm run direct -- audit-logs clear --value 30

# Delete old documents from any collection (older than 60 days)
npm run direct -- db-cleanup --key console-logs --value 60

# Clear all cache
npm run direct -- cache clear
```

### Database maintenance

```bash
# Check database size and collection stats
npm run direct -- db-stats

# List all indexes
npm run direct -- db-indexes

# Check indexes on specific collection
npm run direct -- db-indexes --key users
```

### User management

```bash
# Create admin user
npm run direct -- users create --email admin@example.com --password secure123 --role admin

# Disable a user
npm run direct -- users disable <user-id>

# List all users as table
npm run direct -- users list --output table
```

### Content management

```bash
# Unpublish all blog posts (maintenance mode)
for id in $(npm run direct -- blog-posts list --quiet --output json | jq -r '.items[]._id'); do
  npm run direct -- blog-posts unpublish $id
done

# Clear all form submissions
npm run direct -- forms clear
```

### RBAC setup

```bash
# Create new role
npm run direct -- rbac-roles create --name "content-editor" --description "Can edit content"

# Create group
npm run direct -- rbac-groups create --name "editors"

# Create invite with specific role
npm run direct -- invites create --email newuser@example.com --role content-editor
```

### Debugging

```bash
# View recent errors
npm run direct -- errors list --value 20

# Check cache entries
npm run direct -- cache list --value 50

# View recent notifications
npm run direct -- notifications list --value 20

# Check active cron jobs
npm run direct -- crons list
```

### Batch Operations

```bash
# Delete multiple documents by IDs
npm run direct -- batch-delete --key users --value "id1,id2,id3"

# Update all documents in a collection
npm run direct -- batch-update --key users --value '{"$set": {"active": true}}'

# Count all documents in database
npm run direct -- collection-count

# Count documents in specific collection
npm run direct -- collection-count --key users

# View collection schema
npm run direct -- collection-schema --key users

# Export collection to JSON file
npm run direct -- export-collection --key users --value 1000 --description "users-export.json"
```

### Integrations & External

```bash
# List Telegram bots
npm run direct -- telegram list

# Create Telegram bot
npm run direct -- telegram create --name "MyBot" --key "BOT_TOKEN_HERE"

# List webhooks
npm run direct -- webhooks list

# Create webhook
npm run direct -- webhooks create --name "Deploy Hook" --key "https://example.com/webhook"

# List external DB connections
npm run direct -- external-dbs list
```

### Execution History

```bash
# View cron execution history
npm run direct -- cron-executions list --value 50

# View workflow execution history
npm run direct -- workflow-executions list --value 50

# View script execution history
npm run direct -- script-runs list --value 50

# Clear old execution history
npm run direct -- cron-executions clear --value 7
npm run direct -- workflow-executions clear
npm run direct -- script-runs clear
```

### Stripe & Billing

```bash
# List Stripe catalog items
npm run direct -- stripe-items list

# List Stripe webhook events
npm run direct -- stripe-events list --value 50

# Clear Stripe events
npm run direct -- stripe-events clear
```

### Experiments & A/B Testing

```bash
# List experiments
npm run direct -- experiments list

# Create experiment
npm run direct -- experiments create --name "Homepage Test" --description "A/B test for homepage"

# List experiment assignments
npm run direct -- experiment-assignments list

# Clear assignments
npm run direct -- experiment-assignments clear
```

### Logs Management

```bash
# View console logs
npm run direct -- console-logs list --value 50

# View activity logs
npm run direct -- activity-logs list --value 50

# View email logs
npm run direct -- email-logs list --value 50

# Clear old logs (older than 7 days)
npm run direct -- console-logs clear --value 7
npm run direct -- activity-logs clear --value 14
npm run direct -- email-logs clear --value 30
```

### Health Monitoring

```bash
# List health incidents
npm run direct -- health-incidents list

# List auto-heal attempts
npm run direct -- health-attempts list

# Clear incidents and attempts
npm run direct -- health-incidents clear
npm run direct -- health-attempts clear
```

### Advanced Cleanup

```bash
# Clear all metric buckets
npm run direct -- metric-buckets clear

# Clear error aggregates
npm run direct -- error-aggregates clear

# Clear blog automation locks
npm run direct -- blog-automation-locks clear

# Clear blog automation runs
npm run direct -- blog-automation-runs clear

# Clear virtual EJS files
npm run direct -- virtual-ejs-files clear
```

### Data Integrity

```bash
# Find duplicate emails in users collection
npm run direct -- find-duplicates --key users --value email

# Remove duplicate emails (keep first)
npm run direct -- remove-duplicates --key users --value email

# Validate references in orders collection
npm run direct -- validate-refs --key orders --value users --description userId

# Repair broken references (nullify)
npm run direct -- repair-refs --key orders --value users --description userId

# Repair broken references (delete docs)
npm run direct -- repair-refs --key orders --value users --description userId --name delete
```

### Index Management

```bash
# Add compound index
npm run direct -- add-index --key users --value "email,createdAt"

# Drop an index
npm run direct -- drop-index --key users --value "email_1_createdAt_1"

# Rebuild all indexes
npm run direct -- reindex --key users

# Compact collection (free space)
npm run direct -- compact --key users
```

### Collection Management

```bash
# List all collections with stats
npm run direct -- list-collections

# Create capped collection
npm run direct -- create-collection --key logs --value 10485760 --description capped

# Rename collection
npm run direct -- rename-collection --key old-users --value users

# Drop collection
npm run direct -- drop-collection --key temp-data

# Validate collection integrity
npm run direct -- validate-collection --key users
```

### Database Administration

```bash
# Show database server info
npm run direct -- db-info

# Show database users
npm run direct -- db-users

# Find slow queries (>500ms)
npm run direct -- slow-queries --value 500

# Enable profiling (level 1)
npm run direct -- enable-profiling --value 1

# Disable profiling
npm run direct -- disable-profiling
```

### RBAC Management

```bash
# Show user permissions
npm run direct -- user-permissions --key <user-id>

# Grant role to user
npm run direct -- grant-role --key <user-id> --value "content-editor"

# Revoke role from user
npm run direct -- revoke-role --key <user-id> --value "content-editor"

# Show all groups and members
npm run direct -- group-members

# Show specific group members
npm run direct -- group-members --key <group-id>

# Add user to group
npm run direct -- add-to-group --key <group-id> --value <user-id>

# Remove user from group
npm run direct -- remove-from-group --key <group-id> --value <user-id>
```

### Agent Management

```bash
# Show agent statistics
npm run direct -- agent-stats

# List recent agent sessions
npm run direct -- agent-sessions --value 100

# Clear old agent sessions (older than 14 days)
npm run direct -- clear-agent-sessions --value 14
```

### Migration Helpers

```bash
# Check migration status (timestamps)
npm run direct -- migration-status

# Add timestamps to collection (dry run)
npm run direct -- add-timestamps --key legacy-data --value dry

# Add timestamps to collection (actual)
npm run direct -- add-timestamps --key legacy-data

# Generate data digest report
npm run direct -- data-digest
```

---

## All Available Commands

### `api` - HTTP API Client
```bash
node src/cli/api.js <endpoint> [options]
```

### `direct` - Direct Database CLI
```bash
# Resources: agents, settings, users, json-configs, blog-posts, orgs,
#            crons, errors, scripts, workflows, health-checks, pages,
#            assets, forms, i18n, notifications, rbac-roles, rbac-groups,
#            invites, waiting-list, cache, audit-logs, db-stats, db-indexes,
#            db-cleanup, experiments, telegram, rate-limits, console-logs,
#            activity-logs, email-logs, webhooks, stripe-items, stripe-events,
#            demo-projects, demo-steps, external-dbs, org-members,
#            page-collections, block-definitions, context-blocks,
#            ui-components, headless-models, headless-tokens,
#            blog-automation-locks, blog-automation-runs, cron-executions,
#            workflow-executions, script-runs, health-incidents,
#            health-attempts, error-aggregates, metric-buckets,
#            virtual-ejs-files, virtual-ejs-groups, markdowns,
#            batch-delete, batch-update, collection-count,
#            collection-schema, export-collection, find-duplicates,
#            remove-duplicates, validate-refs, repair-refs, add-index,
#            drop-index, reindex, compact, validate-collection,
#            rename-collection, list-collections, create-collection,
#            drop-collection, db-info, db-users, slow-queries,
#            enable-profiling, disable-profiling, user-permissions,
#            grant-role, revoke-role, group-members, add-to-group,
#            remove-from-group, agent-stats, agent-sessions,
#            clear-agent-sessions, migration-status, add-timestamps,
#            data-digest
node src/cli/direct.js <resource> <command> [options]
```

### `agent-chat` - Interactive AI Agent TUI
```bash
node src/cli/agent-chat.js
```

### `agent-list` - List AI Agents
```bash
node src/cli/agent-list.js
```
