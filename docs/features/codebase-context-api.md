# Codebase Context API with Pagination

## Overview
This service exposes an HTTP API for retrieving context from a git repository ("codebase") with pagination support for efficient processing of large result sets by LLMs.

Each codebase is configured and owned by an Organization.

The service:
- authenticates requests using saasbackend Bearer JWT
- authorizes requests via org membership
- stores SSH credentials encrypted at rest
- lazily clones and caches repos on disk
- executes a strict allowlist of repository context operations
- applies an in-memory rate limit per org+user
- **supports pagination for large result sets**

## Authentication and tenancy
- Requests must include `Authorization: Bearer <token>`.
- Routes are scoped to an organization: `/api/orgs/:orgId/...`.
- Org context is loaded and membership is enforced via saasbackend org middleware.

## Pagination
All search and listing endpoints support pagination via query parameters:
- `offset` (default: 0) - Number of items to skip
- `limit` (default: 100, 0 for all) - Number of items to return
- `total` (optional, boolean) - Include total count in response

Paginated responses include metadata:
```json
{
  "data": [...],
  "pagination": {
    "offset": 0,
    "limit": 100,
    "total": 528,
    "hasMore": true
  }
}
```

## Data model
### CodebaseProject
A codebase project represents a single cloned repository.

Fields:
- `organizationId`
- `name`
- `cloneUrl`
- `defaultBranch`
- `sshPrivateKeyEnc` (AES-256-GCM encrypted)
- `knownHostsEnc` (optional, AES-256-GCM encrypted)
- `createdByUserId`

## Storage
- Codebase projects are stored in MongoDB using Mongoose.
- Repositories are stored on disk under `data/repos/<projectId>` (configurable by `REPOS_DIR`).

## Encryption
Secrets are encrypted using AES-256-GCM with a master key from `ENCRYPTION_KEY_BASE64`.

Encrypted blobs are stored as:
- `iv` (base64)
- `tag` (base64)
- `data` (base64)

## Repo lifecycle
- Clone is performed lazily on first operation.
- If multiple requests arrive while a clone is in progress, later requests wait until clone completes.
- A sync endpoint triggers `git fetch --all --prune`.

## Safety model
- No shell execution; commands use `spawn` with an argument array.
- Strict allowlist for git operations.
- Filesystem access is jailed to the repo root.
- Command execution uses timeouts and output truncation.

## Rate limiting
A fixed-window in-memory limiter is applied to the codebase routes.

Key:
- `orgId:userId`

Default:
- 120 requests per 60 seconds

## HTTP API
Base path:
- `/api/orgs/:orgId/codebases`

## MCP server (SSE/HTTP)
The service also exposes a Model Context Protocol (MCP) server to allow MCP-compatible clients (LLMs) to connect via JSON-RPC 2.0 and invoke the same codebase operations.

Endpoint:
- `GET /mcp` (SSE stream)
- `POST /mcp` (JSON-RPC 2.0 request/notification)
- `DELETE /mcp` (terminate session)

Required headers:
- `Mcp-Protocol-Version: 2025-06-18`
- `Authorization: Bearer <token>`

Authentication supports three forms of Bearer credentials:
- `Authorization: Bearer <jwt>`
- `Authorization: Bearer <email>:<password>`
- `Authorization: Bearer <MCP_BASIC_USER>:<MCP_BASIC_PASS>` (static MCP credential)

Basic auth is also supported (`Authorization: Basic <base64>`) and is decoded to `username:password` and processed using the same rules.

For static MCP credentials, the server resolves the acting user from environment defaults:
- `MCP_DEFAULT_USER_ID` or `MCP_DEFAULT_USER_EMAIL`

Org/project context is resolved per request as:
- `x-org-id` / `x-project-id` headers
- or tool arguments `orgId` / `projectId`
- or environment defaults `MCP_DEFAULT_ORG_ID` / `MCP_DEFAULT_PROJECT_ID`

Session:
- Server issues `Mcp-Session-Id` (response header) when missing.
- Client should send `Mcp-Session-Id` on subsequent requests.
- SSE supports resumption via `Last-Event-ID`.

Response encoding:
- By default tool results are returned as MCP `content` with a single `text` entry containing JSON.
- Tools accept `format: "json"` to force JSON-pretty formatting in the returned text payload.

Implemented MCP methods:
- `initialize`
- `tools/list`
- `tools/call`

Available tools (via `tools/list`):
- `orgs_list`
- `projects_list`
- `project_sync`
- `git_exec`
- `grep_search` (supports `offset`/`limit`)
- `fs_list` (supports `offset`/`limit`)
- `fs_read` (supports `offset`/`limit`)

### List projects
- `GET /`

### Create project
- `POST /`

Body:
- `name`
- `cloneUrl`
- `defaultBranch` (optional)
- `privateKey` (SSH private key)
- `knownHosts` (optional)

### Get project
- `GET /:projectId`

### Delete project
- `DELETE /:projectId`

### Sync repository
- `POST /:projectId/sync`

### Git operation
- `POST /:projectId/git`

Query Parameters (for log command):
- `offset` - Pagination offset
- `limit` - Results per page
- `total` - Include total count

Body:
- `{ args: string[] }`

Allowed subcommands:
- `status`
- `log` (supports pagination)
- `show`
- `diff`
- `rev-parse`
- `ls-files`
- `grep`

### Grep operation
- `POST /:projectId/grep`

Query Parameters:
- `offset` - Pagination offset
- `limit` - Results per page
- `total` - Include total count

Body:
- `query`
- `globs` (optional)
- `maxResults` (optional)
- `contextLines` (optional)

Response:
```json
{
  "stdout": "file.js:10: match line\nfile.js:20: another match",
  "stderr": "",
  "exitCode": 0,
  "offset": 0,
  "limit": 100,
  "total": 528,
  "hasMore": true,
  "matchesFound": true
}
```

### Read file
- `POST /:projectId/fs/read`

Body:
- `path`
- `offset` (optional, line offset)
- `limit` (optional, line limit)

### List directory
- `POST /:projectId/fs/list`

Query Parameters:
- `offset` - Pagination offset
- `limit` - Items per page
- `total` - Include total count

Body:
- `path` (optional)

Response:
```json
{
  "path": ".",
  "items": [
    {
      "name": "src",
      "path": "src",
      "type": "dir",
      "size": 4096,
      "modified": "2026-01-22T17:19:22.274Z"
    }
  ],
  "offset": 0,
  "limit": 100,
  "total": 56,
  "hasMore": true
}
```

## Usage Examples

### Pagination for LLMs
```bash
# Get first 100 grep results
curl -X POST "/api/orgs/:orgId/codebases/:projectId/grep?offset=0&limit=100&total=true" \
  -H "Authorization: Bearer <token>" \
  -d '{"query": "function"}'

# Get next 100 results
curl -X POST "/api/orgs/:orgId/codebases/:projectId/grep?offset=100&limit=100" \
  -H "Authorization: Bearer <token>" \
  -d '{"query": "function"}'
```

### CLI Usage
The interactive CLI supports pagination with navigation:
- Grep search: Choose page size, navigate with n/p/q
- Filesystem listing: Paginated directory browsing
- Git log: Paginated commit history

## Configuration
Environment variables:
- `PORT`
- `MONGODB_URI` or `MONGO_URI`
- `ENCRYPTION_KEY_BASE64`
- `REPOS_DIR` (optional)
- `ENV_FILE` (optional)
