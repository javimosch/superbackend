# Migration System

The Migration System provides comprehensive database migration capabilities for moving data between environments, testing connections, and managing schema changes. It supports multiple database types, asset migration, and provides a safe preview mode for validating migration operations before execution.

## Base URL / mount prefix

`/admin/migration`

## Configuration

No additional environment variables required. Uses existing database and storage configurations.

## API

### Environment Management

#### GET /admin/migration/environments
List all configured migration environments.

**Response (200 OK)**:
```json
[
  {
    "key": "production",
    "name": "Production Database",
    "type": "mongodb",
    "uri": "mongodb://prod-server:27017",
    "createdAt": "2024-01-15T10:30:00Z"
  }
]
```

#### GET /admin/migration/environments/:envKey
Get details of a specific environment.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| envKey | string | Yes | Environment key |

#### POST /admin/migration/environments
Create or update a migration environment.

**Request body**:
```json
{
  "key": "staging",
  "name": "Staging Environment",
  "type": "mongodb",
  "uri": "mongodb://staging-server:27017/db",
  "credentials": {
    "username": "migrate_user",
    "password": "secure_password"
  }
}
```

#### DELETE /admin/migration/environments/:envKey
Delete a migration environment.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| envKey | string | Yes | Environment key |

### Model Schema Discovery

#### GET /admin/migration/models
List all available models/schemas in the current environment.

**Response (200 OK)**:
```json
[
  {
    "name": "User",
    "collection": "users",
    "fields": [
      { "name": "_id", "type": "ObjectId" },
      { "name": "email", "type": "String" },
      { "name": "createdAt", "type": "Date" }
    ]
  }
]
```

#### GET /admin/migration/models/:modelName/schema
Get detailed schema for a specific model.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| modelName | string | Yes | Model name |

### Migration Operations

#### POST /admin/migration/preview
Preview a migration operation without executing it.

**Request body**:
```json
{
  "source": "staging",
  "target": "production",
  "models": ["User", "Organization"],
  "filters": {
    "User": { "createdAt": { "$gte": "2024-01-01" } }
  },
  "transformations": [
    {
      "model": "User",
      "field": "email",
      "operation": "lowercase"
    }
  ]
}
```

**Response (200 OK)**:
```json
{
  "preview": {
    "User": {
      "count": 1250,
      "sampleDocuments": [...]
    },
    "Organization": {
      "count": 45,
      "sampleDocuments": [...]
    }
  },
  "warnings": [
    "Large dataset detected. Consider batching."
  ]
}
```

#### POST /admin/migration/test-connection
Test connection to a migration environment.

**Request body**:
```json
{
  "environment": {
    "key": "test",
    "type": "mongodb",
    "uri": "mongodb://test-server:27017"
  }
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "latency": 45,
  "version": "4.4.0"
}
```

#### POST /admin/migration/test-assets
Test asset storage connection for migration.

**Request body**:
```json
{
  "target": {
    "type": "s3",
    "bucket": "migration-assets",
    "region": "us-east-1"
  }
}
```

#### POST /admin/migration/test-assets-copy
Test asset copy operation between storage systems.

**Request body**:
```json
{
  "source": {
    "type": "filesystem",
    "path": "/old/assets"
  },
  "target": {
    "type": "s3",
    "bucket": "new-assets"
  },
  "dryRun": true
}
```

#### POST /admin/migration/run
Execute a migration operation.

**Request body**:
```json
{
  "source": "staging",
  "target": "production",
  "models": ["User", "Post"],
  "options": {
    "batchSize": 100,
    "parallel": true,
    "continueOnError": false
  }
}
```

**Response (200 OK)**:
```json
{
  "migrationId": "mig_12345",
  "status": "running",
  "startedAt": "2024-01-15T14:30:00Z",
  "progress": {
    "total": 2500,
    "completed": 0
  }
}
```

## Examples

**Setting up a production environment**:
```json
{
  "key": "production",
  "name": "Production MongoDB",
  "type": "mongodb",
  "uri": "mongodb://prod-cluster-1:27017,prod-cluster-2:27017/db",
  "credentials": {
    "username": "migration_service",
    "password": "${PROD_MIGRATION_PASSWORD}"
  },
  "ssl": true
}
```

**Previewing a user data migration**:
```json
{
  "source": "staging",
  "target": "production",
  "models": ["User"],
  "filters": {
    "User": {
      "status": "active",
      "createdAt": { "$gte": "2024-01-01T00:00:00Z" }
    }
  },
  "transformations": [
    {
      "model": "User",
      "field": "email",
      "operation": "lowercase"
    },
    {
      "model": "User",
      "operation": "addField",
      "field": "migratedAt",
      "value": "new Date()"
    }
  ]
}
```

**Running a full migration**:
```json
{
  "source": "staging",
  "target": "production",
  "models": ["User", "Organization", "Post"],
  "options": {
    "batchSize": 500,
    "parallel": true,
    "continueOnError": true,
    "createIndexes": true
  }
}
```

## Error handling

**Common error responses**:
- `400 Bad Request` - Invalid migration configuration
- `403 Forbidden` - Insufficient permissions for migration
- `409 Conflict` - Migration already in progress
- `500 Internal Server Error` - Connection failures or migration errors

**Migration failures include detailed error logs and rollback information when possible.**

## Best practices

- Always run migrations in preview mode first
- Test connections before starting large migrations
- Use batch sizes appropriate for your data volume
- Enable parallel processing for independent collections
- Set up monitoring for long-running migrations
- Keep migration environments separate from production
- Document transformation rules for complex migrations
- Test asset migrations with small datasets first
