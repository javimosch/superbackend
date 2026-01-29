# Metrics Rate Limiting

## Overview
The Metrics system now includes comprehensive rate limiting to prevent abuse and protect system resources. Rate limiting is implemented using the existing rate limiter infrastructure with configurable limits and monitoring.

## Security Improvements

### Rate Limiting
- **`metricsTrackLimiter`**: 100 requests per minute for event tracking
- **`metricsImpactLimiter`**: 30 requests per minute for aggregate metrics
- Identity resolution: JWT userId → API key → Anonymous cookie → IP address
- Configurable via admin UI at `/admin/rate-limiter`

### Input Validation
- Request size limits (10KB for tracking endpoint)
- Action field validation (max 100 characters, alphanumeric + symbols)
- Meta data size limits (5KB)
- Time range restrictions (max 1 year for impact queries)

### Response Headers
All rate-limited responses include:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in window
- `X-RateLimit-Reset`: Time when window resets
- `Retry-After`: Seconds to wait when rate limited

## API Changes

### POST /api/metrics/track
**Rate Limited**: `metricsTrackLimiter` (100/minute)

**Enhanced Validation**:
- Request size limited to 10KB
- Action field: max 100 characters, alphanumeric + `._-`
- Meta data: max 5KB JSON size
- Content-Length header validation

**Response**:
```json
{
  "ok": true,
  "actorType": "user|anonymous",
  "anonId": "uuid-for-anonymous-users"
}
```

**Error Responses**:
```json
// Rate limited
{
  "error": "Rate limit exceeded",
  "limit": 100,
  "windowMs": 60000,
  "retryAfter": 45
}

// Validation errors
{
  "error": "action is required"
}
{
  "error": "action too long (max 100 characters)"
}
{
  "error": "invalid action format"
}
{
  "error": "meta data too large"
}
{
  "error": "Request too large"
}
```

### GET /api/metrics/impact
**Rate Limited**: `metricsImpactLimiter` (30/minute)

**Enhanced Features**:
- Custom time range support via query parameters
- Time range validation (max 1 year)
- Input validation for date formats
- Response caching (5 minutes)

**Query Parameters**:
- `start`: ISO date string (optional)
- `end`: ISO date string (optional)
- If not provided, defaults to current month

**Response Headers**:
- `Cache-Control: public, max-age=300`

**Error Responses**:
```json
{
  "error": "Invalid date format"
}
{
  "error": "Time range too large (max 1 year)"
}
```

## Configuration

### Default Rate Limits
```json
{
  "metricsTrackLimiter": {
    "enabled": true,
    "mode": "enforce",
    "limit": {
      "max": 100,
      "windowMs": 60000
    }
  },
  "metricsImpactLimiter": {
    "enabled": true,
    "mode": "enforce",
    "limit": {
      "max": 30,
      "windowMs": 60000
    }
  }
}
```

### Admin Configuration
Rate limits can be configured via:
1. **Admin UI**: `/admin/rate-limiter`
2. **API**: `/api/admin/rate-limits`
3. **JsonConfig**: `rate-limits` key

### Environment-specific Settings
- **Development**: Higher limits for testing
- **Production**: Stricter limits for security
- **High-volume clients**: API key authentication available

## Identity Resolution

### Priority Order
1. **JWT Token**: `userId` from valid Bearer token
2. **API Key**: For high-volume clients (planned)
3. **Anonymous Cookie**: `enbauges_anon_id` cookie
4. **IP Address**: Fallback for anonymous requests

### Cookie Behavior
- Automatically set for anonymous users
- UUID format
- 1-year expiration
- Used for consistent rate limiting

## Monitoring & Observability

### Rate Limit Metrics
- Violation tracking and alerting
- Per-limiter usage statistics
- Abuse pattern detection
- Performance impact monitoring

### Admin Dashboard
- Real-time rate limit status
- Violation history and trends
- Configuration management
- Emergency controls

## Security Benefits

### Immediate Protection
- **Prevents flooding**: Limits requests per minute
- **Resource protection**: Prevents database exhaustion
- **Data protection**: Limits aggregate data exposure
- **Abuse prevention**: Blocks malicious actors

### Operational Benefits
- **Observability**: Track usage patterns
- **Flexibility**: Adjustable limits per business needs
- **Scalability**: Handle growth gracefully
- **Compliance**: Meet data protection requirements

## Implementation Details

### Rate Limiter Integration
- Uses existing `rateLimiter.limit()` middleware
- Auto-bootstrap configuration in JsonConfig
- MongoDB-based counter storage with TTL
- Fail-open behavior for database issues

### Performance Considerations
- Minimal overhead for legitimate requests
- Efficient counter storage with TTL
- Response caching for impact endpoint
- Optimized identity resolution

### Error Handling
- Graceful degradation on rate limiter failures
- Detailed error messages for debugging
- Standard HTTP status codes
- Consistent error response format

## Migration Notes

### Backward Compatibility
- Existing API contracts maintained
- Optional rate limiting (can be disabled)
- Gradual deployment support
- Rollback procedures available

### Deployment Strategy
1. **Report-only mode**: Monitor violations without blocking
2. **Enforcement mode**: Enable rate limiting
3. **Fine-tuning**: Adjust limits based on usage patterns

## Testing

### Test Coverage
- Rate limiting behavior validation
- Input validation testing
- Error response verification
- Performance impact assessment

### Test Scenarios
- Valid request processing
- Rate limit violation handling
- Invalid input rejection
- Authentication edge cases

## Future Enhancements

### Planned Features
- API key authentication for high-volume clients
- Advanced abuse detection algorithms
- Per-client rate limit overrides
- Enhanced monitoring dashboards

### Extensibility
- Plugin architecture for custom limiters
- Webhook integration for violation alerts
- Machine learning for abuse detection
- Multi-region rate limiting support
