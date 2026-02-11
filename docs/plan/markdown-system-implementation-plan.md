# Markdown System Implementation Plan

## Overview
Based on the comprehensive design document, implement a markdown management system with hierarchical organization, dual UI modes (list and explorer), and following established patterns from the JSON Config system.

## Implementation Status: 
### Phase 1: Core Infrastructure (Priority: High) - 
#### 1.1 Data Model & Schema
- **File**: `src/models/Markdown.js` 
- **Tasks**:
  - Create mongoose schema following established patterns
  - Implement compound unique indexes for fast lookups
  - Add proper field validation and defaults
  - Follow JsonConfig.js structure patterns

#### 1.2 Service Layer
- **File**: `src/services/markdowns.service.js` 
- **Tasks**:
  - Implement core CRUD operations following jsonConfigs.service.js patterns
  - Add path validation and group code normalization
  - Implement caching strategy with Map-based cache
  - Add tree structure building for explorer mode
  - Include proper error handling with structured error codes

#### 1.3 API Routes
- **Files**: 
  - `src/routes/markdowns.routes.js`  (public API)
  - `src/routes/adminMarkdowns.routes.js`  (admin API)
- **Tasks**:
  - Implement public access routes (no auth)
  - Implement admin routes with basic auth
  - Follow established routing patterns from JSON configs
  - Add proper error handling and response formatting

#### 1.4 Controllers
- **Files**:
  - `src/controllers/markdowns.controller.js`  (public)
  - `src/controllers/adminMarkdowns.controller.js`  (admin)
- **Tasks**:
  - Implement controller methods following established patterns
  - Add proper input validation and sanitization
  - Implement pagination and sorting
  - Add search functionality

### Phase 2: Admin UI - List Mode (Priority: High) - 

#### 2.1 Basic Admin Page
- **File**: `views/admin-markdowns.ejs` 
- **Tasks**:
  - Create admin page layout following admin-json-configs.ejs pattern
  - Add tab structure for list/explorer modes
  - Implement responsive design with TailwindCSS

#### 2.2 List Mode Components
- **Tasks**:
  - Create data table with pagination
  - Add search and filtering controls
  - Implement bulk operations (delete, category change)
  - Add create/edit modals
  - Include proper loading states and error handling

#### 2.3 Route Integration
- **File**: `src/middleware.js` 
- **Tasks**:
  - Add admin route registration
  - Integrate with existing basic auth middleware
  - Ensure proper template rendering

### Phase 3: Admin UI - Explorer Mode (Priority: Medium) - 

#### 3.1 Tree Navigation
- **Tasks**:
  - Implement recursive tree view component
  - Add category selector with autocomplete
  - Create breadcrumb navigation
  - Handle folder expansion/collapse

#### 3.2 File Operations
- **Tasks**:
  - Implement file preview modal
  - Add download and copy-to-clipboard functions
  - Create rich markdown editor
  - Add path validation with real-time feedback

#### 3.3 Folder Management
- **Tasks**:
  - Implement folder creation via group_code
  - Add folder content listing
  - Handle navigation between folders
  - Add group code rules info box

### Phase 4: Advanced Features (Priority: Low) - 

#### 4.1 Search Enhancement
- **Tasks**:
  - Implement full-text search
  - Add search result highlighting
  - Include advanced search filters

#### 4.2 Import/Export
- **Tasks**:
  - Add bulk import functionality
  - Implement export to various formats
  - Handle markdown file uploads

#### 4.3 Performance Optimization
- **Tasks**:
  - Add cache warming strategies
  - Implement lazy loading for large trees
  - Optimize database queries

## Technical Implementation Details

### Error Handling Strategy
- Use structured error codes following JSON Config patterns:
  - `VALIDATION` - Input validation errors
  - `NOT_FOUND` - Resource not found
  - `PATH_NOT_UNIQUE` - Duplicate path conflicts
  - `INVALID_MARKDOWN` - Markdown syntax issues
  - `INVALID_GROUP_CODE` - Group code format errors

