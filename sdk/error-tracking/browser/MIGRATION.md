# SDK Package Migration Guide

## Overview

This guide outlines the migration path for the SDK packages from `@saasbackend/*` to `@intranefr/superbackend-*` namespace.

## Current State

### Browser Error Tracking SDK
- **Current Package**: `@intranefr/superbackend-error-tracking-browser-sdk` (v2.0.0)
- **Legacy Package**: `@saasbackend/error-tracking-browser-sdk` (v1.0.1 - deprecated)
- **New Global Variable**: `superbackendErrorTrackingEmbed` (SDK package build)
- **Legacy Global Variable**: `saasbackendErrorTrackingEmbed` (root package build)
- **Status**: ✅ Migration completed with backward compatibility

### Build Approaches

#### Legacy Build Approach (Current - Root Package)
```bash
# Uses root package build script (maintains backward compatibility)
npm run build:sdk:error-tracking:browser
# Global variable: saasbackendErrorTrackingEmbed
```

#### New Build Approach (SDK Package)
```bash
# Uses SDK package build script (new naming)
cd sdk/error-tracking/browser
npm run build
# Global variable: superbackendErrorTrackingEmbed
```

## Migration Timeline

### Phase 1: Deprecation Notice (v1.0.1) ✅ COMPLETED
- Updated package description with deprecation notice
- Added deprecation warning in console
- Maintained backward compatibility

### Phase 2: New Package Release (v2.0.0) ✅ COMPLETED
- Published `@intranefr/superbackend-error-tracking-browser-sdk`
- Updated package name, version, and build configuration
- Implemented dual global variable support with aliasing
- Runtime deprecation warnings for legacy usage

### Phase 3: Legacy Removal (v1.1.0 - 6 months later)
- Publish final version of old package with removal notice
- Unpublish old package from npm
- Complete migration

## Migration Steps

### For Users

#### Step 1: Update Package Installation
```bash
# Old (deprecated)
npm install @saasbackend/error-tracking-browser-sdk

# New (recommended)
npm install @intranefr/superbackend-error-tracking-browser-sdk
```

#### Step 2: Update Import Statements
```javascript
// Old (deprecated)
import { ErrorTracking } from '@saasbackend/error-tracking-browser-sdk';

// New (recommended)
import { ErrorTracking } from '@intranefr/superbackend-error-tracking-browser-sdk';
```

#### Step 3: Update Global Variable References
```javascript
// Legacy build approach (root package)
window.saasbackendErrorTrackingEmbed

// New build approach (SDK package)
window.superbackendErrorTrackingEmbed
```

#### Step 4: Choose Build Approach
```bash
# Option 1: Legacy build (maintains existing global variable)
npm run build:sdk:error-tracking:browser

# Option 2: New build (uses new global variable)
cd sdk/error-tracking/browser && npm run build
```

**Note:** The legacy build approach maintains backward compatibility for existing installations. The new build approach is recommended for new implementations.

### For Developers

#### Step 1: Update Package.json
```json
{
  "name": "@intranefr/superbackend-error-tracking-browser-sdk",
  "description": "Error tracking SDK for SuperBackend browser applications",
  "version": "2.0.0",
  "scripts": {
    "build": "esbuild src/embed.js --bundle --format=iife --global-name=superbackendErrorTrackingEmbed --outfile=dist/embed.iife.js --minify"
  }
}
```

#### Step 2: Update Build Configuration
```json
{
  "scripts": {
    // New SDK package build script (produces new global variable)
    "build": "esbuild src/embed.js --bundle --format=iife --global-name=superbackendErrorTrackingEmbed --outfile=dist/embed.iife.js --minify"
  }
}
```

**Build Script Compatibility:**
- **Root package script** (`build:sdk:error-tracking:browser`): Maintains `saasbackendErrorTrackingEmbed` for backward compatibility
- **SDK package script** (`build`): Uses `superbackendErrorTrackingEmbed` for new implementations

#### Step 3: Publish New Package
```bash
npm publish --access=public
```

## Backward Compatibility

### During Transition Period
- Both packages will be available
- Old package will show deprecation warnings
- Documentation will point to new package

### Breaking Changes
- Package name change
- Global variable name change
- Import path change

## Rollout Plan

### Week 1: Preparation
- [ ] Update old package with deprecation notice
- [ ] Prepare new package version
- [ ] Update build scripts
- [ ] Test compatibility

### Week 2: Release
- [ ] Publish new package v2.0.0
- [ ] Update documentation
- [ ] Communicate changes
- [ ] Monitor adoption

### Month 2-6: Support
- [ ] Monitor old package usage
- [ ] Provide migration support
- [ ] Update integration guides
- [ ] Collect feedback

### Month 6: Deprecation
- [ ] Publish final old package version
- [ ] Add removal notices
- [ ] Plan unpublishing
- [ ] Complete transition

## Testing Strategy

### Compatibility Testing
- Test both packages work simultaneously
- Test global variable access
- Test import statements
- Test build process

### Migration Testing
- Test migration steps
- Test documentation examples
- Test integration scenarios
- Test error handling

## Communication Plan

### Release Notes
- Announce deprecation
- Provide migration instructions
- Share timeline
- Offer support

### Documentation Updates
- Update installation guides
- Update API documentation
- Update examples
- Add migration guide

### Community Outreach
- Blog post announcement
- Social media updates
- Developer community posts
- Direct notifications

## Risk Mitigation

### Package Availability
- Ensure new package is published before deprecation
- Maintain old package during transition
- Test package installation and usage

### User Confusion
- Clear deprecation messages
- Detailed migration documentation
- Support channels for questions
- Gradual transition approach

### Build Process
- Test build scripts thoroughly
- Ensure global variable consistency
- Verify package metadata
- Test installation workflows

## Success Metrics

1. **Adoption Rate**: 80% of users migrate within 3 months
2. **Zero Downtime**: No service interruptions during transition
3. **Documentation Coverage**: All migration scenarios documented
4. **User Satisfaction**: Positive feedback on migration process
5. **Clean Transition**: Old package successfully deprecated

## Support Resources

### Documentation
- Migration guide (this document)
- API reference documentation
- Installation instructions
- Troubleshooting guide

### Community Support
- GitHub issues for migration questions
- Community forums for discussions
- Direct email support for enterprise users
- FAQ section for common issues

### Tools and Scripts
- Migration script to update package.json
- Validation script to check migration
- Compatibility checker for existing setups
- Automated testing for migration scenarios

## Conclusion

This migration ensures a smooth transition to the new @intranefr organization scope while maintaining backward compatibility and providing clear guidance for users. The phased approach minimizes disruption and allows adequate time for migration.
