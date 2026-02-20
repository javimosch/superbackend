const crypto = require('crypto');

module.exports = {
  meta: {
    id: 'core-waiting-list-migration',
    name: 'Core Waiting List Migration Plugin',
    version: '1.0.0',
    description: 'Creates migration script for waiting list data from MongoDB to JSON Configs',
    tags: ['migration', 'waiting-list', 'json-configs', 'core']
  },
  hooks: {
    async install(ctx) {
      console.log('[core-waiting-list-migration] Installing migration script...');
      
      const ScriptDefinition = ctx?.services?.mongoose?.models?.ScriptDefinition || null;
      if (!ScriptDefinition) {
        console.log('[core-waiting-list-migration] ScriptDefinition model not found, skipping script creation');
        return;
      }

      try {
        // Check if script already exists
        const existingScript = await ScriptDefinition.findOne({
          codeIdentifier: 'waiting-list-migration-mongo-to-json'
        });

        if (existingScript) {
          console.log('[core-waiting-list-migration] Migration script already exists, skipping creation');
          return;
        }

        // Create the migration script
        const script = await ScriptDefinition.create({
          name: 'Waiting List Migration - MongoDB to JSON Configs',
          codeIdentifier: 'waiting-list-migration-mongo-to-json',
          description: 'Migrates waiting list entries from MongoDB collection to JSON Configs system with batch processing, progress tracking, and rollback capability.',
          type: 'node',
          runner: 'host',
          script: getMigrationScriptContent(),
          defaultWorkingDirectory: process.cwd(),
          env: [
            { key: 'BATCH_SIZE', value: '100' },
            { key: 'DRY_RUN', value: 'false' },
            { key: 'FORCE_MIGRATION', value: 'false' }
          ],
          timeoutMs: 1800000, // 30 minutes
          enabled: true
        });

        console.log('[core-waiting-list-migration] Successfully created migration script:', script._id);
        
        // Also create rollback script
        const rollbackScript = await ScriptDefinition.create({
          name: 'Waiting List Migration Rollback - JSON Configs to MongoDB',
          codeIdentifier: 'waiting-list-migration-rollback-json-to-mongo',
          description: 'Rollback script to restore waiting list entries from JSON Configs back to MongoDB collection (generated after migration).',
          type: 'node',
          runner: 'host',
          script: getRollbackScriptContent(),
          defaultWorkingDirectory: process.cwd(),
          env: [
            { key: 'BATCH_SIZE', value: '100' },
            { key: 'CONFIRM_ROLLBACK', value: 'false' }
          ],
          timeoutMs: 1800000, // 30 minutes
          enabled: true
        });

        console.log('[core-waiting-list-migration] Successfully created rollback script:', rollbackScript._id);
        
      } catch (error) {
        console.error('[core-waiting-list-migration] Failed to create migration script:', error);
      }
    },

    async bootstrap(ctx) {
      console.log('[core-waiting-list-migration] Bootstrap - verifying migration scripts...');
      
      const ScriptDefinition = ctx?.services?.mongoose?.models?.ScriptDefinition || null;
      if (!ScriptDefinition) {
        console.log('[core-waiting-list-migration] ScriptDefinition model not found');
        return;
      }

      try {
        const migrationScript = await ScriptDefinition.findOne({
          codeIdentifier: 'waiting-list-migration-mongo-to-json'
        });

        if (!migrationScript) {
          console.log('[core-waiting-list-migration] Migration script not found, please run install');
        } else {
          console.log('[core-waiting-list-migration] Migration script is ready');
        }
      } catch (error) {
        console.error('[core-waiting-list-migration] Error verifying scripts:', error);
      }
    }
  }
};

