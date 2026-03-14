---
skill_name: direct-cli-expert-skill
description: MongoDB direct access operations via SuperBackend direct CLI 
tags: automation,superbackend,backend,cli,nodejs
---

**Version:** 1.0.0  
**Scope:** MongoDB direct access operations via SuperBackend CLI  
**Target:** AI Agents and automated systems  

---

## Skill Definition

This skill provides direct MongoDB database access without requiring the HTTP server to be running. It connects directly to the database using Mongoose models and executes CRUD operations.

### Capabilities

- **120+ resources** covering all SuperBackend models
- **Read operations:** list, get (all resources)
- **Write operations:** create, update, delete (most resources)
- **Database utilities:** stats, indexes, cleanup, export/import
- **Batch operations:** bulk delete, bulk update
- **Data analysis:** duplicates, references, field analysis

### Connection Requirements

```bash
# Required environment variable
MONGODB_URI=mongodb://user:pass@host:port/database?authSource=admin

# Optional: Load specific environment
MODE=dev npm run direct -- <resource> <command>
```

---

## Command Patterns

### Pattern 1: List Resources

```bash
npm run direct -- <resource> list [--value <limit>] [--quiet] [--output json|text|table]
```

**Examples:**
```bash
# List first 50 users
npm run direct -- users list

# List 100 blog posts, quiet mode (JSON only)
npm run direct -- blog-posts list --value 100 --quiet

# List agents as table
npm run direct -- agents list --output table
```

### Pattern 2: Get Single Resource

```bash
npm run direct -- <resource> get <id> [--quiet]
```

**Examples:**
```bash
npm run direct -- users get 69b572768452f6d6eacfc9a6 --quiet
npm run direct -- settings get SITE_NAME --quiet
```

### Pattern 3: Create Resource

```bash
npm run direct -- <resource> create --name <name> [options] [--quiet]
```

**Examples:**
```bash
# Create agent (requires providerKey)
npm run direct -- agents create --name "Assistant" --model "gpt-4o-mini" --key "OpenRouter" --quiet

# Create user (password auto-hashed)
npm run direct -- users create --email "user@test.com" --password "secure123" --quiet

# Create health-check (requires checkType and cronExpression)
npm run direct -- health-checks create --name "API Monitor" --value "0 * * * *" --key "internal" --quiet
```

### Pattern 4: Update Resource

```bash
npm run direct -- <resource> update <id> [options] [--quiet]
```

**Examples:**
```bash
npm run direct -- users update 69b572768452f6d6eacfc9a6 --role admin --quiet
npm run direct -- agents update 69b5717d93431ae8c9e09334 --model "gpt-4o" --quiet
```

### Pattern 5: Delete Resource

```bash
npm run direct -- <resource> delete <id> [--quiet]
```

**Examples:**
```bash
npm run direct -- users delete 69b572768452f6d6eacfc9a6 --quiet
npm run direct -- agents delete 69b5717d93431ae8c9e09334 --quiet
```

### Pattern 6: Clear/Reset Operations

```bash
npm run direct -- <resource> clear [--value <days>] [--quiet]
```

**Examples:**
```bash
# Clear all errors
npm run direct -- errors clear --quiet

# Clear audit logs older than 30 days
npm run direct -- audit-logs clear --value 30 --quiet

# Clear all cache
npm run direct -- cache clear --quiet
```

---

## Resource Catalog

### Core Resources

| Resource | List | Get | Create | Update | Delete | Special |
|----------|------|-----|--------|--------|--------|---------|
| `agents` | ✅ | ✅ | ✅ | ✅ | ✅ | - |
| `settings` | ✅ | ✅ | ✅ | ✅ | ✅ | key-based |
| `users` | ✅ | ✅ | ✅ | ✅ | ✅ | disable, enable |
| `json-configs` | ✅ | ✅ | ✅ | ✅ | ✅ | alias-based |

### CMS Resources

