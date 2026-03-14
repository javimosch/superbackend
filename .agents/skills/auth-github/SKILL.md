---
skill_name: auth-github-skill
description: GitHub OAuth authentication for SuperBackend user-facing APIs
tags: authentication,oauth,github,backend,nodejs,express
---

**Version:** 1.0.0
**Scope:** GitHub OAuth authentication flow for SuperBackend
**Target:** AI Agents and automated frontend systems

---

## Skill Definition

This skill provides GitHub OAuth authentication capabilities for SuperBackend-based applications. It handles the complete OAuth 2.0 flow from initiation to token management.

### Capabilities

- **OAuth Flow:** Initiate, callback, and token refresh
- **Account Management:** Auto-create users, link existing accounts
- **Token Management:** JWT generation, GitHub token storage
- **Security:** CSRF protection via state parameter
- **Configuration:** Environment variables or global settings

### Authentication Flow Overview

```
1. Agent redirects user to GitHub OAuth
2. User authorizes application on GitHub
3. GitHub redirects back with authorization code
4. Exchange code for access token
5. Create/link user account
6. Generate JWT tokens for session
7. Redirect to frontend with tokens
```

### Configuration Requirements

```bash
# Option 1: Environment Variables
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback
FRONTEND_URL=http://localhost:3000

# Option 2: Global Settings (recommended for production)
# Set via admin API or UI:
# - github.oauth.clientId
# - github.oauth.clientSecret (encrypted)
# - github.oauth.callbackUrl
```

**Note:** Global settings take precedence over environment variables.

---

## API Endpoints

### Base URL
All endpoints are prefixed with the SuperBackend mount path (default: `/api/auth`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/github` | GET | Initiate GitHub OAuth flow |
| `/github/callback` | GET | Handle OAuth callback |
| `/github/refresh-token` | POST | Refresh GitHub access token |

---

## Command Patterns

### Pattern 1: Initiate GitHub OAuth

**Redirect Flow (Browser):**
```bash
GET /api/auth/github
# Returns: 302 redirect to GitHub OAuth URL
```

**JSON Response (Programmatic):**
```bash
GET /api/auth/github?json=true
# Returns: { "success": true, "authUrl": "...", "state": "..." }
```

**Agent Implementation:**
```javascript
// For browser-based apps
window.location.href = '/api/auth/github';

// For programmatic handling
const response = await fetch('/api/auth/github?json=true');
const { authUrl, state } = await response.json();
// Store state for CSRF verification
sessionStorage.setItem('githubOAuthState', state);
```

### Pattern 2: Handle OAuth Callback

**Callback URL Structure:**
```
/api/auth/github/callback?code=AUTH_CODE&state=STATE
```

**JSON Mode (Recommended for Agents):**
```bash
GET /api/auth/github/callback?code=xxx&state=yyy&json=true
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "email": "user@github.com",
    "name": "GitHub User",
    "githubId": "12345",
    "githubUsername": "ghuser",
    "avatar": "https://avatars.githubusercontent.com/u/12345",
    "emailVerified": true,
    "role": "user"
  }
}
```

**Agent Implementation:**
```javascript
class GitHubAuthHandler {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  // Check if current page is OAuth callback
  isCallback() {
    const params = new URLSearchParams(window.location.search);
    return params.has('code') && params.has('state');
  }

  // Get callback parameters
  getCallbackParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      code: params.get('code'),
      state: params.get('state')
    };
  }

  // Verify state parameter (CSRF protection)
  verifyState(state) {
    const storedState = sessionStorage.getItem('githubOAuthState');
    sessionStorage.removeItem('githubOAuthState');
    return state === storedState;
  }

  // Complete OAuth flow
  async completeAuth(code, state) {
    // Verify CSRF state
    const storedState = sessionStorage.getItem('githubOAuthState');
    if (state !== storedState) {
      throw new Error('Invalid state parameter - CSRF protection failed');
    }

    const response = await fetch(
      `${this.baseUrl}/api/auth/github/callback?code=${code}&state=${state}&json=true`,
      { method: 'GET', headers: { 'Accept': 'application/json' } }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'GitHub authentication failed');
    }

    const data = await response.json();
    
    // Store tokens
    localStorage.setItem('authToken', data.token);
    localStorage.setItem('authRefreshToken', data.refreshToken);
    sessionStorage.removeItem('githubOAuthState');

    // Clear URL
    window.history.replaceState({}, document.title, window.location.pathname);

    return data;
  }
}
```

### Pattern 3: Refresh GitHub Access Token

**Request:**
```bash
POST /api/auth/github/refresh-token
Content-Type: application/json

