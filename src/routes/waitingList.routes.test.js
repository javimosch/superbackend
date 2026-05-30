const express = require('express');
const request = require('supertest');

// Mock the controller
const mockWaitingListController = {
  subscribe: jest.fn(),
  getStats: jest.fn(),
  publicExport: jest.fn()
};

// Mock the async handler
const mockAsyncHandler = jest.fn().mockImplementation((fn) => fn);

// Mock the audit middleware
const mockAuditMiddleware = {
  auditMiddleware: jest.fn().mockImplementation((action, options) => (req, res, next) => {
    req.auditAction = action;
    req.auditOptions = options;
    next();
  })
};

// Mock the rate limiter
const mockRateLimiter = {
  limit: jest.fn().mockImplementation((limiterName) => (req, res, next) => {
    req.rateLimiterName = limiterName;
    next();
  })
};

// Mock modules before requiring the routes
jest.mock('../controllers/waitingList.controller', () => mockWaitingListController);
jest.mock('../utils/asyncHandler', () => mockAsyncHandler);
jest.mock('../services/auditLogger', () => mockAuditMiddleware);
jest.mock('../services/rateLimiter.service', () => mockRateLimiter);

const waitingListRoutes = require('./waitingList.routes');

describe('waitingList.routes', () => {
  let app;

  beforeAll(() => {
    // Rate limiters should be called during module load
    expect(mockRateLimiter.limit).toHaveBeenCalledWith('waitingListSubscribeLimiter');
    expect(mockRateLimiter.limit).toHaveBeenCalledWith('waitingListStatsLimiter');
    expect(mockRateLimiter.limit).toHaveBeenCalledWith('waitingListPublicExportLimiter');

    // Audit middleware should be called for the subscribe endpoint
    expect(mockAuditMiddleware.auditMiddleware).toHaveBeenCalledWith('public.waiting_list.subscribe', { entityType: 'WaitingList' });

    // AsyncHandler should be called for all controllers during module load
    expect(mockAsyncHandler).toHaveBeenCalledWith(mockWaitingListController.subscribe);
    expect(mockAsyncHandler).toHaveBeenCalledWith(mockWaitingListController.getStats);
    expect(mockAsyncHandler).toHaveBeenCalledWith(mockWaitingListController.publicExport);
  });

  beforeEach(() => {
    // Reset controller mocks
    Object.values(mockWaitingListController).forEach(mock => mock.mockClear());
    mockAsyncHandler.mockClear();

    // Create express app
    app = express();
    app.use(express.json());
    app.use('/waiting-list', waitingListRoutes);
  });

  describe('POST /subscribe', () => {
    it('should apply rate limiting middleware', async () => {
      mockWaitingListController.subscribe.mockImplementation((req, res) => {
        expect(req.rateLimiterName).toBe('waitingListSubscribeLimiter');
        res.status(201).json({ success: true });
      });

      await request(app)
        .post('/waiting-list/subscribe')
        .send({ email: 'test@example.com' })
        .expect(201);
    });

    it('should apply audit middleware with correct action', async () => {
      mockWaitingListController.subscribe.mockImplementation((req, res) => {
        expect(req.auditAction).toBe('public.waiting_list.subscribe');
        expect(req.auditOptions).toEqual({ entityType: 'WaitingList' });
        res.status(201).json({ success: true });
      });

      await request(app)
        .post('/waiting-list/subscribe')
        .send({ email: 'test@example.com' })
        .expect(201);
    });

    it('should call waitingListController.subscribe', async () => {
      mockWaitingListController.subscribe.mockImplementation((req, res) => {
        res.status(201).json({ message: 'Subscribed to waiting list' });
      });

      await request(app)
        .post('/waiting-list/subscribe')
        .send({ email: 'test@example.com', name: 'Test User' })
        .expect(201);

      expect(mockWaitingListController.subscribe).toHaveBeenCalledTimes(1);
    });

    it('should handle successful subscription', async () => {
      const mockResponse = {
        message: 'Successfully subscribed to waiting list',
        id: 'subscription-123'
      };
      mockWaitingListController.subscribe.mockImplementation((req, res) => {
        res.status(201).json(mockResponse);
      });

      const response = await request(app)
        .post('/waiting-list/subscribe')
        .send({ email: 'new@example.com' })
        .expect(201);

      expect(response.body).toEqual(mockResponse);
    });

    it('should handle subscription errors', async () => {
      const mockError = { error: 'Email already subscribed' };
      mockWaitingListController.subscribe.mockImplementation((req, res) => {
        res.status(400).json(mockError);
      });

      const response = await request(app)
        .post('/waiting-list/subscribe')
        .send({ email: 'existing@example.com' })
        .expect(400);

      expect(response.body).toEqual(mockError);
    });

    it('should pass request body to controller', async () => {
      const requestData = { email: 'test@example.com', name: 'Test User', source: 'homepage' };
      mockWaitingListController.subscribe.mockImplementation((req, res) => {
        expect(req.body).toEqual(requestData);
        res.status(201).json({ success: true });
      });

      await request(app)
        .post('/waiting-list/subscribe')
        .send(requestData)
        .expect(201);
    });

  });

  describe('GET /stats', () => {
    it('should apply rate limiting middleware', async () => {
      mockWaitingListController.getStats.mockImplementation((req, res) => {
        expect(req.rateLimiterName).toBe('waitingListStatsLimiter');
        res.json({ total: 100 });
      });

      await request(app)
        .get('/waiting-list/stats')
        .expect(200);
    });

    it('should call waitingListController.getStats', async () => {
      mockWaitingListController.getStats.mockImplementation((req, res) => {
        res.json({ total: 150, recent: 25 });
      });

      await request(app)
        .get('/waiting-list/stats')
        .expect(200);

      expect(mockWaitingListController.getStats).toHaveBeenCalledTimes(1);
    });

    it('should handle successful stats response', async () => {
      const mockStats = {
        total: 500,
        recent: 50,
        growth: { daily: 5, weekly: 35, monthly: 150 }
      };
      mockWaitingListController.getStats.mockImplementation((req, res) => {
        res.json(mockStats);
      });

      const response = await request(app)
        .get('/waiting-list/stats')
        .expect(200);

      expect(response.body).toEqual(mockStats);
    });

    it('should handle stats errors', async () => {
      const mockError = { error: 'Stats temporarily unavailable' };
      mockWaitingListController.getStats.mockImplementation((req, res) => {
        res.status(503).json(mockError);
      });

      const response = await request(app)
        .get('/waiting-list/stats')
        .expect(503);

      expect(response.body).toEqual(mockError);
    });

  });

  describe('GET /share/export', () => {
    it('should apply rate limiting middleware', async () => {
      mockWaitingListController.publicExport.mockImplementation((req, res) => {
        expect(req.rateLimiterName).toBe('waitingListPublicExportLimiter');
        res.json({ data: [] });
      });

      await request(app)
        .get('/waiting-list/share/export')
        .expect(200);
    });

    it('should call waitingListController.publicExport', async () => {
      mockWaitingListController.publicExport.mockImplementation((req, res) => {
        res.json({ exports: 'data' });
      });

      await request(app)
        .get('/waiting-list/share/export')
        .expect(200);

      expect(mockWaitingListController.publicExport).toHaveBeenCalledTimes(1);
    });

    it('should handle successful export response', async () => {
      const mockExport = {
        data: [
          { count: 100, date: '2024-01-01' },
          { count: 150, date: '2024-01-02' }
        ],
        format: 'json'
      };
      mockWaitingListController.publicExport.mockImplementation((req, res) => {
        res.json(mockExport);
      });

      const response = await request(app)
        .get('/waiting-list/share/export')
        .expect(200);

      expect(response.body).toEqual(mockExport);
    });

    it('should handle export errors', async () => {
      const mockError = { error: 'Export not available' };
      mockWaitingListController.publicExport.mockImplementation((req, res) => {
        res.status(404).json(mockError);
      });

      const response = await request(app)
        .get('/waiting-list/share/export')
        .expect(404);

      expect(response.body).toEqual(mockError);
    });

    it('should pass query parameters to controller', async () => {
      mockWaitingListController.publicExport.mockImplementation((req, res) => {
        expect(req.query.format).toBe('csv');
        expect(req.query.range).toBe('month');
        res.json({ data: [] });
      });

      await request(app)
        .get('/waiting-list/share/export?format=csv&range=month')
        .expect(200);
    });

  });

  describe('Route Integration', () => {
    it('should apply different rate limiters to different endpoints', async () => {
      mockWaitingListController.subscribe.mockImplementation((req, res) => res.status(201).json({ success: true }));
      mockWaitingListController.getStats.mockImplementation((req, res) => res.json({ total: 100 }));
      mockWaitingListController.publicExport.mockImplementation((req, res) => res.json({ data: [] }));

      await request(app).post('/waiting-list/subscribe').send({}).expect(201);
      await request(app).get('/waiting-list/stats').expect(200);
      await request(app).get('/waiting-list/share/export').expect(200);

      // Verify different rate limiters were applied (checked in beforeAll)
      expect(mockRateLimiter.limit).toHaveBeenCalledTimes(3);
    });

    it('should apply audit middleware only to subscribe endpoint', async () => {
      mockWaitingListController.subscribe.mockImplementation((req, res) => {
        expect(req.auditAction).toBe('public.waiting_list.subscribe');
        res.status(201).json({ success: true });
      });

      mockWaitingListController.getStats.mockImplementation((req, res) => {
        expect(req.auditAction).toBeUndefined();
        res.json({ total: 100 });
      });

      mockWaitingListController.publicExport.mockImplementation((req, res) => {
        expect(req.auditAction).toBeUndefined();
        res.json({ data: [] });
      });

      await request(app).post('/waiting-list/subscribe').send({}).expect(201);
      await request(app).get('/waiting-list/stats').expect(200);
      await request(app).get('/waiting-list/share/export').expect(200);

      // Audit middleware should be called only once (for subscribe)
      expect(mockAuditMiddleware.auditMiddleware).toHaveBeenCalledTimes(1);
    });

  });
});