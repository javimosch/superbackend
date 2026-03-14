# Direct CLI Coverage Assessment

**Last Updated:** 2026-03-14  
**Total Models in Codebase:** 72  
**Resources Implemented:** 120+  
**Status:** ✅ All timeout issues fixed, CLI fully operational

## Recent Fixes (2026-03-14)

### MongoDB Timeout Issues - RESOLVED ✅

**Problem:** Read-only operations were timing out during manual testing.

**Root Causes:**
1. Model schemas not registered before queries
2. No explicit connection timeouts for CLI usage
3. Slow `collStats` operations in `db-stats`

**Solutions Applied:**
1. **Pre-load all models** - Loop through model files with error handling
2. **Aggressive timeouts** - 5s server selection, 10s connect timeout
3. **Simplified db-stats** - Uses `countDocuments()` instead of `collStats`
4. **Better logging** - Progress messages for debugging

### Write Operations Issues - RESOLVED ✅

**Problem:** Create operations failing due to missing required fields.

**Fixes Applied:**

| Resource | Issue | Fix |
|----------|-------|-----|
| `agents create` | Missing `providerKey` | Added `--key` parameter for providerKey |
| `users create` | Password not hashed | Added bcrypt hashing for password |
| `health-checks create` | Missing `createdBy`, `checkType`, `cronExpression` | Added required parameters |

**Test Results:**
```bash
# All write operations now working with cleanup
npm run direct -- agents create --name test --model gpt-4o-mini --key OpenRouter
npm run direct -- agents delete <id>  # ✓ Cleanup works

npm run direct -- users create --email test@test.com --password pass123
npm run direct -- users delete <id>  # ✓ Cleanup works

npm run direct -- health-checks create --name test --value "0 * * * *" --key internal
npm run direct -- health-checks delete <id>  # ✓ Cleanup works
```

---

## Model Coverage Matrix

### ✅ Covered Models (with resource name)

| Model | Resource Command(s) | File |
|-------|---------------------|------|
| Agent | `agents` | resources-core.js |
| AgentMessage | `agent-messages` | resources-additional.js |
| Asset | `assets` | resources-cms.js |
| AuditEvent | `audit-logs` | resources-logs.js |
| BlockDefinition | `block-definitions` | resources-cms-advanced.js |
| BlogAutomationLock | `blog-automation-locks` | resources-execution.js |
| BlogAutomationRun | `blog-automation-runs` | resources-execution.js |
| BlogPost | `blog-posts` | resources-cms.js |
| CacheEntry | `cache` | resources-logs.js |
| ConsoleEntry | `console-entries` | resources-additional.js |
| ConsoleLog | `console-logs` | resources-logs.js |
| ContextBlockDefinition | `context-blocks` | resources-cms-advanced.js |
| CronExecution | `cron-executions` | resources-execution.js |
| CronJob | `crons` | resources-system.js |
| EmailLog | `email-logs` | resources-logs.js |
| ErrorAggregate | `error-aggregates` | resources-health.js |
| ErrorEntry | `errors` | resources-system.js |
| Experiment | `experiments` | resources-execution.js |
| ExperimentAssignment | `experiment-assignments` | resources-execution.js |
| ExperimentEvent | `experiment-events` | resources-additional.js |
| ExperimentMetricBucket | `experiment-metric-buckets` | resources-additional.js |
| ExternalDbConnection | `external-dbs` | resources-integrations.js |
| FileEntry | `file-entries` | resources-additional.js |
| FormSubmission | `forms` | resources-cms.js |
| GlobalSetting | `settings` | resources-core.js |
| HeadlessApiToken | `headless-tokens` | resources-cms-advanced.js |
| HeadlessModelDefinition | `headless-models` | resources-cms-advanced.js |
| HealthAutoHealAttempt | `health-attempts` | resources-health.js |
| HealthCheck | `health-checks` | resources-system.js |
| HealthCheckRun | `health-check-runs` | resources-additional.js |
| HealthIncident | `health-incidents` | resources-health.js |
| I18nEntry | `i18n` | resources-cms.js |
| I18nLocale | `i18n-locales` | resources-additional.js |
| Invite | `invites` | resources-org-rbac.js |
| JsonConfig | `json-configs` | resources-core.js |
| Markdown | `markdowns` | resources-cms.js |
| Notification | `notifications` | resources-logs.js |
| Organization | `orgs` | resources-org-rbac.js |
| OrganizationMember | `org-members` | resources-org-rbac.js |
| Page | `pages` | resources-cms.js |
| PageCollection | `page-collections` | resources-cms-advanced.js |
| ProxyEntry | `proxy-entries` | resources-additional.js |
| RateLimitCounter | `rate-limits` | resources-execution.js |
| RateLimitMetricBucket | `rate-limit-metric-buckets` | resources-additional.js |
| RbacGrant | `rbac-grants` | resources-additional.js |
| RbacGroup | `rbac-groups` | resources-org-rbac.js |
| RbacGroupMember | `group-members`, `add-to-group`, `remove-from-group` | rbac-advanced.js |
| RbacGroupRole | `rbac-group-roles` | resources-additional.js |
| RbacRole | `rbac-roles` | resources-org-rbac.js |
| RbacUserRole | `rbac-user-roles`, `grant-role`, `revoke-role` | resources-additional.js, rbac-advanced.js |
| ScriptDefinition | `scripts` | resources-system.js |
| ScriptRun | `script-runs` | resources-execution.js |
| StripeCatalogItem | `stripe-items` | resources-integrations.js |
| StripeWebhookEvent | `stripe-events` | resources-integrations.js |
| SuperDemo | `demos` | resources-execution.js |
| SuperDemoProject | `demo-projects` | resources-execution.js |
| SuperDemoStep | `demo-steps` | resources-execution.js |
| TelegramBot | `telegram` | resources-integrations.js |
| UiComponent | `ui-components` | resources-cms-advanced.js |
| UiComponentProject | `ui-component-projects` | resources-additional.js |
| UiComponentProjectComponent | `ui-component-project-components` | resources-additional.js |
| User | `users` | resources-core.js |
| VirtualEjsFile | `virtual-ejs-files` | resources-health.js |
| VirtualEjsFileVersion | `virtual-ejs-file-versions` | resources-additional.js |
| VirtualEjsGroupChange | `virtual-ejs-group-changes` | resources-additional.js |
| WaitingList | `waiting-list` | resources-logs.js |
| Webhook | `webhooks` | resources-integrations.js |
| Workflow | `workflows` | resources-system.js |
| WorkflowExecution | `workflow-executions` | resources-execution.js |