### Caching Implementation
- **Cache Keys**: 
  - `markdown:${category}:${group_code}:${slug}` - Full path
  - `markdown-tree:${category}` - Tree structure
  - `markdown-folder:${category}:${group_code}` - Folder contents
- **TTL Strategy**: Default 30 seconds, configurable per document
- **Invalidation**: Clear related caches on create/update/delete

### Security Considerations
- Follow existing Basic Auth pattern from JSON configs
- Public access controlled by `publicEnabled` flag
- Input sanitization for all user-provided data
- Rate limiting integration with existing infrastructure

### Database Optimization
- Compound indexes for fast path lookups
- Efficient field selection in queries
- Pagination for large datasets
- Parallel query execution where possible

## File Structure (Following Established Patterns)

```
src/
├── models/Markdown.js                    # Following JsonConfig.js pattern
├── services/markdowns.service.js          # Following jsonConfigs.service.js pattern
├── controllers/markdowns.controller.js   # Following jsonConfigs.controller.js pattern
├── controllers/adminMarkdowns.controller.js # Following adminJsonConfigs.controller.js pattern
├── routes/markdowns.routes.js             # Following jsonConfigs.routes.js pattern
├── routes/adminMarkdowns.routes.js       # Following adminJsonConfigs.routes.js pattern
└── views/admin-markdowns.ejs             # Following admin-json-configs.ejs pattern
```

## Testing Strategy

### Unit Tests
- **Service Layer Tests**: Following jsonConfigs.service.test.js patterns
- **Controller Tests**: Following adminJsonConfigs.controller.test.js patterns
- **Model Tests**: Schema validation and index tests

### Integration Tests
- API endpoint testing
- Admin UI functionality testing
- Cache behavior verification

### Test Coverage Goals
- Service functions: 90%+ coverage
- Controller methods: 85%+ coverage
- Error scenarios: Full coverage

## Dependencies & Requirements

### Existing Dependencies
- Leverage existing: mongoose, express, ejs
- Use existing middleware: basicAuth, rate limiting
- Follow established UI patterns: TailwindCSS, Vue.js components

### New Dependencies (if needed)
- Markdown parser/renderer (if not already available)
- File system utilities for import/export
- Additional validation libraries

## Migration Considerations

### Database Migration
- No breaking changes expected
- Index creation should be non-blocking
- Consider data validation for existing markdown content

### API Compatibility
- Follow existing API versioning patterns
- Maintain backward compatibility where possible
- Clear documentation of new endpoints

## Success Metrics

### Functional Requirements
- All CRUD operations working
- Hierarchical navigation functional
- Search and filtering operational
- Caching strategy effective
- Admin UI fully functional

### Performance Requirements
- Page load times < 2 seconds
- API response times < 500ms
- Cache hit rate > 80%
- Support for 1000+ markdown documents

### Security Requirements
- Proper authentication enforcement
- Input validation on all endpoints
- Rate limiting functional
- No XSS vulnerabilities in rendered markdown

## Rollback Plan

### Database Rollback
- Schema changes are additive only
- Indexes can be safely dropped
- No data migration required

### Code Rollback
- Feature flag implementation possible
- Route registration can be conditionally disabled
- UI components can be hidden via configuration

## Next Steps

1. **Immediate**: Begin Phase 1 with model and service layer implementation
2. **Short-term**: Complete Phase 2 admin UI list mode
3. **Medium-term**: Implement Phase 3 explorer mode
4. **Long-term**: Add Phase 4 advanced features based on user feedback

## Questions for Clarification

1. Should we implement any specific markdown extensions (tables, mermaid diagrams, etc.)?
2. Are there any specific import/export format requirements?
3. Should we implement versioning for markdown documents?
4. Any specific integration requirements with existing systems?

This plan follows established patterns from the JSON Config system while providing a comprehensive markdown management solution with hierarchical organization and dual UI modes.
