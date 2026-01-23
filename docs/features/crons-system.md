# Crons System

## Overview
The Crons system provides scheduled task management for running scripts and HTTP calls automatically based on cron expressions. It integrates with the existing Scripts module and provides a full-featured HTTP client for webhook calls.

## Admin UI
- URL: `/admin/crons`
- Access: protected by admin basic auth

### Capabilities
- Create, edit, and delete cron jobs
- Enable/disable jobs without deleting
- Manual trigger for testing
- View execution history with detailed logs
- Support for script execution and HTTP calls
- Cron expression presets for common schedules
- Timezone support for scheduling

## Data Models

### CronJob
Mongo collection: `cron_jobs`

Core fields:
- `name`: Human-readable name
- `description`: Optional description
- `cronExpression`: Standard 5-field cron expression
- `timezone`: IANA timezone (default: UTC)
- `enabled`: Enable/disable without deleting
- `nextRunAt`: Calculated next execution time
- `taskType`: 'script' | 'http'
- `timeoutMs`: Task timeout (default: 300000)

Script task fields:
- `scriptId`: Reference to ScriptDefinition
- `scriptEnv`: Override environment variables

HTTP task fields:
- `httpMethod`: GET|POST|PUT|DELETE|PATCH
- `httpUrl`: Target URL
- `httpHeaders`: Custom headers array
- `httpBody`: Request body content
- `httpBodyType`: 'json' | 'raw' | 'form'
- `httpAuth`: Authentication configuration

### CronExecution
Mongo collection: `cron_executions`

Fields:
- `cronJobId`: Reference to CronJob
- `status`: 'running' | 'succeeded' | 'failed' | 'timed_out'
- `startedAt`, `finishedAt`: Execution timestamps
- `durationMs`: Calculated duration
- `output`: Script output or HTTP response
- `error`: Error message if failed
- `httpStatusCode`: HTTP response code
- `httpResponseHeaders`: Response headers object

## Admin API

All routes are protected by basic auth under `/api/admin/crons`:

### Cron Jobs
- `GET /` - List all cron jobs
- `POST /` - Create new cron job
- `GET /:id` - Get single cron job
- `PUT /:id` - Update cron job
- `DELETE /:id` - Delete cron job
- `POST /:id/enable` - Enable cron job
- `POST /:id/disable` - Disable cron job
- `POST /:id/trigger` - Manually trigger execution

### Executions
- `GET /:id/executions` - Get execution history (paginated)
- `GET /:id/executions/:eid` - Get single execution details

### Utilities
- `GET /presets` - Get common cron expression presets
- `POST /preview` - Preview next run times for a cron expression

## Scheduler Service

The cron scheduler service (`src/services/cronScheduler.service.js`) manages:
- Loading enabled jobs from database on startup
- Scheduling jobs using node-cron
- Executing jobs (script or HTTP)
- Tracking execution history
- Updating next run times

### Script Execution
- Reuses existing Scripts module infrastructure
- Merges base script environment with cron overrides
- Tracks execution through ScriptRun model
- Captures output and exit codes

### HTTP Execution
- Full HTTP client with all methods
- Header management
- Authentication support (Bearer token, Basic auth)
- Body handling (JSON, raw text, form data)
- Response capturing (status, headers, body)

## Integration Points

### With Scripts Module
- References ScriptDefinition by ID
- Inherits script permissions and isolation
- Uses existing script runners (host, vm2)
- Environment variable override capability

### With Admin Dashboard
- Integrated into Automation section
- Real-time status updates
- Execution history viewer
- Manual trigger capability

## Security Considerations
- All admin routes protected by basic auth
- Script execution inherits existing script security
- HTTP calls respect timeout limits
- Audit trail via execution logs

## Implementation Details

### Cron Expression Validation
- Uses cron-parser for validation and next run calculation
- Supports standard 5-field expressions
- Timezone-aware scheduling

### Error Handling
- Failed executions logged with error messages
- Timeouts enforced per job configuration
- Graceful handling of missing/invalid scripts
- HTTP error status codes preserved

### Performance
- In-memory job scheduling
- Minimal database queries
- Efficient execution tracking
- Automatic cleanup of old executions (if needed)

## Features Not Implemented (Future)
- Real-time SSE updates for running executions
- Retry policies with exponential backoff
- Webhook notifications on failures
- Job dependencies/chaining
- Export/import configurations