{
  "refreshToken": "ghr_github_refresh_token"
}
```

**Response:**
```json
{
  "success": true,
  "accessToken": "gho_new_access_token",
  "refreshToken": "ghr_new_refresh_token"
}
```

**Agent Implementation:**
```javascript
async refreshGitHubToken(refreshToken) {
  const response = await fetch('/api/auth/github/refresh-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Token refresh failed');
  }

  return response.json();
}
```

---

## User Account Handling

### Account Creation Scenarios

The GitHub OAuth system handles three scenarios automatically:

#### Scenario 1: New User (No GitHub ID, No Email Match)

**Behavior:**
- Creates new user account
- Sets GitHub-specific fields
- Marks email as verified if GitHub provided it

**User Document:**
```javascript
{
  email: "user@github.com",
  name: "GitHub Name",
  githubId: "12345",
  githubUsername: "ghuser",
  githubAccessToken: "gho_...",
  githubRefreshToken: "ghr_...",
  githubEmail: "user@github.com",
  avatar: "https://avatars.githubusercontent.com/u/12345",
  emailVerified: true,
  role: "user"
}
```

#### Scenario 2: Link Existing Account (Email Match)

**Behavior:**
- Finds user by email address
- Links GitHub account to existing user
- Preserves existing role and settings

**Example:**
```javascript
// Existing user with email/password
{
  _id: "existing123",
  email: "user@example.com",
  passwordHash: "$2a$10$...",
  role: "admin"
}

// After GitHub OAuth login with same email
{
  _id: "existing123",
  email: "user@example.com",
  passwordHash: "$2a$10$...",
  githubId: "12345",
  githubUsername: "ghuser",
  githubAccessToken: "gho_...",
  role: "admin"  // Preserved
}
```

#### Scenario 3: Existing GitHub User (GitHub ID Match)

**Behavior:**
- Finds user by githubId
- Updates tokens and profile info
- Preserves all existing data

---

## Security Features

### CSRF Protection

**State Parameter Flow:**
```javascript
// 1. Generate state on init
const state = crypto.randomBytes(32).toString('hex');
sessionStorage.setItem('githubOAuthState', state);

// 2. Include in OAuth URL
const authUrl = `/api/auth/github?json=true`;
// Server stores state in session

// 3. Verify on callback
const storedState = sessionStorage.getItem('githubOAuthState');
if (callbackState !== storedState) {
  throw new Error('CSRF verification failed');
}
```

### Token Security

**GitHub Tokens:**
- Stored encrypted in database (select: false by default)
- Never returned in API responses
- Used only for GitHub API access

**JWT Tokens:**
- Standard SuperBackend JWT format
- Includes userId and role
- Expiry: 7 days (configurable)

### Account Linking Security

**Email Verification:**
- GitHub-provided emails marked as verified
- Non-GitHub emails retain existing verification status

**Account Protection:**
- Existing password users can link GitHub
- GitHub users can add password later
- Role and permissions preserved during linking

---

## Error Handling

### Common Errors

| Error | HTTP Code | Cause | Solution |
|-------|-----------|-------|----------|
| `GITHUB_CLIENT_ID not configured` | 500 | Missing credentials | Configure env vars or global settings |
| `Authorization code missing` | 400 | No code in callback | Check GitHub redirect |
| `Invalid state parameter` | 400 | CSRF mismatch | Clear state, restart flow |
| `Failed to get access token` | 400 | Invalid code/expired | Restart OAuth flow |
| `GitHub OAuth credentials not configured` | 500 | Missing secret | Check global settings priority |

### Error Response Format

```json
{
  "error": "Error message description"
}
```

### Agent Error Handling Pattern

```javascript
async loginWithGitHub() {
  try {
    // Initiate flow
    const { authUrl } = await fetch('/api/auth/github?json=true').then(r => r.json());
    window.location.href = authUrl;
  } catch (error) {
    if (error.message.includes('not configured')) {
      // Admin needs to configure credentials
      console.error('GitHub OAuth not configured');
      // Fallback to email/password
    }
  }
}

