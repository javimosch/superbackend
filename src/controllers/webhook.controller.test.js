const controller = require('./webhook.controller');
const Webhook = require('../models/Webhook');
const webhookService = require('../services/webhook.service');
const AuditEvent = require('../models/AuditEvent');
const mongoose = require('mongoose');

jest.mock('../models/Webhook');
jest.mock('../services/webhook.service');
jest.mock('../models/AuditEvent');

describe('webhook.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      params: {},
      body: {},
      headers: {},
      orgId: new mongoose.Types.ObjectId()
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  describe('getAll', () => {
    test('returns all webhooks for the organization', async () => {
      const mockWebhooks = [{ name: 'w1' }, { name: 'w2' }];
      Webhook.find.mockResolvedValue(mockWebhooks);

      await controller.getAll(mockReq, mockRes);

      expect(Webhook.find).toHaveBeenCalledWith({ organizationId: mockReq.orgId });
      expect(mockRes.json).toHaveBeenCalledWith(mockWebhooks);
    });

    test('returns 400 if no organization context', async () => {
      mockReq.orgId = null;
      await controller.getAll(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('create', () => {
    test('creates a new webhook successfully', async () => {
      mockReq.body = {
        name: 'test-hook',
        targetUrl: 'https://test.com',
        events: ['user.create']
      };
      
      Webhook.findOne.mockResolvedValue(null);
      Webhook.prototype.save = jest.fn().mockResolvedValue(true);

      await controller.create(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    test('returns 400 for duplicate name', async () => {
      mockReq.body = { name: 'duplicate', targetUrl: 'http', events: [] };
      Webhook.findOne.mockResolvedValue({ _id: 'w1' });

      await controller.create(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: expect.stringContaining('already exists') });
    });
  });

  describe('test', () => {
    test('dispatches test payload', async () => {
      mockReq.params.id = 'w1';
      Webhook.findOne.mockResolvedValue({ _id: 'w1' });

      await controller.test(mockReq, mockRes);

      expect(webhookService.test).toHaveBeenCalledWith('w1');
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Test payload dispatched' });
    });
  });

  describe('getHistory', () => {
    test('returns delivery audit events', async () => {
      mockReq.params.id = 'w1';
      Webhook.findOne.mockResolvedValue({ _id: 'w1' });
      
      const mockHistory = [{ action: 'WEBHOOK_DELIVERY_SUCCESS' }];
      AuditEvent.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockHistory)
      });

      await controller.getHistory(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(mockHistory);
    });
  });
});
