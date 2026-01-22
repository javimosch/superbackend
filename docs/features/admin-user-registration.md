# Admin User Registration Feature

## Summary
Enables administrators to register new users through the admin panel using the existing authentication system, with full support for relative path mounting.

## User Story
As an administrator, I want to register new users directly from the admin panel so that I can quickly create accounts without requiring users to self-register.

## Acceptance Criteria

### Functional Requirements
- **Admin Access**: Only authenticated administrators can access user registration
- **Registration Form**: Form with email, password, name, and role fields
- **Validation**: Client-side and server-side validation for all inputs
- **Success Feedback**: Clear confirmation when user is successfully registered
- **Error Handling**: Descriptive error messages for registration failures
- **Auto-refresh**: User list automatically updates after successful registration

### Technical Requirements
- **Relative Path Support**: Works when saasbackend is mounted at any path
- **API Integration**: Uses existing `/api/auth/register` endpoint
- **Security**: Admin-only access with proper authorization
- **Audit Logging**: All registration actions are logged
- **Responsive Design**: Works on desktop and mobile devices

## User Interface Design

### Registration Modal
- **Trigger**: "Register New User" button in admin users page header
- **Layout**: Centered modal with form fields
- **Fields**:
  - Email (required, email validation)
  - Password (required, min 6 characters, show/hide toggle)
  - Name (optional, text input)
  - Role (dropdown: User/Admin)
- **Actions**: Register button, Cancel button
- **States**: Loading, Success, Error

### Visual Design
- Consistent with existing admin panel styling
- TailwindCSS for styling
- Toast notifications for feedback
- Loading spinners during operations

## API Endpoints

