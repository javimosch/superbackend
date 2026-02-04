# Script Development Guide

## Overview

The SuperBackend script system provides a standardized way to create and run database-backed scripts with automatic connection management, error handling, and CLI support. This guide covers how to use the script helper utilities to create robust, maintainable scripts.

## Core Components

### 1. MongooseHelper

Centralized MongoDB connection management with reference counting and automatic cleanup.

```javascript
const { mongooseHelper } = require('../src/helpers/mongooseHelper');

// Connect to database
await mongooseHelper.connect();

// Get connection status
const status = mongooseHelper.getStatus();

// Disconnect (reference counted)
await mongooseHelper.disconnect();

// Force disconnect regardless of references
await mongooseHelper.forceDisconnect();
```

### 2. ScriptBase

Base class for all scripts providing:
- Automatic database connection management
- Standardized logging
- Timeout handling
- Setup/cleanup hooks
- Validation

```javascript
const { ScriptBase } = require('../src/helpers/scriptBase');

class MyScript extends ScriptBase {
  constructor(options = {}) {
    super({
      name: 'MyScript',
      timeout: 300000, // 5 minutes
      ...options
    });
  }

  async execute({ mongoose, models, connection, db }) {
    // Main script logic here
    this.log('info', 'Running script logic...');
    
    // Use mongoose models
    const User = models.User;
    const users = await User.find({});
    
    return { count: users.length };
  }

  async setup(context) {
    // Called before execute
    this.log('debug', 'Setting up script');
  }

  async cleanup(context) {
    // Called after execute (even on error)
    this.log('debug', 'Cleaning up script');
  }
}
```

### 3. ScriptRunner

Utility for running scripts with CLI wrapper functionality.

```javascript
const { ScriptRunner } = require('../src/helpers/scriptRunner');

// Run a script directly
const result = await ScriptRunner.run(MyScript, { timeout: 60000 });

// Create CLI wrapper
const cliScript = ScriptRunner.createCli(MyScript, { 
  timeout: 60000,
  name: 'My CLI Script'
});

// Export for both CLI and module usage
module.exports = cliScript;
```

## Script Patterns

### Pattern 1: Simple Function Script

For simple scripts, you can use a plain async function:

```javascript
const { ScriptRunner } = require('../src/helpers/scriptRunner');

async function mySimpleScript({ mongoose }, options = {}) {
  // Script logic here
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  
  return { collections: collections.length };
}

// Create CLI wrapper
module.exports = ScriptRunner.createCli(mySimpleScript);

// Run if called directly
if (require.main === module) {
  module.exports();
}
```

### Pattern 2: Class-Based Script

For more complex scripts with setup/cleanup:

```javascript
const { ScriptBase, ScriptRunner } = require('../src/helpers');

class DataMigrationScript extends ScriptBase {
  constructor(options = {}) {
    super({
      name: 'DataMigrationScript',
      timeout: 600000, // 10 minutes
      ...options
    });
  }

  async execute({ mongoose }) {
    const startTime = Date.now();
    
    // Migration logic
    await this.migrateUsers();
    await this.migratePosts();
    
    const duration = Date.now() - startTime;
    this.log('info', `Migration completed in ${duration}ms`);
    
    return { success: true, duration };
  }

  async migrateUsers() {
    const User = mongoose.models.User;
    // Migration logic here
  }

  async migratePosts() {
    const Post = mongoose.models.Post;
    // Migration logic here
  }
}

module.exports = ScriptRunner.createCli(DataMigrationScript);
```

### Pattern 3: Batch Script

Run multiple scripts in sequence or parallel:

```javascript
const { ScriptRunner } = require('../src/helpers/scriptRunner');

const scripts = [
  { script: CleanupScript, options: { dryRun: false } },
  { script: MigrationScript, options: { version: '2.0' } },
  { script: ValidationScript, options: { strict: true } }
];

// Create batch runner
const batchRunner = ScriptRunner.createBatch(scripts, {
  stopOnError: true,
  parallel: false
});

// Run batch
const { results, errors } = await batchRunner();
```