| Resource | List | Get | Create | Update | Delete | Special |
|----------|------|-----|--------|--------|--------|---------|
| `blog-posts` | ✅ | ✅ | ✅ | ✅ | ✅ | publish, unpublish |
| `pages` | ✅ | ✅ | ✅ | ✅ | ✅ | - |
| `assets` | ✅ | ✅ | ❌ | ❌ | ✅ | clear |
| `forms` | ✅ | ✅ | ❌ | ❌ | ✅ | clear |
| `i18n` | ✅ | ✅ | ✅ | ❌ | ✅ | - |
| `markdowns` | ✅ | ✅ | ✅ | ❌ | ✅ | - |

### Organization & RBAC

| Resource | List | Get | Create | Update | Delete | Special |
|----------|------|-----|--------|--------|--------|---------|
| `orgs` | ✅ | ✅ | ✅ | ✅ | ✅ | - |
| `org-members` | ✅ | ❌ | ❌ | ❌ | ✅ | - |
| `rbac-roles` | ✅ | ✅ | ✅ | ❌ | ✅ | - |
| `rbac-groups` | ✅ | ✅ | ✅ | ❌ | ✅ | - |
| `invites` | ✅ | ✅ | ✅ | ❌ | ✅ | clear |
| `rbac-grants` | ✅ | ❌ | ❌ | ❌ | ❌ | clear |
| `rbac-group-roles` | ✅ | ❌ | ❌ | ❌ | ✅ | - |
| `rbac-user-roles` | ✅ | ❌ | ❌ | ❌ | ✅ | - |

### System Resources

| Resource | List | Get | Create | Update | Delete | Special |
|----------|------|-----|--------|--------|--------|---------|
| `crons` | ✅ | ✅ | ✅ | ❌ | ✅ | enable, disable |
| `scripts` | ✅ | ✅ | ✅ | ❌ | ✅ | - |
| `workflows` | ✅ | ✅ | ✅ | ❌ | ✅ | enable, disable |
| `health-checks` | ✅ | ✅ | ✅ | ❌ | ✅ | - |
| `errors` | ✅ | ✅ | ❌ | ❌ | ✅ | clear |

### Log Resources

| Resource | List | Get | Create | Update | Delete | Special |
|----------|------|-----|--------|--------|--------|---------|
| `notifications` | ✅ | ✅ | ❌ | ❌ | ✅ | clear |
| `cache` | ✅ | ✅ | ❌ | ❌ | ✅ | clear, key-based |
| `audit-logs` | ✅ | ✅ | ❌ | ❌ | ❌ | clear |
| `console-logs` | ✅ | ✅ | ❌ | ❌ | ❌ | clear |
| `activity-logs` | ✅ | ✅ | ❌ | ❌ | ❌ | clear |
| `email-logs` | ✅ | ✅ | ❌ | ❌ | ❌ | clear |
| `waiting-list` | ✅ | ❌ | ❌ | ❌ | ✅ | clear |

### Integration Resources

| Resource | List | Get | Create | Update | Delete | Special |
|----------|------|-----|--------|--------|--------|---------|
| `telegram` | ✅ | ✅ | ✅ | ❌ | ✅ | enable, disable |
| `webhooks` | ✅ | ✅ | ✅ | ❌ | ✅ | enable, disable |
| `stripe-items` | ✅ | ✅ | ❌ | ❌ | ❌ | clear |
| `stripe-events` | ✅ | ✅ | ❌ | ❌ | ❌ | clear |
| `external-dbs` | ✅ | ✅ | ✅ | ❌ | ✅ | - |

### Execution History

| Resource | List | Get | Create | Update | Delete | Special |
|----------|------|-----|--------|--------|--------|---------|
| `cron-executions` | ✅ | ❌ | ❌ | ❌ | ❌ | clear |
| `workflow-executions` | ✅ | ✅ | ❌ | ❌ | ❌ | clear |
| `script-runs` | ✅ | ✅ | ❌ | ❌ | ❌ | clear |
| `blog-automation-runs` | ✅ | ✅ | ❌ | ❌ | ❌ | clear |
| `blog-automation-locks` | ✅ | ❌ | ❌ | ❌ | ❌ | clear |

