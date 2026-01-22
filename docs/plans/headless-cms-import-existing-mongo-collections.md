# Plan: Headless CMS – Import existing Mongo collections as external models (schema inference + re-sync)

## Goal
Enable users to bring **existing MongoDB collections** (created outside the Headless CMS) into the Headless CMS as **models**, so they can:

- Browse/edit documents in the Admin UI (Collections tab)
- Use the public Headless API endpoints against those collections
- Mark these models as **external** (source-of-truth is Mongo, not the CMS schema editor)
- Re-run **Sync/Infer** to refresh the inferred schema from MongoDB

## Current state (what exists)

### Model definitions
- Persisted in `src/models/HeadlessModelDefinition.js` (`headless_model_definitions`)
- Dynamic runtime model generation in `src/services/headlessModels.service.js`:
  - Collection name is **always** `headless_<codeIdentifier>` (`MODEL_COLLECTION_PREFIX`)
  - Mongoose schema is built from stored `fields` and `indexes`
  - `strict: false` so Mongo can store extra fields
  - Auto migration (`ensureAutoMigration`) sets defaults/unsets removed fields on `headless_<codeIdentifier>`

### Admin UI
- Headless CMS admin page: `views/admin-headless.ejs`
- Admin routes: `src/routes/adminHeadless.routes.js`
- Admin controller: `src/controllers/adminHeadless.controller.js`

### Gap
There is **no support** for:
- Referencing an **arbitrary existing collection name**
- Marking a model as **external**
- Inferring a schema from existing documents

## Key requirements

- **Import**: choose an existing collection (e.g. `users`, `orders`) and create a CMS model from it.
- **External flag**: imported models are clearly labeled and treated differently.
- **Schema inference**: infer fields/types from real data, without needing Mongoose schema to exist.
- **Re-sync**: a button to re-run inference and update the stored model definition.
- **Safety**: never mutate or migrate external collections automatically.

## Proposed high-level design

### A) Model definition gains a “source”
Extend `HeadlessModelDefinition` to support 2 sources:

- `source.type: "internal"` (current behavior)
  - collection is `headless_<codeIdentifier>`
  - schema is user-defined
  - auto-migration can run

- `source.type: "external"` (new)
  - collection is `source.collectionName` (existing Mongo collection)
  - schema is inferred (and can be edited if you choose to allow overrides)
  - **no auto-migration/unset/default backfills** on the external collection

### B) Runtime model binding supports overriding collection
Adjust dynamic model building so that:

- internal model: `collection = headless_<codeIdentifier>`
- external model: `collection = source.collectionName`

This lets the existing CRUD controllers (`headlessCrud.controller.js` and admin collections CRUD) work unchanged: they just call `getDynamicModel(modelCode)`.

### C) Schema inference uses low-level/schemaless Mongo reads
Inference runs using the **native Mongo driver via Mongoose**:

- `mongoose.connection.db.listCollections()` to list collections
- `mongoose.connection.db.collection(name).aggregate([{ $sample: { size: N } }])` to sample documents
- merge field types and produce `fields[]` compatible with existing Headless schema format

This is intentionally schemaless and does not require any pre-existing Mongoose models.

## Proposed data model changes

### HeadlessModelDefinition schema additions
Add fields (names are proposals; exact naming can be adjusted):

- `sourceType: { type: String, enum: ['internal','external'], default: 'internal', index: true }`
- `sourceCollectionName: { type: String, default: null, index: true }` (required when `sourceType=external`)
- `isExternal: { type: Boolean, default: false, index: true }` (optional redundancy; can be derived from `sourceType`)
- `inference: {
    enabled: Boolean,
    lastInferredAt: Date,
    sampleSize: Number,
    warnings: [String],
    stats: Mixed
  }`

Notes:
- Keep backwards compatible defaults so existing internal models keep working.
- Prefer a single `sourceType` rather than a standalone `isExternal` boolean.

## Proposed API changes (admin-only)
All endpoints below are under `basicAuth` (same pattern as current admin headless routes).

### 1) List Mongo collections
`GET /api/admin/headless/external/collections`

Response example:
```json
{ "items": [
  { "name": "users", "type": "collection" },
  { "name": "orders", "type": "collection" }
] }
```

Filtering ideas:
- Optional `?q=` substring filter
- Optional `?includeSystem=false` to hide `system.*`

### 2) Infer schema for a collection (dry-run)
`POST /api/admin/headless/external/infer`

Request:
```json
{ "collectionName": "users", "sampleSize": 200 }
```

Response:
```json
{
  "collectionName": "users",
  "fields": [ {"name":"email","type":"string"}, {"name":"createdAt","type":"date"} ],
  "warnings": ["Field tags has mixed types: string|array"],
  "stats": { "sampled": 200, "docsWithId": 200 }
}
```

### 3) Import collection as model (create)
`POST /api/admin/headless/external/import`

Request:
```json
{
  "codeIdentifier": "users",
  "displayName": "Users",
  "collectionName": "users",
  "sampleSize": 200
}
```

Behavior:
- validates `codeIdentifier` using existing rules
- runs inference (or reuses precomputed inference results)
- creates `HeadlessModelDefinition` with:
  - `sourceType='external'`
  - `sourceCollectionName=collectionName`
  - `fields` = inferred
  - `indexes` = [] (Phase 1)

### 4) Re-sync inferred model
`POST /api/admin/headless/models/:codeIdentifier/sync`

Behavior:
- only allowed for `sourceType=external`
- re-run inference on `sourceCollectionName`
- update `fields` (and possibly `indexes`) via existing `updateModelDefinition` path
- record `inference.lastInferredAt` and warnings

## Inference algorithm (Phase 1)

