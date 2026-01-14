# SuperBackend

Node.js middleware that gives your project backend superpowers. Handles authentication, billing, audit logs, file storage, error tracking, and more—all in one cohesive layer.

---

## Features

- **Authentication & Security**: JWT-based auth with refresh tokens, organization management, and granular RBAC system
- **Billing & Subscriptions**: Full Stripe integration with checkout sessions, billing portal, and webhook processing
- **File Storage**: Unified S3/filesystem API with multipart uploads, namespace support, and public/private visibility
- **Admin Panel**: Basic-auth protected UI for user management, settings, metrics, and operational tasks
- **Audit Logging**: Append-only audit trail for security and compliance with admin search interface
- **Error Tracking**: Frontend + backend error aggregation with fingerprinting and admin triage UI
- **Notifications**: Multi-channel system with in-app notifications and email alerts
- **Feature Flags**: Dynamic feature toggles with rollout percentages and allow lists
- **Global Settings**: Runtime configuration with encrypted storage support for secrets
- **Forms & Leads**: Custom form definitions, lead capture, webhooks, and multi-tenant support
- **Internationalization**: JSON-based localization with server-side and client-side integration
- **Organizations**: Multi-tenant support with role-based member management
- **Headless CMS**: JSON configs, SEO configuration, and content management
- **Email System**: SMTP integration with templates and delivery tracking
- **Webhooks**: Outgoing webhook system for event-driven integrations
- **Metrics & Activity**: Usage tracking and analytics for business insights
- **Middleware Mode**: Drop-in Express middleware that preserves your app structure

---

## Installation

```bash
npm install @intranefr/superbackend
```

or

```bash
yarn add @intranefr/superbackend
```

---

## Quick Start

```javascript
require('dotenv').config();
const express = require('express');
const { middleware } = require('@intranefr/superbackend');

const app = express();

// Mount under /saas prefix (recommended)
app.use('/saas', middleware({
  mongodbUri: process.env.MONGODB_URI,
  corsOrigin: process.env.CORS_ORIGIN || '*',
}));

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

---

## Configuration

SuperBackend is fully configurable. Example options:

```javascript
const backend = new SuperBackend({
  rbac: { /* roles, permissions */ },
  logging: { level: 'info', output: 'console' },
  metrics: true,
  queues: { redisUrl: 'redis://localhost:6379' },
  audit: true,
});
```

---

## Documentation

See the `docs/features/` directory for detailed guides:
- [Getting Started](docs/features/getting-started.md)
- [Core Configuration](docs/features/core-configuration.md)
- [Admin API Usage](docs/features/admin-api-usage.md)
- [Billing & Subscriptions](docs/features/billing-and-subscriptions.md)

---

## Contributing

SuperBackend is open-source and welcomes contributions!  
Please read the [CONTRIBUTING.md](#) for guidelines.

---

<!-- Made by Intrane block -->
<p><em>Part of the Intrane suite of practical developer tools</em></p>
<a href="https://intrane.fr" target="_blank">
  <img src="https://img.shields.io/badge/Intrane-intranefr-blue?style=flat-square" alt="Intrane"/>
</a>
&nbsp;
<a href="https://www.npmjs.com/package/@intranefr/superbackend" target="_blank">
  <img src="https://img.shields.io/npm/v/@intranefr%2Fsuperbackend?style=flat-square" alt="npm"/>
</a>

## License

MIT © 2026 Intrane