### Pattern 4: Scheduled Script

Run scripts on a schedule:

```javascript
const { ScriptRunner } = require('../src/helpers/scriptRunner');

const scheduledScript = ScriptRunner.createScheduled(CleanupScript, {
  interval: 3600000, // 1 hour
  runOnStart: true,
  maxRuns: 24 // Run 24 times then stop
});

// Start scheduled execution
scheduledScript.start();

// Stop later
scheduledScript.stop();
```

## CLI Usage

Scripts support command-line arguments:

```bash
# Run script with default options
node scripts/my-script.js

# Pass options via command line
node scripts/my-script.js --timeout=120000 --dryRun=true

# Pass JSON values
node scripts/my-script.js --config='{"batchSize":1000,"retries":3}'
```

## Environment Variables

Scripts automatically use these environment variables:

- `MONGODB_URI` or `MONGO_URI` - MongoDB connection string
- `DEBUG` - Enable debug logging
- `NODE_ENV` - Environment mode (affects logging)

## Best Practices

### 1. Error Handling

```javascript
class RobustScript extends ScriptBase {
  async execute({ mongoose }) {
    try {
      // Validate preconditions
      await this.validatePreconditions();
      
      // Execute main logic
      const result = await this.processData();
      
      // Validate results
      await this.validateResults(result);
      
      return result;
    } catch (error) {
      this.log('error', 'Script failed', { error: error.message });
      throw error;
    }
  }
  
  async validatePreconditions() {
    const status = mongooseHelper.getStatus();
    if (!status.isConnected) {
      throw new Error('Database not connected');
    }
  }
}
```

### 2. Progress Reporting

```javascript
class ProgressScript extends ScriptBase {
  async execute({ mongoose }) {
    const total = await this.getTotalItems();
    let processed = 0;
    
    this.log('info', `Processing ${total} items`);
    
    for await (const item of this.getItemStream()) {
      await this.processItem(item);
      processed++;
      
      // Report progress every 10%
      if (processed % Math.ceil(total * 0.1) === 0) {
        const percent = Math.round((processed / total) * 100);
        this.log('info', `Progress: ${percent}% (${processed}/${total})`);
      }
    }
    
    this.log('info', `Completed processing ${processed} items`);
    return { processed };
  }
}
```

### 3. Configuration Management

```javascript
class ConfigurableScript extends ScriptBase {
  constructor(options = {}) {
    const defaultConfig = {
      batchSize: 1000,
      retries: 3,
      timeout: 300000
    };
    
    super({
      name: 'ConfigurableScript',
      ...defaultConfig,
      ...options
    });
  }
  
  validate() {
    const validation = super.validate();
    
    if (this.batchSize <= 0 || this.batchSize > 10000) {
      validation.errors.push('batchSize must be between 1 and 10000');
    }
    
    return validation;
  }
}
```

### 4. Resource Management

```javascript
class ResourceAwareScript extends ScriptBase {
  async execute({ mongoose }) {
    const resources = [];
    
    try {
      // Acquire resources
      const lock = await this.acquireLock();
      resources.push(lock);
      
      const tempCollection = await this.createTempCollection();
      resources.push(tempCollection);
      
      // Execute logic
      const result = await this.processWithResources();
      
      return result;
    } finally {
      // Cleanup resources
      for (const resource of resources.reverse()) {
        await this.releaseResource(resource);
      }
    }
  }
}
```

## Testing Scripts

### Unit Testing

```javascript
const { MyScript } = require('./my-script');
const { mongooseHelper } = require('../src/helpers/mongooseHelper');

describe('MyScript', () => {
  beforeEach(async () => {
    await mongooseHelper.connect();
  });
  
  afterEach(async () => {
    await mongooseHelper.forceDisconnect();
  });
  
  test('should process data correctly', async () => {
    const script = new MyScript({ timeout: 5000 });
    const result = await script.run();
    
    expect(result.success).toBe(true);
    expect(result.processed).toBeGreaterThan(0);
  });
});
```

### Integration Testing

