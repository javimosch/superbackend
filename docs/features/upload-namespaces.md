# Upload Namespaces

Upload Namespaces provide advanced file storage organization and management capabilities. They enable creating logical groupings of uploaded files with customizable size limits, access controls, and storage configurations to organize assets by purpose, department, or application feature.

## Base URL / mount prefix

`/admin/upload-namespaces`

## Configuration

### Environment variables

- `MAX_FILE_SIZE_HARD_CAP`
  - Optional
  - Default: `10485760` (10MB)
  - Global hard cap for all file uploads in bytes

## API

### GET /admin/upload-namespaces
List all upload namespaces.

**Response (200 OK)**:
```json
[
  {
    "key": "user-avatars",
    "name": "User Avatars",
    "description": "Profile pictures and user avatars",
    "maxFileSize": 2097152,
    "allowedTypes": ["image/jpeg", "image/png", "image/gif"],
    "storage": "s3",
    "createdAt": "2024-01-15T10:30:00Z"
  }
]
```

### GET /admin/upload-namespaces/summary
Get summary statistics for all namespaces.

**Response (200 OK)**:
```json
{
  "totalNamespaces": 5,
  "totalStorage": 1073741824,
  "namespaces": [
    {
      "key": "user-avatars",
      "fileCount": 1250,
      "totalSize": 52428800
    }
  ]
}
```

### GET /admin/upload-namespaces/:key
Get details of a specific namespace.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| key | string | Yes | Namespace key |

### POST /admin/upload-namespaces
Create a new upload namespace.

**Request body**:
```json
{
  "key": "product-images",
  "name": "Product Images",
  "description": "E-commerce product photos and assets",
  "maxFileSize": 5242880,
  "allowedTypes": ["image/jpeg", "image/png", "image/webp"],
  "storage": {
    "type": "s3",
    "bucket": "product-assets",
    "region": "us-east-1"
  },
  "public": true
}
```

**Response (201 Created)**:
```json
{
  "key": "product-images",
  "name": "Product Images",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### PUT /admin/upload-namespaces/:key
Update namespace configuration.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| key | string | Yes | Namespace key |

**Request body**:
```json
{
  "name": "Updated Product Images",
  "maxFileSize": 10485760,
  "allowedTypes": ["image/jpeg", "image/png", "image/webp", "image/svg+xml"]
}
```

### DELETE /admin/upload-namespaces/:key
Delete a namespace and all its files.

**Request parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| key | string | Yes | Namespace key |

**Warning: This operation cannot be undone and will delete all files in the namespace.**

## Examples

**Creating a user avatar namespace**:
```json
{
  "key": "avatars",
  "name": "User Profile Pictures",
  "description": "Square profile images for user accounts",
  "maxFileSize": 2097152,
  "allowedTypes": ["image/jpeg", "image/png"],
  "storage": {
    "type": "s3",
    "bucket": "user-assets",
    "region": "us-west-2",
    "acl": "public-read"
  },
  "resize": {
    "width": 256,
    "height": 256,
    "fit": "cover"
  }
}
```

**Creating a document storage namespace**:
```json
{
  "key": "documents",
  "name": "Business Documents",
  "description": "PDFs, contracts, and business documents",
  "maxFileSize": 10485760,
  "allowedTypes": ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  "storage": {
    "type": "filesystem",
    "path": "/secure/documents"
  },
  "public": false,
  "encryption": true
}
```

**Creating a media assets namespace**:
```json
{
  "key": "media",
  "name": "Media Assets",
  "description": "Videos, audio files, and rich media content",
  "maxFileSize": 1073741824,
  "allowedTypes": ["video/*", "audio/*"],
  "storage": {
    "type": "s3",
    "bucket": "media-assets",
    "region": "us-east-1",
    "cdn": "https://cdn.example.com"
  },
  "transcoding": {
    "video": ["1080p", "720p"],
    "audio": ["mp3", "aac"]
  }
}
```

## Error handling

**Common error responses**:
- `404 Not Found` - Namespace not found
- `409 Conflict` - Namespace key already exists
- `413 Payload Too Large` - File exceeds namespace size limit
- `415 Unsupported Media Type` - File type not allowed in namespace

## Best practices

- Use descriptive namespace keys for easy identification
- Set appropriate file size limits based on use case
- Restrict file types to prevent security issues
- Use public access only when necessary for performance
- Implement proper backup strategies for critical namespaces
- Monitor storage usage and set up alerts for limits
- Document namespace purposes for team consistency
- Test file uploads with different formats before production
