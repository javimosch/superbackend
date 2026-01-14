# Asset migration across environments (Bulk Migration)

## Context
We already support migrating documents to a target MongoDB connection via migration environments stored as encrypted `GlobalSetting` keys `ENV_CONF_*`.

Next step is to make environments **asset-aware** so a venue migration can also copy its referenced assets to the target environment regardless of storage backend.

Goals:

- Support object copy combinations:
  - **fs -> fs**
  - **fs -> s3**
  - **s3 -> fs**
  - **s3 -> s3**
- Support remote filesystem as a target (and optionally as a source) via **SSH/SFTP**.
- Keep `apres-parties` server-side logic thin: it should call @intranefr/superbackend helpers and not implement storage details.
- Add admin tooling in the @intranefr/superbackend migration view to **test**:
  - DB connection
  - Asset target connectivity
  - Optional "test copy" of a sample key

Constraints:

- Minimal changes to existing files.
- Try to keep changes under **< 500 LOC per file**.

## Proposed environment config extension
We extend the encrypted JSON stored under `ENV_CONF_*`:

```json
{
  "name": "staging",
  "description": "...",
  "connectionString": "mongodb://...",
  "assets": {
    "target": {
      "type": "fs_local" | "fs_remote" | "s3",
      "fs": {
        "baseDir": "uploads"
      },
      "ssh": {
        "host": "example.com",
        "port": 22,
        "username": "ubuntu",
        "privateKeyPem": "-----BEGIN...",
        "passphrase": "optional",
        "baseDir": "/var/app/uploads"
      },
      "s3": {
        "endpoint": "https://s3...",
        "region": "us-east-1",
        "bucket": "...",
        "accessKeyId": "...",
        "secretAccessKey": "...",
        "forcePathStyle": false
      }
    }
  }
}
```

Notes:

- Secrets are stored only inside the env payload which is already encrypted via `encryptString`.
- `privateKeyPem` is accepted from UI as pasted PEM.
- We can allow later: `hostKeyFingerprint` for pinning.

## Storage I/O abstraction (@intranefr/superbackend)
Add a small service layer that can read/write objects by `key` for three endpoint types.

### New files (keep each small)
- `src/services/migrationAssets/index.js`
  - exports `{ resolveSourceEndpoint, resolveTargetEndpoint, testEndpoint, copyKeys }`
- `src/services/migrationAssets/fsLocal.js`
- `src/services/migrationAssets/s3.js`
- `src/services/migrationAssets/sftp.js`

### Endpoint interface
A resolved endpoint returns:

- `type`
- `getObject({ key }) -> { body, contentType } | null`
- `putObject({ key, body, contentType })`
- `stat?/exists?` optional

### Source endpoint resolution
Default source is "current instance":

- Use existing `objectStorage.service` to infer active backend (fs/s3)
- If fs: local base dir from `UPLOAD_DIR`
- If s3: config from global settings/env (already implemented by `objectStorage.service`)

### Target endpoint resolution
Order:

1. If `ENV_CONF_*.assets.target` exists: use it.
2. Else fallback to the target DB `GlobalSetting` storage config (`STORAGE_BACKEND`, `STORAGE_S3_CONFIG`).
3. Else fallback to local fs with `UPLOAD_DIR`.

## Migration service API
Extend `src/services/migration.service.js` with:

- `copyAssetKeys({ targetEnvKey, keys, dryRun, batchSize })`
  - reads from resolved source endpoint
  - writes to resolved target endpoint
  - returns `{ ok, requested, copied, skipped, failed[] }`

Keep existing `copyAssetObjects` (if present) but implement it via `copyAssetKeys`.

## Admin API changes (@intranefr/superbackend)
In `src/controllers/adminMigration.controller.js` + routes:

- `POST /api/admin/migration/test-assets`
  - `{ envKey }`
  - tests target endpoint connectivity:
    - `fs_local`: validate directory is writable
    - `s3`: `HeadBucket` and (optionally) `PutObject` to `__migration_test__/...`
    - `fs_remote`: open SFTP + ensure baseDir exists / is writable

- `POST /api/admin/migration/test-assets-copy`
  - `{ envKey, key }`
  - reads sample object from current instance + writes to target
  - can be used by UI to validate full path

Both endpoints protected by `basicAuth` and audited.

## Admin UI changes (@intranefr/superbackend)
Update `views/admin-migration.ejs`:

- In environment editor add an "Assets target" section:
  - type selector: fs_local / fs_remote / s3
  - conditional fields
- Add buttons:
  - "Test assets connectivity" -> calls `/test-assets`
  - "Test copy key" -> input `key` + calls `/test-assets-copy`

## `apres-parties` changes
Reduce server-side complexity in `src/services/venueMigration.js`:

- Keep venue and asset document migration as-is.
- Replace any byte-copy logic with:

`@intranefr/superbackend.services.migration.copyAssetKeys({ targetEnvKey: envKey, keys, dryRun })`

UI remains "asset aware" but only displays the returned copy summary.

## Dependencies
Add to `ref-@intranefr/superbackend/package.json`:

- `ssh2-sftp-client` (or `ssh2`)

S3 dependency is already present (`@aws-sdk/client-s3`).

## Rollout checklist
- Save a test env with fs_local target and validate copy works.
- Save an env with S3 target and validate connectivity + copy.
- Save an env with fs_remote target and validate SFTP connectivity + copy.
- Run venue migration in `apres-parties` with includeAssets enabled.

## Open questions
- Should we allow remote FS as a **source** (copying from remote to local)?
  - Current plan assumes source is always the current instance.
  - Can be added later by allowing `source` endpoint config in env payload.
