# Waiting List Migration Guide

This guide walks you through migrating waiting list data from the legacy MongoDB collection to the new JSON Configs persistence system using the migration plugin.

## Overview

The waiting list system has been updated to use JSON Configs for better performance, caching, and management. This migration tool safely transfers all existing data from the MongoDB `WaitingList` collection to the new JSON Configs-based system.

## Prerequisites

1. **Server Access**: Admin access to the SuperBackend instance
2. **Backup**: Create a backup of the MongoDB database before migration
3. **Downtime**: Plan for a brief maintenance window (typically 5-30 minutes depending on data size)

## Step 1: Install the Migration Plugin

1. Navigate to **Admin → Plugins System** (`/admin/plugins-system`)
2. Find "Waiting List Migration Plugin" in the plugin list
3. Click **Enable** to install the plugin
4. The plugin will automatically create two migration scripts:
   - Migration script: `waiting-list-migration-mongo-to-json`
   - Rollback script: `waiting-list-migration-rollback-json-to-mongo`

## Step 2: Prepare for Migration

### Check Data Size
First, estimate your data size:
```javascript
// In MongoDB shell
db.waitinglists.countDocuments()
```

### Review Current Data
Check your current waiting list entries in the admin interface to understand what data will be migrated.

## Step 3: Perform Dry Run (Recommended)

1. Navigate to **Admin → Scripts** (`/admin/scripts`)
2. Find "Waiting List Migration - MongoDB to JSON Configs"
3. Click **Edit** to configure the script
4. Set environment variable: `DRY_RUN=true`
5. Save and run the script
6. Review the output to verify:
   - All entries are detected
   - No unexpected errors
   - Transformation looks correct

## Step 4: Execute Migration

1. Go back to the script configuration
2. Remove or set `DRY_RUN=false`
3. Optional: Adjust `BATCH_SIZE` based on your data size:
   - Small datasets (<1,000): `BATCH_SIZE=100`
   - Medium datasets (1,000-10,000): `BATCH_SIZE=50`
   - Large datasets (>10,000): `BATCH_SIZE=25`
4. Click **Run** to start the migration
5. Monitor the live output for progress

### Migration Output Example
```
=== Waiting List Migration: MongoDB → JSON Configs ===
Configuration:
  - Batch size: 100
  - Dry run: false
  - Force migration: false

Found 2500 entries in MongoDB WaitingList collection

Starting migration...

Processing batch 1 (100 entries)...
  ✓ Migrated: user1@example.com
  ✓ Migrated: user2@example.com
  ...
  Progress: 4.0% (100/2500) | Rate: 25.3/sec | ETA: 95s
```

## Step 5: Verify Migration

After migration completes:

1. **Check Counts**: Verify the numbers match
2. **Test Functionality**: 
   - Try adding a new waiting list entry
   - Check if existing entries display correctly
   - Verify statistics are accurate
3. **Spot Check**: Review a few random entries for data integrity

## Step 6: Post-Migration

### Immediate Actions
- Keep the MongoDB collection for at least 1 week
- Monitor system performance
- Test all waiting list features

### After Grace Period (1-2 weeks)
- If everything works correctly, consider archiving the old collection:
  ```javascript
  // In MongoDB shell
  db.waitinglists.renameCollection('waitinglists_backup_YYYY_MM_DD')
  ```

## Rollback (If Needed)

If issues arise after migration:

1. Navigate to **Admin → Scripts**
2. Find "Waiting List Migration Rollback - JSON Configs to MongoDB"
3. Set `CONFIRM_ROLLBACK=true`
4. Run the rollback script
5. Verify data is restored

## Troubleshooting

### Migration Stops Midway
- Check server logs for errors
- Reduce `BATCH_SIZE` and retry
- Ensure adequate server resources

### Duplicate Email Errors
- Use `FORCE_MIGRATION=true` if you want to overwrite
- Or manually resolve duplicates before migration

### Timeout Errors
- Increase script timeout in configuration
- Reduce batch size
- Run during off-peak hours

### Data Validation Fails
- Check MongoDB connection
- Verify JSON Configs service is working
- Review individual error messages

## Best Practices

1. **Always backup before migration**
2. **Use dry run first** to preview changes
3. **Monitor during migration** for any issues
4. **Test thoroughly** after migration
5. **Keep old data** for a grace period
6. **Document the migration** for future reference

## Migration Checklist

- [ ] Backup MongoDB database
- [ ] Install migration plugin
- [ ] Perform dry run
- [ ] Schedule maintenance window
- [ ] Execute migration
- [ ] Verify data integrity
- [ ] Test all functionality
- [ ] Monitor system for 1 week
- [ ] Archive old collection (if satisfied)

## Support

For additional help:
1. Check server console logs
2. Review script output for specific errors
3. Consult the plugin documentation at `plugins/waiting-list-migration/README.md`
4. Contact support with migration logs and error details
