# Plan: RBAC Rights Comparison Documentation Sub-Tab

## Overview
Add a new "Documentation" sub-tab to the RBAC Admin UI that provides clear examples and API references for comparing rights programmatically and via API, specifically for codebases using SuperBackend in middleware mode.

## Goals
- Enable developers to integrate rights checking in their middleware or application code
- Provide clear API usage examples
- Show both programmatic (in-process) and HTTP API methods
- Include request/response examples and error handling

## Implementation Plan

### 1. Add Documentation Sub-Tab
- Add "Documentation" tab to RBAC admin UI (`views/admin-rbac.ejs`)
- Position as the last tab after "Rights", "Groups", and "Roles"
- Use same Vue tab structure as other sub-tabs

### 2. Documentation Content Sections

#### Section 1: Programmatic Rights Checking (Middleware Mode)
- How to access `rbacService` directly in SuperBackend middleware mode
- Example: Using `globalThis.superbackend.services.rbac`
- Show `checkRight(userId, orgId, right)` usage
- Include async/await examples and error handling
- Explain how to get `userId` from request context (JWT/auth)

#### Section 2: HTTP API Rights Checking
- Endpoint: `POST /api/rbac/check`
- Headers: Authorization (JWT) or Basic Auth
- Request body structure: `{ userId, orgId, right }`
- Response structure: `{ allowed, decisionLayer, context }`
- Show curl examples and JavaScript fetch examples

#### Section 3: Batch Rights Checking
- How to check multiple rights efficiently
- Programmatic: Loop vs batch helper (if available)
- API: Multiple single requests vs future batch endpoint design note
- Performance considerations

#### Section 4: Common Integration Patterns
- Express middleware example for route protection
- Koa/Fastify examples (brief)
- Granular vs wildcard rights examples
- Scoping examples (org-specific vs global rights)

#### Section 5: Troubleshooting & Best Practices
- Common errors (missing userId, invalid right format)
- Caching considerations
- Logging rights checks for audit
- Performance tips

### 3. UI Implementation Details

#### Tab Content Structure
```html
<div v-if="activeTab === 'docs'">
  <div class="space-y-6">
    <!-- Section 1: Programmatic -->
    <section>
      <h3 class="text-lg font-semibold mb-3">Programmatic Rights Checking (Middleware Mode)</h3>
      <div class="bg-gray-50 rounded p-4">
        <pre class="text-xs overflow-x-auto"><code>...</code></pre>
      </div>
    </section>
    <!-- Repeat for other sections -->
  </div>
</div>
```

#### Styling
- Use consistent Tailwind classes with other tabs
- Code blocks with `bg-gray-50`, `text-xs`, `overflow-x-auto`
- Clear section headings with `h3` titles
- Alert/info boxes for important notes

### 4. Code Examples to Include

#### Programmatic Example
```javascript
// In your middleware/route handler
const rbac = globalThis.superbackend.services.rbac;
const result = await rbac.checkRight(userId, orgId, 'backoffice:dashboard:access');

if (result.allowed) {
  // Proceed with protected action
} else {
  // Deny access
  console.log('Denied by:', result.decisionLayer);
}
```

#### API Example (curl)
```bash
curl -X POST http://localhost:3000/api/rbac/check \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "507f1f77bcf86cd799439011",
    "orgId": "507f1f77bcf86cd799439012",
    "right": "backoffice:dashboard:access"
  }'
```

#### Express Middleware Example
```javascript
const requireRight = (right) => async (req, res, next) => {
  const rbac = globalThis.superbackend.services.rbac;
  const result = await rbac.checkRight(req.user.id, req.org.id, right);
  
  if (result.allowed) return next();
  res.status(403).json({ error: 'Insufficient permissions' });
};

// Usage
app.get('/admin/dashboard', requireRight('backoffice:dashboard:access'), dashboardHandler);
```

### 5. File Changes Required

#### Primary File
- `views/admin-rbac.ejs`: Add Documentation tab with all sections and examples

#### No Backend Changes
- No API changes needed (uses existing `/api/rbac/check` endpoint)
- No new services required (uses existing `rbacService`)

### 6. Testing Considerations
- Verify code examples are syntactically correct
- Test curl examples against actual API
- Ensure programmatic examples work in middleware mode
- Check responsive layout on smaller screens

### 7. Future Enhancements (Optional)
- "Try it out" interactive API tester within documentation
- Copy-to-clipboard buttons for code examples
- Language switcher for examples (JavaScript, Python, curl)
- Export documentation as Markdown/PDF

## Success Criteria
- Developers can copy-paste working examples for integration
- Clear distinction between programmatic and API methods
- Comprehensive coverage of common use cases
- Consistent with existing RBAC admin UI design

## Implementation Notes
- Keep examples concise but complete
- Use real-world rights format (`backoffice:dashboard:access`)
- Include error handling in examples
- Add comments explaining key steps
- Maintain consistency with existing documentation style

## Final Implementation Details

### Completed Features
- Added Documentation tab as the fourth tab in RBAC admin UI
- Implemented four comprehensive sections with practical examples
- Used existing `/api/rbac/check` endpoint and `rbacService` - no backend changes needed
- Applied consistent Tailwind CSS styling matching other tabs
- Included copy-paste ready code examples for immediate developer use

### Key Implementation Decisions
1. **No Backend Changes**: Leveraged existing API endpoints and services
2. **Comprehensive Examples**: Covered both programmatic and HTTP API methods
3. **Real-world Format**: Used actual rights patterns from the system
4. **Developer-focused**: Prioritized practical integration needs
5. **Consistent Design**: Maintained UI consistency with existing tabs

### Files Modified
- `views/admin-rbac.ejs`: Added Documentation tab with all sections and examples

### Documentation Created
- `docs/features/rbac-documentation-tab.md`: Technical documentation reflecting final implementation

### Success Metrics Met
- Developers can copy-paste working examples for integration ✓
- Clear distinction between programmatic and API methods ✓
- Comprehensive coverage of common use cases ✓
- Consistent with existing RBAC admin UI design ✓

## Status: COMPLETED
The RBAC Documentation tab has been successfully implemented and is now available in the admin UI, providing developers with comprehensive integration guidance for rights checking in SuperBackend middleware mode.
