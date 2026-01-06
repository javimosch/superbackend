# ChikkaDB-TS: SQLite Fallback for SaasBackend

## Overview

**ChikkaDB-TS** is a Mongoose-compatible SQLite translation layer that enables automatic fallback to SQLite when MongoDB is not configured.

### Key Features

- ✅ **Zero Code Changes**: All existing models work unchanged
- ✅ **Automatic Fallback**: SQLite activates when `MONGODB_URI` is not set
- ✅ **Mongoose Compatible API**: Same query syntax for both databases
- ✅ **CRUD Operations**: Create, Read, Update, Delete fully supported
- ✅ **Schema Support**: Indexes, timestamps, validations
- ✅ **Pure JavaScript**: No native dependencies (uses sql.js)

## Architecture

```
Mongoose Models (unchanged)
        ↓
 mongoose.model() override
        ↓
    ┌───────────────────┐
    │  Adapter Selector │
    └───────┬───────────┘
            ↓
    ┌─────────────────┐
    │  MongoDB URI?   │
    └─────┬───────┬───┘
        YES      NO
         ↓        ↓
      Mongoose  ChikkaDB-TS
         ↓        ↓
      MongoDB   SQLite
```

## Quick Start

### 1. Automatic Detection

```javascript
const { createMiddleware } = require('saasbackend');

// Automatically uses SQLite if MONGODB_URI not set
const middleware = createMiddleware({
  corsOrigin: 'http://localhost:3000'
});
```

### 2. With MongoDB (Production)

```javascript
const middleware = createMiddleware({
  mongodbUri: process.env.MONGODB_URI,
  corsOrigin: 'http://localhost:3000'
});
```

### 3. Explicit SQLite

```javascript
const middleware = createMiddleware({
  useSQLite: true,
  dataDir: './data',
  dbPath: './data/app.db'
});
```

## Database Operations

All standard Mongoose operations work identically:

```javascript
const User = require('./models/User');

// Create
const user = await User.create({
  email: 'user@example.com',
  name: 'John Doe'
});

// Read
const found = await User.findOne({ email: 'user@example.com' });
const byId = await User.findById(user.id);
const all = await User.find();

// Update
await User.updateOne({ id: user.id }, { name: 'Jane Doe' });

// Delete
await User.deleteOne({ id: user.id });

// Count
const count = await User.countDocuments();
```

## File Structure

```
src/db/
├── chikkadb-ts/
│   ├── index.js           # ChikkaDB class, exports
│   ├── Connection.js      # SQLite connection via sql.js
│   ├── Schema.js          # Schema definition translator
│   ├── Model.js           # Mongoose-compatible Model
│   ├── Query.js           # SQL query builder
│   └── Document.js        # Document wrapper class
└── mongoose-adapter.js    # Adapter pattern implementation
```

## Implementation Details

### Connection Management

```javascript
// src/db/chikkadb-ts/Connection.js
// Creates SQLite database using sql.js
// Persists to disk after each operation
// Exports SQLite-compatible db interface
```

### Schema Translation

```javascript
// Mongoose schema → SQLite columns
String      → TEXT
Number      → REAL
Boolean     → INTEGER (0/1)
Date        → TEXT (ISO string)
Object      → TEXT (JSON stringified)
```

### Query Building

```javascript
// Mongoose query → SQL
User.find({ role: 'admin' })
  → SELECT * FROM user WHERE role = ?

User.find({ age: { $gt: 18 } })
  → SELECT * FROM user WHERE age > ?
```

## Configuration Options

### Middleware Options

```javascript
{
  // SQLite settings
  useSQLite: boolean,              // Force SQLite (default: auto-detect)
  dataDir: string,                 // Data directory (default: './data')
  dbPath: string,                  // Full DB path (default: dataDir/saasbackend.db)
  
  // Existing options
  corsOrigin: string,
  mongodbUri: string,
  // ... other options
}
```

### Environment Variables

```bash
# MongoDB (takes precedence)
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname

# SQLite is used if MONGODB_URI is not set
# No additional env vars required for SQLite
```

