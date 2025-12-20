# Auth & JWT

## What it is
JWT-based authentication system for user-facing APIs. Public endpoints issue tokens, protected endpoints require `Authorization: Bearer <access_token>`.

## Base URL / mount prefix
When mounted at `/saas`, all routes are prefixed:
- `/saas/api/auth/register`
- `/saas/api/auth/login`
- `/saas/api/auth/me`

## API

### Public endpoints
- `POST /saas/api/auth/register` - Register new user
- `POST /saas/api/auth/login` - Login user
- `POST /saas/api/auth/refresh-token` - Refresh access token

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
