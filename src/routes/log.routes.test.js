const request = require('supertest');
const express = require('express');

// Mock the dependencies
jest.mock('../services/errorLogger');
jest.mock('../services/rateLimiter.service');
jest.mock('../utils/jwt');

const { logError, getConfig } = require('../services/errorLogger');
const rateLimiter = require('../services/rateLimiter.service');
const { verifyAccessToken } = require('../utils/jwt');

describe('Error Logging Routes with Centralized Rate Limiter', () => {
  let app;
  let mockReq;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup Express app with our routes
    app = express();
    app.use(express.json());
    app.use('/api/log', require('./log.routes'));
    
    mockReq = {
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent',
        'x-request-id': 'test-request-id'
      }
    };

    // Mock getConfig
    getConfig.mockResolvedValue({
      errorTrackingEnabled: true,
      errorRateLimitPerMinute: 30,
      errorRateLimitAnonPerMinute: 10
    });

    // Mock logError
    logError.mockResolvedValue();
  });

  describe('POST /api/log/error', () => {
    const errorPayload = {
      severity: 'error',
      errorName: 'TestError',
      message: 'Test error message',
      stack: 'Error: Test error\n    at test.js:1:1'
    };

    test('should allow anonymous request within rate limit', async () => {
      // Mock rate limiter to allow request
      rateLimiter.check.mockResolvedValue({
        allowed: true,
        remaining: 9,
        limit: { max: 10, windowMs: 60000 }
      });

      const response = await request(app)
        .post('/api/log/error')
        .send(errorPayload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true, tracked: true });
      expect(response.headers['x-ratelimit-limit']).toBe('10');
      expect(response.headers['x-ratelimit-remaining']).toBe('9');
      expect(rateLimiter.check).toHaveBeenCalledWith('errorReportingAnonLimiter', { req: expect.any(Object) });
      expect(logError).toHaveBeenCalledWith(expect.objectContaining({
        source: 'frontend',
        severity: 'error',
        errorName: 'TestError',
        actor: expect.objectContaining({
          userId: null,
          ip: expect.any(String) // IP address format may vary
        })
      }));
    });

    test('should block anonymous request when rate limited', async () => {
      // Mock rate limiter to block request
      rateLimiter.check.mockResolvedValue({
        allowed: false,
        remaining: 0,
        limit: { max: 10, windowMs: 60000 }
      });

      const response = await request(app)
        .post('/api/log/error')
        .send(errorPayload);

      expect(response.status).toBe(429);
      expect(response.body).toEqual({ error: 'Too many error reports. Please try again later.' });
      expect(response.headers['x-ratelimit-limit']).toBe('10');
      expect(response.headers['x-ratelimit-remaining']).toBe('0');
      expect(rateLimiter.check).toHaveBeenCalledWith('errorReportingAnonLimiter', { req: expect.any(Object) });
      expect(logError).not.toHaveBeenCalled();
    });

    test('should allow authenticated request within rate limit', async () => {
      // Mock rate limiter to allow request
      rateLimiter.check.mockResolvedValue({
        allowed: true,
        remaining: 29,
        limit: { max: 30, windowMs: 60000 }
      });

      const response = await request(app)
        .post('/api/log/error')
        .set('Authorization', 'Bearer valid-token')
        .send(errorPayload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true, tracked: true });
      expect(response.headers['x-ratelimit-limit']).toBe('30');
      expect(response.headers['x-ratelimit-remaining']).toBe('29');
      expect(rateLimiter.check).toHaveBeenCalledWith('errorReportingAuthLimiter', { req: expect.any(Object) });
    });

    test('should block authenticated request when rate limited', async () => {
      // Mock rate limiter to block request
      rateLimiter.check.mockResolvedValue({
        allowed: false,
        remaining: 0,
        limit: { max: 30, windowMs: 60000 }
      });

      const response = await request(app)
        .post('/api/log/error')
        .set('Authorization', 'Bearer valid-token')
        .send(errorPayload);

      expect(response.status).toBe(429);
      expect(response.body).toEqual({ error: 'Too many error reports. Please try again later.' });
      expect(response.headers['x-ratelimit-limit']).toBe('30');
      expect(response.headers['x-ratelimit-remaining']).toBe('0');
      expect(rateLimiter.check).toHaveBeenCalledWith('errorReportingAuthLimiter', { req: expect.any(Object) });
      expect(logError).not.toHaveBeenCalled();
    });

    test('should fail open when rate limiter service fails', async () => {
      // Mock rate limiter to throw an error
      rateLimiter.check.mockRejectedValue(new Error('Rate limiter service unavailable'));

      const response = await request(app)
        .post('/api/log/error')
        .send(errorPayload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true, tracked: true });
      expect(logError).toHaveBeenCalled();
    });

    test('should handle disabled error tracking', async () => {
      // Mock config to disable error tracking
      getConfig.mockResolvedValue({
        errorTrackingEnabled: false,
        errorRateLimitPerMinute: 30,
        errorRateLimitAnonPerMinute: 10
      });

      // Mock rate limiter to allow request
      rateLimiter.check.mockResolvedValue({
        allowed: true,
        remaining: 9,
        limit: { max: 10, windowMs: 60000 }
      });

      const response = await request(app)
        .post('/api/log/error')
        .send(errorPayload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true, tracked: false });
      expect(logError).not.toHaveBeenCalled();
    });

    test('should extract user info from valid JWT token', async () => {
      // Mock JWT verification
      verifyAccessToken.mockReturnValue({ userId: 'user123', role: 'user' });

      // Mock rate limiter to allow request
      rateLimiter.check.mockResolvedValue({
        allowed: true,
        remaining: 29,
        limit: { max: 30, windowMs: 60000 }
      });

      const response = await request(app)
        .post('/api/log/error')
        .set('Authorization', 'Bearer valid-jwt-token')
        .send(errorPayload);

      expect(response.status).toBe(200);
      expect(logError).toHaveBeenCalledWith(expect.objectContaining({
        actor: expect.objectContaining({
          userId: 'user123',
          role: 'user'
        })
      }));
    });

    test('should handle invalid JWT token gracefully', async () => {
      // Mock JWT verification to throw error
      verifyAccessToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Mock rate limiter to allow request
      rateLimiter.check.mockResolvedValue({
        allowed: true,
        remaining: 29,
        limit: { max: 30, windowMs: 60000 }
      });

      const response = await request(app)
        .post('/api/log/error')
        .set('Authorization', 'Bearer invalid-token')
        .send(errorPayload);

      expect(response.status).toBe(200);
      expect(logError).toHaveBeenCalledWith(expect.objectContaining({
        actor: expect.objectContaining({
          userId: null
        })
      }));
    });
  });
});
