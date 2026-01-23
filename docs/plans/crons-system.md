---
description: Crons system - A scheduled task manager for running scripts and HTTP calls on a schedule
---

# Plan: Crons System - Scheduled Task Manager - IMPLEMENTED

## Goal
Add a new **Crons** module to the Automation section of the admin dashboard that allows:
- Linking existing scripts to run on a schedule (cron expressions)
- Creating HTTP call tasks that execute on a schedule
- Managing scheduled tasks with enable/disable functionality
- Viewing execution history and logs

## Implementation Status: ✅ COMPLETED

### Features Implemented
- ✅ Script and HTTP task scheduling
- ✅ Cron expression management with presets
- ✅ Enable/disable functionality
- ✅ Manual trigger capability
- ✅ Execution history with detailed logs
- ✅ Timezone support
- ✅ Full admin UI with Vue.js
- ✅ RESTful API endpoints
- ✅ Scheduler service integration

### Files Created
1. `src/models/CronJob.js` - MongoDB model for cron jobs
2. `src/models/CronExecution.js` - MongoDB model for execution tracking
3. `src/controllers/adminCrons.controller.js` - API endpoints
4. `src/services/cronScheduler.service.js` - Scheduler service
5. `src/routes/adminCrons.routes.js` - Route definitions
6. `views/admin-crons.ejs` - Admin dashboard UI
7. `docs/features/crons-system.md` - Feature documentation

### Integration Points
- Added to Automation navigation section
- Routes mounted at `/api/admin/crons`
- View route at `/admin/crons`
- Scheduler starts automatically with MongoDB connection
- Integrates with existing Scripts module

## Features

### 1. Cron Task Types
- **Script Execution**: Run existing scripts from the Scripts module on schedule
- **HTTP Call**: Make HTTP requests (GET, POST, PUT, DELETE) to external endpoints on schedule

### 2. Scheduling
- Support standard cron expressions (5 fields: minute hour day month weekday)
- Provide common schedule presets (every minute, hourly, daily, weekly, monthly)
- Timezone support for scheduling
- Next run time preview

### 3. Configuration Options
- **For Script Tasks**:
  - Script selection dropdown
  - Override environment variables (optional)
  - Timeout configuration
  
- **For HTTP Tasks**:
  - HTTP method selection
  - URL configuration
  - Headers (key-value pairs)
  - Request body (JSON or raw text)
  - Authentication options (Bearer token, Basic auth)
  - Timeout configuration

### 4. Management Features
- Enable/disable cron jobs without deleting
- Manual trigger option for testing
- Execution history with:
  - Status (success/failed/running)
  - Start/end times
  - Output/logs
  - Error messages
- Bulk actions (enable/disable/delete multiple)

### 5. UI/UX
- Clean table view of all cron jobs
- Real-time status indicators
- Quick actions (run now, toggle enable/disable)
- Detailed execution log modal
- Create/Edit modal with form validation

## Technical Implementation

### 1. Data Model

#### CronJob Schema (MongoDB: `cron_jobs`)
```javascript
{
  _id: ObjectId,
  name: String,           // Human-readable name
  description: String,    // Optional description
  
  // Schedule configuration
  cronExpression: String, // Standard cron expression
  timezone: String,       // IANA timezone (default: UTC)
  enabled: Boolean,       // Enable/disable without deleting
  nextRunAt: Date,        // Calculated next execution time
  
  // Task configuration
  taskType: String,       // 'script' | 'http'
  
  // Script task fields
  scriptId: ObjectId,     // Reference to ScriptDefinition
  scriptEnv: [{           // Override environment variables
    key: String,
    value: String
  }],
  
  // HTTP task fields
  httpMethod: String,     // GET|POST|PUT|DELETE|PATCH
  httpUrl: String,        // Target URL
  httpHeaders: [{         // Custom headers
    key: String,
    value: String
  }],
  httpBody: String,       // Request body
  httpBodyType: String,   // 'json' | 'raw' | 'form'
  httpAuth: {
    type: String,         // 'bearer' | 'basic' | 'none'
    token: String,        // For bearer
    username: String,     // For basic
    password: String      // For basic
  },
  
  // Common fields
  timeoutMs: Number,      // Task timeout (default: 300000)
  
  // Metadata
  createdAt: Date,
  updatedAt: Date,
  createdBy: String       // Admin user who created it
}
```

