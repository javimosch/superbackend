const request = require('supertest');
const express = require('express');
const metricsController = require('./metrics.controller');
const ActionEvent = require('../models/ActionEvent');
const GlobalSetting = require('../models/GlobalSetting');
const User = require('../models/User');

// Mock dependencies
jest.mock('../models/ActionEvent');
jest.mock('../models/GlobalSetting');
jest.mock('../models/User');
jest.mock('../utils/jwt');

describe('Metrics Controller', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Mock the rate limiter to always allow requests for testing
    jest.doMock('../services/rateLimiter.service', () => ({
      limit: () => (req, res, next) => next()
    }));
    
    app.post('/metrics/track', metricsController.track);
    app.get('/metrics/impact', metricsController.getImpact);
    
    jest.clearAllMocks();
  });

  describe('POST /metrics/track', () => {
    test('should track valid event successfully', async () => {
      const mockEventData = {
        action: 'user_login',
        meta: { source: 'web' }
      };

      ActionEvent.create.mockResolvedValue({ _id: 'event123' });

      const response = await request(app)
        .post('/metrics/track')
        .send(mockEventData);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        ok: true,
        actorType: 'anonymous'
      });
      expect(ActionEvent.create).toHaveBeenCalledWith({
        action: 'user_login',
        actorType: 'anonymous',
        actorId: expect.any(String),
        meta: { source: 'web' }
      });
    });

    test('should reject requests without action', async () => {
      const response = await request(app)
        .post('/metrics/track')
        .send({ meta: {} });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('action is required');
    });

    test('should reject requests with invalid action format', async () => {
      const response = await request(app)
        .post('/metrics/track')
        .send({ action: 'invalid action!' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid action format');
    });

    test('should reject requests with action too long', async () => {
      const longAction = 'a'.repeat(101);
      const response = await request(app)
        .post('/metrics/track')
        .send({ action: longAction });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('action too long (max 100 characters)');
    });

    test('should reject requests with meta data too large', async () => {
      const largeMeta = { data: 'x'.repeat(1024 * 6) }; // > 5KB
      const response = await request(app)
        .post('/metrics/track')
        .send({ action: 'test_action', meta: largeMeta });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('meta data too large');
    });

    test('should reject requests with content-length too large', async () => {
      const response = await request(app)
        .post('/metrics/track')
        .set('Content-Length', '15000') // > 10KB
        .send({ action: 'test' });

      expect(response.status).toBe(413);
      expect(response.body.error).toBe('Request too large');
    }, 10000); // Increase timeout for this test

    test('should handle authenticated users', async () => {
      const mockUser = { _id: 'user123', email: 'test@example.com' };
      
      // Mock JWT verification and user lookup
      const { verifyAccessToken } = require('../utils/jwt');
      verifyAccessToken.mockReturnValue({ userId: 'user123' });
      User.findById.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/metrics/track')
        .set('Authorization', 'Bearer valid_token')
        .send({ action: 'user_action' });

      expect(response.body.actorType).toBe('user');
      expect(response.body.anonId).toBeNull();
    });
  });

  describe('GET /metrics/impact', () => {
    beforeEach(() => {
      // Mock default aggregation results
      ActionEvent.aggregate.mockResolvedValue([{ count: 150 }]);
      ActionEvent.countDocuments.mockResolvedValue(75);
      
      // Mock newsletter setting
      GlobalSetting.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          value: JSON.stringify(['email1@test.com', 'email2@test.com'])
        })
      });
    });

    test('should return impact metrics for default month range', async () => {
      const response = await request(app)
        .get('/metrics/impact');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        activeUsers: 150,
        servicesConsulted: 75,
        newsletterSubscribers: 2
      });
      expect(response.body.range).toBeDefined();
      expect(response.headers['cache-control']).toBe('public, max-age=300');
    });

    test('should handle custom time range', async () => {
      const startDate = '2024-01-01T00:00:00.000Z';
      const endDate = '2024-01-31T23:59:59.999Z';

      const response = await request(app)
        .get('/metrics/impact')
        .query({ start: startDate, end: endDate });

      expect(response.status).toBe(200);
      expect(response.body.range.start).toBe(startDate);
      expect(response.body.range.end).toBe(endDate);
    });

    test('should reject invalid date format', async () => {
      const response = await request(app)
        .get('/metrics/impact')
        .query({ start: 'invalid-date' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid date format');
    });

    test('should reject time range too large', async () => {
      const startDate = '2020-01-01T00:00:00.000Z';
      const endDate = '2025-01-01T00:00:00.000Z'; // 5 years

      const response = await request(app)
        .get('/metrics/impact')
        .query({ start: startDate, end: endDate });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Time range too large (max 1 year)');
    });

    test('should handle partial date range', async () => {
      const startDate = '2024-01-01T00:00:00.000Z';

      const response = await request(app)
        .get('/metrics/impact')
        .query({ start: startDate });

      expect(response.status).toBe(200);
      // Should default end date to current month end
      expect(response.body.range.start).toBe(startDate);
    });

    test('should handle newsletter parsing errors gracefully', async () => {
      GlobalSetting.findOne = jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          value: 'invalid json'
        })
      });

      const response = await request(app)
        .get('/metrics/impact');

      expect(response.status).toBe(200);
      expect(response.body.newsletterSubscribers).toBe(0);
    });
  });
});