### Sampling
- Default sample size: `N=200` (configurable)
- Use `$sample` when possible; fallback to `.find({}).limit(N)` if needed.

### Type detection
Map BSON/JS values to the existing Headless field types:

- string -> `string`
- number -> `number`
- boolean -> `boolean`
- Date -> `date`
- Array -> `array`
- Object -> `object`
- ObjectId:
  - default to `string` or `object` (open question)
  - optionally detect “reference” heuristics later

### Merging strategy
For each field name across sampled docs:

- Track:
  - presence count
  - nullability
  - set of detected types

Then choose the output type:

- If only one type seen -> that type
- If mixed primitive types -> choose `object` or `array` or `string`? (recommend: fall back to `object` for mixed, warn)
- If `array` seen and array element types mixed -> keep `array` and warn

### Required/unique/default inference
Phase 1 (recommended):
- `required=false`, `unique=false`, no `default`

Reason: correctness and safety. Required/unique inference is hard and can break writes.

## Admin UI changes (Phase 1)

Update `views/admin-headless.ejs`:

### Models tab
- Add an **Import from Mongo** button
- Import modal:
  - collection selector (populated by `GET /external/collections`)
  - `codeIdentifier` + `displayName` inputs (default from collection name)
  - sample size (optional)
  - “Infer preview” (calls `/external/infer`)
  - “Import” (calls `/external/import`)

### Model list
- Show badge for external models: `External`
- Show the backing collection name for external models

### Selected model actions
- If `sourceType=external`, show **Sync/Infer** button
  - calls `POST /models/:codeIdentifier/sync`
  - refreshes model list and re-renders fields

### Collections tab
- No functional changes expected; should work as soon as `getDynamicModel` binds to external collection.

## Backward compatibility
- Existing internal models remain unchanged:
  - collection name remains `headless_<codeIdentifier>`
  - auto migration remains enabled
- External models:
  - must explicitly disable `ensureAutoMigration` and any backfill/unset logic

## Security & safety considerations
- Only expose this import/sync feature behind admin `basicAuth`.
- Avoid SSRF; inference is in-process and uses the existing DB connection.
- Protect against huge collections:
  - always sample/limit, never scan full collection
  - enforce maximum sample size (e.g. 1000)
- Avoid touching system collections by default (e.g. `system.*`).

## Testing strategy (plan)

### Unit tests
- Inference function:
  - single-type fields
  - mixed types -> warnings
  - nested objects/arrays

### Integration tests
- Import a seeded external collection, ensure:
  - model definition created with `sourceType=external`
  - `getDynamicModel` uses the external collection name
  - admin collections CRUD can list documents from that external collection

## Open questions (need your decision before implementation)

Locked in:

1. **ObjectId mapping**:
  - Infer primitives as `string|number|date|boolean`.
  - Infer `ObjectId` as `string` by default.
  - **Attempt `ref` inference** for `ObjectId` fields where possible.

2. **Editing inferred schema**:
  - External models are **read-only** in the schema editor for now.

3. **Naming collisions**:
  - Force external model `codeIdentifier` prefix: `ext_...`.

4. **Indexes**:
  - Read existing Mongo indexes via `collection.indexes()` and store them in `HeadlessModelDefinition.indexes`.

## Milestones
1. Add model definition source fields + dynamic model collection override.
2. Implement inference service + admin endpoints (list collections, infer, import, sync).
3. Update Admin UI (import modal + external badge + sync button).
4. Add tests and a manual verification checklist.

## Implementation details (final)

### Persistence
Implemented in `src/models/HeadlessModelDefinition.js`:

- `sourceType: 'internal'|'external'`
- `sourceCollectionName` (for external)
- `isExternal` (redundant flag for compatibility)
- `inference.{enabled,lastInferredAt,sampleSize,warnings,stats}`

### Dynamic model binding
Implemented in `src/services/headlessModels.service.js`:

- External definition detection: `sourceType === 'external' || isExternal === true`
- Collection selection:
  - internal -> `headless_<code>`
  - external -> `sourceCollectionName`
- External models:
  - do not add internal metadata fields (`_headlessModelCode`, `_headlessSchemaVersion`)
  - skip `ensureAutoMigration`
  - skip best-effort index creation

### Schema inference and import/sync
Implemented in `src/services/headlessExternalModels.service.js`:

- List collections: `mongoose.connection.db.listCollections()`
- Sampling:
  - preferred: `$sample` aggregation
  - fallback: `find().limit(N)`
- Field type inference:
  - primitives: `string|number|boolean|date`
  - arrays: `array`
  - objects: `object`
  - ObjectId:
    - stored as `string` by default
    - attempts `ref` inference using a simple field-name heuristic (e.g. `userId` -> collection/model `users` if an external model exists for that collection)
- Index import:
  - reads Mongo indexes via `collection.indexes()`
  - stores them in model definition `indexes[]`
- External models require `codeIdentifier` prefix `ext_` (validated server-side)

### Admin endpoints
Implemented in `src/controllers/adminHeadless.controller.js` and `src/routes/adminHeadless.routes.js`:

- `GET /api/admin/headless/external/collections`
- `POST /api/admin/headless/external/infer`
- `POST /api/admin/headless/external/import`
- `POST /api/admin/headless/models/:codeIdentifier/sync`

### Admin UI
Implemented in `views/admin-headless.ejs`:

- Models list shows an `External` badge and collection name.
- Import modal:
  - lists collections
  - infers preview
  - imports a model as `ext_<collection>` by default
- External models:
  - schema table inputs are disabled
  - advanced JSON and AI builder are disabled
  - `Save schema` is blocked and shows a message
  - `Sync/Infer` triggers server-side re-inference.