---

## ❌ Missing Models (0 uncovered)

**All 72 models are now covered! 🎉**

---

## Coverage Summary

| Category | Count |
|----------|-------|
| Total Models | 72 |
| Covered | 72 |
| Missing | 0 |
| **Coverage** | **100%** |

---

## Feature Coverage

### Core CRUD Operations
- ✅ list, get, create, update, delete for most resources
- ✅ Special commands (publish, enable, disable, etc.)

### Database Utilities
- ✅ `db-stats`, `db-indexes`, `db-cleanup`
- ✅ `collection-stats`, `top-collections`, `empty-collections`
- ✅ `find-large-documents`, `sample-documents`
- ✅ `find-duplicates`, `remove-duplicates`
- ✅ `validate-refs`, `repair-refs`, `find-orphaned-documents`, `delete-orphaned-documents`
- ✅ `analyze-field-types`, `find-null-fields`, `fill-null-fields`
- ✅ `remove-field`, `rename-field`, `convert-field-types`
- ✅ `distinct-values`, `field-cardinality`
- ✅ `collection-count`, `collection-schema`
- ✅ `export-collection`, `export-json`, `export-all-collections`, `import-json`
- ✅ Index management: `add-index`, `drop-index`, `reindex`, `compact`
- ✅ Collection ops: `list-collections`, `create-collection`, `drop-collection`, `rename-collection`, `validate-collection`

### Database Administration
- ✅ `db-info`, `db-users`
- ✅ `slow-queries`, `enable-profiling`, `disable-profiling`

### Batch Operations
- ✅ `batch-delete`, `batch-update`
- ✅ `count-by-field`

### RBAC Management
- ✅ `user-permissions`, `grant-role`, `revoke-role`
- ✅ `group-members`, `add-to-group`, `remove-from-group`
- ✅ `rbac-roles`, `rbac-groups`, `rbac-grants`, `rbac-group-roles`, `rbac-user-roles`

### Data Seeding
- ✅ `seed-users`, `seed-settings`, `seed-agents`
- ✅ `generate-test-data`
- ✅ `clear-all-data`

### Log Management
- ✅ `errors`, `audit-logs`, `console-logs`, `activity-logs`, `email-logs`
- ✅ `console-entries`, `action-events`
- ✅ All with list, get, clear commands

### Agent Management
- ✅ `agents`, `agent-messages`, `agent-stats`, `agent-sessions`, `clear-agent-sessions`

### Experiment/A/B Testing
- ✅ `experiments`, `experiment-assignments`, `experiment-events`, `experiment-metric-buckets`

### Execution History
- ✅ `cron-executions`, `workflow-executions`, `script-runs`, `health-check-runs`

