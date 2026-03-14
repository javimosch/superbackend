# Auth & JWT

## What it is
JWT-based authentication system for user-facing APIs. Public endpoints issue tokens, protected endpoints require `Authorization: Bearer <access_token>`.

Supports both email/password authentication and GitHub OAuth.

## Base URL / mount prefix
When mounted at `/saas`, all routes are prefixed:
- `/saas/api/auth/register`
- `/saas/api/auth/login`
- `/saas/api/auth/me`
- `/saas/api/auth/github`

## Setup

### GitHub OAuth Configuration

You can configure GitHub OAuth credentials using either **Environment Variables** or **Global Settings** (recommended for production).

#### Option 1: Environment Variables

1. Create a GitHub OAuth App:
   - Go to https://github.com/settings/developers
   - Click "New OAuth App"
   - Set Authorization callback URL: `http://localhost:3000/api/auth/github/callback`

2. Add credentials to `.env`:
```bash
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback
FRONTEND_URL=http://localhost:3000
```

#### Option 2: Global Settings (Recommended)

Global settings override environment variables and can be managed via admin UI or API:

**Via Admin API:**
```bash
# Set GitHub Client ID
curl -X POST ${BASE_URL}/api/admin/global-settings \
  -H 'Authorization: Bearer <admin_token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "key": "github.oauth.clientId",
    "value": "your-github-client-id",
    "type": "plain"
  }'

# Set GitHub Client Secret (encrypted)
curl -X POST ${BASE_URL}/api/admin/global-settings \
  -H 'Authorization: Bearer <admin_token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "key": "github.oauth.clientSecret",
    "value": "your-github-client-secret",
    "type": "encrypted"
  }'

# Set Callback URL
curl -X POST ${BASE_URL}/api/admin/global-settings \
  -H 'Authorization: Bearer <admin_token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "key": "github.oauth.callbackUrl",
    "value": "http://localhost:3000/api/auth/github/callback",
    "type": "plain"
  }'
```

**Via Admin UI:**
1. Navigate to `/admin/global-settings`
2. Add settings with keys:
   - `github.oauth.clientId` (type: plain)
   - `github.oauth.clientSecret` (type: encrypted)
   - `github.oauth.callbackUrl` (type: plain)

**Note:** Global settings take precedence over environment variables.

## API

### Email/Password endpoints
- `POST /saas/api/auth/register` - Register new user
- `POST /saas/api/auth/login` - Login user
- `POST /saas/api/auth/refresh-token` - Refresh access token

### GitHub OAuth endpoints
- `GET /saas/api/auth/github` - Initiate GitHub OAuth flow
- `GET /saas/api/auth/github/callback` - Handle GitHub OAuth callback
- `POST /saas/api/auth/github/refresh-token` - Refresh GitHub access token

### JWT endpoints
- `GET /saas/api/auth/me` - Get current user

## Admin UI
- `/saas/admin/users` - User management

## Common errors / troubleshooting
- **401 No token provided**: Missing `Authorization: Bearer` header
- **401 Invalid token**: Token expired or malformed
- **401 Refresh failed**: Invalid refresh token or JWT secrets misconfigured
- **400 Invalid email**: Email format validation failed
- **409 Email exists**: User already registered

### Error response examples

**Invalid credentials:**
```json
{
  "error": "Invalid credentials",
  "code": "INVALID_CREDENTIALS"
}
```

**Token expired:**
```json
{
  "error": "Token expired",
  "code": "TOKEN_EXPIRED"
}
```

**Missing token:**
```json
{
  "error": "No token provided",
  "code": "MISSING_TOKEN"
}
```

### Complete authentication flow example

**1. Register user:**
```bash
curl -X POST ${BASE_URL}/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"password123","name":"John Doe"}'
```

**Expected response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "email": "user@example.com",
    "name": "John Doe",
    "currentPlan": "free"
  }
}
```

**2. Make authenticated request:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  ${BASE_URL}/api/auth/me
```

