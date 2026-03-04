# Changelog

All notable changes to this project will be documented in this file.

## [1.6.5] - 2026-02-24

### Added
- **Security:** Session expiration validation and user context enrichment in admin authentication.

### Changed
- **Middleware:** Unified admin authentication under the `adminAuth` middleware, replacing the legacy `adminSessionAuth`.

## [1.6.4] - 2026-02-21

### Changed
- **Reliability:** Implemented fallback mechanisms for Telegram service initialization to ensure system stability during startup failures.

## [1.6.3] - 2026-02-20

### Added
- **Security & RBAC:** Complete Role-Based Access Control (RBAC) implementation with new roles: `superadmin`, `limited-admin`, `content-manager`, and `developer`.
- **Admin Tools:** New Data Cleanup utility with overview, dry-run, and destructive execution capabilities for MongoDB maintenance.
- **UX/UI:** Support for Iframe mode and cross-window communication in the admin dashboard for seamless integration.
- **Data Migration:** Migrated the Waiting List module from MongoDB to performance-optimized JSON Configs.
- **RBAC Registry:** Expanded rights registry to cover all admin panel sections and module-specific access.

### Changed
- **Authentication:** Fully transitioned admin routes from Basic Auth to Session-based authentication.
- **Architecture:** Standardized internal API authentication and whitelisted `core-` prefix for official plugins.

## [1.5.3] - 2026-02-17

### Added
- **Plugin System:** Introduced a new Plugin Architecture with admin UI management and runtime bootstrap capabilities.
- **AI Infrastructure:** Launched the AI Agent Gateway with full Telegram integration.
- **Interactive Tools:** Developed the Agent Chat TUI (Terminal UI) featuring interactive spinners, progress updates, and session management.
- **Content Management:** New Markdown Management System featuring a hierarchical explorer, Zen Mode editor, and Live Preview.
- **Experimentation:** Implemented an A/B Testing system with event tracking and webhook support.
- **UI Framework:** Added a UI Components service for managing and previewing frontend assets.

### Documentation
- Comprehensive guides for the Plugins System and UI Component development.
- Documentation for Admin Preview & Testing contracts.

## [1.5.2] - 2026-02-10

### Added
- **Scripting:** Introduced `async/await` support for Node.js scripts and standardized script return values.
- **Observability:** Audit logging for script creation and enhanced console management with module-specific prefixing.
- **Registry:** Initial implementation of the Registry System for service discovery.

### Documentation
- Published the OpenRegistry Protocol specification.
