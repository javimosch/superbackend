const controller = require('./stripeAdmin.controller');
const StripeCatalogItem = require('../models/StripeCatalogItem');
const stripeHelper = require('../services/stripeHelper.service');
const { createAuditEvent, getBasicAuthActor } = require('../services/audit.service');
const mongoose = require('mongoose');

jest.mock('../models/StripeCatalogItem');
jest.mock('../services/stripeHelper.service');
jest.mock('../services/audit.service', () => ({
  createAuditEvent: jest.fn(),
  getBasicAuthActor: jest.fn(() => ({ actorType: 'admin', actorId: 'test' })),
}));

describe('stripeAdmin.controller', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReq = {
      params: {},
      body: {},
      query: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('getStripeStatus', () => {
    test('returns status and counts', async () => {
      stripeHelper.isStripeConfigured.mockResolvedValue(true);
      StripeCatalogItem.countDocuments.mockResolvedValueOnce(10); // total
      StripeCatalogItem.countDocuments.mockResolvedValueOnce(5);  // active

      await controller.getStripeStatus(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        configured: true,
        catalogCount: 10,
        activeCount: 5
      }));
    });
  });

  describe('listCatalog', () => {
    test('returns catalog items with pagination', async () => {
      const mockItems = [{ _id: 'c1', planKey: 'pro' }];
      StripeCatalogItem.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockItems)
      });
      StripeCatalogItem.countDocuments.mockResolvedValue(1);

      await controller.listCatalog(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        items: mockItems,
        pagination: expect.objectContaining({ total: 1 })
      }));
    });
  });

  describe('upsertCatalogItem', () => {
    test('creates or updates a stripe product and catalog entry', async () => {
      stripeHelper.isStripeConfigured.mockResolvedValue(true);
      mockReq.body = {
        productName: 'Pro Plan',
        planKey: 'pro',
        displayName: 'Pro',
        billingType: 'subscription',
        unitAmount: 2000,
        interval: 'month'
      };

      const mockResult = {
        catalogItem: { _id: 'ci1' },
        product: { id: 'prod1', name: 'Pro Plan' },
        price: { id: 'price1', unit_amount: 2000 }
      };
      stripeHelper.upsertStripeProductAndPrice.mockResolvedValue(mockResult);

      await controller.upsertCatalogItem(mockReq, mockRes);

      expect(stripeHelper.upsertStripeProductAndPrice).toHaveBeenCalled();
      expect(createAuditEvent).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    test('returns 400 if Stripe not configured', async () => {
      stripeHelper.isStripeConfigured.mockResolvedValue(false);
      await controller.upsertCatalogItem(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('product and price listing', () => {
    test('listStripeProducts returns products from stripe client', async () => {
      stripeHelper.isStripeConfigured.mockResolvedValue(true);
      const mockStripe = {
        products: { list: jest.fn().mockResolvedValue({ data: [{ id: 'p1' }], has_more: false }) }
      };
      stripeHelper.getStripeClient.mockResolvedValue(mockStripe);

      await controller.listStripeProducts(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        products: expect.any(Array),
        hasMore: false
      }));
    });

    test('listStripePrices returns prices with mapping info', async () => {
      stripeHelper.isStripeConfigured.mockResolvedValue(true);
      const mockStripe = {
        prices: { list: jest.fn().mockResolvedValue({ data: [{ id: 'price1' }], has_more: false }) }
      };
      stripeHelper.getStripeClient.mockResolvedValue(mockStripe);
      StripeCatalogItem.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ stripePriceId: 'price1' }])
      });

      await controller.listStripePrices(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        prices: expect.arrayContaining([expect.objectContaining({ _isMapped: true })])
      }));
    });
  });

  describe('syncEnvFromCatalog', () => {
    test('populates process.env from active catalog items', async () => {
      const mockItems = [
        { planKey: 'PRO_PRICE_ID', stripePriceId: 'price_pro' }
      ];
      StripeCatalogItem.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockItems)
      });

      await controller.syncEnvFromCatalog(mockReq, mockRes);

      expect(process.env.PRO_PRICE_ID).toBe('price_pro');
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        totalActive: 1
      }));
    });
  });

  describe('deleteCatalogItem', () => {
    test('removes catalog item and logs audit', async () => {
      const id = new mongoose.Types.ObjectId();
      mockReq.params.id = String(id);
      const mockItem = { _id: id, toObject: () => ({ _id: id }) };
      
      StripeCatalogItem.findById.mockResolvedValue(mockItem);
      StripeCatalogItem.deleteOne.mockResolvedValue({ deletedCount: 1 });

      await controller.deleteCatalogItem(mockReq, mockRes);

      expect(StripeCatalogItem.deleteOne).toHaveBeenCalledWith({ _id: String(id) });
      expect(createAuditEvent).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Catalog item deleted' });
    });
  });
});
