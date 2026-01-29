---
description: POC Starter Kits - Instant project scaffolding for CTOs
---

# POC Starter Kits — Plan

## Goal
Create **POC Starter Kits** that help CTOs ship Proof of Concepts in hours instead of weeks. The system provides pre-configured project templates with common SaaS patterns already wired up, leveraging SuperBackend's existing services and patterns.

## Why now (problems to solve)
CTOs building POCs face repetitive friction:
- **Setup time**: 1-2 weeks to wire auth, billing, database models, and deployment
- **Decision fatigue**: Choosing stack components, folder structure, and patterns
- **Integration complexity**: Connecting frontend to backend, handling CORS, JWT flow
- **Missing pieces**: No audit logs, error tracking, or admin panels in early prototypes
- **Demo pressure**: Need something impressive quickly for stakeholders

## Guiding principles
- **Zero boilerplate**: Generate working code, not empty folders
- **Production patterns**: Use real auth, real billing, real database - not mocks
- **Customizable**: Easy to modify, extend, or replace components
- **Full-stack**: Include both backend API stubs AND frontend components
- **Deploy-ready**: One-command deployment to common platforms

---

# Proposed Architecture

## 1. Kit Definition
A **POC Kit** is a template package containing:
- **Backend stub**: Minimal Express app with SuperBackend integrated
- **Frontend scaffold**: React/Vue components for common SaaS UI patterns
- **Database models**: Pre-defined schemas for the target domain
- **Configuration files**: Environment files, deployment configs
- **Documentation**: Contextual README with next steps

### Kit manifest (`kit.json`)
```json
{
  "id": "saas-mvp",
  "name": "SaaS MVP Kit",
  "description": "User auth, teams, subscription billing, and basic dashboard",
  "version": "1.0.0",
  "author": "SuperBackend",
  "tags": ["saas", "teams", "billing"],
  "framework": "react",
  "database": "mongodb",
  "deployment": ["vercel", "railway", "docker"],
  "dependencies": {
    "backend": ["@intranefr/superbackend"],
    "frontend": ["react", "axios", "react-router"]
  }
}
```

## 2. Kit Registry Service
Add a lightweight service that:
- Stores kit definitions in `JsonConfig` (key: `poc-kits`)
- Serves kit metadata via API
- Validates kit manifests
- Tracks usage analytics

### API endpoints (admin, basic auth)
- `GET /api/admin/poc-kits` - List available kits
- `POST /api/admin/poc-kits` - Upload new kit
- `GET /api/admin/poc-kits/:id/download` - Generate and download kit

## 3. Kit Generator Engine
Core generator that:
1. **Loads template files** from stored kit ZIP/base64
2. **Interpolates variables** (project name, database URL, etc.)
3. **Creates package.json** with correct dependencies
4. **Generates environment files** with placeholder secrets
5. **Creates deployment configs** (Dockerfile, railway.json, vercel.json)
6. **Zips the result** for download

### Template variables
- `{{PROJECT_NAME}}` - User-provided project name
- `{{PROJECT_SLUG}}` - URL-safe version
- `{{DATABASE_URL}}` - MongoDB connection string
- `{{JWT_SECRET}}` - Generated secret
- `{{STRIPE_KEY}}` - Stripe test key placeholder

## 4. Initial Kit Templates

### Kit 1: SaaS MVP (`saas-mvp`)
**Features**:
- User registration/login with email verification
- Organization/team management (RBAC)
- Stripe subscription billing (2 tiers)
- Basic dashboard with user settings
- Admin panel for user management
- Audit logging and error tracking

**Generated structure**:
```
my-saas-app/
├── backend/
│   ├── src/
│   │   ├── models/          # Custom models extend SuperBackend
│   │   ├── routes/          # API routes
│   │   └── app.js           # Express + SuperBackend
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/           # Route pages
│   │   └── hooks/           # Auth, API hooks
│   ├── package.json
│   └── public/
├── docker-compose.yml
├── railway.json
└── README.md
```

### Kit 2: Content Platform (`content-platform`)
**Features**:
- User-generated content with rich text
- Comment system
- Like/bookmark functionality
- Admin content moderation
- SEO-optimized pages
- File uploads for media