```javascript
const { ScriptRunner } = require('../src/helpers/scriptRunner');

describe('Script Integration', () => {
  test('should run via CLI wrapper', async () => {
    const cliScript = ScriptRunner.createCli(MyScript);
    const result = await cliScript({ testMode: true });
    
    expect(result).toBeDefined();
  });
  
  test('should handle CLI arguments', async () => {
    // Test with different argument formats
    const options = { batchSize: 100, dryRun: true };
    const result = await ScriptRunner.run(MyScript, options);
    
    expect(result).toBeDefined();
  });
});
```

## Migration Guide

### From Manual Connection Management

**Before:**
```javascript
const mongoose = require('mongoose');

async function oldScript() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    // Script logic...
    await mongoose.disconnect();
  } catch (error) {
    await mongoose.disconnect();
    throw error;
  }
}
```

**After:**
```javascript
const { ScriptBase, ScriptRunner } = require('../src/helpers');

class NewScript extends ScriptBase {
  async execute({ mongoose }) {
    // Script logic... (connection handled automatically)
  }
}

module.exports = ScriptRunner.createCli(NewScript);
```

## Common Use Cases

### Data Cleanup

```javascript
class CleanupScript extends ScriptBase {
  async execute({ mongoose }) {
    const cutoffDate = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)); // 30 days
    
    const result = await mongoose.models.Log.deleteMany({
      createdAt: { $lt: cutoffDate }
    });
    
    this.log('info', `Deleted ${result.deletedCount} old log entries`);
    return { deletedCount: result.deletedCount };
  }
}
```

### Data Validation

```javascript
class ValidationScript extends ScriptBase {
  async execute({ mongoose }) {
    const errors = [];
    
    // Validate users
    const invalidUsers = await mongoose.models.User.find({
      $or: [
        { email: { $exists: false } },
        { email: { $eq: '' } }
      ]
    });
    
    if (invalidUsers.length > 0) {
      errors.push(`${invalidUsers.length} users have invalid emails`);
    }
    
    return { 
      valid: errors.length === 0,
      errors 
    };
  }
}
```

### Report Generation

```javascript
class ReportScript extends ScriptBase {
  async execute({ mongoose }) {
    const report = {
      generatedAt: new Date(),
      users: await this.getUserStats(),
      posts: await this.getPostStats(),
      system: await this.getSystemStats()
    };
    
    // Save report
    await mongoose.models.Report.create(report);
    
    this.log('info', 'Report generated successfully');
    return report;
  }
  
  async getUserStats() {
    return {
      total: await mongoose.models.User.countDocuments(),
      active: await mongoose.models.User.countDocuments({ 
        lastLogin: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      })
    };
  }
}
```

## Troubleshooting

### Common Issues

1. **Connection Timeouts**
   - Increase timeout in script options
   - Check MongoDB URI and network connectivity
   - Verify database server is running

2. **Memory Issues**
   - Use batch processing for large datasets
   - Implement cursor-based iteration
   - Monitor memory usage with `process.memoryUsage()`

3. **Script Hanging**
   - Set appropriate timeout values
   - Add progress logging
   - Use Promise.race() for timeout handling

### Debug Mode

Enable debug logging:
```bash
DEBUG=1 node scripts/my-script.js
```

Or set in code:
```javascript
process.env.DEBUG = '1';
```

## Performance Tips

1. **Use Bulk Operations**
   ```javascript
   await User.insertMany(users); // Instead of individual saves
   ```

2. **Lean Queries**
   ```javascript
   const users = await User.find({}).lean(); // Returns plain objects
   ```

3. **Index Optimization**
   ```javascript
   // Ensure indexes exist for query fields
   await User.createIndex({ email: 1 });
   ```

4. **Connection Pooling**
   ```javascript
   // Helper already configures optimal pool size for scripts
   // Monitor with mongooseHelper.getStatus()
   ```

## Conclusion

The script helper system provides a robust foundation for database-backed scripts with automatic connection management, error handling, and CLI support. By following these patterns and best practices, you can create maintainable, reliable scripts for various use cases.

For more examples, see the existing scripts in the `scripts/` directory and their implementations.
