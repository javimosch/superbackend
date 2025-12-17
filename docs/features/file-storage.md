# File storage

## What it is

File storage provides a unified API for uploading, managing, and serving files (assets). It supports:

- **S3-compatible object storage** (AWS S3, MinIO, etc.) when configured
- **Filesystem fallback** when S3 is not configured
- **Public and private assets** with visibility control
- **Multipart uploads** via API (S3 lives behind the backend)
- **Proxy-based public URLs** for serving public assets

## Configuration

### Environment variables

```bash
# Filesystem fallback (always available)
UPLOAD_DIR=uploads
MAX_FILE_SIZE=10485760
MAX_FILE_SIZE_HARD_CAP=10485760

# S3 / MinIO (optional - enables S3 backend)
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET=saasbackend
S3_FORCE_PATH_STYLE=true
```

If `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_BUCKET` are all set, the S3 backend is used. Otherwise, the filesystem fallback is used.

## Storage model

Each asset is tracked in MongoDB via the `Asset` model:

```js
{
  _id: ObjectId,
  key: "assets/2024/01/abc123.jpg",      // storage path
  provider: "s3" | "fs",
  bucket: "saasbackend" | "fs",
  originalName: "photo.jpg",
  contentType: "image/jpeg",
  sizeBytes: 102400,
  visibility: "public" | "private",
  namespace: "default" | "avatars" | "invoices" | ...,
  visibilityEnforced: boolean,
  ownerUserId: ObjectId | null,          // null for admin-uploaded
  orgId: ObjectId | null,
  status: "uploaded" | "deleted",
  createdAt: Date,
  updatedAt: Date
}
```

## Upload namespaces

Uploads can be partitioned into **namespaces** (e.g. `avatars`, `marketing`, `invoices`). A namespace controls:

- **Max file size** (`maxFileSizeBytes`)
- **Allowed content types** (`allowedContentTypes`)
- **Key prefix** (`keyPrefix`) to organize storage keys. If not set, it defaults to `assets/<namespaceKey>`.
- **Visibility policy**
  - `defaultVisibility`: fallback when `visibility` is not provided
  - `enforceVisibility`: when true, the namespace visibility becomes the only source of truth (upload request visibility is ignored)

If an upload provides an unknown namespace, the backend falls back to `default`.

If a namespace is configured but `enabled=false`, the backend also falls back to `default`.

`MAX_FILE_SIZE_HARD_CAP` is the upload hard cap used by the API.

- Multipart parsing (multer) is capped by the environment value (`env.MAX_FILE_SIZE_HARD_CAP` or `env.MAX_FILE_SIZE`).
- Upload validation uses the **effective** hard cap (env cap possibly tightened by Global Settings).

Per-namespace limits are clamped so they cannot exceed the environment hard cap.

The hard cap can also be overridden via Global Settings:

- `GlobalSetting.key = MAX_FILE_SIZE_HARD_CAP`
- `type = number` (stored as a numeric string)

The effective hard cap is:

```
effectiveHardCap = min(env.MAX_FILE_SIZE_HARD_CAP, GlobalSetting.MAX_FILE_SIZE_HARD_CAP)
```

Important: multipart parsing (multer) is limited by the environment hard cap (`env.MAX_FILE_SIZE_HARD_CAP` or `env.MAX_FILE_SIZE`). The Global Setting participates in **validation** (rejects uploads that exceed the effective hard cap), but it cannot allow uploads larger than the env limit.

## API

### Public assets (no auth)

Serve public assets via proxy:

```
GET /public/assets/*
```

The `*` portion is the asset key (it can include slashes).

Example:

```bash
curl "http://localhost:5000/public/assets/assets/2024/01/abc123.jpg"
```

If the asset exists and is public, returns the file with correct `Content-Type`. Returns 404 if not found or private.

Responses include:

- `Cache-Control: public, max-age=31536000`

### User endpoints (JWT)

Upload a file:

