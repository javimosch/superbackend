# LLM UI Integration

The LLM UI Integration provides a complete admin interface for managing AI-powered UI components and projects. It enables creating, deploying, and managing conversational AI interfaces with project-based organization and component reusability across different applications.

## Base URL / mount prefix

`/admin/llm-ui`

## Configuration

No additional environment variables required. Integrates with existing admin authentication and database configurations.

## API

### Projects Management

#### GET /admin/llm-ui/projects
List all LLM UI projects.

**Response (200 OK)**:
```json
[
  {
    "_id": "project_id",
    "name": "Customer Support Chat",
    "description": "AI-powered customer support interface",
    "apiKey": "prj_xxx",
    "createdAt": "2024-01-15T10:30:00Z"
  }
]
```

#### POST /admin/llm-ui/projects
Create a new LLM UI project.

**Request body**:
```json
{
  "name": "Customer Support Chat",
  "description": "AI-powered customer support interface"
}
```

**Response (201 Created)**:
```json
{
  "_id": "new_project_id",
  "name": "Customer Support Chat",
  "apiKey": "prj_auto_generated_key",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

#### GET /admin/llm-ui/projects/:projectId
Get a specific project by ID.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectId | string | Yes | Project ID |

#### PUT /admin/llm-ui/projects/:projectId
Update project details.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectId | string | Yes | Project ID |

**Request body**:
```json
{
  "name": "Updated Project Name",
  "description": "Updated description"
}
```

#### DELETE /admin/llm-ui/projects/:projectId
Delete a project and all its component assignments.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectId | string | Yes | Project ID |

#### POST /admin/llm-ui/projects/:projectId/rotate-key
Rotate the API key for a project.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectId | string | Yes | Project ID |

**Response (200 OK)**:
```json
{
  "apiKey": "prj_new_rotated_key"
}
```

### Components Management

#### GET /admin/llm-ui/components
List all available UI components.

**Response (200 OK)**:
```json
[
  {
    "code": "chat-widget",
    "name": "Chat Widget",
    "description": "Interactive chat interface component",
    "config": { "theme": "default", "position": "bottom-right" },
    "createdAt": "2024-01-15T10:30:00Z"
  }
]
```

#### POST /admin/llm-ui/components
Create a new UI component.

**Request body**:
```json
{
  "code": "custom-chat",
  "name": "Custom Chat Interface",
  "description": "Custom branded chat widget",
  "config": {
    "theme": "corporate",
    "colors": { "primary": "#0066cc" }
  }
}
```

**Response (201 Created)**:
```json
{
  "code": "custom-chat",
  "name": "Custom Chat Interface",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

#### GET /admin/llm-ui/components/:code
Get a specific component by code.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| code | string | Yes | Component code |

#### PUT /admin/llm-ui/components/:code
Update component configuration.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| code | string | Yes | Component code |

**Request body**:
```json
{
  "name": "Updated Component Name",
  "config": { "theme": "dark" }
}
```

#### DELETE /admin/llm-ui/components/:code
Delete a component.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| code | string | Yes | Component code |

### Project-Component Assignments

#### GET /admin/llm-ui/projects/:projectId/components
List components assigned to a project.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectId | string | Yes | Project ID |

**Response (200 OK)**:
```json
[
  {
    "componentCode": "chat-widget",
    "assignedAt": "2024-01-15T11:00:00Z",
    "config": { "theme": "project-specific" }
  }
]
```

#### POST /admin/llm-ui/projects/:projectId/components/:code
Assign a component to a project with custom configuration.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectId | string | Yes | Project ID |
| code | string | Yes | Component code |

**Request body**:
```json
{
  "config": {
    "theme": "project-theme",
    "position": "top-left"
  }
}
```

#### DELETE /admin/llm-ui/projects/:projectId/components/:code
Remove component assignment from project.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectId | string | Yes | Project ID |
| code | string | Yes | Component code |

## Examples

**Creating a customer support project**:
```json
{
  "name": "Customer Support AI",
  "description": "24/7 AI-powered customer support chat"
}
```

**Creating a chat widget component**:
```json
{
  "code": "support-chat",
  "name": "Support Chat Widget",
  "description": "Floating chat widget for customer support",
  "config": {
    "position": "bottom-right",
    "theme": "light",
    "welcomeMessage": "Hi! How can we help you today?",
    "offlineMessage": "We're currently offline. Leave a message!"
  }
}
```

**Assigning component to project**:
```json
{
  "config": {
    "welcomeMessage": "Welcome to Acme Corp support!",
    "brandColor": "#ff6b35"
  }
}
```

## Error handling

**Common error responses**:
- `404 Not Found` - Project or component not found
- `409 Conflict` - Component code already exists
- `400 Bad Request` - Invalid component configuration

## Best practices

- Use descriptive project names for easy identification
- Create reusable components for common UI patterns
- Override component configs per project for customization
- Regularly rotate API keys for security
- Test component assignments in staging before production
- Document custom configurations for team consistency
