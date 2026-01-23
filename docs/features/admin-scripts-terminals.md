# Admin Scripts & Terminals

The Admin Scripts & Terminals system provides operational tooling for running scripts and managing terminal sessions within the SuperBackend admin interface. Execute maintenance scripts, run database operations, and manage interactive terminal sessions for system administration tasks.

## Base URL / mount prefix

`/admin/scripts` and `/admin/terminals`

## Configuration

No additional environment variables required. Uses existing admin authentication and system execution permissions.

## API

### Scripts Management

#### GET /admin/scripts
List all available scripts.

**Response (200 OK)**:
```json
[
  {
    "_id": "script_id",
    "name": "Database Cleanup",
    "description": "Clean up old database records",
    "script": "cleanup.sql",
    "createdAt": "2024-01-15T10:30:00Z"
  }
]
```

#### POST /admin/scripts
Create a new script.

**Request body**:
```json
{
  "name": "User Migration",
  "description": "Migrate user data to new format",
  "script": "UPDATE users SET migrated = true WHERE migrated IS NULL;"
}
```

**Response (201 Created)**:
```json
{
  "_id": "new_script_id",
  "name": "User Migration",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

#### GET /admin/scripts/:id
Get a specific script by ID.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Script ID |

#### PUT /admin/scripts/:id
Update script details.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Script ID |

**Request body**:
```json
{
  "name": "Updated Script Name",
  "script": "UPDATED SQL CONTENT"
}
```

#### DELETE /admin/scripts/:id
Delete a script.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Script ID |

#### POST /admin/scripts/:id/run
Execute a script.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Script ID |

**Response (200 OK)**:
```json
{
  "runId": "run_12345",
  "status": "running",
  "startedAt": "2024-01-15T10:35:00Z"
}
```

### Script Runs

#### GET /admin/scripts/runs
List all script execution runs.

**Response (200 OK)**:
```json
[
  {
    "_id": "run_12345",
    "scriptId": "script_id",
    "scriptName": "Database Cleanup",
    "status": "completed",
    "startedAt": "2024-01-15T10:35:00Z",
    "completedAt": "2024-01-15T10:37:00Z",
    "duration": 120000
  }
]
```

#### GET /admin/scripts/runs/:runId
Get details of a specific script run.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| runId | string | Yes | Run ID |

**Response (200 OK)**:
```json
{
  "_id": "run_12345",
  "scriptId": "script_id",
  "status": "completed",
  "output": "Cleanup completed. 150 records removed.",
  "error": null,
  "startedAt": "2024-01-15T10:35:00Z",
  "completedAt": "2024-01-15T10:37:00Z"
}
```

#### GET /admin/scripts/runs/:runId/stream
Stream real-time output from a running script.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| runId | string | Yes | Run ID |

Returns Server-Sent Events stream with script output.

### Terminal Sessions

#### POST /admin/terminals/sessions
Create a new terminal session.

**Request body**:
```json
{
  "name": "Maintenance Session",
  "workingDirectory": "/app"
}
```

**Response (201 Created)**:
```json
{
  "_id": "session_12345",
  "name": "Maintenance Session",
  "status": "active",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

#### GET /admin/terminals/sessions
List active terminal sessions.

**Response (200 OK)**:
```json
[
  {
    "_id": "session_12345",
    "name": "Maintenance Session",
    "status": "active",
    "createdAt": "2024-01-15T10:30:00Z",
    "lastActivity": "2024-01-15T10:45:00Z"
  }
]
```

#### DELETE /admin/terminals/sessions/:sessionId
Terminate a terminal session.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sessionId | string | Yes | Session ID |

## Examples

**Creating a database maintenance script**:
```json
{
  "name": "Weekly Cleanup",
  "description": "Remove old log entries and temporary files",
  "script": "DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '30 days';"
}
```

**Running a script**:
```json
{
  "runId": "run_67890",
  "status": "running"
}
```

**Creating a terminal session**:
```json
{
  "name": "Database Migration",
  "workingDirectory": "/app/migrations"
}
```

## Error handling

**Common error responses**:
- `404 Not Found` - Script or session not found
- `409 Conflict` - Script execution already in progress
- `500 Internal Server Error` - Script execution failures

**Script failures include detailed error messages in the run output for debugging.**

## Best practices

- Test scripts in development environment before production
- Use descriptive script names and document their purpose
- Monitor script execution times for performance issues
- Clean up terminal sessions after use to free resources
- Store sensitive operations as scripts rather than manual commands
- Use streaming for long-running script monitoring
- Implement proper error handling in custom scripts
