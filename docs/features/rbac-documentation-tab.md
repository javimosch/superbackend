# RBAC Documentation Tab

## Overview
Added a comprehensive Documentation sub-tab to the RBAC Admin UI that provides developers with clear examples and API references for integrating rights checking in their applications using SuperBackend in middleware mode.

## Implementation Details

### Tab Addition
- New "Documentation" tab added to the RBAC admin UI after the Roles tab
- Uses consistent Vue.js tab structure and Tailwind CSS styling
- Positioned as the fourth tab: Rights, Groups, Roles, Documentation

### Content Sections

#### 1. Programmatic Rights Checking (Middleware Mode)
- Shows how to access the RBAC service via `globalThis.superbackend.services.rbac`
- Includes basic rights checking example with decisionLayer explanation
- Provides complete Express middleware example for route protection
- Demonstrates error handling and response structure

#### 2. HTTP API Rights Checking
- Documents the `/api/rbac/check` endpoint with authentication requirements
- Shows request/response format with detailed context object
- Includes curl example for testing from command line
- Provides JavaScript fetch example for frontend integration

#### 3. Common Integration Patterns
- Wildcard rights usage (`backoffice:*`)
- Multiple rights checking with Promise.all for AND/OR logic
- Global vs org-scoped rights distinction
- Practical code examples for each pattern

#### 4. Troubleshooting & Best Practices
- Common error scenarios and solutions
- Performance optimization tips
- Audit logging recommendations using decisionLayer
- Highlighted tip box for key insights

### Technical Implementation
- No backend changes required - uses existing `/api/rbac/check` endpoint and `rbacService`
- All code examples use real-world rights format (`backoffice:dashboard:access`)
- Consistent styling with other RBAC tabs using Tailwind classes
- Code blocks with syntax highlighting and proper formatting
- Responsive design with horizontal scrolling for long code examples

### Developer Experience
- Copy-paste ready examples for immediate integration
- Clear separation between programmatic and API methods
- Comprehensive coverage of common use cases
- Practical authentication examples (JWT and Basic Auth)

## File Changes
- `views/admin-rbac.ejs`: Added Documentation tab with four comprehensive sections

## Usage
Developers can now access integration documentation directly within the RBAC admin UI, making it easy to implement rights checking in their middleware or application code without leaving the admin interface.