async handleCallback() {
  try {
    const { code, state } = getCallbackParams();
    const data = await completeAuth(code, state);
    return { success: true, user: data.user };
  } catch (error) {
    if (error.message.includes('CSRF')) {
      // Security issue - restart flow
      return { success: false, error: 'SECURITY_ERROR' };
    }
    if (error.message.includes('expired')) {
      // Code expired - restart flow
      return { success: false, error: 'EXPIRED_CODE' };
    }
    throw error;
  }
}
```

---

## Configuration Management

### Using Global Settings (Recommended)

**Via Admin API:**
```bash
# Set Client ID
curl -X POST ${BASE_URL}/api/admin/global-settings \
  -H 'Authorization: Bearer <admin_token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "key": "github.oauth.clientId",
    "value": "Iv1.abcdef123456",
    "type": "plain"
  }'

# Set Client Secret (encrypted)
curl -X POST ${BASE_URL}/api/admin/global-settings \
  -H 'Authorization: Bearer <admin_token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "key": "github.oauth.clientSecret",
    "value": "secret_value_here",
    "type": "encrypted"
  }'

# Set Callback URL
curl -X POST ${BASE_URL}/api/admin/global-settings \
  -H 'Authorization: Bearer <admin_token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "key": "github.oauth.callbackUrl",
    "value": "https://app.example.com/api/auth/github/callback",
    "type": "plain"
  }'
```

**Via Direct CLI:**
```bash
# Set Client ID
npm run direct -- global-settings create --key "github.oauth.clientId" --value "Iv1.abcdef" --quiet

# Set Client Secret (encrypted)
npm run direct -- global-settings create --key "github.oauth.clientSecret" --value "secret" --quiet
```

**Priority Order:**
```
1. Global Settings (github.oauth.*)
2. Environment Variables (GITHUB_*)
3. Defaults (localhost callback)
```

---

## GitHub Setup Guide

### Step 1: Create OAuth App

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - **Application name:** Your App Name
   - **Homepage URL:** https://yourapp.com
   - **Authorization callback URL:** https://yourapp.com/api/auth/github/callback
4. Click "Register application"

### Step 2: Get Credentials

After registration:
- **Client ID:** Displayed on app page
- **Client Secret:** Click "Generate a new client secret"

### Step 3: Configure SuperBackend

```bash
# Add to .env or set via global settings
GITHUB_CLIENT_ID=Iv1.abcdef123456
GITHUB_CLIENT_SECRET=your_secret_here
GITHUB_CALLBACK_URL=https://yourapp.com/api/auth/github/callback
```

### Step 4: Test

```bash
# Initiate OAuth flow
curl -v http://localhost:3000/api/auth/github?json=true

# Expected: 302 redirect to github.com
```

---

## Agent Tips

### Tip 1: Store State for CSRF Protection

```javascript
// Before redirect
const { state } = await fetch('/api/auth/github?json=true').then(r => r.json());
sessionStorage.setItem('githubOAuthState', state);

// After callback
const storedState = sessionStorage.getItem('githubOAuthState');
// Verify matches callback state
```

### Tip 2: Handle Both Redirect and JSON Modes

```javascript
// Browser apps: use redirect
loginWithGitHub() {
  window.location.href = '/api/auth/github';
}

// Mobile/API clients: use JSON
async loginWithGitHubJSON() {
  const { authUrl } = await fetch('/api/auth/github?json=true').then(r => r.json());
  // Open authUrl in browser/SFSafariViewController
  // Handle callback via deep link
}
```

### Tip 3: Clean Up URL After Callback

```javascript
// Remove ?code=xxx&state=yyy from URL
window.history.replaceState({}, document.title, window.location.pathname);
```

### Tip 4: Token Storage Strategy

```javascript
// Access token (short-lived)
localStorage.setItem('authToken', token);

// Refresh token (long-lived)
localStorage.setItem('authRefreshToken', refreshToken);

// For enhanced security, use httpOnly cookies instead
```

### Tip 5: Auto-Link Accounts

```javascript
// User registers with email/password
// Later logs in with GitHub (same email)
// System auto-links accounts - no action needed

