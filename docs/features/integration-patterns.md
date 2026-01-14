# Integration patterns

## Use middleware mode (recommended)

Middleware mode is the recommended integration approach. Standalone mode may be deprecated in the future.

### Minimal parent app

```js
require('dotenv').config();
const express = require('express');
const { middleware } = require('@intranefr/superbackend');

const app = express();

// Important: do NOT apply express.json() to the Stripe webhook path.
// Safest approach: mount SuperBackend before your global body parsers.
app.use('/saas', middleware({
  mongodbUri: process.env.MONGODB_URI,
  corsOrigin: process.env.CORS_ORIGIN || '*'
}));

// Your app routes can go here.

app.listen(3000);
```

## Mounting under a prefix

If you mount under `/saas`, all SuperBackend routes are prefixed.

```js
app.use('/saas', middleware({ mongodbUri: process.env.MONGODB_URI }));
```

Examples:

- `GET /saas/api/auth/me`
- `POST /saas/api/billing/create-checkout-session`
- `POST /saas/api/stripe/webhook`
- `GET /saas/api/json-configs/:slug`
- `GET /saas/public/assets/*`
- `GET /saas/admin/test`

## Advanced deployment scenarios

### 1. Microservices architecture

When integrating SuperBackend into a microservices setup:

```js
const express = require('express');
const { middleware } = require('@intranefr/superbackend');

// Auth service
const authApp = express();
authApp.use('/saas', middleware({
  mongodbUri: process.env.MONGODB_URI,
  corsOrigin: process.env.CORS_ORIGIN
}));

// API Gateway routing
const gateway = express();
gateway.use('/auth', authApp);
gateway.use('/api', yourMainApiRoutes);

app.listen(3000);
```

### 2. Docker containerization

**Dockerfile example:**
```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
EXPOSE 3000

ENV NODE_ENV=production
CMD ["node", "server.js"]
```

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  superbackend:
    build: .
    environment:
      - MONGODB_URI=mongodb://mongo:27017/saasbackend
      - JWT_ACCESS_SECRET=your-secret-key
      - CORS_ORIGIN=https://your-frontend.com
    ports:
      - "3000:3000"
    depends_on:
      - mongo

  mongo:
    image: mongo:6
    volumes:
      - mongo-data:/data/db

volumes:
  mongo-data:
```

### 3. Kubernetes deployment

**Deployment manifest:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: superbackend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: superbackend
  template:
    metadata:
      labels:
        app: superbackend
    spec:
      containers:
      - name: superbackend
        image: your-registry/superbackend:latest
        ports:
        - containerPort: 3000
        env:
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: superbackend-secrets
              key: mongodb-uri
        - name: JWT_ACCESS_SECRET
          valueFrom:
            secretKeyRef:
              name: superbackend-secrets
              key: jwt-secret
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: superbackend-service
spec:
  selector:
    app: superbackend
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
```

### 4. Reverse proxy configuration

