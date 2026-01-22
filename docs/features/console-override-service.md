# Console Override Service Feature

## Summary
A bootstrap service that enhances console logging in development environments by duplicating all console output to both standard output and a local log file.

## Purpose
- Enable persistent logging during development and testing
- Facilitate debugging by maintaining a written record of console output
- Provide seamless dual logging without code changes

## Environment Activation
The service automatically activates when:
- `NODE_ENV` is not set to "production"
- `CONSOLE_OVERRIDE_ENABLED` is not explicitly set to "false"

## Implementation Details

### Service Location
- **Main Service**: `src/services/consoleOverride.service.js`
- **Bootstrap Integration**: `src/middleware.js` (early initialization)
- **Public API**: Available via `saasbackend.consoleOverride`

### Console Methods Overridden
- `console.log()`
- `console.error()`
- `console.warn()`
- `console.info()`
- `console.debug()`

### File Output
- **Default Location**: `stdout.log` in current working directory
- **Write Mode**: Append (preserves previous logs)
- **Format**: Exact replica of console output
- **Encoding**: UTF-8

## Usage

### Automatic Activation
```javascript
// Service initializes automatically when ref-saasbackend starts
// No manual intervention required in non-production environments
const saasbackend = require('ref-saasbackend');
// Console override is now active (if NODE_ENV !== 'production')
```

### Manual Control
```javascript
const consoleOverride = require('./src/services/consoleOverride.service');

// Check if override is active
if (consoleOverride.isActive()) {
  console.log('Console override is running');
}

// Get current log file path
const logPath = consoleOverride.getLogPath();

// Restore original console (if needed)
consoleOverride.restore();
```

## Behavior

### In Development/Staging
- All console method calls:
  - Output to standard console (normal behavior)
  - Simultaneously write to `stdout.log` file in current working directory
- Preserves original formatting, colors, and stack traces
- Maintains method signatures and return values
- Zero performance impact beyond file I/O

### In Production
- No changes to console behavior
- No file writing overhead
- Original console object remains untouched
- Zero memory or CPU overhead

## Configuration

### Environment Variables
- `NODE_ENV`: Set to "production" to disable the service
- `CONSOLE_LOG_FILE`: Custom log file path (default: `stdout.log`)
- `CONSOLE_OVERRIDE_ENABLED`: Force enable/disable (true/false)

### Example Configuration
```bash
# Development (enabled by default)
NODE_ENV=development

# Custom log file
CONSOLE_LOG_FILE=./logs/app.log

# Force disable
CONSOLE_OVERRIDE_ENABLED=false

# Force enable in production
NODE_ENV=production
CONSOLE_OVERRIDE_ENABLED=true
```

## Service API

### Methods
```javascript
consoleOverride.init([options])     // Initialize service
consoleOverride.restore()          // Restore original console
consoleOverride.isActive()         // Returns boolean status
consoleOverride.getLogPath()        // Returns log file path or null
```

### Options Object
```javascript
{
  logFile: 'custom-log.log',    // Custom log file name
  forceEnable: true             // Force enable regardless of NODE_ENV
}
```

## Error Handling

### File Write Errors
- Falls back to console-only logging
- Logs error message to original console
- Continues normal application operation
- Prevents infinite recursion

### Stream Errors
- Handles stream error events gracefully
- Automatic cleanup on stream failure
- Maintains application stability

### Process Exit
- Automatic file stream cleanup on process exit
- Handles SIGINT, SIGTERM, and exit events
- Prevents file handle leaks

## Performance Impact

### Development/Staging
- Minimal overhead from file stream operations
- Asynchronous writing prevents blocking
- Negligible impact on application performance
- Memory-efficient stream-based writing

### Production
- Zero overhead (service disabled)
- No file operations or additional processing
- No memory allocation for service

## Integration Points

### Bootstrap Process
- Initializes early in application startup
- Captures logs from entire application lifecycle
- Works with all modules and dependencies
- Available via main saasbackend export

### Compatibility
- Compatible with existing logging libraries
- Works with Winston, Bunyan, Pino, etc.
- Preserves third-party logging behavior
- No interference with console extensions

## Testing

### Test Coverage
- Unit tests for all service methods
- Integration tests for end-to-end functionality
- Error scenario testing
- Environment configuration testing

### Test Files
- `src/services/consoleOverride.service.test.js` (Unit tests)
- `src/services/consoleOverride.service.integration.test.js` (Integration tests)

### Running Tests
```bash
# Run all console override tests
npm test -- --testPathPattern=consoleOverride

# Run integration tests only
npm test -- --testPathPattern=consoleOverride.service.integration
```

## Troubleshooting

### Common Issues

**Service not activating**
- Check `NODE_ENV` is not "production"
- Verify `CONSOLE_OVERRIDE_ENABLED` is not "false"
- Ensure middleware is being initialized

**Log file not created**
- Check file permissions in current directory
- Verify disk space availability
- Check for file path errors
- Look for error messages in console output

**Missing log entries**
- Verify service is active with `consoleOverride.isActive()`
- Check for file write errors in console output
- Ensure asynchronous writes have time to complete

### Debug Information
```javascript
const consoleOverride = require('./src/services/consoleOverride.service');
console.log('Override active:', consoleOverride.isActive());
console.log('Log file path:', consoleOverride.getLogPath());
console.log('NODE_ENV:', process.env.NODE_ENV);
```

## Security Considerations

### Log File Access
- Log files contain application output and potentially sensitive data
- Ensure proper file permissions in production-like environments
- Consider log rotation for long-running applications
- Monitor log file size growth

### Information Disclosure
- Avoid logging sensitive information (passwords, tokens, PII)
- Review application logging practices
- Implement log sanitization if needed
- Secure log file storage and access

## Best Practices

### Development
- Use the service for debugging and troubleshooting
- Review log files for error patterns
- Clean up log files periodically
- Monitor log file sizes

### Testing
- Test with various console method types
- Verify error handling scenarios
- Check file permissions in different environments
- Validate async behavior

### Production Preparation
- Ensure `NODE_ENV=production` in production
- Remove or secure any accumulated log files
- Consider production logging solutions
- Implement log rotation policies

## File Structure

```
src/services/
├── consoleOverride.service.js              # Main service implementation
├── consoleOverride.service.test.js         # Unit tests
└── consoleOverride.service.integration.test.js  # Integration tests

docs/
├── features/console-override-service.md     # This feature documentation
└── plans/console-override-service-plan.md   # Implementation plan
```

## Dependencies

### Runtime Dependencies
- Node.js built-in `fs` module
- Node.js built-in `path` module
- No external dependencies required

### Development Dependencies
- Jest (for testing)
- No additional testing frameworks required
