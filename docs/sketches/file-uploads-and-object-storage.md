# File Uploads + Object Storage (Sketch)

## Goal
Add a reusable file upload system suitable for SaaS products:
- User uploads (avatars, attachments)
- Public vs private objects
- Signed URL downloads
- Quotas and limits

## Non-goals (for v1)
- Full media processing pipeline
- Virus scanning (but leave hooks)

## Storage backends
- Primary: S3-compatible (AWS S3, MinIO, etc.)
- Dev fallback: local disk (optional)

## Data model (Mongoose)
### `FileObject`
- `userId` (ObjectId -> User, required, index)
- `orgId` (ObjectId -> Organization, optional, index)
- `key` (string, required, unique) (storage path)
- `bucket` (string, required)
- `contentType` (string)
- `sizeBytes` (number)
- `originalName` (string)
- `visibility` (`private` | `public`)
- `sha256` (string, optional)
- `status` (`uploaded` | `deleted`)
- timestamps

Indexes:
- `{ userId: 1, createdAt: -1 }`

## Upload approach
Preferred: direct-to-storage uploads via signed URLs
1. Client requests signed upload URL
2. Client uploads directly to S3
3. Client confirms upload

Fallback: multipart upload to API (simpler, more load)

## API endpoints (sketch)
All endpoints require **JWT**.

- `POST /api/files/upload-url`
  - body: `{ contentType, sizeBytes, originalName, visibility }`
  - response: `{ fileId, uploadUrl, key, headers? }`

- `POST /api/files/confirm`
  - body: `{ fileId }`
  - marks status uploaded

- `GET /api/files`
  - list files (paginated)

- `GET /api/files/:id/download-url`
  - returns signed download URL (private) or direct URL (public)

- `DELETE /api/files/:id`
  - soft delete DB + optionally delete from storage

### Admin (Basic Auth)
- `GET /api/admin/files` (support)

## Validation and limits
- Max file size per upload
- Allowed content types
- Quotas per user/org (see `usage-metering-and-entitlements.md`)

## Activity logging
- `file_upload_requested`
- `file_uploaded`
- `file_deleted`

## Implementation outline (files)
- `src/models/FileObject.js`
- `src/services/objectStorage.service.js` (S3 client wrapper)
- `src/controllers/file.controller.js`
- `src/routes/file.routes.js`

## Testing checklist
- Signed upload URL works
- Confirm marks uploaded
- Download URL only for owner
- Public visibility returns public URL

## Open questions
- Do we delete objects immediately or via background job?
- Do we support per-org shared files?
- Do we store `sha256` for dedupe/integrity?