**Nginx configuration:**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /saas/ {
        proxy_pass http://superbackend:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Important for Stripe webhooks
        proxy_set_header Content-Type application/json;
        proxy_set_header X-Forwarded-Body $request_body;
    }
    
    location / {
        proxy_pass http://your-frontend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Apache configuration:**
```apache
<VirtualHost *:80>
    ServerName your-domain.com
    
    ProxyPreserveHost On
    ProxyPass /saas/ http://superbackend:3000/
    ProxyPassReverse /saas/ http://superbackend:3000/
    
    # Your main application
    ProxyPass / http://your-frontend:3000/
    ProxyPassReverse / http://your-frontend:3000/
</VirtualHost>
```

## Stripe webhooks: raw body gotcha

Stripe signature verification requires the raw request body.

SuperBackend registers webhook handlers using `express.raw({ type: 'application/json' })` for:

- `POST /api/stripe/webhook`
- `POST /api/stripe-webhook` (legacy)

### Rule of thumb

- If your parent app uses `app.use(express.json())` globally, it can break Stripe signature validation.
- Prefer mounting SuperBackend **before** your global JSON body parser.

When mounting under a prefix (example `/saas`):

- Webhook paths become `/saas/api/stripe/webhook` and `/saas/api/stripe-webhook`.

### If you must keep global body parsing

If your app requires a global parser, you can exclude Stripe webhook paths.

Example pattern:

```js
const express = require('express');

app.use((req, res, next) => {
  if (req.path === '/api/stripe/webhook' || req.path === '/api/stripe-webhook') {
    return next();
  }
  return express.json()(req, res, next);
});

app.use(middleware({ mongodbUri: process.env.MONGODB_URI, skipBodyParser: true }));
```

Note:

- When mounting under a prefix (example `/saas`), webhook paths become `/saas/api/stripe/webhook`.

### Production webhook security

**1. Verify webhook signatures:**
```bash
# Test webhook signature verification
stripe listen --forward-to http://localhost:3000/saas/api/stripe/webhook
```

**2. Use environment-specific webhook secrets:**
```env
# Development
STRIPE_WEBHOOK_SECRET=whsec_test_...

# Production
STRIPE_WEBHOOK_SECRET=whsec_live_...
```

**3. Monitor webhook delivery:**
```bash
# Check webhook stats
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  http://localhost:3000/saas/api/admin/stripe-webhooks-stats
```

## CORS patterns

### Let SuperBackend handle CORS

```js
app.use('/saas', middleware({
  mongodbUri: process.env.MONGODB_URI,
  corsOrigin: 'https://app.example.com'
}));
```

### Let the parent app handle CORS

```js
app.use(cors({ origin: 'https://app.example.com', credentials: true }));
app.use('/saas', middleware({ mongodbUri: process.env.MONGODB_URI, corsOrigin: false }));
```

### Multiple origins configuration

```js
app.use('/saas', middleware({
  mongodbUri: process.env.MONGODB_URI,
  corsOrigin: 'https://app.example.com,https://admin.example.com'
}));
```

## Environment configuration patterns

### 1. Development environment

```env
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/saasbackend_dev
JWT_ACCESS_SECRET=dev-secret-key-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret-key
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
CORS_ORIGIN=http://localhost:3000
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
PUBLIC_URL=http://localhost:3000
```

### 2. Staging environment

```env
NODE_ENV=staging
MONGODB_URI=mongodb://mongo:27017/saasbackend_staging
JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
CORS_ORIGIN=https://staging.your-app.com
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
PUBLIC_URL=https://staging.your-app.com
```

### 3. Production environment

```env
NODE_ENV=production
MONGODB_URI=${MONGODB_URI}
JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
CORS_ORIGIN=https://your-app.com
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
PUBLIC_URL=https://your-app.com
```

## Quick test: healthcheck

```bash
curl http://localhost:3000/health
```

If mounted under `/saas`:

```bash
curl http://localhost:3000/saas/health
```

**Expected response:**
```json
{
  "status": "ok",
  "mode": "middleware",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0"
}
```

## Frontend snippets

### Auth: login

```js
async function login(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json(); // { token, refreshToken, user }
}
```

If mounted under `/saas`:

- Use `/saas/api/auth/login`.

### Billing: create checkout session and redirect

```js
async function startCheckout(token, priceId) {
  const res = await fetch('/api/billing/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ priceId })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create checkout session');

  window.location.href = data.url;
}
```

### File upload with progress

```js
async function uploadFile(file, token) {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch('/api/assets/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Upload failed');
  }
  
  return await response.json();
}
```

## Admin API: curl pattern

Admin endpoints require basic auth:

```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" http://localhost:3000/api/admin/users
```

If mounted under `/saas`:

```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" http://localhost:3000/saas/api/admin/users
```

### Common admin operations

**List all users:**
```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "http://localhost:3000/saas/api/admin/users?limit=50&offset=0"
```

**Disable a user:**
```bash
curl -X POST -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "http://localhost:3000/saas/api/admin/users/USER_ID/disable"
```

**Get feature flags:**
```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  "http://localhost:3000/saas/api/admin/feature-flags"
```

**Create feature flag:**
```bash
curl -X POST -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"key":"new_feature","enabled":true,"rolloutPercentage":10}' \
  "http://localhost:3000/saas/api/admin/feature-flags"
```

## Common integration issues and solutions

### Issue 1: CORS errors in production

**Symptoms:** `Access-Control-Allow-Origin` errors in browser console.

**Solution:** Configure CORS properly:
```js
app.use('/saas', middleware({
  corsOrigin: 'https://your-frontend.com' // Exact domain
}));
```

### Issue 2: Stripe webhooks failing signature verification

**Symptoms:** `400 Bad Request` for webhook endpoints.

**Solution:** Ensure raw body parsing and correct webhook secret:
```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Issue 3: JWT tokens not working across subdomains

**Symptoms:** Authentication works on one subdomain but not others.

**Solution:** Configure JWT secrets and CORS for subdomains:
```js
app.use('/saas', middleware({
  corsOrigin: 'https://*.your-app.com'
}));
```

### Issue 4: Database connection issues in Docker

**Symptoms:** `ECONNREFUSED` errors when connecting to MongoDB.

**Solution:** Use correct Docker network names:
```env
MONGODB_URI=mongodb://mongo:27017/saasbackend
```

### Issue 5: Health check showing wrong mode

**Symptoms:** Health endpoint shows `mode: "standalone"` when using middleware.

**Solution:** Ensure you're using the middleware export correctly:
```js
const { middleware } = require('@intranefr/superbackend');
app.use('/saas', middleware({ ... }));
```