### Advanced Resources

| Resource | List | Get | Create | Update | Delete | Special |
|----------|------|-----|--------|--------|--------|---------|
| `experiments` | ✅ | ✅ | ✅ | ❌ | ✅ | - |
| `experiment-assignments` | ✅ | ✅ | ❌ | ❌ | ❌ | clear |
| `demo-projects` | ✅ | ✅ | ✅ | ❌ | ✅ | - |
| `demo-steps` | ✅ | ✅ | ❌ | ❌ | ✅ | clear |
| `rate-limits` | ✅ | ✅ | ❌ | ❌ | ✅ | clear |
| `metric-buckets` | ✅ | ❌ | ❌ | ❌ | ❌ | clear |
| `error-aggregates` | ✅ | ✅ | ❌ | ❌ | ✅ | clear |

### CMS Advanced

| Resource | List | Get | Create | Update | Delete | Special |
|----------|------|-----|--------|--------|--------|---------|
| `page-collections` | ✅ | ✅ | ✅ | ❌ | ✅ | - |
| `block-definitions` | ✅ | ✅ | ❌ | ❌ | ✅ | - |
| `context-blocks` | ✅ | ✅ | ❌ | ❌ | ✅ | - |
| `ui-components` | ✅ | ✅ | ❌ | ❌ | ✅ | - |
| `ui-component-projects` | ✅ | ✅ | ❌ | ❌ | ✅ | - |
| `ui-component-project-components` | ✅ | ✅ | ❌ | ❌ | ✅ | - |
| `headless-models` | ✅ | ✅ | ✅ | ❌ | ✅ | - |
| `headless-tokens` | ✅ | ❌ | ❌ | ❌ | ✅ | clear |

### Virtual Files

| Resource | List | Get | Create | Update | Delete | Special |
|----------|------|-----|--------|--------|--------|---------|
| `virtual-ejs-files` | ✅ | ✅ | ❌ | ❌ | ✅ | clear |
| `virtual-ejs-file-versions` | ✅ | ❌ | ❌ | ❌ | ❌ | clear |
| `virtual-ejs-group-changes` | ✅ | ❌ | ❌ | ❌ | ❌ | clear |

### Additional Resources

| Resource | List | Get | Create | Update | Delete | Special |
|----------|------|-----|--------|--------|--------|---------|
| `action-events` | ✅ | ✅ | ❌ | ❌ | ❌ | clear |
| `file-entries` | ✅ | ✅ | ❌ | ❌ | ✅ | clear |
| `proxy-entries` | ✅ | ✅ | ❌ | ❌ | ✅ | - |
| `console-entries` | ✅ | ✅ | ❌ | ❌ | ❌ | - |
| `health-check-runs` | ✅ | ✅ | ❌ | ❌ | ❌ | clear |
| `health-incidents` | ✅ | ✅ | ❌ | ❌ | ❌ | clear |
| `health-attempts` | ✅ | ✅ | ❌ | ❌ | ❌ | clear |
| `i18n-locales` | ✅ | ✅ | ✅ | ❌ | ✅ | - |
| `experiment-events` | ✅ | ❌ | ❌ | ❌ | ❌ | clear |
| `experiment-metric-buckets` | ✅ | ❌ | ❌ | ❌ | ❌ | clear |
| `rate-limit-metric-buckets` | ✅ | ❌ | ❌ | ❌ | ❌ | clear |

---

## Database Utilities

### Statistics & Analysis

```bash
# Database statistics
npm run direct -- db-stats

# Collection count (all or specific)
npm run direct -- collection-count
npm run direct -- collection-count --key users

# Top collections by size
npm run direct -- top-collections --value 20

# Find empty collections
npm run direct -- empty-collections

# Collection schema analysis
npm run direct -- collection-schema --key users
```

### Index Management

