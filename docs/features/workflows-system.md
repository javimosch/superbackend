# Workflows System

Workflows enable automated execution of business logic through a visual node-based interface. Create complex automation flows with LLM interactions, conditional logic, HTTP calls, and parallel processing to handle advanced use cases beyond simple API endpoints.

## Base URL / mount prefix

`/workflows`

## Configuration

No additional environment variables required. Workflows integrate with existing LLM service and external API configurations.

## API

### GET /workflows
List all workflows for the current organization.

**Response (200 OK)**:
```json
[
  {
    "_id": "workflow_id",
    "name": "User Onboarding Flow",
    "description": "Automated user welcome and setup",
    "nodes": [...],
    "createdAt": "2024-01-15T10:30:00Z"
  }
]
```

### GET /workflows/:id
Get a specific workflow by ID.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Workflow ID |

**Response (200 OK)**:
```json
{
  "_id": "workflow_id",
  "name": "User Onboarding Flow",
  "description": "Automated user welcome and setup",
  "nodes": [
    {
      "id": "node1",
      "type": "llm",
      "name": "generate_welcome",
      "prompt": "Generate a welcome message for {{user.name}}"
    }
  ],
  "testDataset": {
    "user": { "name": "John Doe" }
  }
}
```

### POST /workflows
Create a new workflow.

**Request body**:
```json
{
  "name": "User Onboarding Flow",
  "description": "Automated user welcome and setup",
  "nodes": [...],
  "testDataset": {
    "user": { "name": "John Doe" }
  }
}
```

**Response (201 Created)**:
```json
{
  "_id": "new_workflow_id",
  "name": "User Onboarding Flow",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### PUT /workflows/:id
Update an existing workflow.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Workflow ID |

**Request body**:
```json
{
  "name": "Updated Flow Name",
  "nodes": [...]
}
```

### DELETE /workflows/:id
Delete a workflow and all its execution history.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Workflow ID |

### GET /workflows/:id/runs
Get execution history for a workflow.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Workflow ID |

**Response (200 OK)**:
```json
[
  {
    "_id": "execution_id",
    "status": "completed",
    "executedAt": "2024-01-15T10:35:00Z",
    "duration": 1250,
    "log": [...]
  }
]
```

### POST /workflows/:id/test
Test execute a workflow with provided context.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Workflow ID |

**Request body**:
```json
{
  "body": { "user": { "name": "Test User" } },
  "query": {},
  "headers": {},
  "method": "POST"
}
```

**Response (200 OK)**:
```json
{
  "status": "completed",
  "log": [...],
  "context": {
    "entrypoint": { "user": { "name": "Test User" } },
    "nodes": { "generate_welcome": "Welcome, Test User!" }
  }
}
```

### POST /workflows/:id/nodes/:nodeId/test
Test execute a single node within a workflow.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Workflow ID |
| nodeId | string | Yes | Node ID to test |

**Request body**:
```json
{
  "node": {
    "id": "node1",
    "type": "llm",
    "prompt": "Say hello to {{user.name}}"
  },
  "context": {
    "user": { "name": "Test User" }
  }
}
```

## Examples

**Creating a simple LLM workflow**:
```json
{
  "name": "Simple Greeting",
  "nodes": [
    {
      "id": "greet",
      "type": "llm",
      "name": "greeting",
      "prompt": "Generate a friendly greeting for {{user.name}}",
      "provider": "openrouter",
      "model": "minimax/minimax-m2.1",
      "temperature": 0.7
    }
  ],
  "testDataset": {
    "user": { "name": "Alice" }
  }
}
```

**Conditional workflow with HTTP call**:
```json
{
  "name": "User Validation Flow",
  "nodes": [
    {
      "id": "check_age",
      "type": "if",
      "condition": "context.user.age >= 18",
      "then": [
        {
          "id": "validate",
          "type": "http",
          "url": "https://api.example.com/validate",
          "method": "POST",
          "body": { "userId": "{{user.id}}" }
        }
      ],
      "else": [
        {
          "id": "reject",
          "type": "exit",
          "body": { "error": "User too young" }
        }
      ]
    }
  ]
}
```

## Error handling

**Common error responses**:
- `404 Not Found` - Workflow or node not found
- `500 Internal Server Error` - Execution failures, LLM API errors, or invalid node configurations

**Workflow execution errors are logged in the execution log with specific error messages for debugging.**

## Best practices

- Test workflows with sample data before deploying
- Use descriptive node names for better debugging
- Handle LLM rate limits and timeouts in production
- Validate external API responses in conditional nodes
- Keep workflows focused on specific business processes
- Use parallel nodes for independent operations to improve performance