function getMigrationScriptContent() {
  return `
// Waiting List Migration Script
// Migrates entries from MongoDB WaitingList collection to JSON Configs system

const mongoose = require('mongoose');
const { performance } = require('perf_hooks');

// Configuration
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100');
const DRY_RUN = process.env.DRY_RUN === 'true';
const FORCE_MIGRATION = process.env.FORCE_MIGRATION === 'true';

// Load models and services
const WaitingList = require('./src/models/WaitingList');
const waitingListService = require('./src/services/waitingListJson.service');

async function migrate() {
  console.log('=== Waiting List Migration: MongoDB → JSON Configs ===');
  console.log('Configuration:');
  console.log('  - Batch size:', BATCH_SIZE);
  console.log('  - Dry run:', DRY_RUN);
  console.log('  - Force migration:', FORCE_MIGRATION);
  console.log('');

  try {
    // Ensure MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB not connected');
    }

    // Check prerequisites
    await checkPrerequisites();

    // Get source data count
    const totalCount = await WaitingList.countDocuments();
    console.log('Found', totalCount, 'entries in MongoDB WaitingList collection');

    if (totalCount === 0) {
      console.log('No entries to migrate. Exiting.');
      return;
    }

    // Check destination
    const { entries: existingEntries } = await waitingListService.getWaitingListEntries();
    if (existingEntries.length > 0 && !FORCE_MIGRATION) {
      console.log('\\nWARNING: Found', existingEntries.length, 'entries already in JSON Configs!');
      console.log('Use FORCE_MIGRATION=true to override or clear the JSON Configs first.');
      throw new Error('Destination not empty');
    }

    if (DRY_RUN) {
      console.log('\\n=== DRY RUN MODE - No changes will be made ===');
    }

    // Initialize counters
    let processed = 0;
    let success = 0;
    let skipped = 0;
    let errors = 0;
    const startTime = performance.now();

    // Process in batches
    console.log('\\nStarting migration...');
    
    for (let skip = 0; skip < totalCount; skip += BATCH_SIZE) {
      const batch = await WaitingList.find({})
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(BATCH_SIZE)
        .lean();

      console.log(\`\\nProcessing batch \${Math.floor(skip / BATCH_SIZE) + 1} (\${batch.length} entries)...\`);

      for (const entry of batch) {
        try {
          // Transform data
          const transformedEntry = transformEntry(entry);

          // Check for duplicates in this batch
          const isDuplicate = existingEntries.some(e => 
            e.email.toLowerCase() === transformedEntry.email.toLowerCase()
          );

          if (isDuplicate && !FORCE_MIGRATION) {
            console.log(\`  ⚠️  Skipping duplicate: \${transformedEntry.email}\`);
            skipped++;
            continue;
          }

          if (!DRY_RUN) {
            // Add to JSON Configs
            await waitingListService.addWaitingListEntry(transformedEntry);
          }

          console.log(\`  ✓ Migrated: \${transformedEntry.email}\`);
          success++;
        } catch (error) {
          console.error(\`  ✗ Failed to migrate \${entry.email}:\`, error.message);
          errors++;
        }
        processed++;
      }

      // Show progress
      const progress = ((processed / totalCount) * 100).toFixed(1);
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      const rate = (processed / elapsed).toFixed(1);
      const eta = processed > 0 ? ((totalCount - processed) / rate).toFixed(0) : 'N/A';
      
      console.log(\`  Progress: \${progress}% (\${processed}/\${totalCount}) | Rate: \${rate}/sec | ETA: \${eta}s\`);
    }

    // Final verification
    console.log('\\n=== Migration Summary ===');
    console.log('Total processed:', processed);
    console.log('Successful:', success);
    console.log('Skipped:', skipped);
    console.log('Errors:', errors);
    console.log('Elapsed time:', ((performance.now() - startTime) / 1000).toFixed(2), 'seconds');

    if (!DRY_RUN) {
      // Verify final count
      const { entries: finalEntries } = await waitingListService.getWaitingListEntries();
      console.log('\\nFinal verification:');
      console.log('  Source count (MongoDB):', totalCount);
      console.log('  Destination count (JSON Configs):', finalEntries.length);

      if (finalEntries.length === totalCount - skipped) {
        console.log('  ✅ Migration successful!');
      } else {
        console.log('  ⚠️  Count mismatch - please review');
      }

      // Generate rollback data
      console.log('\\nRollback data saved to: ./waiting-list-rollback-data.json');
      require('fs').writeFileSync(
        './waiting-list-rollback-data.json',
        JSON.stringify({ migrated: await WaitingList.find().lean(), timestamp: new Date().toISOString() }, null, 2)
      );
    }

    console.log('\\nNext steps:');
    if (DRY_RUN) {
      console.log('1. Review the output above');
      console.log('2. Run again with DRY_RUN=false to perform actual migration');
    } else {
      console.log('1. Test the waiting list functionality');
      console.log('2. Verify data integrity in admin interface');
      console.log('3. Keep the MongoDB collection for a grace period');
      console.log('4. Use rollback script if needed: waiting-list-migration-rollback-json-to-mongo');
    }

  } catch (error) {
    console.error('\\nMigration failed:', error);
    process.exit(1);
  }
}

function transformEntry(entry) {
  return {
    id: entry._id.toString() || generateId(),
    email: entry.email,
    type: entry.type || 'both',
    status: entry.status || 'active',
    referralSource: entry.referralSource || '',
    createdAt: entry.createdAt || new Date(),
    updatedAt: entry.updatedAt || new Date()
  };
}

function generateId() {
  return crypto.randomBytes(16).toString('hex');
}

async function checkPrerequisites() {
  console.log('Checking prerequisites...');
  
  // Check JSON Configs service
  try {
    await waitingListService.getWaitingListEntries();
    console.log('  ✅ JSON Configs service available');
  } catch (error) {
    throw new Error('JSON Configs service not available: ' + error.message);
  }

  // Check MongoDB collection
  try {
    await WaitingList.findOne().limit(1);
    console.log('  ✅ MongoDB WaitingList collection accessible');
  } catch (error) {
    throw new Error('MongoDB WaitingList collection not accessible: ' + error.message);
  }
}

// Execute migration
migrate().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
`;
}