#### CronExecution Schema (MongoDB: `cron_executions`)
```javascript
{
  _id: ObjectId,
  cronJobId: ObjectId,    // Reference to CronJob
  
  // Execution details
  status: String,         // 'running' | 'succeeded' | 'failed' | 'timed_out'
  startedAt: Date,
  finishedAt: Date,
  durationMs: Number,
  
  // Results
  output: String,         // Script output or HTTP response
  error: String,          // Error message if failed
  
  // HTTP specific
  httpStatusCode: Number, // HTTP response code
  httpResponseHeaders: Object,
  
  // Metadata
  triggeredAt: Date,      // When it was supposed to run
  actualRunAt: Date       // When it actually started
}
```

### 2. Backend Implementation

#### Routes (all under `/api/admin/crons`)
```
GET    /                    - List all cron jobs
POST   /                    - Create new cron job
GET    /:id                 - Get single cron job
PUT    /:id                 - Update cron job
DELETE /:id                 - Delete cron job
POST   /:id/enable          - Enable cron job
POST   /:id/disable         - Disable cron job
POST   /:id/trigger         - Manually trigger execution
GET    /:id/executions      - Get execution history
GET    /:id/executions/:eid - Get single execution log
GET    /presets             - Get common cron presets
POST   /preview             - Preview next run times
```

#### Scheduler Service
```javascript
// src/services/cronScheduler.js
class CronScheduler {
  constructor() {
    this.jobs = new Map(); // In-memory job tracking
    this.cronParser = require('cron-parser');
  }
  
  async start() {
    // Load enabled jobs from DB
    // Schedule each with node-cron
    // Handle missed executions
  }
  
  async scheduleJob(cronJob) {
    // Use node-cron to schedule
    // Update nextRunAt in DB
  }
  
  async unscheduleJob(jobId) {
    // Remove from node-cron
    // Clear from memory
  }
  
  async executeJob(cronJob) {
    // Create execution record
    // Run script or HTTP call based on type
    // Update execution record with results
  }
}
```

### 3. Frontend Implementation

#### Vue.js Components
- **CronsList.vue**: Main table view with actions
- **CronForm.vue**: Create/edit form
- **ExecutionHistory.vue**: View execution logs
- **CronPresets.vue**: Common schedule selector

#### UI Structure
```
Automation
├── Workflows
├── Scripts
├── Terminals
└── Crons (NEW)
    ├── List view with table
    ├── Create/Edit modal
    ├── Execution history modal
    └── Real-time status updates
```

### 4. Integration Points

#### With Scripts Module
- Reuse ScriptDefinition model
- Pass script execution through existing script runners
- Inherit script permissions and isolation

#### With Existing Infrastructure
- Use same admin authentication
- Follow same SSE pattern for live updates
- Reuse error tracking and logging

## Implementation Steps

1. **Backend Setup**
   - Create CronJob and CronExecution models
   - Implement CRUD API endpoints
   - Build scheduler service with node-cron
   - Add execution tracking

2. **Frontend Development**
   - Add Crons to navigation items
   - Create Vue components for UI
   - Implement form validation
   - Add real-time status updates

3. **Integration & Testing**
   - Connect with Scripts module
   - Test HTTP call functionality
   - Verify scheduling accuracy
   - Test timezone handling

4. **Polish & Documentation**
   - Add error handling
   - Write API documentation
   - Create user guide
   - Add monitoring metrics

## Security Considerations

- HTTP calls to internal IPs should be configurable/restricted
- Script execution inherits existing script security model
- Audit log for all cron modifications
- Rate limiting for manual triggers

## Future Enhancements

- Dependency chains (run job after another succeeds)
- Retry policies with exponential backoff
- Webhook notifications on failure
- Export/import cron configurations
- Visual cron expression builder