## Supported Query Operators

```javascript
// Equality
{ field: value }

// Comparison
{ field: { $gt: value } }      // >
{ field: { $gte: value } }     // >=
{ field: { $lt: value } }      // <
{ field: { $lte: value } }     // <=
{ field: { $ne: value } }      // !=
{ field: { $eq: value } }      // =

// Membership
{ field: { $in: [v1, v2] } }   // IN (...)
{ field: { $nin: [v1, v2] } }  // NOT IN (...)

// Pattern
{ field: { $regex: pattern } } // LIKE %pattern%
```

## Limitations

### Not Supported

- Mongoose population/refs (manual queries needed)
- Aggregation pipelines
- Transactions
- Full-text search
- Bulk operations
- Schema methods (v2+)

### Recommended Constraints

- **Data Size**: < 100k records
- **Deployment**: Single-server only
- **Use Case**: Development, testing, embedded
- **Not For**: Large-scale production

## Docker Integration

### Volume Mount

```yaml
services:
  app:
    image: saasbackend:latest
    volumes:
      - ./data:/app/data
    # No MongoDB required
```

### With MongoDB

```yaml
services:
  app:
    environment:
      MONGODB_URI: mongodb://mongo:27017/saasbackend
  mongo:
    image: mongo:latest
    volumes:
      - mongo-data:/data/db
```

## Performance Notes

### SQLite Optimization Tips

1. **Indexes**: Define on frequently queried fields
   ```javascript
   email: { type: String, index: true }
   ```

2. **Pagination**: Use limit/skip for large result sets
   ```javascript
   User.find().limit(100).skip(offset)
   ```

3. **Data Cleanup**: Archive old records periodically
   ```javascript
   await LogEntry.deleteMany({ createdAt: { $lt: thirtyDaysAgo } })
   ```

### MongoDB for Production

For production deployments with:
- > 100k records
- Multiple servers
- High write frequency
- Complex queries

Use MongoDB instead. Fallback is for development/testing only.

## Debugging

### Check Database Mode

```javascript
const { isSQLite, shouldUseSQLite } = require('./src/db/mongoose-adapter');

console.log('Using SQLite:', isSQLite());
console.log('Should use SQLite:', shouldUseSQLite());
```

### View Database File

```bash
# Check if SQLite file exists
ls -lh ./data/saasbackend.db

# Inspect with sqlite3 CLI
sqlite3 ./data/saasbackend.db ".tables"
```

## Troubleshooting

### "Database file not found"

```bash
# Create data directory
mkdir -p ./data
chmod 755 ./data
```

### Slow queries

- Reduce data size (archive old records)
- Add indexes to frequently queried fields
- Use MongoDB for production

### Memory issues

SQLite keeps entire database in memory. For large datasets:
- Use MongoDB
- Archive/partition data
- Implement pagination

## Migration to MongoDB

When transitioning from SQLite to MongoDB:

```javascript
// Existing code works unchanged
const User = require('./models/User');

// Just set MONGODB_URI environment variable
process.env.MONGODB_URI = 'mongodb://...';

// Restart application
// Models automatically use MongoDB
```

## Testing

Run ChikkaDB tests:

```bash
npm test -- src/db/chikkadb-ts/chikkadb-ts.test.js
```

Run all tests (with SQLite):

```bash
npm test
# Note: Some tests expecting MongoDB may timeout
```

## Future Enhancements

- [ ] Schema method support
- [ ] Query performance optimizations
- [ ] Bulk insert/update operations
- [ ] Aggregation pipeline simulation
- [ ] Data migration utilities
- [ ] Query caching layer

## Contributing

ChikkaDB-TS is part of the SaasBackend project. For contributions:

1. Keep Mongoose API compatibility
2. Add tests for new features
3. Update documentation
4. No breaking changes to models

## License

MIT - Same as SaasBackend

## Support

For issues or questions:
- Check docs/features/sqlite-fallback.md
- Review test cases in src/db/chikkadb-ts/
- Open an issue on GitHub
