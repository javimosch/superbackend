# Breaking Changes Compatibility

## Overview

SuperBackend provides backward compatibility support during the rebranding transition from "saasbackend" to "superbackend". This ensures existing installations continue to work while users migrate to the new naming conventions.

## Environment Variables

### Encryption Key Support

SuperBackend supports both old and new environment variable names for encrypted settings:

```javascript
// New preferred name
process.env.SUPERBACKEND_ENCRYPTION_KEY

// Legacy fallback name
process.env.SAASBACKEND_ENCRYPTION_KEY
```

**Implementation Details:**
- The system checks for `SUPERBACKEND_ENCRYPTION_KEY` first
- Falls back to `SAASBACKEND_ENCRYPTION_KEY` if the new name is not set
- Error messages reference both variable names for clarity

### S3 Bucket Configuration

Default S3 bucket naming supports both conventions:

```env
# New preferred default
S3_BUCKET=superbackend

# Legacy fallback support
S3_BUCKET=saasbackend
```

## Global Registry Access

### Dual Registry Support

The global model registry is accessible through both names during transition:

```javascript
// New preferred registry
globalThis.superbackend.models

// Legacy fallback registry  
globalThis.saasbackend.models
```

**Implementation Details:**
- Both registries are populated with the same model references
- Accessing the legacy registry triggers a deprecation warning in console
- The `getModelRegistry()` helper function tries new registry first, then legacy

### Deprecation Warnings

When legacy registry access is detected, a console warning is displayed:

```
Deprecation: globalThis.saasbackend is deprecated. Use globalThis.superbackend instead.
```

## SDK Package Migration

### Browser Error Tracking SDK

The browser SDK package includes deprecation notices:

**Current Package:** `@intranefr/superbackend-error-tracking-browser-sdk` (v2.0.0)
- Updated package name and version
- Supports both global variables with deprecation warnings
- Runtime aliasing for backward compatibility

**Legacy Package:** `@saasbackend/error-tracking-browser-sdk` (v1.0.1 - deprecated)
- Shows deprecation warnings when used
- Maintained for backward compatibility

### SDK Implementation Details

```javascript
// New package.json
"name": "@intranefr/superbackend-error-tracking-browser-sdk",
"version": "2.0.0",
"description": "Error tracking SDK for SuperBackend browser applications."

// Build script (new package)
"build": "esbuild src/embed.js --bundle --format=iife --global-name=superbackendErrorTrackingEmbed --outfile=dist/embed.iife.js --minify"

// Runtime deprecation warning (legacy usage)
console.warn('DEPRECATION: Global "window.saasbackend" is deprecated. Use "window.superbackend" instead.');
```

## Configuration Examples

### Environment Setup

```env
# Recommended new configuration
SUPERBACKEND_ENCRYPTION_KEY=your-32-byte-encryption-key
S3_BUCKET=superbackend

# Legacy configuration still supported
SAASBACKEND_ENCRYPTION_KEY=your-32-byte-encryption-key
S3_BUCKET=saasbackend
```

### Code Integration

```javascript
// New preferred usage
const { middleware } = require('@intranefr/superbackend');
const models = globalThis.superbackend.models;

// Legacy usage still works
const { middleware } = require('@intranefr/superbackend');
const models = globalThis.saasbackend.models; // Shows deprecation warning
```

## Migration Timeline

### Phase 1: Compatibility Layer (Current)
- Both old and new environment variables supported
- Dual global registry access with deprecation warnings
- SDK packages marked as deprecated but functional

### Phase 2: Transition Period (Next 6 months)
- Encourage migration to new environment variables
- Publish new SDK packages under @intranefr scope
- Maintain backward compatibility

### Phase 3: Legacy Removal (Future major version)
- Remove support for old environment variables
- Remove legacy global registry access
- Unpublish deprecated SDK packages

## Error Handling

### Missing Environment Variables

When neither new nor legacy environment variables are set:

```javascript
// Error message references both options
'SUPERBACKEND_ENCRYPTION_KEY (or SAASBACKEND_ENCRYPTION_KEY for compatibility) is required for encrypted settings'
```

### Registry Access Patterns

The `getModelRegistry()` function handles all access patterns:

```javascript
function getModelRegistry() {
  // Shows warning if only legacy registry is used
  if (globalThis?.saasbackend?.models && !globalThis?.superbackend?.models) {
    console.warn('Deprecation: globalThis.saasbackend is deprecated. Use globalThis.superbackend instead.');
  }
  return globalThis?.superbackend?.models || globalThis?.saasbackend?.models || null;
}
```

## Testing Considerations

### Compatibility Testing

Test both old and new configurations:

```bash
# Test new environment variables
SUPERBACKEND_ENCRYPTION_KEY=test-key npm test

# Test legacy environment variables  
SAASBACKEND_ENCRYPTION_KEY=test-key npm test

# Test global registry access
node -e "console.log(globalThis.superbackend?.models !== null)"
node -e "console.log(globalThis.saasbackend?.models !== null)" // Should show warning
```

### Migration Validation

Validate migration steps:

1. **Environment Variables**: Ensure both old and new work
2. **Global Registry**: Verify dual access and warnings
3. **SDK Packages**: Test deprecation notices and functionality
4. **Error Messages**: Confirm helpful migration guidance

## Best Practices

### Migration Strategy

1. **Gradual Migration**: Update environment variables first
2. **Code Updates**: Migrate global registry references
3. **Package Updates**: Switch to new SDK packages
4. **Testing**: Validate all functionality works
5. **Cleanup**: Remove legacy references after transition

### Development Setup

During development, support both configurations:

```javascript
// Support both registry names in development code
const registry = globalThis.superbackend || globalThis.saasbackend;
const models = registry?.models;
```

### Production Deployment

Use new environment variables in production:

```env
# Production configuration
SUPERBACKEND_ENCRYPTION_KEY=${ENCRYPTION_KEY}
S3_BUCKET=superbackend-${ENVIRONMENT}
```

This compatibility layer ensures a smooth transition while maintaining full functionality for existing users.
