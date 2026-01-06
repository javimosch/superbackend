# SQLite Fallback Support

## Overview

SaasBackend now includes minimal SQLite support via **ChikkaDB-TS**, a Mongoose-compatible translation layer. When MongoDB URI is not configured, the system automatically falls back to SQLite.

## Automatic Fallback

SQLite mode activates automatically when:
- `MONGODB_URI` environment variable is not set
- `MONGO_URI` environment variable is not set
- No `mongodbUri` option is passed to middleware

```javascript
// No MongoDB configured → uses SQLite automatically
const middleware = createMiddleware({
  // Other options...
});

// Explicitly use SQLite
const middleware = createMiddleware({
  useSQLite: true
});
```

## Database Location

- **Default:** `./data/saasbackend.db` (relative to working directory)
- **Configurable:**
  ```javascript
  const middleware = createMiddleware({
    dataDir: '/custom/data/path',
    dbPath: '/custom/data/path/mydb.db'
  });
  ```

## Features Supported (MVP)

✅ Basic CRUD operations (Create, Read, Update, Delete)  
✅ Document queries (find, findById, findOne)  
✅ Batch operations (updateMany, deleteMany)  
✅ Field indexing  
✅ Timestamps (createdAt, updatedAt)  
✅ Schema validation (basic type checking)  
✅ Pre-save hooks  

## Limitations

⚠️ Not supported in this version:
- MongoDB aggregation pipelines
- Complex population/joins (use manual queries instead)
- Transactions
- Full-text search
- Bulk write operations

## How It Works

### Architecture

1. **ChikkaDB-TS** (`src/db/chikkadb-ts/`) - SQLite translation layer
   - `Connection.js` - Database connection and persistence
   - `Schema.js` - Schema definition parser
   - `Model.js` - Mongoose-compatible model wrapper
   - `Query.js` - Query builder for SQL generation
   - `Document.js` - Document instance wrapper

2. **Mongoose Adapter** (`src/db/mongoose-adapter.js`) - Runtime override
   - Detects MongoDB URI availability
   - Initializes appropriate database backend
   - Overrides mongoose.model() on-the-fly
   - Maintains API compatibility

### Zero-Change Integration

Model code requires **no modifications**:

```javascript
// models/User.js - Works identically with both MongoDB and SQLite
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: String,
  ...
});

module.exports = mongoose.model('User', userSchema);
```

All existing controllers and routes work unchanged.

## Environment Variables

### MongoDB (Production)
```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname
```

### SQLite (Default when MONGODB_URI not set)
```env
# No MONGODB_URI required, falls back to ./data/saasbackend.db
```

## Docker Usage

### Volume Mount
```yaml
services:
  app:
    image: saasbackend:latest
    volumes:
      - ./data:/app/data  # Persist SQLite database
```

### Environment Override
```yaml
services:
  app:
    environment:
      - MONGODB_URI=mongodb://mongo:27017/saasbackend
```

## Query Examples

Both MongoDB and SQLite support the same syntax:

```javascript
const User = require('../models/User');

// Find all
await User.find();

// Find with filter
await User.find({ email: 'user@example.com' });

// Find one
await User.findOne({ role: 'admin' });

// Find by ID
await User.findById(userId);

// Create
await User.create({ email: 'new@example.com', name: 'John' });

// Update
await User.updateOne({ id }, { name: 'Jane' });

// Delete
await User.deleteOne({ id });

// Count
await User.countDocuments({ role: 'admin' });
```

## Performance Notes

- **SQLite** is suitable for:
  - Small to medium datasets (< 100k records)
  - Single-server deployments
  - Development/testing
  - Embedded use cases

- **MongoDB** recommended for:
  - Large-scale applications
  - Distributed systems
  - High-frequency data changes
  - Complex queries

## Troubleshooting

### "Cannot read property 'init' of undefined"
Ensure `sql.js` is installed: `npm install sql.js`

### Database file not persisting
Check directory permissions on the data directory:
```bash
chmod 755 ./data
```

### Slow queries on large datasets
SQLite is not optimized for millions of records. Consider:
- Using MongoDB for production
- Archiving old data
- Adding query indexes

## Future Enhancements (v2+)

- [ ] SQLite-specific query optimizations
- [ ] Bulk import/export utilities
- [ ] Migration tools (SQLite ↔ MongoDB)
- [ ] Multi-database support
- [ ] Query caching layer
- [ ] Aggregation pipeline support