```bash
# List all indexes
npm run direct -- db-indexes

# Get indexes for specific collection
npm run direct -- db-indexes --key users

# Add compound index
npm run direct -- add-index --key users --value "email,createdAt"

# Drop index
npm run direct -- drop-index --key users --value "email_1_createdAt_1"

# Rebuild indexes
npm run direct -- reindex --key users
```

### Data Integrity

```bash
# Find duplicates
npm run direct -- find-duplicates --key users --value email

# Remove duplicates
npm run direct -- remove-duplicates --key users --value email

# Validate references
npm run direct -- validate-refs --key orders --value userId --description users

# Repair references (nullify)
npm run direct -- repair-refs --key orders --value userId --description users

# Find orphaned documents
npm run direct -- find-orphaned-documents --key orders --value userId --description users

# Delete orphaned documents
npm run direct -- delete-orphaned-documents --key orders --value userId --description users
```

### Field Operations

```bash
# Analyze field types
npm run direct -- analyze-field-types --key users --value status

# Find null fields
npm run direct -- find-null-fields --key users --value phone

# Fill null fields
npm run direct -- fill-null-fields --key users --value phone --description "N/A"

# Remove field from all documents
npm run direct -- remove-field --key users --value legacyField

# Rename field
npm run direct -- rename-field --key users --value "oldName:newName"

# Get distinct values
npm run direct -- distinct-values --key users --value role

# Get field cardinality
npm run direct -- field-cardinality --key users --value email
```

### Export/Import

```bash
# Export collection to JSON
npm run direct -- export-collection --key users --value 1000 --description "users-export.json"

# Export all collections
npm run direct -- export-all-collections --value "./db-backup"

# Import JSON into collection
npm run direct -- import-json --key users --value "users-import.json"

# Generate test data
npm run direct -- generate-test-data --key temp-data --value 100
```

### Cleanup Operations

```bash
# Database cleanup (by date)
npm run direct -- db-cleanup --key audit-logs --value 30

# Compact collection
npm run direct -- compact --key users

# Validate collection
npm run direct -- validate-collection --key users

# Rename collection
npm run direct -- rename-collection --key old-users --value users

# Drop collection
npm run direct -- drop-collection --key temp-data
```

### Database Administration

```bash
# Server info
npm run direct -- db-info

# Database users
npm run direct -- db-users

# Find slow queries (>1000ms)
npm run direct -- slow-queries --value 1000

# Enable profiling
npm run direct -- enable-profiling --value 1

# Disable profiling
npm run direct -- disable-profiling
```

### RBAC Advanced

```bash
# Get user permissions
npm run direct -- user-permissions --key <userId>

# Grant role
npm run direct -- grant-role --key <userId> --value "admin"

# Revoke role
npm run direct -- revoke-role --key <userId> --value "admin"

# List group members
npm run direct -- group-members
npm run direct -- group-members --key <groupId>

# Add to group
npm run direct -- add-to-group --key <groupId> --value <userId>

# Remove from group
npm run direct -- remove-from-group --key <groupId> --value <userId>
```

### Agent Management

```bash
# Agent statistics
npm run direct -- agent-stats

# List agent sessions
npm run direct -- agent-sessions --value 100

# Clear old sessions
npm run direct -- clear-agent-sessions --value 14
```

### Migration Helpers

```bash
# Check migration status
npm run direct -- migration-status

# Add timestamps to legacy collection
npm run direct -- add-timestamps --key legacy-data --value dry
npm run direct -- add-timestamps --key legacy-data

# Generate data digest
npm run direct -- data-digest
```

### Batch Operations

```bash
# Batch delete by IDs
npm run direct -- batch-delete --key users --value "id1,id2,id3"

# Batch update all documents
npm run direct -- batch-update --key users --value '{"$set": {"active": true}}'
```

---

## Agent Tips

### Tip 1: Always Use --quiet for Programmatic Output