### Kit 3: API Service (`api-service`)
**Features**:
- API key authentication
- Rate limiting per key
- Usage metrics dashboard
- OpenAPI documentation
- Webhook support
- Multi-tenant API keys

### Kit 4: Marketplace (`marketplace`)
**Features**:
- Product listings with categories
- User profiles and reviews
- Search and filtering
- Booking/appointment system
- Payment processing
- Admin moderation tools

---

# Implementation Plan

## Phase 1 - Core Generator (Week 1)
1. Create `PocKit` model for kit definitions
2. Build generator service (`src/services/pocKitGenerator.service.js`)
3. Add admin endpoints for kit management
4. Create first working kit (SaaS MVP)
5. Basic UI in admin panel to browse/generate kits

## Phase 2 - Kit Templates (Week 2)
1. Build remaining 3 kit templates
2. Add framework options (React/Vue)
3. Include deployment configs for Vercel, Railway, Docker
4. Add variable validation and error handling
5. Create kit documentation template

## Phase 3 - Enhanced Features (Week 3)
1. Add post-generation wizard (next steps checklist)
2. Include sample data seeds
3. Add testing setup (Jest config, sample tests)
4. Create CI/CD templates (GitHub Actions)
5. Kit versioning and updates

## Phase 4 - Advanced Features (Week 4)
1. Custom kit builder (UI to select features)
2. Kit marketplace (community submissions)
3. One-click deploy integration
4. Analytics and telemetry
5. Kit customization wizard

---

# Technical Implementation

## New Files
- `src/models/PocKit.js` - Kit definition model
- `src/services/pocKitGenerator.service.js` - Core generator logic
- `src/controllers/adminPocKits.controller.js` - Admin endpoints
- `src/routes/adminPocKits.routes.js` - Route definitions
- `views/admin-poc-kits.ejs` - Admin UI
- `templates/kits/` - Stored kit templates

## Generator Service Sketch
```javascript
class PocKitGenerator {
  async generateKit(kitId, variables) {
    const kit = await PocKit.findById(kitId);
    const template = await this.loadTemplate(kit.templatePath);
    
    // Interpolate variables
    const files = await this.interpolate(template, variables);
    
    // Create package.json with dependencies
    files['package.json'] = this.generatePackageJson(kit, variables);
    
    // Generate environment files
    files['.env.example'] = this.generateEnvExample(kit);
    
    // Add deployment configs
    if (kit.deployment.includes('docker')) {
      files['Dockerfile'] = this.generateDockerfile(kit);
    }
    
    // Return ZIP buffer
    return await this.createZip(files);
  }
}
```

## Admin UI Components
- Kit browser with search/filter
- Variable input form (project name, etc.)
- Real-time preview of generated structure
- Download button with progress indicator
- Usage analytics dashboard

---

# Open Questions

1. **Kit Storage**: Should templates be stored in:
   - Database (JsonConfig with base64 ZIP)
   - Git repository (clone and template)
   - File system (with admin upload)

2. **Frontend Framework**: Start with React only, or support Vue from day one?

3. **Customization Level**: Should kits be:
   - Fixed templates (simpler, more opinionated)
   - Modular components (more complex, flexible)

4. **Deployment Integration**: Prioritize:
   - Vercel (frontend focus)
   - Railway (full-stack)
   - Docker (universal)
   - All three from start?

5. **Update Mechanism**: How should generated projects receive updates?
   - Manual migration guides
   - Automated diff/patch system
   - No updates (snapshot in time)

---

# Success Metrics
- **Time to first API call**: < 5 minutes from kit download
- **Deployment success rate**: > 90% one-command deploy
- **Kit adoption**: Track downloads and completed projects
- **User feedback**: Survey CTOs on time saved vs manual setup
- **Community contributions**: Number of community-submitted kits

---

# Next Steps
1. Lock in technical decisions (storage, frameworks, deployment)
2. Create detailed specifications for each kit template
3. Build Phase 1 MVP with SaaS MVP kit
4. Test with real CTOs and iterate based on feedback
5. Launch with 4 kits and gather usage data

---

*This feature directly addresses the #1 pain point for CTOs: reducing time from idea to working prototype. By providing production-ready patterns instead of empty boilerplate, we enable faster validation and iteration on new ideas.*