### Integrations
- ✅ `telegram`, `webhooks`, `stripe-items`, `stripe-events`, `external-dbs`

### CMS & Content
- ✅ `blog-posts`, `pages`, `assets`, `forms`, `i18n`, `i18n-locales`, `markdowns`
- ✅ `page-collections`, `block-definitions`, `context-blocks`
- ✅ `ui-components`, `ui-component-projects`, `ui-component-project-components`
- ✅ `headless-models`, `headless-tokens`

### Health & Metrics
- ✅ `health-checks`, `health-check-runs`, `health-incidents`, `health-attempts`
- ✅ `error-aggregates`, `metric-buckets`, `rate-limits`, `rate-limit-metric-buckets`

### Virtual Files
- ✅ `virtual-ejs-files`, `virtual-ejs-file-versions`, `virtual-ejs-groups`, `virtual-ejs-group-changes`

### Migration
- ✅ `migration-status`, `add-timestamps`, `data-digest`

---

## Module File Organization

| Module | LOC | Resources |
|--------|-----|-----------|
| `direct.js` | 388 | Main entry point |
| `cli-utils.js` | 112 | Utilities |
| `help.js` | 195 | Help text |
| `resources-core.js` | 204 | agents, settings, users, json-configs |
| `resources-cms.js` | 247 | blog-posts, pages, assets, forms, i18n, markdowns |
| `resources-org-rbac.js` | 171 | orgs, rbac-roles, rbac-groups, invites, org-members |
| `resources-system.js` | 190 | crons, errors, scripts, workflows, health-checks |
| `resources-logs.js` | 204 | notifications, cache, audit-logs, console-logs, activity-logs, email-logs, waiting-list |
| `resources-integrations.js` | 182 | telegram, webhooks, stripe, external-dbs |
| `resources-execution.js` | 272 | experiments, rate-limits, demo, blog-automation, execution history |
| `resources-cms-advanced.js` | 173 | page-collections, blocks, ui-components, headless |
| `resources-health.js` | 132 | health, error-aggregates, metric-buckets, virtual-ejs |
| `resources-additional.js` | 400 | Additional models |
| `db-utils.js` | 416 | Database utilities |
| `db-admin.js` | 63 | DB admin |
| `db-advanced.js` | 287 | Advanced DB ops |
| `rbac-advanced.js` | 132 | RBAC advanced |
| `agent-utils.js` | 61 | Agent utilities |
| `migration.js` | 82 | Migration helpers |
| `data-seeding.js` | 307 | Data seeding & import/export |

**Total:** 4,389 lines across 20 files (all under 500 LOC ✓)

---

## Recommendations

### High Priority
1. ✅ All models covered - 100% coverage achieved!

### Medium Priority
1. Consider adding more commands to `proxy-entries` (currently only list/get/delete)
2. Add `demos` publish/unpublish commands

### Low Priority
1. Add more seed data generators for other models
2. Add data validation commands
3. Add backup/restore functionality

---

## Testing Status

| File | Test File | Status |
|------|-----------|--------|
| `cli-utils.js` | `cli-utils.test.js` | ✅ Exists |
| `help.js` | `help.test.js` | ✅ Exists |
| `direct.js` | - | Integration tested via npm |

---

## Commands by Category

### Data Analysis (13 commands)
- `collection-stats`, `top-collections`, `empty-collections`
- `find-large-documents`, `analyze-field-types`
- `find-null-fields`, `fill-null-fields`
- `distinct-values`, `field-cardinality`
- `sample-documents`, `count-by-field`
- `find-orphaned-documents`, `delete-orphaned-documents`

### Data Manipulation (8 commands)
- `remove-field`, `rename-field`, `convert-field-types`
- `batch-delete`, `batch-update`
- `find-duplicates`, `remove-duplicates`
- `validate-refs`, `repair-refs`

### Import/Export (5 commands)
- `import-json`, `export-json`, `export-all-collections`
- `export-collection`, `generate-test-data`

### Seeding (4 commands)
- `seed-users`, `seed-settings`, `seed-agents`
- `clear-all-data`

### Index Management (4 commands)
- `add-index`, `drop-index`, `reindex`, `compact`

### Collection Management (6 commands)
- `list-collections`, `create-collection`, `drop-collection`
- `rename-collection`, `validate-collection`
- `collection-count`, `collection-schema`

### DB Admin (5 commands)
- `db-info`, `db-users`, `slow-queries`
- `enable-profiling`, `disable-profiling`

---

## Conclusion

The Direct CLI has **excellent coverage** at 98.6% of all models. Only 1 model (SuperDemo) lacks a dedicated resource, which is low priority given it's a niche feature.

The CLI is well-organized with all files under 500 LOC, following the codebase standards.
