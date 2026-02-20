# Waiting List Migration Plugin

This plugin creates migration scripts to transfer waiting list data from the legacy MongoDB collection to the new JSON Configs persistence system.

## Installation

1. Enable the plugin via the admin interface at `/admin/plugins-system`
2. The plugin will automatically create two scripts:
   - **Migration Script**: `waiting-list-migration-mongo-to-json`
   - **Rollback Script**: `waiting-list-migration-rollback-json-to-mongo`

## Usage

### Migration Script

Access the migration script at `/admin/scripts`:

1. Find "Waiting List Migration - MongoDB to JSON Configs" in the script list
2. Configure environment variables as needed:
   - `BATCH_SIZE`: Number of entries to process per batch (default: 100)
   - `DRY_RUN`: Set to 'true' to preview migration without changes (default: false)
   - `FORCE_MIGRATION`: Set to 'true' to bypass existing data checks (default: false)
3. Click "Run" to start the migration
4. Monitor the live output for progress and any errors

### Rollback Script

If you need to restore data back to MongoDB:

1. Find "Waiting List Migration Rollback - JSON Configs to MongoDB"
2. Set `CONFIRM_ROLLBACK=true` to enable the rollback
3. Run the script to restore data from JSON Configs to MongoDB

## Features

### Migration Script Features
- **Batch Processing**: Processes entries in configurable batches to avoid memory issues
- **Progress Tracking**: Shows real-time progress, processing rate, and estimated time remaining
- **Dry Run Mode**: Preview migration without making actual changes
- **Duplicate Detection**: Identifies and handles duplicate email addresses
- **Error Handling**: Continues processing even if individual entries fail
- **Data Validation**: Validates source and destination data before migration
- **Rollback Data**: Generates rollback data file for emergency recovery

### Safety Features
- **Prerequisite Checks**: Verifies both MongoDB and JSON Configs systems are available
- **Data Validation**: Checks for existing data before migration
- **Backup Recommendations**: Advises on data backup before starting
- **Final Verification**: Compares source and destination counts after migration
- **Clear Logging**: Detailed output for troubleshooting

## Data Mapping

The migration transforms MongoDB schema to JSON Configs format:

| MongoDB Field | JSON Configs Field | Notes |
|---------------|-------------------|-------|
| `_id` | `id` | Converts ObjectId to string or generates UUID |
| `email` | `email` | Preserves email address |
| `type` | `type` | Preserves type (buyer/seller/both) |
| `status` | `status` | Preserves status (active/subscribed/launched) |
| `referralSource` | `referralSource` | Preserves referral source |
| `createdAt` | `createdAt` | Preserves creation timestamp |
| `updatedAt` | `updatedAt` | Preserves update timestamp |

## Post-Migration Steps

After successful migration:

1. **Test Functionality**: Verify waiting list features work with new system
2. **Data Integrity**: Check counts and random entries in admin interface
3. **Grace Period**: Keep MongoDB collection for a reasonable period
4. **Cleanup**: Once satisfied, consider archiving or removing the old collection

## Troubleshooting

### Common Issues

**Migration fails with "Destination not empty"**
- Use `FORCE_MIGRATION=true` if you want to overwrite existing data
- Or clear the JSON Configs data first

**Script times out**
- Increase timeout in script configuration
- Reduce `BATCH_SIZE` to process smaller batches

**Individual entries fail**
- Check the error logs for specific failure reasons
- Migration continues even if some entries fail
- Review and fix problematic entries manually

### Performance Tips

- For large datasets (>10,000 entries), consider:
  - Setting `BATCH_SIZE=50` to reduce memory usage
  - Running during off-peak hours
  - Monitoring server resources during migration

## Plugin Structure

```
plugins/waiting-list-migration/
├── index.js          # Main plugin file
└── README.md         # This documentation
```

The plugin follows the SuperBackend plugin system conventions:
- `meta`: Plugin metadata and description
- `hooks.install`: Creates migration scripts when plugin is enabled
- `hooks.bootstrap`: Verifies scripts exist on server startup

## Support

For issues or questions:
1. Check the script output logs for error details
2. Verify both MongoDB and JSON Configs systems are operational
3. Review plugin logs in server console
4. Consider using the rollback script if needed