### POST /admin/users/register
**Purpose**: Register a new user (admin only)
**Authentication**: Basic auth + admin role required
**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe",
  "role": "user"
}
```

**Response**:
```json
{
  "success": true,
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error Responses**:
- `400 Bad Request`: Invalid input data
- `401 Unauthorized`: Admin access required
- `403 Forbidden`: Insufficient permissions
- `409 Conflict`: Email already registered

## Implementation Details

### Backend Components

#### Controller Method
```javascript
const registerUser = asyncHandler(async (req, res) => {
  const { email, password, name, role = 'user' } = req.body;
  
  // Validation
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  
  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Role must be either "user" or "admin"' });
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  
  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  
  // Create new user
  const user = new User({
    email: email.toLowerCase(),
    passwordHash: password,
    name: name || '',
    role: role
  });
  
  await user.save();
  
  // Log the admin action
  console.log(`Admin registered new user: ${user.email} with role: ${user.role}`);
  
  res.status(201).json({
    success: true,
    user: user.toJSON()
  });
});
```

#### Route Configuration
```javascript
router.post('/users/register', adminController.registerUser);
```

### Frontend Components

#### Registration Modal Structure
```html
<div id="modal-register" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center">
  <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
    <h3 class="text-lg font-semibold text-gray-900 mb-4">Register New User</h3>
    <form id="register-form" class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Email *</label>
        <input id="register-email" type="email" required class="w-full border rounded px-3 py-2" placeholder="user@example.com">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Password *</label>
        <div class="relative">
          <input id="register-password" type="password" required minlength="6" class="w-full border rounded px-3 py-2 pr-10" placeholder="Min 6 characters">
          <button type="button" id="toggle-password" class="absolute right-2 top-2 text-gray-500 hover:text-gray-700">
            <svg id="eye-icon" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
            </svg>
          </button>
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input id="register-name" type="text" class="w-full border rounded px-3 py-2" placeholder="Optional">
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Role</label>
        <select id="register-role" class="w-full border rounded px-3 py-2">
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div id="register-error" class="hidden text-red-600 text-sm"></div>
    </form>
    <div class="flex justify-end gap-2 mt-6">
      <button id="btn-register-cancel" class="bg-gray-100 text-gray-800 px-4 py-2 rounded hover:bg-gray-200">Cancel</button>
      <button id="btn-register-submit" class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">Register</button>
    </div>
  </div>
</div>
```

#### JavaScript Functions
```javascript
function openRegisterModal() {
  document.getElementById('register-email').value = '';
  document.getElementById('register-password').value = '';
  document.getElementById('register-name').value = '';
  document.getElementById('register-role').value = 'user';
  document.getElementById('register-error').classList.add('hidden');
  document.getElementById('modal-register').classList.remove('hidden');
}

function closeRegisterModal() {
  document.getElementById('modal-register').classList.add('hidden');
}

function togglePasswordVisibility() {
  const passwordInput = document.getElementById('register-password');
  const eyeIcon = document.getElementById('eye-icon');
  
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    // Update to eye-slash icon
  } else {
    passwordInput.type = 'password';
    // Update to eye icon
  }
}

async function registerUser() {
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  const name = document.getElementById('register-name').value.trim();
  const role = document.getElementById('register-role').value;
  const errorDiv = document.getElementById('register-error');

  // Validation and API call logic
}

function getApiUrl(endpoint) {
  const pathname = window.location.pathname;
  const pathSegments = pathname.split('/').filter(Boolean);
  
  if (pathSegments.includes('admin')) {
    const adminIndex = pathSegments.indexOf('admin');
    
    if (adminIndex > 0) {
      const basePath = '/' + pathSegments.slice(0, adminIndex).join('/');
      return basePath + endpoint;
    } else {
      return endpoint;
    }
  }
  
  return window.location.origin + endpoint;
}
```

### Relative Path Compatibility

#### URL Detection Logic
The `getApiUrl()` function dynamically detects the mounting context:
- Analyzes `window.location.pathname` for admin context
- Handles patterns like `/super/admin/` or `/api/admin/`
- Provides fallback for root mounting
- Ensures API calls work regardless of deployment configuration

#### Supported Mounting Patterns
- `/admin/` → Direct API calls
- `/super/admin/` → `/super/api/admin/` endpoints  
- `/api/admin/` → `/api/api/admin/` endpoints
- Custom paths with admin segment

## Authentication

### Browser-Based Authentication
The registration feature uses browser-based basic authentication, consistent with other admin panel functions:

- **Initial Login**: User authenticates once when accessing the admin panel
- **Session Management**: Browser caches authentication credentials for the session
- **API Calls**: All admin API calls use browser's cached authentication automatically
- **Auth Expiration**: Clear error messages guide users to refresh and re-authenticate if needed

### Security Benefits
- No credential storage in client-side storage
- Leverages browser's secure authentication management
- Consistent with existing admin panel security patterns
- Session-based authentication with automatic expiration

### Error Handling
- **401 Unauthorized**: Clear message suggesting page refresh and re-login
- **Network Errors**: Graceful handling with user-friendly error messages
- **Validation Errors**: Detailed feedback for form validation issues

### Input Validation
- Email format validation
- Password strength requirements
- Name length limits
- Role enumeration validation

### Audit Trail
- Log registration attempts
- Record admin user performing action
- Track success/failure outcomes

## Error Handling

### Client-Side Errors
- Network connectivity issues
- Invalid form inputs
- Duplicate email detection
- Permission denied scenarios

### Server-Side Errors
- Database connection failures
- Email service errors
- Validation failures
- Authorization errors

## Testing Strategy

### Unit Tests
- Controller method validation
- Route protection
- Form validation functions
- API URL construction

### Integration Tests
- End-to-end registration flow
- Relative path compatibility
- Error handling scenarios
- Security validation

### User Acceptance Tests
- Admin can successfully register user
- Error messages display correctly
- User list updates automatically
- Works on different screen sizes

## Performance Considerations

### Response Times
- API response < 500ms
- Modal animation < 300ms
- List refresh < 1 second

### Resource Usage
- Minimal additional JavaScript overhead
- Efficient DOM updates
- Optimized API calls

## Browser Compatibility

### Supported Browsers
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Features Used
- ES6 JavaScript (async/await)
- Fetch API
- CSS Grid/Flexbox
- Modern JavaScript promises

## Deployment Notes

### Configuration
- No additional environment variables required
- Uses existing authentication setup
- Compatible with current deployment methods

### Rollback Strategy
- Feature can be disabled by removing route
- UI changes are non-breaking
- No database schema changes required

## Monitoring and Analytics

### Metrics to Track
- Registration success rate
- Registration frequency
- Error rates by type
- Performance metrics

### Logging
- Admin actions logged
- Registration attempts recorded
- Error details captured
- Performance timing logged

## Future Enhancements

### Phase 2 Features
- Bulk user registration via CSV
- User invitation system
- Email verification workflow
- Custom user fields

### Phase 3 Features
- Registration templates
- Automated user provisioning
- Integration with external identity providers
- Advanced user management workflows