// Agent should inform user:
"Your GitHub account has been linked to your existing account"
```

### Tip 6: Handle Token Expiry

```javascript
// GitHub access tokens expire
// Use refresh token to get new access token
async refreshGitHubToken() {
  const refreshToken = localStorage.getItem('githubRefreshToken');
  const response = await fetch('/api/auth/github/refresh-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  
  if (!response.ok) {
    // Refresh failed - re-authenticate
    localStorage.removeItem('githubRefreshToken');
    return false;
  }
  
  const { accessToken, refreshToken: newRefreshToken } = await response.json();
  // Store new tokens
  return true;
}
```

### Tip 7: Check Configuration Status

```javascript
async checkGitHubOAuthConfigured() {
  try {
    const response = await fetch('/api/auth/github?json=true');
    if (response.status === 500) {
      const error = await response.json();
      return error.error.includes('not configured');
    }
    return true;
  } catch (e) {
    return false;
  }
}
```

---

## Integration Examples

### React Component

```jsx
function GitHubLoginButton() {
  const handleLogin = () => {
    window.location.href = '/api/auth/github';
  };

  return (
    <button onClick={handleLogin}>
      <GitHubIcon />
      Sign in with GitHub
    </button>
  );
}

function OAuthCallback() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (!code || !state) {
      setError('Invalid callback');
      setLoading(false);
      return;
    }

    fetch(`/api/auth/github/callback?code=${code}&state=${state}&json=true`)
      .then(r => r.json())
      .then(data => {
        localStorage.setItem('token', data.token);
        window.location.href = '/dashboard';
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Completing login...</div>;
  if (error) return <div>Error: {error}</div>;
  return null;
}
```

### Node.js Backend (Alternative Frontend)

```javascript
const express = require('express');
const axios = require('axios');

const router = express.Router();

router.get('/auth/github', async (req, res) => {
  const state = crypto.randomBytes(32).toString('hex');
  res.cookie('github_oauth_state', state, { httpOnly: true });
  
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${CALLBACK_URL}&state=${state}`;
  res.redirect(authUrl);
});

router.get('/auth/github/callback', async (req, res) => {
  const { code, state } = req.query;
  
  // Verify state
  if (state !== req.cookies.github_oauth_state) {
    return res.status(400).json({ error: 'Invalid state' });
  }
  
  // Exchange code at SuperBackend
  const response = await axios.get(
    `${SUPERBACKEND_URL}/api/auth/github/callback?code=${code}&state=${state}&json=true`
  );
  
  const { token, user } = response.data;
  
  // Set session cookie
  res.cookie('auth_token', token, { httpOnly: true });
  res.redirect('/dashboard');
});
```

---

## Testing

### Manual Test Flow

```bash
# 1. Initiate OAuth
curl -v http://localhost:3000/api/auth/github?json=true
# Expected: 302 to github.com

# 2. After GitHub authorization, check callback
# Browser will redirect to: /api/auth/github/callback?code=xxx&state=yyy

# 3. Verify JWT token
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <token_from_callback>"
```

### Automated Test Pattern

```javascript
describe('GitHub OAuth', () => {
  test('should initiate OAuth flow', async () => {
    const response = await request(app)
      .get('/api/auth/github?json=true');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('authUrl');
    expect(response.body).toHaveProperty('state');
  });

  test('should handle callback with valid code', async () => {
    // Mock GitHub API
    nock('https://github.com')
      .post('/login/oauth/access_token')
      .reply(200, { access_token: 'gho_test' });
    
    nock('https://api.github.com')
      .get('/user')
      .reply(200, { id: 12345, login: 'testuser', email: 'test@github.com' });

    const response = await request(app)
      .get('/api/auth/github/callback?code=test_code&state=test_state&json=true');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
    expect(response.body).toHaveProperty('user');
  });
});
```

---

## Performance Characteristics

| Operation | Typical Time | Notes |
|-----------|--------------|-------|
| Init OAuth | <100ms | Generates state, returns URL |
| Token Exchange | 500-2000ms | GitHub API call |
| User Profile Fetch | 200-500ms | GitHub API call |
| User Create/Link | 50-200ms | Database operation |
| JWT Generation | <10ms | Local operation |
| Total Flow | 1-3s | End-to-end |

---

## Security Considerations

1. **State Parameter:** Always verify to prevent CSRF attacks
2. **Token Storage:** GitHub tokens encrypted at rest, never exposed
3. **HTTPS Required:** OAuth callbacks must use HTTPS in production
4. **Scope Limitation:** Only request necessary scopes (read:user, user:email)
5. **Account Linking:** Verify email ownership before linking
6. **Session Management:** Use secure, httpOnly cookies for JWT storage

---

## Version History

- **1.0.0** - Initial skill definition
  - Complete OAuth flow documented
  - Account linking scenarios covered
  - Security patterns included
  - Agent tips and examples provided