```bash
# Good: Pure JSON output
npm run direct -- users list --quiet

# Bad: Includes status messages
npm run direct -- users list
```

### Tip 2: Capture IDs for Cleanup

```bash
# Create and capture ID
CREATE_OUTPUT=$(npm run direct -- users create --email "test@test.com" --password "pass" --quiet)
USER_ID=$(echo "$CREATE_OUTPUT" | grep '"_id"' | sed 's/.*"_id": "\([^"]*\)".*/\1/')

# Cleanup
npm run direct -- users delete "$USER_ID" --quiet
```

### Tip 3: Use Resource-Specific Required Fields

```bash
# agents create requires --key (providerKey)
npm run direct -- agents create --name "Bot" --model "gpt-4" --key "OpenRouter"

# health-checks create requires --key (checkType) and --value (cronExpression)
npm run direct -- health-checks create --name "Check" --value "0 * * * *" --key "internal"

# users create auto-hashes password
npm run direct -- users create --email "user@test.com" --password "plain123"
```

### Tip 4: Chain Operations Safely

```bash
# Safe create-test-cleanup pattern
npm run direct -- settings create --key TEST_KEY --value "test" --quiet && \
  npm run direct -- settings get TEST_KEY --quiet && \
  npm run direct -- settings delete --key TEST_KEY --quiet
```

### Tip 5: Use Exit Codes for Error Handling

```bash
# Exit code 0 = success, 1 = failure
if npm run direct -- users get "$USER_ID" --quiet; then
  echo "User exists"
else
  echo "User not found"
fi
```

### Tip 6: Parse JSON Output Reliably

```bash
# Use jq for reliable parsing
USER_COUNT=$(npm run direct -- users list --quiet | jq '.count')

# Or use grep/sed for simple cases
USER_ID=$(npm run direct -- users create ... --quiet | grep '"_id"' | cut -d'"' -f4)
```

### Tip 7: Handle Connection Timeouts

```bash
# CLI has 10s connection timeout
# If MongoDB is slow, increase serverSelectionTimeoutMS in mongooseHelper

# Check connectivity first
timeout 15 npm run direct -- db-stats --quiet
```

### Tip 8: Use No-Command Resources Correctly

These resources don't need a command argument:
- `db-stats`, `db-info`, `db-users`
- `collection-count`, `top-collections`, `empty-collections`
- `slow-queries`, `migration-status`, `data-digest`

```bash
# Correct
npm run direct -- db-stats

# Incorrect (will fail)
npm run direct -- db-stats list
```

---

## Error Handling

### Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `Schema hasn't been registered` | Model name mismatch | Check model name in resources-*.js |
| `Path X is required` | Missing required field | Add required parameter (--key, --value, etc.) |
| `Cast to ObjectId failed` | Invalid ID format | Use full 24-character MongoDB ObjectId |
| `Connection timeout` | MongoDB unreachable | Check MONGODB_URI, network access |
| `Command is required` | Resource needs command | Add list/get/create/update/delete |

### Exit Codes

```
0   Success
1   Generic error (validation, not found, etc.)
```

---

## Performance Characteristics

| Operation | Typical Time | Notes |
|-----------|--------------|-------|
| list (50 items) | 1-3s | Depends on collection size |
| get by ID | 0.5-1s | Indexed lookup |
| create | 1-2s | Includes validation |
| delete | 0.5-1s | Single document |
| clear | 2-10s | Depends on document count |
| db-stats | 5-10s | Queries all collections |
| export-collection | 5-30s | Depends on document count |

---

## Security Considerations

1. **MONGODB_URI** contains credentials - protect environment
2. **No authentication** - CLI trusts MONGODB_URI completely
3. **Full database access** - Can read/write/delete any collection
4. **No audit logging** - Operations not tracked by default
5. **Password hashing** - users create auto-hashes passwords with bcrypt

---

## Version History

- **1.0.0** - Initial skill definition with 120+ resources
  - All read operations documented
  - All write operations documented
  - Database utilities documented
  - Agent tips and patterns included