```
POST /api/assets/upload
Content-Type: multipart/form-data
Authorization: Bearer <token>

Form fields:
- file: (binary)
- namespace: (optional) namespace key (default: `default`)
- visibility: "public" | "private" (optional)
- orgId: (optional)

Notes:

- If the selected namespace has `enforceVisibility=true`, the upload will always use the namespace `defaultVisibility`.
- If `enforceVisibility=false`, `visibility` is used when provided, otherwise `defaultVisibility` is applied.
```

### Advanced upload examples

**1. Upload with progress tracking:**
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -F "file=@large-video.mp4" \
  -F "namespace=marketing" \
  -F "visibility=private" \
  -F "orgId=60f7b3b3b3b3b3b3b3b3b3b3" \
  "http://localhost:5000/api/assets/upload" \
  --progress-bar
```

**2. Upload with custom namespace:**
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -F "file=@document.pdf" \
  -F "namespace=invoices" \
  -F "visibility=private" \
  "http://localhost:5000/api/assets/upload"
```

**3. Upload multiple files:**
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -F "file=@image1.jpg" \
  -F "namespace=avatars" \
  -F "visibility=public" \
  "http://localhost:5000/api/assets/upload" && \
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -F "file=@image2.png" \
  -F "namespace=avatars" \
  -F "visibility=public" \
  "http://localhost:5000/api/assets/upload"
```

**4. JavaScript upload with FormData:**
```javascript
async function uploadFile(file, namespace = 'default', visibility = 'private', orgId = null) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('namespace', namespace);
  formData.append('visibility', visibility);
  if (orgId) formData.append('orgId', orgId);

  const response = await fetch('/api/assets/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: formData
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Upload failed');
  }

  return await response.json();
}

// Usage
const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  try {
    const result = await uploadFile(file, 'avatars', 'public');
    console.log('Upload successful:', result.asset);
  } catch (error) {
    console.error('Upload failed:', error.message);
  }
});
```

**5. Upload with error handling:**
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-file.jpg" \
  -F "namespace=avatars" \
  -F "visibility=public" \
  "http://localhost:5000/api/assets/upload" \
  -w "\nHTTP Status: %{http_code}\nResponse Time: %{time_total}s\n" \
  -s
```

**6. Upload with custom metadata:**
```bash
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -F "file=@screenshot.png;type=image/png" \
  -F "namespace=marketing" \
  -F "visibility=public" \
  "http://localhost:5000/api/assets/upload"
```

### Response examples

**Successful upload response:**
```json
{
  "asset": {
    "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "key": "assets/2024/01/abc123.jpg",
    "originalName": "photo.jpg",
    "contentType": "image/jpeg",
    "sizeBytes": 102400,
    "visibility": "public",
    "namespace": "avatars",
    "publicUrl": "/public/assets/assets/2024/01/abc123.jpg",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Error responses:**

**File too large:**
```json
{
  "error": "File too large",
  "code": "FILE_TOO_LARGE",
  "maxSize": 10485760
}
```

**Invalid file type:**
```json
{
  "error": "Invalid file type",
  "code": "INVALID_FILE_TYPE",
  "allowedTypes": ["image/jpeg", "image/png", "image/gif"]
}
```

**Missing namespace:**
```json
{
  "error": "Namespace not found",
  "code": "NAMESPACE_NOT_FOUND",
  "namespace": "invalid-namespace"
}
```

**Unauthorized:**
```json
{
  "error": "Unauthorized",
  "code": "UNAUTHORIZED"
}
```

### Download examples

**Download private file:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/assets/60f7b3b3b3b3b3b3b3b3b3b3/download" \
  -o downloaded-file.jpg
```