**3. Refresh token when expired:**
```bash
curl -X POST ${BASE_URL}/api/auth/refresh-token \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"$REFRESH_TOKEN"}'
```

### Client-side integration example

```javascript
class AuthService {
  constructor(baseUrl = 'http://localhost:3000/saas') {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem('token');
    this.refreshToken = localStorage.getItem('refreshToken');
  }

  async login(email, password) {
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    this.token = data.token;
    this.refreshToken = data.refreshToken;
    
    localStorage.setItem('token', this.token);
    localStorage.setItem('refreshToken', this.refreshToken);
    
    return data;
  }

  async fetchWithAuth(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
      'Authorization': `Bearer ${this.token}`
    };

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      await this.refreshTokens();
      // Retry with new token
      const retryResponse = await fetch(url, {
        ...options,
        headers: { ...headers, 'Authorization': `Bearer ${this.token}` }
      });

      if (!retryResponse.ok) {
        throw new Error('Authentication failed');
      }

      return retryResponse;
    }

    return response;
  }

  async refreshTokens() {
    const response = await fetch(`${this.baseUrl}/api/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.refreshToken })
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    this.token = data.token;
    this.refreshToken = data.refreshToken;

    localStorage.setItem('token', this.token);
    localStorage.setItem('refreshToken', this.refreshToken);
  }

  logout() {
    this.token = null;
    this.refreshToken = null;
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
  }
}
```

## GitHub OAuth Flow

### 1. Initiate OAuth flow

**Redirect user to GitHub:**
```bash
curl ${BASE_URL}/api/auth/github
# Returns: 302 redirect to GitHub OAuth
```

**Or get JSON response for frontend handling:**
```bash
curl ${BASE_URL}/api/auth/github?json=true
# Returns: { "success": true, "authUrl": "...", "state": "..." }
```

### 2. GitHub redirects back to callback URL

After user authorizes, GitHub redirects to:
```
http://localhost:3000/api/auth/github/callback?code=AUTH_CODE&state=STATE
```

### 3. Handle callback

The callback endpoint:
- Exchanges code for access token
- Fetches user profile from GitHub
- Creates new user or links to existing account
- Generates JWT tokens
- Redirects to frontend with token

**Response (JSON mode):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "60f7b3b3b3b3b3b3b3b3b3b3",
    "email": "test@github.com",
    "name": "Test User",
    "githubId": "12345",
    "githubUsername": "testuser",
    "avatar": "https://avatars.githubusercontent.com/u/12345"
  }
}
```

### Frontend integration example

```javascript
class GitHubAuthService {
  constructor(baseUrl = 'http://localhost:3000/saas') {
    this.baseUrl = baseUrl;
  }

  // Redirect to GitHub OAuth
  loginWithGitHub() {
    window.location.href = `${this.baseUrl}/api/auth/github`;
  }

  // Handle OAuth callback (call this from your callback page)
  async handleCallback(code, state) {
    const response = await fetch(
      `${this.baseUrl}/api/auth/github/callback?code=${code}&state=${state}&json=true`,
      {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'GitHub login failed');
    }

    const data = await response.json();
    
    localStorage.setItem('token', data.token);
    localStorage.setItem('refreshToken', data.refreshToken);
    
    return data;
  }

  // Check if we're on callback page
  isCallbackPage() {
    const params = new URLSearchParams(window.location.search);
    return params.has('code') && params.has('state');
  }

  // Get callback params
  getCallbackParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      code: params.get('code'),
      state: params.get('state')
    };
  }
}
```

### Account linking

GitHub OAuth supports automatic account linking:

1. **By GitHub ID**: If user already logged in with GitHub, updates tokens
2. **By email**: If user registered with same email, links GitHub account
3. **New user**: Creates new account with GitHub info

### Security features

- **CSRF Protection**: State parameter verification
- **Token Storage**: GitHub tokens stored encrypted (not returned in responses)
- **Session Management**: State stored in session between redirect and callback