function getRollbackScriptContent() {
  return `
// Waiting List Migration Rollback Script
// Restores entries from JSON Configs back to MongoDB collection

const mongoose = require('mongoose');
const { performance } = require('perf_hooks');
const crypto = require('crypto');

// Configuration
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '100');
const CONFIRM_ROLLBACK = process.env.CONFIRM_ROLLBACK === 'true';

// Load models and services
const WaitingList = require('./src/models/WaitingList');
const waitingListService = require('./src/services/waitingListJson.service');

async function rollback() {
  console.log('=== Waiting List Rollback: JSON Configs → MongoDB ===');
  console.log('Configuration:');
  console.log('  - Batch size:', BATCH_SIZE);
  console.log('  - Confirm rollback:', CONFIRM_ROLLBACK);
  console.log('');

  if (!CONFIRM_ROLLBACK) {
    console.log('⚠️  DANGER: This will overwrite MongoDB data!');
    console.log('Set CONFIRM_ROLLBACK=true to proceed.');
    return;
  }

  try {
    // Ensure MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB not connected');
    }

    // Get source data from JSON Configs
    const { entries } = await waitingListService.getWaitingListEntries();
    console.log('Found', entries.length, 'entries in JSON Configs');

    if (entries.length === 0) {
      console.log('No entries to rollback. Exiting.');
      return;
    }

    // Clear existing MongoDB data (with confirmation)
    const existingCount = await WaitingList.countDocuments();
    if (existingCount > 0) {
      console.log('\\nClearing existing MongoDB entries...');
      await WaitingList.deleteMany({});
      console.log('Deleted', existingCount, 'existing entries');
    }

    // Initialize counters
    let processed = 0;
    let success = 0;
    let errors = 0;
    const startTime = performance.now();

    // Process in batches
    console.log('\\nStarting rollback...');

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      console.log(\`\\nProcessing batch \${Math.floor(i / BATCH_SIZE) + 1} (\${batch.length} entries)...\`);

      for (const entry of batch) {
        try {
          // Transform data for MongoDB
          const mongoEntry = {
            _id: entry.id || generateObjectId(),
            email: entry.email,
            type: entry.type || 'both',
            status: entry.status || 'active',
            referralSource: entry.referralSource || '',
            createdAt: new Date(entry.createdAt),
            updatedAt: new Date(entry.updatedAt)
          };

          // Insert into MongoDB
          await WaitingList.create(mongoEntry);
          console.log(\`  ✓ Restored: \${mongoEntry.email}\`);
          success++;
        } catch (error) {
          console.error(\`  ✗ Failed to restore \${entry.email}:\`, error.message);
          errors++;
        }
        processed++;
      }

      // Show progress
      const progress = ((processed / entries.length) * 100).toFixed(1);
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
      const rate = (processed / elapsed).toFixed(1);
      
      console.log(\`  Progress: \${progress}% (\${processed}/\${entries.length}) | Rate: \${rate}/sec\`);
    }

    // Final verification
    console.log('\\n=== Rollback Summary ===');
    console.log('Total processed:', processed);
    console.log('Successful:', success);
    console.log('Errors:', errors);
    console.log('Elapsed time:', ((performance.now() - startTime) / 1000).toFixed(2), 'seconds');

    // Verify final count
    const finalCount = await WaitingList.countDocuments();
    console.log('\\nFinal verification:');
    console.log('  Source count (JSON Configs):', entries.length);
    console.log('  Destination count (MongoDB):', finalCount);

    if (finalCount === success) {
      console.log('  ✅ Rollback successful!');
    } else {
      console.log('  ⚠️  Count mismatch - please review');
    }

  } catch (error) {
    console.error('\\nRollback failed:', error);
    process.exit(1);
  }
}

function generateObjectId() {
  return new mongoose.Types.ObjectId();
}

// Execute rollback
rollback().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
`;
}