**Get asset details:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/assets/60f7b3b3b3b3b3b3b3b3b3b3"
```

**Response:**
```json
{
  "asset": {
    "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "key": "assets/2024/01/abc123.jpg",
    "originalName": "photo.jpg",
    "contentType": "image/jpeg",
    "sizeBytes": 102400,
    "visibility": "private",
    "namespace": "avatars",
    "publicUrl": null,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### List assets examples

**List all assets:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/assets"
```

**List with pagination:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/assets?page=2&limit=10"
```

**Filter by visibility:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/assets?visibility=public"
```

**Response:**
```json
{
  "assets": [
    {
      "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
      "key": "assets/2024/01/abc123.jpg",
      "originalName": "photo.jpg",
      "contentType": "image/jpeg",
      "sizeBytes": 102400,
      "visibility": "public",
      "namespace": "avatars",
      "publicUrl": "/public/assets/assets/2024/01/abc123.jpg"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

### Delete examples

**Delete asset:**
```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/api/assets/60f7b3b3b3b3b3b3b3b3b3b3"
```

**Response:**
```json
{
  "message": "Asset deleted successfully"
}
```

Note:

- `key` includes the `assets/` prefix.
- `publicUrl` is returned only when `visibility` is `public`, and is `/public/assets/${key}`.

List my assets:

```
GET /api/assets
Authorization: Bearer <token>
```

Query params:

- `visibility`: filter by visibility
- `page`, `limit`: pagination

Get asset details:

```
GET /api/assets/:id
Authorization: Bearer <token>
```

Download private asset:

```
GET /api/assets/:id/download
Authorization: Bearer <token>
```

Delete asset:

```
DELETE /api/assets/:id
Authorization: Bearer <token>
```

### Admin endpoints (basic auth)

```
GET    /api/admin/assets/info
GET    /api/admin/assets
GET    /api/admin/assets/:id
POST   /api/admin/assets/upload
PATCH  /api/admin/assets/:id
DELETE /api/admin/assets/:id

GET    /api/admin/upload-namespaces
GET    /api/admin/upload-namespaces/summary
GET    /api/admin/upload-namespaces/:key
POST   /api/admin/upload-namespaces
PUT    /api/admin/upload-namespaces/:key
DELETE /api/admin/upload-namespaces/:key
```

Upload namespace examples:

```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "http://localhost:5000/api/admin/upload-namespaces"
```

```bash
curl -X POST -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "avatars",
    "enabled": true,
    "maxFileSizeBytes": 2097152,
    "allowedContentTypes": ["image/png", "image/jpeg"],
    "keyPrefix": "assets/avatars",
    "defaultVisibility": "private",
    "enforceVisibility": false
  }' \
  "http://localhost:5000/api/admin/upload-namespaces"
```

Storage info:

```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "http://localhost:5000/api/admin/assets/info"
```

List all assets:

```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "http://localhost:5000/api/admin/assets"
```

Upload (admin):

```bash
curl -X POST -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  -F "file=@logo.png" \
  -F "visibility=public" \
  "http://localhost:5000/api/admin/assets/upload"
```

Update visibility:

```bash
curl -X PATCH -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"visibility": "private"}' \
  "http://localhost:5000/api/admin/assets/ASSET_ID"
```

Delete:

```bash
curl -X DELETE -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "http://localhost:5000/api/admin/assets/ASSET_ID"
```

## Admin UI

Open:

```
GET /admin/assets
```

If mounted under a prefix (example `/saas`):

- `/saas/admin/assets`

Features:

- List all assets with filters (visibility, content type)
- Upload new assets
- Toggle public/private
- Copy public URL
- Delete assets

## Allowed file types

Default allowed types:

- **Images**: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml`
- **Documents**: `application/pdf`
- **Videos**: `video/mp4`, `video/webm`

Configurable via `ALLOWED_CONTENT_TYPES` env var (comma-separated).

## Troubleshooting

### Files not uploading

- Check `MAX_FILE_SIZE` env var
- Ensure content type is allowed
- Check S3 credentials if using S3 backend

### Public URL returns 404

- Verify asset visibility is `public`
- Confirm asset status is `uploaded` (not `deleted`)

### S3 connection issues

- Verify `S3_ENDPOINT` is reachable
- Check `S3_FORCE_PATH_STYLE=true` for MinIO
- Ensure bucket exists and credentials have write access
