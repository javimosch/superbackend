const express = require('express');
const request = require('supertest');

// Mock the controller
const mockRegistryController = {
  auth: jest.fn(),
  list: jest.fn()
};

// Mock the rate limiter
const mockRateLimiter = {
  limit: jest.fn().mockImplementation((limiterName) => (req, res, next) => {
    req.rateLimiterName = limiterName;
    next();
  })
};

// Mock modules before requiring the routes
jest.mock('../controllers/registry.controller', () => mockRegistryController);
jest.mock('../services/rateLimiter.service', () => mockRateLimiter);

const registryRoutes = require('./registry.routes');

describe('registry.routes', () => {
  let app;

  beforeAll(() => {
    // Rate limiter should be called during module load
    expect(mockRateLimiter.limit).toHaveBeenCalledWith('openRegistryAuthLimiter');
    expect(mockRateLimiter.limit).toHaveBeenCalledWith('openRegistryListLimiter');
  });

  beforeEach(() => {
    // Reset controller mocks but keep rate limiter calls from module load
    mockRegistryController.auth.mockClear();
    mockRegistryController.list.mockClear();

    // Create express app
    app = express();
    app.use(express.json());
    app.use('/registry', registryRoutes);
  });

  describe('GET /:id/auth', () => {
    it('should apply rate limiting middleware', async () => {
      mockRegistryController.auth.mockImplementation((req, res) => {
        // Check that rate limiter middleware was applied
        expect(req.rateLimiterName).toBe('openRegistryAuthLimiter');
        res.json({ auth: true });
      });

      await request(app)
        .get('/registry/test-registry/auth')
        .expect(200);
    });

    it('should call controller.auth with correct parameters', async () => {
      mockRegistryController.auth.mockImplementation((req, res) => {
        expect(req.params.id).toBe('test-registry');
        res.json({ auth: true });
      });

      await request(app)
        .get('/registry/test-registry/auth')
        .set('Authorization', 'Bearer token123')
        .expect(200);

      expect(mockRegistryController.auth).toHaveBeenCalledTimes(1);
    });

    it('should handle successful auth response', async () => {
      const mockResponse = { authenticated: true, user: 'test-user' };
      mockRegistryController.auth.mockImplementation((req, res) => {
        res.json(mockResponse);
      });

      const response = await request(app)
        .get('/registry/my-registry/auth')
        .expect(200);

      expect(response.body).toEqual(mockResponse);
    });

    it('should handle auth errors', async () => {
      const mockError = { error: { code: 'UNAUTHORIZED', message: 'Invalid token' } };
      mockRegistryController.auth.mockImplementation((req, res) => {
        res.status(401).json(mockError);
      });

      const response = await request(app)
        .get('/registry/my-registry/auth')
        .expect(401);

      expect(response.body).toEqual(mockError);
    });

    it('should pass authorization header to controller', async () => {
      mockRegistryController.auth.mockImplementation((req, res) => {
        expect(req.headers.authorization).toBe('Bearer test-token');
        res.json({ auth: true });
      });

      await request(app)
        .get('/registry/test-id/auth')
        .set('Authorization', 'Bearer test-token')
        .expect(200);
    });
  });

  describe('GET /:id/list', () => {
    it('should apply rate limiting middleware', async () => {
      mockRegistryController.list.mockImplementation((req, res) => {
        // Check that rate limiter middleware was applied
        expect(req.rateLimiterName).toBe('openRegistryListLimiter');
        res.json({ items: [] });
      });

      await request(app)
        .get('/registry/test-registry/list')
        .expect(200);
    });

    it('should call controller.list with correct parameters', async () => {
      mockRegistryController.list.mockImplementation((req, res) => {
        expect(req.params.id).toBe('test-registry');
        res.json({ items: [] });
      });

      await request(app)
        .get('/registry/test-registry/list')
        .expect(200);

      expect(mockRegistryController.list).toHaveBeenCalledTimes(1);
    });

    it('should handle successful list response', async () => {
      const mockResponse = {
        items: [
          { id: 'item1', name: 'Test Item 1' },
          { id: 'item2', name: 'Test Item 2' }
        ],
        total: 2
      };
      mockRegistryController.list.mockImplementation((req, res) => {
        res.json(mockResponse);
      });

      const response = await request(app)
        .get('/registry/my-registry/list')
        .expect(200);

      expect(response.body).toEqual(mockResponse);
    });

    it('should handle list errors', async () => {
      const mockError = { error: { code: 'NOT_FOUND', message: 'Registry not found' } };
      mockRegistryController.list.mockImplementation((req, res) => {
        res.status(404).json(mockError);
      });

      const response = await request(app)
        .get('/registry/nonexistent/list')
        .expect(404);

      expect(response.body).toEqual(mockError);
    });

    it('should pass query parameters to controller', async () => {
      mockRegistryController.list.mockImplementation((req, res) => {
        expect(req.query.category).toBe('test');
        expect(req.query.limit).toBe('10');
        res.json({ items: [] });
      });

      await request(app)
        .get('/registry/test-id/list?category=test&limit=10')
        .expect(200);
    });

    it('should pass authorization header to controller', async () => {
      mockRegistryController.list.mockImplementation((req, res) => {
        expect(req.headers.authorization).toBe('Bearer list-token');
        res.json({ items: [] });
      });

      await request(app)
        .get('/registry/test-id/list')
        .set('Authorization', 'Bearer list-token')
        .expect(200);
    });
  });

  describe('Route parameter validation', () => {
    it('should handle special characters in registry id', async () => {
      mockRegistryController.auth.mockImplementation((req, res) => {
        expect(req.params.id).toBe('test-registry-123');
        res.json({ auth: true });
      });

      await request(app)
        .get('/registry/test-registry-123/auth')
        .expect(200);
    });

    it('should handle URL encoded registry id', async () => {
      mockRegistryController.list.mockImplementation((req, res) => {
        expect(req.params.id).toBe('test registry with spaces');
        res.json({ items: [] });
      });

      await request(app)
        .get('/registry/test%20registry%20with%20spaces/list')
        .expect(200);
    });
  });

  describe('Rate limiting integration', () => {
    it('should apply different rate limiters to different endpoints', async () => {
      mockRegistryController.auth.mockImplementation((req, res) => {
        expect(req.rateLimiterName).toBe('openRegistryAuthLimiter');
        res.json({ auth: true });
      });
      mockRegistryController.list.mockImplementation((req, res) => {
        expect(req.rateLimiterName).toBe('openRegistryListLimiter');
        res.json({ items: [] });
      });

      await request(app).get('/registry/test/auth').expect(200);
      await request(app).get('/registry/test/list').expect(200);

      // Rate limiters should have been called during module load (checked in beforeAll)
      expect(mockRateLimiter.limit).toHaveBeenCalledTimes(2);
    });
  });
});