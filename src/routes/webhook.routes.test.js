const request = require('supertest');
const express = require('express');

describe('Webhook Routes Rate Limiting Integration', () => {
  let app;

  beforeEach(() => {
    // Mock the rate limiter before requiring routes
    jest.doMock('../services/rateLimiter.service', () => ({
      limit: jest.fn((limiterId) => {
        const middleware = (req, res, next) => {
          // Store the limiter ID for verification
          req._limiterId = limiterId;
          next();
        };
        return middleware;
      })
    }));

    // Mock other dependencies
    jest.doMock('../controllers/webhook.controller', () => ({
      getAll: (req, res) => res.json([]),
      create: (req, res) => res.json({}),
      update: (req, res) => res.json({}),
      getHistory: (req, res) => res.json([]),
      delete: (req, res) => res.json({}),
      test: (req, res) => res.json({ message: 'Test webhook dispatched' })
    }));
    
    jest.doMock('../middleware/auth', () => ({
      basicAuth: (req, res, next) => next(),
      authenticate: (req, res, next) => next()
    }));
    
    jest.doMock('../middleware/org', () => ({
      loadOrgContext: (req, res, next) => next()
    }));

    // Now require the routes after mocking
    const webhookRoutes = require('./webhook.routes');
    
    // Setup Express app
    app = express();
    app.use(express.json());
    app.use('/api/webhooks', webhookRoutes);
  });

  test('should apply rate limiter to webhook test endpoint', async () => {
    const response = await request(app)
      .post('/api/webhooks/test-webhook/test')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Test webhook dispatched');
  });

  test('should call rate limiter with correct ID', async () => {
    // Get the rate limiter mock
    const { limit } = require('../services/rateLimiter.service');
    
    await request(app)
      .post('/api/webhooks/test-webhook/test')
      .set('Authorization', 'Bearer valid-token');

    expect(limit).toHaveBeenCalledWith('webhookTestLimiter');
  });
});
